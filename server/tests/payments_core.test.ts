import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { BookingService } from '../src/services/booking.service';
import { splitAmount } from '../src/config/payments';
import { getPaymentGateway, setPaymentGateway } from '../src/lib/payments';
import { FakePaymentGateway } from '../src/lib/payments/fake.gateway';
import { BookingStatus, PaymentStatus, VerificationStatus } from '../src/types';

const HOUR_MS = 60 * 60 * 1000;

/** YYYY-MM-DD for "today + n days" in IST, the marketplace's timezone. */
const istDateString = (daysFromNow: number) =>
  new Date(Date.now() + 5.5 * HOUR_MS + daysFromNow * 24 * HOUR_MS).toISOString().split('T')[0];

describe('splitAmount', () => {
  it('takes the platform fee and gives the rest to the artist', () => {
    expect(splitAmount(1_500_000, 10)).toEqual({ platformFeePaise: 150_000, artistSharePaise: 1_350_000 });
  });

  it('rounds the fee to whole paise and never loses a paisa', () => {
    const { platformFeePaise, artistSharePaise } = splitAmount(333, 10);
    expect(platformFeePaise).toBe(33);
    expect(platformFeePaise + artistSharePaise).toBe(333);
  });

  it('rejects non-integer or non-positive amounts', () => {
    expect(() => splitAmount(10.5, 10)).toThrow();
    expect(() => splitAmount(0, 10)).toThrow();
  });
});

describe('Payments core: accept → AWAITING_PAYMENT → pay', () => {
  const customerToken = 'mock_customer_token';
  const artistToken = 'mock_artist_token';
  const otherCustomerToken = 'mock_new_user_cust_02';
  const farDate = '2027-03-10';
  const soonDate = istDateString(1);
  const ARTIST_ACCOUNT = 'acc_fake_jammers';
  let artistId: number;
  let baseFee: number;
  let farSlotId: number;
  let soonSlotId: number;
  let fake: FakePaymentGateway;
  let originalPaymentsEnabled: string | undefined;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const cleanup = async () => {
    const where = { artistId, slot: { date: { in: [farDate, soonDate] } } };
    await prisma.payment.deleteMany({ where: { booking: where } });
    await prisma.booking.deleteMany({ where });
    await prisma.availabilitySlot.deleteMany({ where: { artistId, date: { in: [farDate, soonDate] } } });
  };

  const requestBooking = (slotId: number, token = customerToken) =>
    request(app)
      .post('/api/bookings')
      .set(auth(token))
      .send({ artistId, slotId, eventType: 'Payments Test Gig', eventLocation: 'Test Venue, Hyderabad' });

  const accept = (bookingId: number) =>
    request(app).put(`/api/bookings/${bookingId}/respond`).set(auth(artistToken)).send({ action: 'ACCEPT' });

  const pay = (bookingId: number, token = customerToken) =>
    request(app).post(`/api/bookings/${bookingId}/pay`).set(auth(token));

  const createAwaitingPayment = async (slotId = farSlotId): Promise<number> => {
    const res = await requestBooking(slotId);
    expect(res.status).toBe(201);
    const acceptRes = await accept(res.body.booking.id);
    expect(acceptRes.status).toBe(200);
    return res.body.booking.id;
  };

  beforeAll(async () => {
    originalPaymentsEnabled = process.env.PAYMENTS_ENABLED;
    process.env.PAYMENTS_ENABLED = 'true';
    fake = new FakePaymentGateway();
    setPaymentGateway(fake);

    await request(app).post('/api/auth/complete-signup').send({
      idToken: otherCustomerToken,
      role: 'CUSTOMER',
      name: 'Second Venue Organizer',
      email: 'venue2@hyderabadbars.in'
    });
    const artist = await prisma.artistProfile.findFirst({
      where: { verificationStatus: VerificationStatus.VERIFIED, user: { email: 'jammers@stagely.in' } }
    });
    expect(artist).toBeDefined();
    artistId = artist!.id;
    baseFee = artist!.baseFee;
    await prisma.artistProfile.update({
      where: { id: artistId },
      data: { payoutAccountId: ARTIST_ACCOUNT, payoutStatus: 'ACTIVE' }
    });
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
    farSlotId = (await prisma.availabilitySlot.create({
      data: { artistId, date: farDate, startTime: '20:00', endTime: '23:00' }
    })).id;
    soonSlotId = (await prisma.availabilitySlot.create({
      data: { artistId, date: soonDate, startTime: '20:00', endTime: '23:00' }
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

  it('locks in the fee in paise when the booker requests', async () => {
    const res = await requestBooking(farSlotId);
    expect(res.status).toBe(201);
    expect(res.body.booking.amountPaise).toBe(baseFee * 100);
  });

  it('moves an accepted booking to AWAITING_PAYMENT with a 24h payment deadline', async () => {
    const before = Date.now();
    const bookingId = await createAwaitingPayment();
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe(BookingStatus.AWAITING_PAYMENT);
    const due = booking.paymentDueAt!.getTime();
    expect(due).toBeGreaterThanOrEqual(before + 24 * HOUR_MS - 1000);
    expect(due).toBeLessThanOrEqual(Date.now() + 24 * HOUR_MS + 1000);
  });

  it('caps the payment deadline at the event start', async () => {
    const bookingId = await createAwaitingPayment(soonSlotId);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.paymentDueAt!.getTime()).toBeLessThanOrEqual(new Date(`${soonDate}T20:00:00+05:30`).getTime());
  });

  it('keeps the old ACCEPTED flow when payments are switched off', async () => {
    process.env.PAYMENTS_ENABLED = 'false';
    try {
      const res = await requestBooking(farSlotId);
      const acceptRes = await accept(res.body.booking.id);
      expect(acceptRes.body.booking.status).toBe(BookingStatus.ACCEPTED);
      expect(acceptRes.body.booking.paymentDueAt).toBeNull();
    } finally {
      process.env.PAYMENTS_ENABLED = 'true';
    }
  });

  it('holds the night while awaiting payment', async () => {
    await createAwaitingPayment();
    const other = await prisma.availabilitySlot.create({
      data: { artistId, date: farDate, startTime: '23:30', endTime: '23:59' }
    });
    const res = await requestBooking(other.id, otherCustomerToken);
    expect(res.status).toBe(409);
  });

  it('creates an order with the artist share held, and returns checkout details', async () => {
    const bookingId = await createAwaitingPayment();
    const res = await pay(bookingId);
    expect(res.status).toBe(200);

    const amountPaise = baseFee * 100;
    const { platformFeePaise, artistSharePaise } = splitAmount(amountPaise, 10);
    expect(res.body).toMatchObject({ keyId: 'rzp_test_fake', amountPaise });
    expect(res.body.orderId).toMatch(/^order_/);
    expect(res.body.checkoutUrl).toMatch(new RegExp(`/pay/${res.body.orderId}$`));

    const payment = await prisma.payment.findUniqueOrThrow({ where: { bookingId } });
    expect(payment).toMatchObject({
      gatewayOrderId: res.body.orderId,
      amountPaise,
      platformFeePaise,
      artistSharePaise,
      status: PaymentStatus.CREATED
    });

    const order = fake.orders.get(res.body.orderId)!;
    expect(order.artistAccountId).toBe(ARTIST_ACCOUNT);
    expect(order.artistSharePaise).toBe(artistSharePaise);
  });

  it('returns the same order when pay is called again', async () => {
    const bookingId = await createAwaitingPayment();
    const first = await pay(bookingId);
    const second = await pay(bookingId);
    expect(second.status).toBe(200);
    expect(second.body.orderId).toBe(first.body.orderId);
  });

  it('creates only one order when pay is called twice at once', async () => {
    const bookingId = await createAwaitingPayment();
    const [a, b] = await Promise.all([pay(bookingId), pay(bookingId)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.orderId).toBe(b.body.orderId);
    expect(await prisma.payment.count({ where: { bookingId } })).toBe(1);
  });

  it("refuses to let another booker pay for someone else's booking", async () => {
    const bookingId = await createAwaitingPayment();
    const res = await pay(bookingId, otherCustomerToken);
    expect(res.status).toBe(403);
  });

  it('refuses to let the artist start a payment', async () => {
    const bookingId = await createAwaitingPayment();
    const res = await pay(bookingId, artistToken);
    expect(res.status).toBe(403);
  });

  it('refuses payment before the artist accepts', async () => {
    const res = await requestBooking(farSlotId);
    const payRes = await pay(res.body.booking.id);
    expect(payRes.status).toBe(409);
  });

  it('refuses payment if the artist has no payout account', async () => {
    const bookingId = await createAwaitingPayment();
    await prisma.artistProfile.update({ where: { id: artistId }, data: { payoutAccountId: null } });
    try {
      const res = await pay(bookingId);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/payout/i);
    } finally {
      await prisma.artistProfile.update({ where: { id: artistId }, data: { payoutAccountId: ARTIST_ACCOUNT } });
    }
  });

  it('returns 404 for an unknown booking', async () => {
    const res = await pay(999999999);
    expect(res.status).toBe(404);
  });

  describe('payment expiry', () => {
    const backdateDue = (bookingId: number) =>
      prisma.booking.update({ where: { id: bookingId }, data: { paymentDueAt: new Date(Date.now() - 60 * 1000) } });

    it('expires an unpaid booking and releases the night', async () => {
      const bookingId = await createAwaitingPayment();
      await backdateDue(bookingId);

      const count = await BookingService.expireUnpaidBookings();
      expect(count).toBeGreaterThanOrEqual(1);
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(booking.status).toBe(BookingStatus.PAYMENT_EXPIRED);
      const slot = await prisma.availabilitySlot.findUniqueOrThrow({ where: { id: farSlotId } });
      expect(slot.isBooked).toBe(false);
    });

    it('leaves a booking alone before its deadline', async () => {
      const bookingId = await createAwaitingPayment();
      await BookingService.expireUnpaidBookings();
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(booking.status).toBe(BookingStatus.AWAITING_PAYMENT);
    });

    it('refuses to pay once the window has closed (no manual sweep)', async () => {
      const bookingId = await createAwaitingPayment();
      await backdateDue(bookingId);
      const res = await pay(bookingId);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/expired|closed/i);
    });

    it('lets another booker take the night after the payment window lapses', async () => {
      const bookingId = await createAwaitingPayment();
      await backdateDue(bookingId);
      const res = await requestBooking(farSlotId, otherCustomerToken);
      expect(res.status).toBe(201);
    });
  });

  it('uses the fake gateway under test', () => {
    expect(getPaymentGateway().name).toBe('fake');
  });
});
