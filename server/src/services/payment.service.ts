import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../lib/http';
import { getPaymentGateway } from '../lib/payments';
import { artistShareAfterRefund, customerRefundPercent, paymentsConfig, splitAmount } from '../config/payments';
import { BookingStatus, PaymentStatus } from '../types';
import { BookingService, computeEventEnd, computeEventStart, releaseSlotsIfFree } from './booking.service';

export interface CheckoutDetails {
  orderId: string;
  /** Razorpay public key for the checkout page. */
  keyId: string;
  amountPaise: number;
  /** Hosted checkout page the app opens in a browser (served from Phase 6). */
  checkoutUrl: string;
}

export interface PaymentStatusView {
  bookingId: number;
  bookingStatus: string;
  paymentStatus: string | null;
  amountPaise: number | null;
  paymentDueAt: Date | null;
}

/** Fields we read from a Razorpay payment entity. */
interface CapturedPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
}

/** What applying a capture decided; gateway calls happen after the DB transaction commits. */
type CaptureOutcome =
  | { kind: 'CONFIRMED' | 'ALREADY_CONFIRMED' | 'UNKNOWN_ORDER' | 'AMOUNT_MISMATCH' | 'ALREADY_REFUNDED' }
  | { kind: 'REFUND_LATE' | 'REFUND_EXTRA'; gatewayPaymentId: string; amountPaise: number };

/** A webhook rejected before processing (bad signature or body). */
export class WebhookError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'WebhookError';
  }
}

const toCheckout = (payment: { gatewayOrderId: string; amountPaise: number }): CheckoutDetails => ({
  orderId: payment.gatewayOrderId,
  keyId: getPaymentGateway().keyId,
  amountPaise: payment.amountPaise,
  checkoutUrl: `${paymentsConfig().publicBaseUrl}/pay/${payment.gatewayOrderId}`
});

/**
 * All money state changes live here. The server never trusts the app's word that a payment
 * succeeded: only a signed webhook or a server-side gateway check moves a booking to CONFIRMED.
 */
export class PaymentService {
  /**
   * Creates (or reuses) the Razorpay order for an AWAITING_PAYMENT booking. The artist's share
   * rides on the order as a transfer with the settlement on hold.
   */
  static async startCheckout(bookingId: number, customerId: number): Promise<CheckoutDetails> {
    // The window may have just closed
    await BookingService.expireUnpaidBookings();

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { artist: true, payment: true }
    });
    if (!booking) {
      throw notFound('Booking not found');
    }
    if (booking.customerId !== customerId) {
      throw forbidden('Only the booker can pay for this booking');
    }
    if (booking.status === BookingStatus.PAYMENT_EXPIRED) {
      throw conflict('The payment window for this booking has closed');
    }
    if (booking.status !== BookingStatus.AWAITING_PAYMENT) {
      throw conflict(`Cannot pay for a booking with status ${booking.status}`);
    }

    // Retrying checkout (e.g. after a failed card) reuses the same order
    if (booking.payment) {
      return toCheckout(booking.payment);
    }

    if (!booking.artist.payoutAccountId) {
      throw conflict("This artist hasn't finished setting up payouts yet, so payment can't be taken");
    }

    const amountPaise = booking.amountPaise ?? booking.artist.baseFee * 100;
    const { platformFeePaise, artistSharePaise } = splitAmount(amountPaise, paymentsConfig().platformFeePercent);

    const order = await getPaymentGateway().createOrderWithHeldTransfer({
      amountPaise,
      artistAccountId: booking.artist.payoutAccountId,
      artistSharePaise,
      receipt: `booking_${booking.id}`,
      notes: { bookingId: String(booking.id) }
    });

    try {
      const payment = await prisma.payment.create({
        data: {
          bookingId: booking.id,
          gatewayOrderId: order.id,
          amountPaise,
          artistSharePaise,
          platformFeePaise,
          status: PaymentStatus.CREATED
        }
      });
      return toCheckout(payment);
    } catch (err) {
      // A concurrent request created the order first; hand back theirs. Our extra order is
      // never shown to anyone, so it can't be paid.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await prisma.payment.findUniqueOrThrow({ where: { bookingId: booking.id } });
        return toCheckout(existing);
      }
      throw err;
    }
  }

  /**
   * Handles a Razorpay webhook. The signature is checked over the exact raw body; each event
   * is recorded once (by event id) in the same transaction as its effects, so replays and
   * concurrent deliveries are no-ops, and a failure rolls back so Razorpay retries it.
   */
  static async handleWebhook(rawBody: string, signature: string | undefined, eventIdHeader: string | undefined): Promise<void> {
    if (!signature || !getPaymentGateway().verifyWebhookSignature(rawBody, signature)) {
      throw new WebhookError(401, 'Invalid signature');
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      throw new WebhookError(400, 'Malformed JSON body');
    }
    const type = typeof event?.event === 'string' ? event.event : 'unknown';
    const eventId = eventIdHeader || `sha256_${crypto.createHash('sha256').update(rawBody).digest('hex')}`;

    const outcome = await prisma.$transaction(async (tx) => {
      // ON CONFLICT DO NOTHING: a concurrent duplicate waits for us to commit, then skips
      const { count } = await tx.paymentEvent.createMany({
        data: [{ eventId, type, payload: event }],
        skipDuplicates: true
      });
      if (count === 0) return null;

      switch (type) {
        case 'payment.captured':
        case 'order.paid': {
          const entity = event?.payload?.payment?.entity;
          return isCapturedEntity(entity) ? PaymentService.applyCapture(tx, entity) : null;
        }
        case 'payment.failed': {
          const orderId = event?.payload?.payment?.entity?.order_id;
          if (typeof orderId === 'string') {
            await tx.payment.updateMany({
              where: { gatewayOrderId: orderId, status: PaymentStatus.CREATED },
              data: { status: PaymentStatus.FAILED }
            });
          }
          return null;
        }
        case 'transfer.processed': {
          const transfer = event?.payload?.transfer?.entity;
          if (typeof transfer?.id === 'string' && typeof transfer?.source === 'string') {
            await tx.payment.updateMany({
              where: { gatewayPaymentId: transfer.source, gatewayTransferId: null },
              data: { gatewayTransferId: transfer.id }
            });
          }
          return null;
        }
        default:
          return null; // recorded for the audit trail; nothing to do
      }
    });

    if (outcome) await PaymentService.settleCaptureOutcome(outcome);
  }

  /**
   * Applies a captured payment. Every write is conditional on the current state, so whichever
   * of webhook, status poll or expiry sweep gets there first wins and the rest are no-ops.
   */
  private static async applyCapture(tx: Prisma.TransactionClient, entity: CapturedPaymentEntity): Promise<CaptureOutcome> {
    const payment = await tx.payment.findUnique({ where: { gatewayOrderId: entity.order_id } });
    if (!payment) return { kind: 'UNKNOWN_ORDER' };

    if (entity.amount !== payment.amountPaise || entity.currency !== 'INR') {
      console.error(
        `💥 Payment amount mismatch on booking ${payment.bookingId}: expected ${payment.amountPaise} INR paise, ` +
          `got ${entity.amount} ${entity.currency} (payment ${entity.id}). Not confirming; needs admin review.`
      );
      return { kind: 'AMOUNT_MISMATCH' };
    }

    // A second, different payment on an order that's already paid: give it back
    if (payment.gatewayPaymentId && payment.gatewayPaymentId !== entity.id) {
      return { kind: 'REFUND_EXTRA', gatewayPaymentId: entity.id, amountPaise: entity.amount };
    }

    await tx.payment.updateMany({
      where: { id: payment.id, gatewayPaymentId: null },
      data: { gatewayPaymentId: entity.id, status: PaymentStatus.CAPTURED }
    });

    const { count } = await tx.booking.updateMany({
      where: { id: payment.bookingId, status: BookingStatus.AWAITING_PAYMENT },
      data: { status: BookingStatus.CONFIRMED }
    });
    if (count === 1) return { kind: 'CONFIRMED' };

    const booking = await tx.booking.findUniqueOrThrow({ where: { id: payment.bookingId } });
    if (booking.status === BookingStatus.CONFIRMED) return { kind: 'ALREADY_CONFIRMED' };

    const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (current.status !== PaymentStatus.CAPTURED) return { kind: 'ALREADY_REFUNDED' };

    // Paid after the window closed (or the booking otherwise ended): the night may already be
    // someone else's, so the booker gets everything back.
    return { kind: 'REFUND_LATE', gatewayPaymentId: entity.id, amountPaise: payment.amountPaise };
  }

  private static async settleCaptureOutcome(outcome: CaptureOutcome): Promise<void> {
    if (outcome.kind === 'REFUND_LATE') {
      await PaymentService.refundLateCapture(outcome.gatewayPaymentId, outcome.amountPaise);
    } else if (outcome.kind === 'REFUND_EXTRA') {
      try {
        await getPaymentGateway().refund(outcome.gatewayPaymentId, outcome.amountPaise, { reverseAllTransfers: true });
        console.warn(`↩️ Refunded duplicate payment ${outcome.gatewayPaymentId}`);
      } catch (err) {
        console.error(`💥 Could not refund duplicate payment ${outcome.gatewayPaymentId}; refund it manually:`, err);
      }
    }
  }

  /** Full refund (and transfer reversal) for a capture that arrived too late. Failures retry from the sweep. */
  private static async refundLateCapture(gatewayPaymentId: string, amountPaise: number): Promise<boolean> {
    try {
      await getPaymentGateway().refund(gatewayPaymentId, amountPaise, { reverseAllTransfers: true });
    } catch (err) {
      console.error(`Late-payment refund for ${gatewayPaymentId} failed; the sweep will retry:`, err);
      return false;
    }
    await prisma.payment.updateMany({
      where: { gatewayPaymentId, status: PaymentStatus.CAPTURED },
      data: { status: PaymentStatus.REFUNDED, refundedPaise: amountPaise }
    });
    return true;
  }

  /**
   * Sweep: refunds captures stuck on bookings whose payment window had closed. A repeated
   * full refund is rejected by the gateway (it would exceed the payment), so retrying is safe.
   */
  static async retryLateCaptureRefunds(): Promise<number> {
    const stuck = await prisma.payment.findMany({
      where: { status: PaymentStatus.CAPTURED, booking: { status: BookingStatus.PAYMENT_EXPIRED } },
      select: { gatewayPaymentId: true, amountPaise: true }
    });
    let refunded = 0;
    for (const p of stuck) {
      if (p.gatewayPaymentId && (await PaymentService.refundLateCapture(p.gatewayPaymentId, p.amountPaise))) {
        refunded += 1;
      }
    }
    return refunded;
  }

  /**
   * Where a booking's payment stands, for the app to poll after checkout. While the booking is
   * still awaiting payment, the gateway is asked directly in case the webhook is late.
   */
  static async getPaymentStatus(bookingId: number, userId: number): Promise<PaymentStatusView> {
    await BookingService.expireUnpaidBookings();

    const find = () =>
      prisma.booking.findUnique({ where: { id: bookingId }, include: { artist: true, payment: true } });
    let booking = await find();
    if (!booking) {
      throw notFound('Booking not found');
    }
    if (booking.customerId !== userId && booking.artist.userId !== userId) {
      throw forbidden('Not authorized to view this booking');
    }

    if (booking.status === BookingStatus.AWAITING_PAYMENT && booking.payment) {
      try {
        const attempts = await getPaymentGateway().fetchOrderPayments(booking.payment.gatewayOrderId);
        const captured = attempts.find((p) => p.status === 'captured');
        if (captured) {
          const outcome = await prisma.$transaction((tx) =>
            PaymentService.applyCapture(tx, {
              id: captured.id,
              order_id: captured.orderId,
              amount: captured.amountPaise,
              currency: 'INR'
            })
          );
          await PaymentService.settleCaptureOutcome(outcome);
          booking = (await find())!;
        }
      } catch (err) {
        // The webhook will still arrive; the app just keeps polling
        console.error(`Payment status check with the gateway failed for booking ${bookingId}:`, err);
      }
    }

    return {
      bookingId: booking.id,
      bookingStatus: booking.status,
      paymentStatus: booking.payment?.status ?? null,
      amountPaise: booking.payment?.amountPaise ?? booking.amountPaise,
      paymentDueAt: booking.paymentDueAt
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Settlement: releasing payouts and refunding, reconciled against the gateway
  // ---------------------------------------------------------------------------------------------

  /**
   * Moves a paid booking's money to where its final status says it should be: the booker gets
   * `refundTargetPaise` back and the artist keeps the rest minus the proportional fee.
   *
   * Idempotent and race-safe: a per-booking advisory lock serialises settlements, and each step
   * compares against what Razorpay says already happened (refunded so far, reversed so far, hold
   * state) rather than our own records, so a retry after a partial failure only does what's left.
   * The payment leaves CAPTURED only when everything succeeded; otherwise the sweep retries.
   */
  static async settleBooking(bookingId: number): Promise<'SETTLED' | 'PENDING' | 'NOTHING'> {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(${SETTLE_LOCK_NAMESPACE}::int4, ${bookingId}::int4)) AS l`;

          const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { payment: true } });
          const payment = booking?.payment;
          if (!booking || !payment || payment.status !== PaymentStatus.CAPTURED || !payment.gatewayPaymentId) {
            return 'NOTHING';
          }
          if (!SETTLE_STATUSES.includes(booking.status as BookingStatus)) return 'NOTHING';

          const gateway = getPaymentGateway();
          const refundTarget = Math.min(Math.max(payment.refundTargetPaise, 0), payment.amountPaise);
          const artistFinal = artistShareAfterRefund(payment, refundTarget);

          const transferId = payment.gatewayTransferId ?? (await gateway.fetchHeldTransferId(payment.gatewayPaymentId));
          if (!transferId) {
            console.warn(`Settlement for booking ${bookingId} waiting: the held transfer doesn't exist yet`);
            return 'PENDING';
          }
          const transfer = await gateway.fetchTransfer(transferId);

          // 1. Pull back whatever the artist shouldn't keep (before refunding from our balance)
          const toReverse = transfer.amountPaise - transfer.reversedPaise - artistFinal;
          if (toReverse > 0) await gateway.reverseTransfer(transferId, toReverse);

          // 2. Refund the booker whatever they're still owed
          const alreadyRefunded = await gateway.fetchRefundedPaise(payment.gatewayPaymentId);
          if (refundTarget > alreadyRefunded) await gateway.refund(payment.gatewayPaymentId, refundTarget - alreadyRefunded);

          // 3. Let the artist's remaining share settle
          if (artistFinal > 0 && transfer.onHold) await gateway.releaseTransfer(transferId);

          const status =
            refundTarget === 0
              ? PaymentStatus.RELEASED
              : refundTarget >= payment.amountPaise
                ? PaymentStatus.REFUNDED
                : PaymentStatus.PARTIALLY_REFUNDED;
          await tx.payment.update({
            where: { id: payment.id },
            data: { status, refundedPaise: refundTarget, gatewayTransferId: transferId }
          });
          return 'SETTLED';
        },
        { timeout: 60_000, maxWait: 30_000 }
      );
    } catch (err) {
      console.error(`Settlement for booking ${bookingId} failed; the sweep will retry:`, err);
      return 'PENDING';
    }
  }

  /** Sweep: settles every paid booking that has reached a final status but isn't settled yet. */
  static async settlePendingPayments(): Promise<number> {
    const pending = await prisma.payment.findMany({
      where: { status: PaymentStatus.CAPTURED, booking: { status: { in: SETTLE_STATUSES } } },
      select: { bookingId: true }
    });
    let settled = 0;
    for (const { bookingId } of pending) {
      if ((await PaymentService.settleBooking(bookingId)) === 'SETTLED') settled += 1;
    }
    return settled;
  }

  // ---------------------------------------------------------------------------------------------
  // Cancellations, disputes and admin rulings
  // ---------------------------------------------------------------------------------------------

  /**
   * The booker or the artist cancels before the event starts. Artist cancellations refund 100%;
   * booker cancellations follow CUSTOMER_CANCELLATION_POLICY. The night is released either way.
   */
  static async cancelBooking(bookingId: number, userId: number, reason?: string, now: Date = new Date()) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { artist: true, slot: true, payment: true }
    });
    if (!booking) {
      throw notFound('Booking not found');
    }
    const isCustomer = booking.customerId === userId;
    const isArtist = booking.artist.userId === userId;
    if (!isCustomer && !isArtist) {
      throw forbidden('Only the booker or the artist can cancel this booking');
    }
    if (!CANCELLABLE_STATUSES.includes(booking.status as BookingStatus)) {
      throw conflict(`Cannot cancel a booking with status ${booking.status}`);
    }
    const eventStart = computeEventStart(booking.slot);
    if (now >= eventStart) {
      throw conflict('The event has already started. Use "Report a problem" instead.');
    }

    const paid = booking.status === BookingStatus.CONFIRMED;
    const payment = booking.payment;
    let refundTarget = 0;
    if (payment) {
      if (!paid) {
        // Not paid yet: anything that still lands on this order goes straight back
        refundTarget = payment.amountPaise;
      } else if (isArtist) {
        refundTarget = payment.amountPaise;
      } else {
        const hoursBefore = (eventStart.getTime() - now.getTime()) / HOUR_MS;
        refundTarget = Math.round((payment.amountPaise * customerRefundPercent(hoursBefore)) / 100);
      }
    }

    const newStatus = isArtist ? BookingStatus.CANCELLED_BY_ARTIST : BookingStatus.CANCELLED_BY_CUSTOMER;
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.booking.updateMany({
        where: { id: bookingId, status: booking.status },
        data: { status: newStatus, cancelledAt: now, cancellationReason: reason ?? null }
      });
      if (count === 0) {
        throw conflict('This booking just changed. Refresh and try again.');
      }
      if (payment) {
        await tx.payment.update({ where: { id: payment.id }, data: { refundTargetPaise: refundTarget } });
      }
      await releaseSlotsIfFree(tx, [booking.slotId]);
    });

    if (paid) await PaymentService.settleBooking(bookingId);

    return {
      booking: await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { payment: true, slot: true } }),
      refundPaise: paid ? refundTarget : 0
    };
  }

  /**
   * The booker reports a problem with a paid gig, from the event start until the dispute window
   * after it ends. The money stays held and auto-completion stops until an admin rules.
   */
  static async openDispute(bookingId: number, customerId: number, reason: string, now: Date = new Date()) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { slot: true } });
    if (!booking) {
      throw notFound('Booking not found');
    }
    if (booking.customerId !== customerId) {
      throw forbidden('Only the booker can report a problem with this booking');
    }
    if (booking.status === BookingStatus.DISPUTED) {
      throw conflict('A problem has already been reported for this booking');
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw conflict(`Cannot report a problem on a booking with status ${booking.status}`);
    }
    const eventStart = computeEventStart(booking.slot);
    const eventEnd = booking.eventEndsAt ?? computeEventEnd(booking.slot);
    const windowEnd = new Date(eventEnd.getTime() + paymentsConfig().disputeWindowHours * HOUR_MS);
    if (now < eventStart) {
      throw conflict('You can report a problem once the event has started. Before that, you can cancel.');
    }
    if (now > windowEnd) {
      throw conflict('The window to report a problem with this gig has closed');
    }

    const { count } = await prisma.booking.updateMany({
      where: { id: bookingId, status: BookingStatus.CONFIRMED },
      data: { status: BookingStatus.DISPUTED, disputeReason: reason, disputedAt: now }
    });
    if (count === 0) {
      throw conflict('This booking just changed. Refresh and try again.');
    }
    return prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  }

  /** Admin: open disputes, oldest first, with what's needed to decide. */
  static async listDisputes() {
    return prisma.booking.findMany({
      where: { status: BookingStatus.DISPUTED },
      include: {
        artist: { select: { id: true, artistName: true, userId: true } },
        customer: { select: { id: true, name: true, venueName: true, email: true, phone: true } },
        slot: true,
        payment: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { sender: { select: { id: true, name: true, role: true } } }
        }
      },
      orderBy: { disputedAt: 'asc' }
    });
  }

  /**
   * Admin: rules on a dispute. PAY_ARTIST completes the gig; REFUND gives the booker everything
   * back; SPLIT completes the gig with `refundPaise` going back to the booker.
   */
  static async resolveDispute(bookingId: number, outcome: unknown, refundPaise?: unknown) {
    if (outcome !== 'PAY_ARTIST' && outcome !== 'REFUND' && outcome !== 'SPLIT') {
      throw badRequest('outcome must be PAY_ARTIST, REFUND or SPLIT');
    }
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { payment: true } });
    if (!booking) {
      throw notFound('Booking not found');
    }
    if (booking.status !== BookingStatus.DISPUTED || !booking.payment) {
      throw conflict(`Cannot resolve a booking with status ${booking.status}`);
    }
    const amount = booking.payment.amountPaise;

    let refundTarget = 0;
    if (outcome === 'REFUND') {
      refundTarget = amount;
    } else if (outcome === 'SPLIT') {
      if (typeof refundPaise !== 'number' || !Number.isSafeInteger(refundPaise) || refundPaise <= 0 || refundPaise >= amount) {
        throw badRequest(`refundPaise must be a whole number of paise between 1 and ${amount - 1}`);
      }
      refundTarget = refundPaise;
    }

    const now = new Date();
    const newStatus = outcome === 'REFUND' ? BookingStatus.REFUNDED : BookingStatus.COMPLETED;
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.booking.updateMany({
        where: { id: bookingId, status: BookingStatus.DISPUTED },
        data: {
          status: newStatus,
          resolution: outcome,
          resolvedAt: now,
          ...(newStatus === BookingStatus.COMPLETED ? { completedAt: now } : {})
        }
      });
      if (count === 0) {
        throw conflict('This dispute has already been resolved');
      }
      await tx.payment.update({ where: { id: booking.payment!.id }, data: { refundTargetPaise: refundTarget } });
    });

    await PaymentService.settleBooking(bookingId);
    return prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { payment: true } });
  }
}

const HOUR_MS = 60 * 60 * 1000;
/** Arbitrary namespace for settlement advisory locks (the booking id is the second key). */
const SETTLE_LOCK_NAMESPACE = 7311;
/** Final booking statuses whose money should be released and/or refunded. */
const SETTLE_STATUSES: BookingStatus[] = [
  BookingStatus.COMPLETED,
  BookingStatus.CANCELLED_BY_ARTIST,
  BookingStatus.CANCELLED_BY_CUSTOMER,
  BookingStatus.REFUNDED
];
/** Bookings that can still be cancelled (before the event starts). */
const CANCELLABLE_STATUSES: BookingStatus[] = [
  BookingStatus.ACCEPTED,
  BookingStatus.AWAITING_PAYMENT,
  BookingStatus.CONFIRMED
];

function isCapturedEntity(entity: any): entity is CapturedPaymentEntity {
  return (
    typeof entity?.id === 'string' &&
    typeof entity?.order_id === 'string' &&
    typeof entity?.amount === 'number' &&
    typeof entity?.currency === 'string'
  );
}
