import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { AUTO_COMPLETE_AFTER_HOURS, BookingService, computeEventEnd } from '../src/services/booking.service';
import { BookingStatus, VerificationStatus } from '../src/types';

const HOUR_MS = 60 * 60 * 1000;

describe('Booking completion: gigs reach COMPLETED so reviews unlock', () => {
  const customerToken = 'mock_customer_token';
  const artistToken = 'mock_artist_token';
  const otherCustomerToken = 'mock_new_user_cust_02';
  const testDate = '2027-02-14';
  let artistId: number;
  let slotId: number;

  const cleanup = async () => {
    await prisma.review.deleteMany({ where: { booking: { artistId, slot: { date: testDate } } } });
    await prisma.booking.deleteMany({ where: { artistId, slot: { date: testDate } } });
    await prisma.availabilitySlot.deleteMany({ where: { artistId, date: testDate } });
  };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Requests the slot as the default customer and has the artist accept it. */
  const createAcceptedBooking = async (): Promise<number> => {
    const res = await request(app)
      .post('/api/bookings')
      .set(auth(customerToken))
      .send({ artistId, slotId, eventType: 'Completion Test Gig', eventLocation: 'Test Venue, Hyderabad' });
    expect(res.status).toBe(201);
    const accept = await request(app)
      .put(`/api/bookings/${res.body.booking.id}/respond`)
      .set(auth(artistToken))
      .send({ action: 'ACCEPT' });
    expect(accept.status).toBe(200);
    return res.body.booking.id;
  };

  /** Pretends the gig ended `hoursAgo` hours ago. */
  const endEventHoursAgo = (bookingId: number, hoursAgo: number) =>
    prisma.booking.update({
      where: { id: bookingId },
      data: { eventEndsAt: new Date(Date.now() - hoursAgo * HOUR_MS) }
    });

  const complete = (bookingId: number, token = customerToken) =>
    request(app).post(`/api/bookings/${bookingId}/complete`).set(auth(token));

  beforeAll(async () => {
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
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
    slotId = (await prisma.availabilitySlot.create({
      data: { artistId, date: testDate, startTime: '20:00', endTime: '23:00' }
    })).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  describe('computeEventEnd', () => {
    it('reads the slot end time as IST', () => {
      expect(computeEventEnd({ date: '2027-02-14', startTime: '20:00', endTime: '23:00' }).toISOString())
        .toBe('2027-02-14T17:30:00.000Z');
    });

    it('rolls an overnight gig into the next day', () => {
      expect(computeEventEnd({ date: '2027-02-14', startTime: '22:00', endTime: '02:00' }).toISOString())
        .toBe('2027-02-14T20:30:00.000Z');
    });
  });

  it('stamps eventEndsAt on a new booking request', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set(auth(customerToken))
      .send({ artistId, slotId, eventType: 'Completion Test Gig', eventLocation: 'Test Venue, Hyderabad' });
    expect(res.status).toBe(201);
    expect(new Date(res.body.booking.eventEndsAt).toISOString()).toBe('2027-02-14T17:30:00.000Z');
  });

  it('refuses to complete before the event has ended', async () => {
    const bookingId = await createAcceptedBooking();
    const res = await complete(bookingId);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/after the event/i);
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(booking?.status).toBe(BookingStatus.ACCEPTED);
  });

  it('lets the booker complete after the event, then leave a review', async () => {
    const bookingId = await createAcceptedBooking();
    await endEventHoursAgo(bookingId, 1);

    const res = await complete(bookingId);
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe(BookingStatus.COMPLETED);
    expect(res.body.booking.completedAt).toBeTruthy();

    const review = await request(app)
      .post(`/api/bookings/${bookingId}/review`)
      .set(auth(customerToken))
      .send({ rating: 5, comment: 'Brilliant set' });
    expect(review.status).toBe(201);
  });

  it('does not let the artist complete the booking', async () => {
    const bookingId = await createAcceptedBooking();
    await endEventHoursAgo(bookingId, 1);
    const res = await complete(bookingId, artistToken);
    expect(res.status).toBe(403);
  });

  it("does not let another booker complete someone else's booking", async () => {
    const bookingId = await createAcceptedBooking();
    await endEventHoursAgo(bookingId, 1);
    const res = await complete(bookingId, otherCustomerToken);
    expect(res.status).toBe(403);
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(booking?.status).toBe(BookingStatus.ACCEPTED);
  });

  it('refuses to complete a booking the artist never accepted', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set(auth(customerToken))
      .send({ artistId, slotId, eventType: 'Completion Test Gig', eventLocation: 'Test Venue, Hyderabad' });
    await endEventHoursAgo(res.body.booking.id, 1);
    const completeRes = await complete(res.body.booking.id);
    expect(completeRes.status).toBe(409);
  });

  it('refuses to complete twice', async () => {
    const bookingId = await createAcceptedBooking();
    await endEventHoursAgo(bookingId, 1);
    expect((await complete(bookingId)).status).toBe(200);
    expect((await complete(bookingId)).status).toBe(409);
  });

  it('returns 404 for an unknown booking', async () => {
    const res = await complete(999999999);
    expect(res.status).toBe(404);
  });

  describe('auto-completion', () => {
    it(`completes an accepted booking ${AUTO_COMPLETE_AFTER_HOURS}h after the event ends`, async () => {
      const bookingId = await createAcceptedBooking();
      await endEventHoursAgo(bookingId, AUTO_COMPLETE_AFTER_HOURS + 1);

      const count = await BookingService.autoCompleteFinishedBookings();
      expect(count).toBeGreaterThanOrEqual(1);
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      expect(booking?.status).toBe(BookingStatus.COMPLETED);
      expect(booking?.completedAt).toBeTruthy();
    });

    it(`leaves a booking alone inside the ${AUTO_COMPLETE_AFTER_HOURS}h window`, async () => {
      const bookingId = await createAcceptedBooking();
      await endEventHoursAgo(bookingId, AUTO_COMPLETE_AFTER_HOURS - 1);

      await BookingService.autoCompleteFinishedBookings();
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      expect(booking?.status).toBe(BookingStatus.ACCEPTED);
    });

    it('never completes a request the artist has not accepted', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set(auth(customerToken))
        .send({ artistId, slotId, eventType: 'Completion Test Gig', eventLocation: 'Test Venue, Hyderabad' });
      await endEventHoursAgo(res.body.booking.id, AUTO_COMPLETE_AFTER_HOURS + 1);

      await BookingService.autoCompleteFinishedBookings();
      const booking = await prisma.booking.findUnique({ where: { id: res.body.booking.id } });
      expect(booking?.status).not.toBe(BookingStatus.COMPLETED);
    });

    it('happens lazily when bookings are listed, without waiting for the sweep', async () => {
      const bookingId = await createAcceptedBooking();
      await endEventHoursAgo(bookingId, AUTO_COMPLETE_AFTER_HOURS + 1);

      const res = await request(app).get('/api/bookings').set(auth(customerToken));
      expect(res.status).toBe(200);
      const listed = res.body.bookings.find((b: { id: number }) => b.id === bookingId);
      expect(listed.status).toBe(BookingStatus.COMPLETED);
    });
  });
});
