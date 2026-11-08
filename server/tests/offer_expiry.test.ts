import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { BookingService, OFFER_TTL_HOURS } from '../src/services/booking.service';
import { VerificationStatus, BookingStatus } from '../src/types';

const HOUR_MS = 60 * 60 * 1000;

/** YYYY-MM-DD for "today + n days" in IST, the marketplace's timezone. */
const istDateString = (daysFromNow: number) =>
  new Date(Date.now() + 5.5 * HOUR_MS + daysFromNow * 24 * HOUR_MS).toISOString().split('T')[0];

describe('Offer Expiry: unanswered requests release the locked night', () => {
  const customerToken = 'mock_customer_token';
  const artistToken = 'mock_artist_token';
  const secondCustomerToken = 'mock_new_user_cust_02';
  const farDate = '2027-01-20';
  const soonDate = istDateString(1); // tomorrow (IST)
  let artistId: number;
  let farSlotId: number;
  let soonSlotId: number;

  const cleanup = async () => {
    await prisma.booking.deleteMany({ where: { artistId, slot: { date: { in: [farDate, soonDate] } } } });
    await prisma.availabilitySlot.deleteMany({ where: { artistId, date: { in: [farDate, soonDate] } } });
  };

  const requestBooking = (token: string, slotId: number) =>
    request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ artistId, slotId, eventType: 'Expiry Test Gig', eventLocation: 'Test Venue, Hyderabad' });

  const backdateOffer = (bookingId: number) =>
    prisma.booking.update({ where: { id: bookingId }, data: { expiresAt: new Date(Date.now() - 60 * 1000) } });

  beforeAll(async () => {
    await request(app).post('/api/auth/complete-signup').send({
      idToken: secondCustomerToken,
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
    farSlotId = (await prisma.availabilitySlot.create({
      data: { artistId, date: farDate, startTime: '20:00', endTime: '22:00' }
    })).id;
    soonSlotId = (await prisma.availabilitySlot.create({
      data: { artistId, date: soonDate, startTime: '20:00', endTime: '22:00' }
    })).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('stamps a new request with an expiry OFFER_TTL_HOURS from now', async () => {
    const before = Date.now();
    const res = await requestBooking(customerToken, farSlotId);
    expect(res.status).toBe(201);

    const expiresAt = new Date(res.body.booking.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + OFFER_TTL_HOURS * HOUR_MS - 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + OFFER_TTL_HOURS * HOUR_MS + 1000);
  });

  it('caps the expiry at the event start when the event is sooner than the TTL', async () => {
    const res = await requestBooking(customerToken, soonSlotId);
    expect(res.status).toBe(201);

    const eventStartIst = new Date(`${soonDate}T20:00:00+05:30`).getTime();
    expect(new Date(res.body.booking.expiresAt).getTime()).toBe(eventStartIst);
  });

  it('expires a stale request and unlocks its slot', async () => {
    const res = await requestBooking(customerToken, farSlotId);
    await backdateOffer(res.body.booking.id);

    const expiredCount = await BookingService.expireStaleOffers();
    expect(expiredCount).toBeGreaterThanOrEqual(1);

    const booking = await prisma.booking.findUnique({ where: { id: res.body.booking.id } });
    expect(booking?.status).toBe(BookingStatus.EXPIRED);
    const slot = await prisma.availabilitySlot.findUnique({ where: { id: farSlotId } });
    expect(slot?.isBooked).toBe(false);
  });

  it('lets another customer book the night once the earlier offer has lapsed (no manual sweep)', async () => {
    const first = await requestBooking(customerToken, farSlotId);
    await backdateOffer(first.body.booking.id);

    const second = await requestBooking(secondCustomerToken, farSlotId);
    expect(second.status).toBe(201);
    expect(second.body.booking.status).toBe(BookingStatus.REQUESTED);
  });

  it('refuses to let the artist accept an expired offer', async () => {
    const res = await requestBooking(customerToken, farSlotId);
    await backdateOffer(res.body.booking.id);

    const acceptRes = await request(app)
      .put(`/api/bookings/${res.body.booking.id}/respond`)
      .set('Authorization', `Bearer ${artistToken}`)
      .send({ action: 'ACCEPT' });

    expect(acceptRes.status).toBe(409);
    expect(acceptRes.body.error).toMatch(/expired/i);
    const booking = await prisma.booking.findUnique({ where: { id: res.body.booking.id } });
    expect(booking?.status).toBe(BookingStatus.EXPIRED);
  });

  it('shows the lapsed offer as EXPIRED in the customer booking list', async () => {
    const res = await requestBooking(customerToken, farSlotId);
    await backdateOffer(res.body.booking.id);

    const listRes = await request(app).get('/api/bookings').set('Authorization', `Bearer ${customerToken}`);
    expect(listRes.status).toBe(200);
    const listed = listRes.body.bookings.find((b: any) => b.id === res.body.booking.id);
    expect(listed.status).toBe(BookingStatus.EXPIRED);
  });

  it('shows the slot as open again on the public artist profile after expiry', async () => {
    const res = await requestBooking(customerToken, farSlotId);
    await backdateOffer(res.body.booking.id);

    const profileRes = await request(app).get(`/api/artists/${artistId}`);
    expect(profileRes.status).toBe(200);
    const slot = profileRes.body.artist.availabilitySlots.find((s: any) => s.id === farSlotId);
    expect(slot.isBooked).toBe(false);
  });

  it('never expires an accepted booking', async () => {
    const res = await requestBooking(customerToken, farSlotId);
    await request(app)
      .put(`/api/bookings/${res.body.booking.id}/respond`)
      .set('Authorization', `Bearer ${artistToken}`)
      .send({ action: 'ACCEPT' });
    await backdateOffer(res.body.booking.id);

    await BookingService.expireStaleOffers();

    const booking = await prisma.booking.findUnique({ where: { id: res.body.booking.id } });
    expect(booking?.status).toBe(BookingStatus.ACCEPTED);
    const slot = await prisma.availabilitySlot.findUnique({ where: { id: farSlotId } });
    expect(slot?.isBooked).toBe(true);
  });

  it('expires legacy requests that have no expiresAt once they are older than the TTL', async () => {
    const res = await requestBooking(customerToken, farSlotId);
    await prisma.booking.update({
      where: { id: res.body.booking.id },
      data: { expiresAt: null, createdAt: new Date(Date.now() - (OFFER_TTL_HOURS + 1) * HOUR_MS) }
    });

    await BookingService.expireStaleOffers();

    const booking = await prisma.booking.findUnique({ where: { id: res.body.booking.id } });
    expect(booking?.status).toBe(BookingStatus.EXPIRED);
    const slot = await prisma.availabilitySlot.findUnique({ where: { id: farSlotId } });
    expect(slot?.isBooked).toBe(false);
  });
});
