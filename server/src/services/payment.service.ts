import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { conflict, forbidden, notFound } from '../lib/http';
import { getPaymentGateway } from '../lib/payments';
import { paymentsConfig, splitAmount } from '../config/payments';
import { BookingStatus, PaymentStatus } from '../types';
import { BookingService } from './booking.service';

export interface CheckoutDetails {
  orderId: string;
  /** Razorpay public key for the checkout page. */
  keyId: string;
  amountPaise: number;
  /** Hosted checkout page the app opens in a browser (served from Phase 6). */
  checkoutUrl: string;
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
}
