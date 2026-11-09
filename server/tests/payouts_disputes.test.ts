import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { BookingService } from '../src/services/booking.service';
import { PaymentService } from '../src/services/payment.service';
import { customerRefundPercent } from '../src/config/payments';
import { setPaymentGateway } from '../src/lib/payments';
import { FakePaymentGateway, signFakeWebhook } from '../src/lib/payments/fake.gateway';
import { BookingStatus, PaymentStatus, VerificationStatus } from '../src/types';

const HOUR_MS = 60 * 60 * 1000;

describe('customerRefundPercent (confirmed cancellation policy)', () => {
  it.each([
    [200, 100],
    [168, 100],
    [167.9, 50],
    [24, 50],
    [23.9, 0],
    [0.5, 0]
  ])('%sh before the event refunds %s%%', (hours, percent) => {
    expect(customerRefundPercent(hours)).toBe(percent);
  });
});

describe('Payouts, disputes, cancellations and refunds', () => {
  const customerToken = 'mock_customer_token';
  const artistToken = 'mock_artist_token';
  const adminToken = 'mock_admin_token';
  const otherCustomerToken = 'mock_new_user_cust_02';
  const testDate = '2027-05-20';
  const eventStart = new Date(`${testDate}T20:00:00+05:30`);
  const eventEnd = new Date(`${testDate}T23:00:00+05:30`);
  let artistId: number;
  let slotId: number;
  let customerId: number;
  let artistUserId: number;
  let fake: FakePaymentGateway;
  let originalPaymentsEnabled: string | undefined;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const cleanup = async () => {
    const where = { artistId, slot: { date: testDate } };
    await prisma.review.deleteMany({ where: { booking: where } });
    await prisma.message.deleteMany({ where: { booking: where } });
    await prisma.payment.deleteMany({ where: { booking: where } });
    await prisma.booking.deleteMany({ where });
    await prisma.availabilitySlot.deleteMany({ where: { artistId, date: testDate } });
    await prisma.paymentEvent.deleteMany({ where: { eventId: { startsWith: 'evt_test_pd_' } } });
  };

  const bookingOf = (id: number) => prisma.booking.findUniqueOrThrow({ where: { id }, include: { payment: true, slot: true } });

  /** Request → accept → pay → capture (confirmed via the status poll). */
  const createConfirmed = async (): Promise<number> => {
    const res = await request(app)
      .post('/api/bookings')
      .set(auth(customerToken))
      .send({ artistId, slotId, eventType: 'Payout Test Gig', eventLocation: 'Test Venue, Hyderabad' });
    expect(res.status).toBe(201);
    const bookingId = res.body.booking.id;
    await request(app).put(`/api/bookings/${bookingId}/respond`).set(auth(artistToken)).send({ action: 'ACCEPT' });
    const payRes = await request(app).post(`/api/bookings/${bookingId}/pay`).set(auth(customerToken));
    fake.simulateCapture(payRes.body.orderId);
    const status = await request(app).get(`/api/bookings/${bookingId}/payment-status`).set(auth(customerToken));
    expect(status.body.bookingStatus).toBe(BookingStatus.CONFIRMED);
    return bookingId;
  };

  /** The fake transfer and refunds for a booking's payment. */
  const moneyOf = async (bookingId: number) => {
    const { payment } = await bookingOf(bookingId);
    const transfer = [...fake.transfers.values()].find((t) => t.paymentId === payment!.gatewayPaymentId)!;
    const refundedPaise = fake.refunds.filter((r) => r.paymentId === payment!.gatewayPaymentId).reduce((s, r) => s + r.amountPaise, 0);
    const artistKeeps = transfer.amountPaise - transfer.reversedPaise;
    return { payment: payment!, transfer, refundedPaise, artistKeeps };
  };

  /** What the artist should end up with when the booker gets `refund` back. */
  const expectedArtistKeeps = (payment: { amountPaise: number; platformFeePaise: number }, refund: number) => {
    const kept = payment.amountPaise - refund;
    return kept - Math.round((kept * payment.platformFeePaise) / payment.amountPaise);
  };

  beforeAll(async () => {
    originalPaymentsEnabled = process.env.PAYMENTS_ENABLED;
    process.env.PAYMENTS_ENABLED = 'true';
    await request(app).post('/api/auth/complete-signup').send({
      idToken: otherCustomerToken,
      role: 'CUSTOMER',
      name: 'Second Venue Organizer',
      email: 'venue2@hyderabadbars.in'
    });
    const artist = await prisma.artistProfile.findFirst({
      where: { verificationStatus: VerificationStatus.VERIFIED, user: { email: 'jammers@stagely.in' } }
    });
    artistId = artist!.id;
    artistUserId = artist!.userId;
    customerId = (await prisma.user.findFirstOrThrow({ where: { firebaseUid: 'firebase_customer_uid_001' } })).id;
    await prisma.artistProfile.update({
      where: { id: artistId },
      data: { payoutAccountId: 'acc_fake_jammers', payoutStatus: 'ACTIVE' }
    });
    await cleanup();
  });

  beforeEach(async () => {
    fake = new FakePaymentGateway();
    setPaymentGateway(fake);
    await cleanup();
    slotId = (await prisma.availabilitySlot.create({
      data: { artistId, date: testDate, startTime: '20:00', endTime: '23:00' }
    })).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.artistProfile.update({
      where: { id: artistId },
      data: { payoutAccountId: null, payoutStatus: 'NOT_STARTED' }
    });
    if (originalPaymentsEnabled === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = originalPaymentsEnabled;
    setPaymentGateway(null);
    await prisma.$disconnect();
  });

  describe('completion releases the payout', () => {
    it('pays the artist when the booker marks the gig completed', async () => {
      const bookingId = await createConfirmed();
      await prisma.booking.update({ where: { id: bookingId }, data: { eventEndsAt: new Date(Date.now() - HOUR_MS) } });

      const res = await request(app).post(`/api/bookings/${bookingId}/complete`).set(auth(customerToken));
      expect(res.status).toBe(200);
      expect(res.body.booking.status).toBe(BookingStatus.COMPLETED);

      const { payment, transfer, refundedPaise, artistKeeps } = await moneyOf(bookingId);
      expect(payment.status).toBe(PaymentStatus.RELEASED);
      expect(transfer.onHold).toBe(false);
      expect(artistKeeps).toBe(payment.artistSharePaise);
      expect(refundedPaise).toBe(0);
    });

    it('pays the artist after the 48h auto-complete, via the sweep', async () => {
      const bookingId = await createConfirmed();
      await prisma.booking.update({ where: { id: bookingId }, data: { eventEndsAt: new Date(Date.now() - 49 * HOUR_MS) } });

      await BookingService.autoCompleteFinishedBookings();
      expect(await PaymentService.settlePendingPayments()).toBeGreaterThanOrEqual(1);

      const { payment, transfer } = await moneyOf(bookingId);
      expect((await bookingOf(bookingId)).status).toBe(BookingStatus.COMPLETED);
      expect(payment.status).toBe(PaymentStatus.RELEASED);
      expect(transfer.onHold).toBe(false);
    });

    it('retries a release that failed', async () => {
      const bookingId = await createConfirmed();
      await prisma.booking.update({ where: { id: bookingId }, data: { eventEndsAt: new Date(Date.now() - HOUR_MS) } });
      const realRelease = fake.releaseTransfer.bind(fake);
      fake.releaseTransfer = async () => {
        throw new Error('gateway down');
      };

      const res = await request(app).post(`/api/bookings/${bookingId}/complete`).set(auth(customerToken));
      expect(res.status).toBe(200);
      expect((await moneyOf(bookingId)).payment.status).toBe(PaymentStatus.CAPTURED);

      fake.releaseTransfer = realRelease;
      await PaymentService.settlePendingPayments();
      const { payment, transfer } = await moneyOf(bookingId);
      expect(payment.status).toBe(PaymentStatus.RELEASED);
      expect(transfer.onHold).toBe(false);
    });
  });

  describe('disputes', () => {
    const afterEvent = new Date(eventEnd.getTime() + HOUR_MS);

    it('holds the money and stops auto-completion while disputed', async () => {
      const bookingId = await createConfirmed();
      await PaymentService.openDispute(bookingId, customerId, 'Artist played 20 minutes', afterEvent);
      await prisma.booking.update({ where: { id: bookingId }, data: { eventEndsAt: new Date(Date.now() - 49 * HOUR_MS) } });

      await BookingService.autoCompleteFinishedBookings();
      await PaymentService.settlePendingPayments();

      const booking = await bookingOf(bookingId);
      expect(booking.status).toBe(BookingStatus.DISPUTED);
      expect(booking.disputeReason).toBe('Artist played 20 minutes');
      const { transfer, refundedPaise } = await moneyOf(bookingId);
      expect(transfer.onHold).toBe(true);
      expect(refundedPaise).toBe(0);
    });

    it('can be reported from the event start until 48h after it ends', async () => {
      const bookingId = await createConfirmed();
      await expect(
        PaymentService.openDispute(bookingId, customerId, 'No show', new Date(eventStart.getTime() - 60_000))
      ).rejects.toMatchObject({ statusCode: 409 });
      await expect(
        PaymentService.openDispute(bookingId, customerId, 'No show', new Date(eventEnd.getTime() + 49 * HOUR_MS))
      ).rejects.toMatchObject({ statusCode: 409 });
      await PaymentService.openDispute(bookingId, customerId, 'No show', new Date(eventStart.getTime() + HOUR_MS));
      expect((await bookingOf(bookingId)).status).toBe(BookingStatus.DISPUTED);
    });

    it('requires a reason and only the booker can report', async () => {
      const bookingId = await createConfirmed();
      const noReason = await request(app).post(`/api/bookings/${bookingId}/dispute`).set(auth(customerToken)).send({});
      expect(noReason.status).toBe(400);
      const artist = await request(app).post(`/api/bookings/${bookingId}/dispute`).set(auth(artistToken)).send({ reason: 'x' });
      expect(artist.status).toBe(403);
      const other = await request(app).post(`/api/bookings/${bookingId}/dispute`).set(auth(otherCustomerToken)).send({ reason: 'x' });
      expect(other.status).toBe(403);
    });

    it('cannot be opened on a booking that was never paid', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set(auth(customerToken))
        .send({ artistId, slotId, eventType: 'Payout Test Gig', eventLocation: 'Test Venue, Hyderabad' });
      await expect(
        PaymentService.openDispute(res.body.booking.id, customerId, 'No show', afterEvent)
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('admin resolution', () => {
    const openDispute = async () => {
      const bookingId = await createConfirmed();
      await PaymentService.openDispute(bookingId, customerId, 'Sound was terrible', new Date(eventEnd.getTime() + HOUR_MS));
      return bookingId;
    };
    const resolve = (bookingId: number, body: object, token = adminToken) =>
      request(app).post(`/api/admin/disputes/${bookingId}/resolve`).set(auth(token)).send(body);

    it('lists open disputes with the reason and chat for admins only', async () => {
      const bookingId = await openDispute();
      await request(app).post(`/api/bookings/${bookingId}/messages`).set(auth(customerToken)).send({ content: 'They left early' });

      const res = await request(app).get('/api/admin/disputes').set(auth(adminToken));
      expect(res.status).toBe(200);
      const dispute = res.body.disputes.find((d: { id: number }) => d.id === bookingId);
      expect(dispute.disputeReason).toBe('Sound was terrible');
      expect(dispute.messages.map((m: { content: string }) => m.content)).toContain('They left early');
      expect(dispute.payment.amountPaise).toBeGreaterThan(0);

      expect((await request(app).get('/api/admin/disputes').set(auth(customerToken))).status).toBe(403);
    });

    it('PAY_ARTIST completes the gig and releases the payout', async () => {
      const bookingId = await openDispute();
      const res = await resolve(bookingId, { outcome: 'PAY_ARTIST' });
      expect(res.status).toBe(200);

      const booking = await bookingOf(bookingId);
      expect(booking).toMatchObject({ status: BookingStatus.COMPLETED, resolution: 'PAY_ARTIST' });
      const { payment, transfer, refundedPaise } = await moneyOf(bookingId);
      expect(payment.status).toBe(PaymentStatus.RELEASED);
      expect(transfer.onHold).toBe(false);
      expect(refundedPaise).toBe(0);
    });

    it('REFUND gives the booker everything back and pulls back the artist share', async () => {
      const bookingId = await openDispute();
      expect((await resolve(bookingId, { outcome: 'REFUND' })).status).toBe(200);

      expect((await bookingOf(bookingId)).status).toBe(BookingStatus.REFUNDED);
      const { payment, refundedPaise, artistKeeps } = await moneyOf(bookingId);
      expect(payment).toMatchObject({ status: PaymentStatus.REFUNDED, refundedPaise: payment.amountPaise });
      expect(refundedPaise).toBe(payment.amountPaise);
      expect(artistKeeps).toBe(0);
    });

    it('SPLIT refunds part and pays the artist the rest minus the proportional fee', async () => {
      const bookingId = await openDispute();
      const { payment: before } = await moneyOf(bookingId);
      const refund = Math.round(before.amountPaise * 0.3);

      expect((await resolve(bookingId, { outcome: 'SPLIT', refundPaise: refund })).status).toBe(200);

      expect((await bookingOf(bookingId)).status).toBe(BookingStatus.COMPLETED);
      const { payment, transfer, refundedPaise, artistKeeps } = await moneyOf(bookingId);
      expect(payment).toMatchObject({ status: PaymentStatus.PARTIALLY_REFUNDED, refundedPaise: refund });
      expect(refundedPaise).toBe(refund);
      expect(artistKeeps).toBe(expectedArtistKeeps(payment, refund));
      expect(transfer.onHold).toBe(false);
    });

    it('rejects a SPLIT without a sensible refund amount', async () => {
      const bookingId = await openDispute();
      const { payment } = await moneyOf(bookingId);
      for (const refundPaise of [undefined, 0, payment.amountPaise, -5, 10.5]) {
        expect((await resolve(bookingId, { outcome: 'SPLIT', refundPaise })).status).toBe(400);
      }
      expect((await resolve(bookingId, { outcome: 'NOPE' })).status).toBe(400);
    });

    it('refuses to resolve twice, or to resolve a booking that is not disputed', async () => {
      const bookingId = await openDispute();
      expect((await resolve(bookingId, { outcome: 'PAY_ARTIST' })).status).toBe(200);
      expect((await resolve(bookingId, { outcome: 'REFUND' })).status).toBe(409);
      expect((await moneyOf(bookingId)).refundedPaise).toBe(0);
    });

    it('only an admin can resolve', async () => {
      const bookingId = await openDispute();
      expect((await resolve(bookingId, { outcome: 'REFUND' }, customerToken)).status).toBe(403);
      expect((await resolve(bookingId, { outcome: 'REFUND' }, artistToken)).status).toBe(403);
    });
  });

  describe('cancellations', () => {
    const hoursBefore = (h: number) => new Date(eventStart.getTime() - h * HOUR_MS);

    it('artist cancels: the booker gets everything back and the night reopens', async () => {
      const bookingId = await createConfirmed();
      const res = await request(app).post(`/api/bookings/${bookingId}/cancel`).set(auth(artistToken)).send({ reason: 'Band member ill' });
      expect(res.status).toBe(200);

      const booking = await bookingOf(bookingId);
      expect(booking.status).toBe(BookingStatus.CANCELLED_BY_ARTIST);
      expect(booking.slot.isBooked).toBe(false);
      const { payment, refundedPaise, artistKeeps } = await moneyOf(bookingId);
      expect(payment.status).toBe(PaymentStatus.REFUNDED);
      expect(refundedPaise).toBe(payment.amountPaise);
      expect(artistKeeps).toBe(0);
    });

    it('booker cancels more than 7 days out: full refund', async () => {
      const bookingId = await createConfirmed();
      await PaymentService.cancelBooking(bookingId, customerId, undefined, hoursBefore(8 * 24));
      const { payment, refundedPaise } = await moneyOf(bookingId);
      expect((await bookingOf(bookingId)).status).toBe(BookingStatus.CANCELLED_BY_CUSTOMER);
      expect(refundedPaise).toBe(payment.amountPaise);
    });

    it('booker cancels 1–7 days out: half back, artist paid the other half minus the fee', async () => {
      const bookingId = await createConfirmed();
      const result = await PaymentService.cancelBooking(bookingId, customerId, undefined, hoursBefore(3 * 24));

      const { payment, transfer, refundedPaise, artistKeeps } = await moneyOf(bookingId);
      const half = Math.round(payment.amountPaise / 2);
      expect(result.refundPaise).toBe(half);
      expect(refundedPaise).toBe(half);
      expect(artistKeeps).toBe(expectedArtistKeeps(payment, half));
      expect(transfer.onHold).toBe(false);
      expect(payment.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
    });

    it('booker cancels under 24h out: no refund, artist paid minus the fee', async () => {
      const bookingId = await createConfirmed();
      await PaymentService.cancelBooking(bookingId, customerId, undefined, hoursBefore(5));
      const { payment, transfer, refundedPaise, artistKeeps } = await moneyOf(bookingId);
      expect(refundedPaise).toBe(0);
      expect(artistKeeps).toBe(payment.artistSharePaise);
      expect(transfer.onHold).toBe(false);
      expect(payment.status).toBe(PaymentStatus.RELEASED);
    });

    it('cannot cancel once the event has started', async () => {
      const bookingId = await createConfirmed();
      await expect(
        PaymentService.cancelBooking(bookingId, artistUserId, undefined, new Date(eventStart.getTime() + 60_000))
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('only the booker or the artist can cancel', async () => {
      const bookingId = await createConfirmed();
      expect((await request(app).post(`/api/bookings/${bookingId}/cancel`).set(auth(otherCustomerToken))).status).toBe(403);
    });

    it('cancelling an unpaid booking frees the night, and a payment that lands later is refunded', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set(auth(customerToken))
        .send({ artistId, slotId, eventType: 'Payout Test Gig', eventLocation: 'Test Venue, Hyderabad' });
      const bookingId = res.body.booking.id;
      await request(app).put(`/api/bookings/${bookingId}/respond`).set(auth(artistToken)).send({ action: 'ACCEPT' });
      const payRes = await request(app).post(`/api/bookings/${bookingId}/pay`).set(auth(customerToken));

      expect((await request(app).post(`/api/bookings/${bookingId}/cancel`).set(auth(customerToken))).status).toBe(200);
      let booking = await bookingOf(bookingId);
      expect(booking.status).toBe(BookingStatus.CANCELLED_BY_CUSTOMER);
      expect(booking.slot.isBooked).toBe(false);

      // The checkout tab was still open and the booker paid anyway
      const late = fake.simulateCapture(payRes.body.orderId);
      const raw = JSON.stringify({
        entity: 'event',
        event: 'payment.captured',
        payload: { payment: { entity: { id: late.id, order_id: late.orderId, amount: late.amountPaise, currency: 'INR' } } }
      });
      const hook = await request(app)
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('X-Razorpay-Event-Id', `evt_test_pd_${Date.now()}`)
        .set('X-Razorpay-Signature', signFakeWebhook(raw))
        .send(raw);
      expect(hook.status).toBe(200);
      await PaymentService.settlePendingPayments();
      booking = await bookingOf(bookingId);
      expect(booking.status).toBe(BookingStatus.CANCELLED_BY_CUSTOMER);
      const refunded = fake.refunds.filter((r) => r.paymentId === late.id).reduce((s, r) => s + r.amountPaise, 0);
      expect(refunded).toBe(late.amountPaise);
      const transfer = [...fake.transfers.values()].find((t) => t.paymentId === late.id)!;
      expect(transfer.amountPaise - transfer.reversedPaise).toBe(0);
    });
  });

  describe('no refund after release, and no double refunds', () => {
    it('a released booking can no longer be cancelled, disputed or resolved', async () => {
      const bookingId = await createConfirmed();
      await prisma.booking.update({ where: { id: bookingId }, data: { eventEndsAt: new Date(Date.now() - HOUR_MS) } });
      await request(app).post(`/api/bookings/${bookingId}/complete`).set(auth(customerToken));

      expect((await request(app).post(`/api/bookings/${bookingId}/cancel`).set(auth(artistToken))).status).toBe(409);
      expect(
        (await request(app).post(`/api/bookings/${bookingId}/dispute`).set(auth(customerToken)).send({ reason: 'late' })).status
      ).toBe(409);
      expect(
        (await request(app).post(`/api/admin/disputes/${bookingId}/resolve`).set(auth(adminToken)).send({ outcome: 'REFUND' })).status
      ).toBe(409);
      expect((await moneyOf(bookingId)).refundedPaise).toBe(0);
    });

    it('concurrent settlement retries refund exactly once', async () => {
      const bookingId = await createConfirmed();
      const realRefund = fake.refund.bind(fake);
      fake.refund = async () => {
        throw new Error('gateway down');
      };
      await PaymentService.cancelBooking(bookingId, customerId, undefined, new Date(eventStart.getTime() - 3 * 24 * HOUR_MS));
      expect((await moneyOf(bookingId)).refundedPaise).toBe(0);

      fake.refund = realRefund;
      fake.latencyMs = 300; // slow gateway calls so the concurrent settlements genuinely overlap
      await Promise.all([
        PaymentService.settleBooking(bookingId),
        PaymentService.settleBooking(bookingId),
        PaymentService.settlePendingPayments()
      ]);
      const { payment, refundedPaise, artistKeeps } = await moneyOf(bookingId);
      const half = Math.round(payment.amountPaise / 2);
      expect(refundedPaise).toBe(half);
      expect(artistKeeps).toBe(expectedArtistKeeps(payment, half));
    });
  });
});
