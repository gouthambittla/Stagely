import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { BookingService } from '../src/services/booking.service';
import { PaymentService } from '../src/services/payment.service';
import { setPaymentGateway, GatewayPayment } from '../src/lib/payments';
import { FakePaymentGateway, signFakeWebhook } from '../src/lib/payments/fake.gateway';
import { BookingStatus, PaymentStatus, VerificationStatus } from '../src/types';

describe('Payment webhooks and confirmation', () => {
  const customerToken = 'mock_customer_token';
  const artistToken = 'mock_artist_token';
  const otherCustomerToken = 'mock_new_user_cust_02';
  const testDate = '2027-04-18';
  const EVENT_PREFIX = 'evt_test_wh_';
  let artistId: number;
  let slotId: number;
  let fake: FakePaymentGateway;
  let originalPaymentsEnabled: string | undefined;
  let eventSeq = 0;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const newEventId = () => `${EVENT_PREFIX}${Date.now()}_${++eventSeq}`;

  const cleanup = async () => {
    const where = { artistId, slot: { date: testDate } };
    await prisma.payment.deleteMany({ where: { booking: where } });
    await prisma.booking.deleteMany({ where });
    await prisma.availabilitySlot.deleteMany({ where: { artistId, date: testDate } });
    await prisma.paymentEvent.deleteMany({ where: { eventId: { startsWith: EVENT_PREFIX } } });
  };

  /** Request → accept → pay. Returns the booking id and Razorpay order id. */
  const createOrder = async (): Promise<{ bookingId: number; orderId: string }> => {
    const res = await request(app)
      .post('/api/bookings')
      .set(auth(customerToken))
      .send({ artistId, slotId, eventType: 'Webhook Test Gig', eventLocation: 'Test Venue, Hyderabad' });
    expect(res.status).toBe(201);
    const bookingId = res.body.booking.id;
    expect((await request(app).put(`/api/bookings/${bookingId}/respond`).set(auth(artistToken)).send({ action: 'ACCEPT' })).status).toBe(200);
    const payRes = await request(app).post(`/api/bookings/${bookingId}/pay`).set(auth(customerToken));
    expect(payRes.status).toBe(200);
    return { bookingId, orderId: payRes.body.orderId };
  };

  const paymentEvent = (p: GatewayPayment, event = 'payment.captured', overrides: Record<string, unknown> = {}) => ({
    entity: 'event',
    event,
    contains: ['payment'],
    payload: {
      payment: {
        entity: { id: p.id, entity: 'payment', order_id: p.orderId, amount: p.amountPaise, currency: 'INR', status: p.status, ...overrides }
      }
    },
    created_at: Math.floor(Date.now() / 1000)
  });

  const sendWebhook = (body: unknown, opts: { eventId?: string; signature?: string | null; raw?: string } = {}) => {
    const raw = opts.raw ?? JSON.stringify(body);
    let req = request(app)
      .post('/api/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Event-Id', opts.eventId ?? newEventId());
    if (opts.signature !== null) req = req.set('X-Razorpay-Signature', opts.signature ?? signFakeWebhook(raw));
    return req.send(raw);
  };

  const bookingOf = (id: number) => prisma.booking.findUniqueOrThrow({ where: { id }, include: { payment: true } });

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

  describe('signature and parsing', () => {
    it('rejects a bad signature with 401 and changes nothing', async () => {
      const { bookingId, orderId } = await createOrder();
      const payment = fake.simulateCapture(orderId);
      const eventId = newEventId();

      const res = await sendWebhook(paymentEvent(payment), { eventId, signature: 'deadbeef' });
      expect(res.status).toBe(401);
      expect((await bookingOf(bookingId)).status).toBe(BookingStatus.AWAITING_PAYMENT);
      expect(await prisma.paymentEvent.count({ where: { eventId } })).toBe(0);
    });

    it('rejects a missing signature with 401', async () => {
      const { orderId } = await createOrder();
      const res = await sendWebhook(paymentEvent(fake.simulateCapture(orderId)), { signature: null });
      expect(res.status).toBe(401);
    });

    it('rejects a body that was changed after signing', async () => {
      const { bookingId, orderId } = await createOrder();
      const payment = fake.simulateCapture(orderId);
      const signed = JSON.stringify(paymentEvent(payment));
      const tampered = JSON.stringify(paymentEvent(payment, 'payment.captured', { amount: 1 }));
      const res = await sendWebhook(null, { raw: tampered, signature: signFakeWebhook(signed) });
      expect(res.status).toBe(401);
      expect((await bookingOf(bookingId)).status).toBe(BookingStatus.AWAITING_PAYMENT);
    });

    it('returns 400 for a correctly signed body that is not JSON', async () => {
      const res = await sendWebhook(null, { raw: 'not json' });
      expect(res.status).toBe(400);
    });
  });

  describe('payment.captured', () => {
    it('confirms the booking and records the payment', async () => {
      const { bookingId, orderId } = await createOrder();
      const payment = fake.simulateCapture(orderId);

      const res = await sendWebhook(paymentEvent(payment));
      expect(res.status).toBe(200);

      const booking = await bookingOf(bookingId);
      expect(booking.status).toBe(BookingStatus.CONFIRMED);
      expect(booking.payment).toMatchObject({ gatewayPaymentId: payment.id, status: PaymentStatus.CAPTURED });
    });

    it('treats a replayed event as a no-op', async () => {
      const { bookingId, orderId } = await createOrder();
      const payment = fake.simulateCapture(orderId);
      const eventId = newEventId();

      expect((await sendWebhook(paymentEvent(payment), { eventId })).status).toBe(200);
      expect((await sendWebhook(paymentEvent(payment), { eventId })).status).toBe(200);

      expect(await prisma.paymentEvent.count({ where: { eventId } })).toBe(1);
      expect((await bookingOf(bookingId)).status).toBe(BookingStatus.CONFIRMED);
    });

    it('confirms only once when the same event arrives concurrently', async () => {
      const { bookingId, orderId } = await createOrder();
      const payment = fake.simulateCapture(orderId);
      const eventId = newEventId();

      const results = await Promise.all(Array.from({ length: 5 }, () => sendWebhook(paymentEvent(payment), { eventId })));
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(await prisma.paymentEvent.count({ where: { eventId } })).toBe(1);
      expect((await bookingOf(bookingId)).status).toBe(BookingStatus.CONFIRMED);
    });

    it('confirms once when payment.captured and order.paid race for the same payment', async () => {
      const { bookingId, orderId } = await createOrder();
      const payment = fake.simulateCapture(orderId);

      const [a, b] = await Promise.all([
        sendWebhook(paymentEvent(payment, 'payment.captured')),
        sendWebhook(paymentEvent(payment, 'order.paid'))
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      const booking = await bookingOf(bookingId);
      expect(booking.status).toBe(BookingStatus.CONFIRMED);
      expect(booking.payment?.gatewayPaymentId).toBe(payment.id);
      expect(fake.refunds).toHaveLength(0);
    });

    it('does not confirm when the captured amount does not match', async () => {
      const { bookingId, orderId } = await createOrder();
      const payment = fake.simulateCapture(orderId, 100);

      const res = await sendWebhook(paymentEvent(payment));
      expect(res.status).toBe(200);
      const booking = await bookingOf(bookingId);
      expect(booking.status).toBe(BookingStatus.AWAITING_PAYMENT);
      expect(booking.payment?.status).not.toBe(PaymentStatus.CAPTURED);
    });

    it('refunds in full when the payment lands after the window expired', async () => {
      const { bookingId, orderId } = await createOrder();
      await prisma.booking.update({ where: { id: bookingId }, data: { paymentDueAt: new Date(Date.now() - 60_000) } });
      await BookingService.expireUnpaidBookings();
      const payment = fake.simulateCapture(orderId);

      expect((await sendWebhook(paymentEvent(payment))).status).toBe(200);

      const booking = await bookingOf(bookingId);
      expect(booking.status).toBe(BookingStatus.PAYMENT_EXPIRED);
      expect(booking.payment).toMatchObject({ status: PaymentStatus.REFUNDED, refundedPaise: payment.amountPaise });
      expect(fake.refunds).toEqual([expect.objectContaining({ paymentId: payment.id, amountPaise: payment.amountPaise })]);
      // The artist's held share was pulled back too
      const transfer = [...fake.transfers.values()].find((t) => t.paymentId === payment.id)!;
      expect(transfer.reversedPaise).toBe(transfer.amountPaise);
    });

    it('retries a failed late-payment refund from the sweep', async () => {
      const { bookingId, orderId } = await createOrder();
      await prisma.booking.update({ where: { id: bookingId }, data: { paymentDueAt: new Date(Date.now() - 60_000) } });
      await BookingService.expireUnpaidBookings();
      const payment = fake.simulateCapture(orderId);

      const realRefund = fake.refund.bind(fake);
      fake.refund = async () => {
        throw new Error('gateway down');
      };
      expect((await sendWebhook(paymentEvent(payment))).status).toBe(200);
      expect((await bookingOf(bookingId)).payment?.status).toBe(PaymentStatus.CAPTURED);

      fake.refund = realRefund;
      const retried = await PaymentService.retryLateCaptureRefunds();
      expect(retried).toBeGreaterThanOrEqual(1);
      expect((await bookingOf(bookingId)).payment?.status).toBe(PaymentStatus.REFUNDED);
    });

    it('ignores a payment for an order Stagely does not know', async () => {
      const res = await sendWebhook(
        paymentEvent({ id: 'pay_unknown', orderId: 'order_unknown', amountPaise: 5000, status: 'captured' })
      );
      expect(res.status).toBe(200);
    });
  });

  describe('other events', () => {
    it('payment.failed leaves the booking payable, and a later capture still confirms it', async () => {
      const { bookingId, orderId } = await createOrder();
      const failed: GatewayPayment = { id: 'pay_failed_try', orderId, amountPaise: 1, status: 'failed' };

      expect((await sendWebhook(paymentEvent(failed, 'payment.failed'))).status).toBe(200);
      let booking = await bookingOf(bookingId);
      expect(booking.status).toBe(BookingStatus.AWAITING_PAYMENT);
      expect(booking.payment?.status).toBe(PaymentStatus.FAILED);

      const retry = await request(app).post(`/api/bookings/${bookingId}/pay`).set(auth(customerToken));
      expect(retry.body.orderId).toBe(orderId);

      expect((await sendWebhook(paymentEvent(fake.simulateCapture(orderId)))).status).toBe(200);
      booking = await bookingOf(bookingId);
      expect(booking.status).toBe(BookingStatus.CONFIRMED);
      expect(booking.payment?.status).toBe(PaymentStatus.CAPTURED);
    });

    it('transfer.processed stores the held transfer id', async () => {
      const { bookingId, orderId } = await createOrder();
      const payment = fake.simulateCapture(orderId);
      await sendWebhook(paymentEvent(payment));
      const transfer = [...fake.transfers.values()].find((t) => t.paymentId === payment.id)!;

      const res = await sendWebhook({
        entity: 'event',
        event: 'transfer.processed',
        contains: ['transfer'],
        payload: { transfer: { entity: { id: transfer.id, entity: 'transfer', source: payment.id, amount: transfer.amountPaise } } }
      });
      expect(res.status).toBe(200);
      expect((await bookingOf(bookingId)).payment?.gatewayTransferId).toBe(transfer.id);
    });

    it('acknowledges events it does not handle', async () => {
      const res = await sendWebhook({ entity: 'event', event: 'settlement.processed', payload: {} });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/bookings/:id/payment-status', () => {
    const status = (bookingId: number, token = customerToken) =>
      request(app).get(`/api/bookings/${bookingId}/payment-status`).set(auth(token));

    it('shows the booker and the artist where the payment stands', async () => {
      const { bookingId } = await createOrder();
      for (const token of [customerToken, artistToken]) {
        const res = await status(bookingId, token);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
          bookingStatus: BookingStatus.AWAITING_PAYMENT,
          paymentStatus: PaymentStatus.CREATED
        });
      }
    });

    it('is private to the booking', async () => {
      const { bookingId } = await createOrder();
      expect((await status(bookingId, otherCustomerToken)).status).toBe(403);
    });

    it('confirms by asking the gateway when the webhook has not arrived yet', async () => {
      const { bookingId, orderId } = await createOrder();
      fake.simulateCapture(orderId);

      const res = await status(bookingId);
      expect(res.status).toBe(200);
      expect(res.body.bookingStatus).toBe(BookingStatus.CONFIRMED);
      expect(res.body.paymentStatus).toBe(PaymentStatus.CAPTURED);
    });

    it('does not confirm when the gateway has no captured payment', async () => {
      const { bookingId } = await createOrder();
      const res = await status(bookingId);
      expect(res.body.bookingStatus).toBe(BookingStatus.AWAITING_PAYMENT);
    });
  });
});
