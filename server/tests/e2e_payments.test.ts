import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { PaymentGateway, setPaymentGateway } from '../src/lib/payments';
import { FakePaymentGateway } from '../src/lib/payments/fake.gateway';
import { PayoutService } from '../src/services/payout.service';
import { BookingStatus, PaymentStatus } from '../src/types';

/**
 * Phase 7 (automated part): the whole payments journey over HTTP against the fake gateway —
 * artist onboarding with payouts, admin verification, payout activation, request, accept, hosted
 * checkout, payment, completion, payout release and review; plus a disputed gig split by an admin.
 * The same journey against real Razorpay Test Mode is the manual runbook in
 * docs/wiki/payments-test-mode.md.
 */
describe('E2E: payments journey', () => {
  const token = `mock_new_user_e2epay_${Date.now()}`;
  const uid = token.replace('mock_new_user_', 'firebase_new_uid_');
  const artistAuth = { Authorization: `Bearer ${token}` };
  const customerAuth = { Authorization: 'Bearer mock_customer_token' };
  const adminAuth = { Authorization: 'Bearer mock_admin_token' };
  const RETURN_URL = 'stagely://payment-result';
  const dates = ['2027-07-10', '2027-07-11'];
  let fake: FakePaymentGateway;
  let artistId: number;
  let originalPaymentsEnabled: string | undefined;

  const slotIdFor = async (date: string) =>
    (await prisma.availabilitySlot.findFirstOrThrow({ where: { artistId, date } })).id;

  /** Request → accept → pay through the hosted page. Returns the booking id once CONFIRMED. */
  const bookAndPay = async (date: string): Promise<number> => {
    const req = await request(app)
      .post('/api/bookings')
      .set(customerAuth)
      .send({ artistId, slotId: await slotIdFor(date), eventType: 'Wedding Sangeet', eventLocation: 'Taj Falaknuma, Hyderabad' });
    expect(req.status).toBe(201);
    const bookingId = req.body.booking.id;

    const accept = await request(app).put(`/api/bookings/${bookingId}/respond`).set(artistAuth).send({ action: 'ACCEPT' });
    expect(accept.status).toBe(200);
    expect(accept.body.booking.status).toBe(BookingStatus.AWAITING_PAYMENT);

    const pay = await request(app).post(`/api/bookings/${bookingId}/pay`).set(customerAuth);
    expect(pay.status).toBe(200);
    const checkoutPath = new URL(pay.body.checkoutUrl).pathname;

    const pageRes = await request(app).get(`${checkoutPath}?return=${encodeURIComponent(RETURN_URL)}`);
    expect(pageRes.status).toBe(200);
    expect(pageRes.text).toContain('Simulate successful payment');

    const simulate = await request(app).post(`${checkoutPath}/simulate?return=${encodeURIComponent(RETURN_URL)}`);
    expect(simulate.status).toBe(303);
    expect(simulate.headers.location).toBe(`${RETURN_URL}?status=success&bookingId=${bookingId}`);

    const status = await request(app).get(`/api/bookings/${bookingId}/payment-status`).set(customerAuth);
    expect(status.body).toMatchObject({ bookingStatus: BookingStatus.CONFIRMED, paymentStatus: PaymentStatus.CAPTURED });
    return bookingId;
  };

  /**
   * Time travel: the gig happened `daysAgo` days ago. Moves both the slot date (event start, used by
   * disputes) and eventEndsAt (used by completion). Bookings must be paid first: a past-dated slot
   * can't be paid for, because the payment window closes at the event start.
   */
  const endEvent = async (bookingId: number, daysAgo: number) => {
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    const day = new Date(Date.now() + 5.5 * 60 * 60 * 1000 - daysAgo * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await prisma.availabilitySlot.update({ where: { id: booking.slotId }, data: { date: day } });
    await prisma.booking.update({
      where: { id: bookingId },
      data: { eventEndsAt: new Date(`${day}T22:00:00+05:30`) }
    });
  };

  const moneyOf = async (bookingId: number) => {
    const payment = await prisma.payment.findUniqueOrThrow({ where: { bookingId } });
    const transfer = [...fake.transfers.values()].find((t) => t.paymentId === payment.gatewayPaymentId)!;
    const refunded = fake.refunds.filter((r) => r.paymentId === payment.gatewayPaymentId).reduce((s, r) => s + r.amountPaise, 0);
    return { payment, transfer, refunded };
  };

  beforeAll(async () => {
    originalPaymentsEnabled = process.env.PAYMENTS_ENABLED;
    process.env.PAYMENTS_ENABLED = 'true';
    fake = new FakePaymentGateway();
    setPaymentGateway(fake);
  });

  afterAll(async () => {
    const user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
    if (user) {
      const where = { artist: { userId: user.id } };
      await prisma.review.deleteMany({ where: { booking: where } });
      await prisma.message.deleteMany({ where: { booking: where } });
      await prisma.payment.deleteMany({ where: { booking: where } });
      await prisma.booking.deleteMany({ where });
      await prisma.availabilitySlot.deleteMany({ where });
      await prisma.artistProfile.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    if (originalPaymentsEnabled === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = originalPaymentsEnabled;
    setPaymentGateway(null);
    await prisma.$disconnect();
  });

  it('onboards an artist with payouts, gets them verified and activated', async () => {
    await request(app).post('/api/auth/complete-signup').send({ idToken: token, role: 'ARTIST', name: 'Raga Collective' });
    const onboard = await request(app)
      .post('/api/artists/onboard')
      .set(artistAuth)
      .send({
        artistName: 'Raga Collective',
        category: 'Band',
        genres: ['Sufi', 'Bollywood'],
        location: 'Hyderabad',
        baseFee: 40000,
        availableSlots: dates.map((date) => ({ date, startTime: '19:00', endTime: '22:00' })),
        payout: {
          legalName: 'Ravi Kumar',
          email: 'ravi@ragacollective.in',
          phone: '9848012345',
          pan: 'ABCPK1234L',
          accountNumber: '123456789012',
          ifsc: 'SBIN0001234',
          address: { street1: 'Plot 7, Jubilee Hills', city: 'Hyderabad', state: 'Telangana', postalCode: '500033' }
        }
      });
    expect(onboard.status).toBe(201);
    artistId = onboard.body.artistProfile.id;

    const verify = await request(app).put(`/api/admin/artists/${artistId}/verify`).set(adminAuth).send({ status: 'VERIFIED' });
    expect(verify.status).toBe(200);

    // Razorpay finishes its review; the sweep notices
    fake.setLinkedAccountStatus((await prisma.artistProfile.findUniqueOrThrow({ where: { id: artistId } })).payoutAccountId!, 'ACTIVE');
    await PayoutService.refreshPendingAccounts();
    const payout = await request(app).get('/api/artists/payout-account').set(artistAuth);
    expect(payout.body.payoutAccount).toMatchObject({ status: 'ACTIVE', accountNumberMasked: 'XXXX9012' });
  });

  it('happy path: book, pay, perform, complete, artist paid, review', async () => {
    const bookingId = await bookAndPay(dates[0]);
    await endEvent(bookingId, 2);

    const complete = await request(app).post(`/api/bookings/${bookingId}/complete`).set(customerAuth);
    expect(complete.status).toBe(200);

    const { payment, transfer, refunded } = await moneyOf(bookingId);
    expect(payment.status).toBe(PaymentStatus.RELEASED);
    expect(payment).toMatchObject({ amountPaise: 4_000_000, platformFeePaise: 400_000, artistSharePaise: 3_600_000 });
    expect(transfer).toMatchObject({ amountPaise: 3_600_000, reversedPaise: 0, onHold: false });
    expect(refunded).toBe(0);

    const review = await request(app).post(`/api/bookings/${bookingId}/review`).set(customerAuth).send({ rating: 5, comment: 'Magical evening' });
    expect(review.status).toBe(201);

    // The hosted page now says it's paid instead of offering checkout again
    const pageRes = await request(app).get(`/pay/${payment.gatewayOrderId}`);
    expect(pageRes.text).toMatch(/already paid/i);
  });

  it('disputed gig: booker reports a problem, admin splits the money', async () => {
    const bookingId = await bookAndPay(dates[1]);
    await endEvent(bookingId, 1);

    const dispute = await request(app)
      .post(`/api/bookings/${bookingId}/dispute`)
      .set(customerAuth)
      .send({ reason: 'Band arrived 90 minutes late and played half the set' });
    expect(dispute.status).toBe(200);
    expect((await request(app).post(`/api/bookings/${bookingId}/complete`).set(customerAuth)).status).toBe(409);

    const list = await request(app).get('/api/admin/disputes').set(adminAuth);
    expect(list.body.disputes.map((d: { id: number }) => d.id)).toContain(bookingId);

    const resolve = await request(app)
      .post(`/api/admin/disputes/${bookingId}/resolve`)
      .set(adminAuth)
      .send({ outcome: 'SPLIT', refundPaise: 2_000_000 });
    expect(resolve.status).toBe(200);
    expect(resolve.body.booking.status).toBe(BookingStatus.COMPLETED);

    const { payment, transfer, refunded } = await moneyOf(bookingId);
    expect(payment.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
    expect(refunded).toBe(2_000_000);
    // Kept ₹20,000; Stagely's 10% of that is ₹2,000; the artist keeps ₹18,000
    expect(transfer.amountPaise - transfer.reversedPaise).toBe(1_800_000);
    expect(transfer.onHold).toBe(false);
  });
});

describe('Hosted checkout page', () => {
  const customerAuth = { Authorization: 'Bearer mock_customer_token' };
  const testDate = '2027-07-20';
  let fake: FakePaymentGateway;
  let artistId: number;
  let originalPaymentsEnabled: string | undefined;

  const cleanup = async () => {
    const where = { artistId, slot: { date: testDate } };
    await prisma.payment.deleteMany({ where: { booking: where } });
    await prisma.booking.deleteMany({ where });
    await prisma.availabilitySlot.deleteMany({ where: { artistId, date: testDate } });
  };

  /** An AWAITING_PAYMENT booking with an order. */
  const createOrder = async (eventType = 'Corporate Night') => {
    const slot = await prisma.availabilitySlot.create({ data: { artistId, date: testDate, startTime: '20:00', endTime: '23:00' } });
    const req = await request(app)
      .post('/api/bookings')
      .set(customerAuth)
      .send({ artistId, slotId: slot.id, eventType, eventLocation: 'Hitex, Hyderabad' });
    await request(app).put(`/api/bookings/${req.body.booking.id}/respond`).set({ Authorization: 'Bearer mock_artist_token' }).send({ action: 'ACCEPT' });
    const pay = await request(app).post(`/api/bookings/${req.body.booking.id}/pay`).set(customerAuth);
    return { bookingId: req.body.booking.id as number, orderId: pay.body.orderId as string };
  };

  /** A gateway that behaves like Razorpay as far as the page is concerned (not the fake). */
  const razorpayLike = (): PaymentGateway => ({ name: 'razorpay', keyId: 'rzp_test_page123' }) as unknown as PaymentGateway;

  beforeAll(async () => {
    originalPaymentsEnabled = process.env.PAYMENTS_ENABLED;
    process.env.PAYMENTS_ENABLED = 'true';
    const artist = await prisma.artistProfile.findFirstOrThrow({ where: { user: { email: 'jammers@stagely.in' } } });
    artistId = artist.id;
    await prisma.artistProfile.update({ where: { id: artistId }, data: { payoutAccountId: 'acc_fake_page', payoutStatus: 'ACTIVE' } });
  });

  beforeEach(async () => {
    fake = new FakePaymentGateway();
    setPaymentGateway(fake);
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.artistProfile.update({ where: { id: artistId }, data: { payoutAccountId: null, payoutStatus: 'NOT_STARTED' } });
    if (originalPaymentsEnabled === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = originalPaymentsEnabled;
    setPaymentGateway(null);
    await prisma.$disconnect();
  });

  it('404s for malformed or unknown order ids', async () => {
    expect((await request(app).get('/pay/not-an-order')).status).toBe(404);
    expect((await request(app).get('/pay/order_doesnotexist99')).status).toBe(404);
  });

  it('renders Razorpay checkout with a nonce-locked CSP and the app return links', async () => {
    const { bookingId, orderId } = await createOrder();
    setPaymentGateway(razorpayLike());

    const res = await request(app).get(`/pay/${orderId}?return=${encodeURIComponent('stagely://payment-result')}`);
    expect(res.status).toBe(200);
    const csp = res.headers['content-security-policy'];
    const nonce = /'nonce-([^']+)'/.exec(csp)![1];
    expect(csp).toContain('https://checkout.razorpay.com');
    expect(csp).not.toContain("'unsafe-inline' https://checkout");
    expect(res.text).toContain(`<script nonce="${nonce}">`);
    expect(res.text).toContain('"key":"rzp_test_page123"');
    expect(res.text).toContain(`"order_id":"${orderId}"`);
    expect(res.text).toContain(`stagely://payment-result?status=success&bookingId=${bookingId}`);
    expect(res.text).not.toContain('Simulate');
  });

  it('ignores return URLs that are not the app', async () => {
    const { orderId } = await createOrder();
    setPaymentGateway(razorpayLike());
    const res = await request(app).get(`/pay/${orderId}?return=${encodeURIComponent('https://evil.example/steal')}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('evil.example');
    expect(res.text).toContain('var returns = null');
  });

  it('escapes booking text in the page', async () => {
    const { orderId } = await createOrder('<img src=x onerror=alert(1)>');
    const res = await request(app).get(`/pay/${orderId}`);
    expect(res.text).not.toContain('<img src=x');
    expect(res.text).toContain('&lt;img src=x');
  });

  it('refuses to simulate payments unless the fake gateway is in use', async () => {
    const { orderId } = await createOrder();
    setPaymentGateway(razorpayLike());
    expect((await request(app).post(`/pay/${orderId}/simulate`)).status).toBe(404);
  });

  it('simulating twice still confirms once', async () => {
    const { bookingId, orderId } = await createOrder();
    expect((await request(app).post(`/pay/${orderId}/simulate`)).status).toBe(303);
    expect((await request(app).post(`/pay/${orderId}/simulate`)).status).toBe(303);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { payment: true } });
    expect(booking.status).toBe(BookingStatus.CONFIRMED);
    expect([...fake.payments.values()].filter((p) => p.orderId === orderId)).toHaveLength(1);
  });
});
