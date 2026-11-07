import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { BookingStatus, UserRole } from '../src/types';

describe('Stagely Customer Experience End-to-End Suite', () => {
  const timestamp = Date.now();
  const customerToken = `mock_new_user_cust_exp_${timestamp}`;
  const customerUid = `firebase_new_uid_exp_${timestamp}`;
  let customerId: number;
  let bookedArtistId: number;
  let bookedSlotId: number;
  let createdBookingId: number;

  beforeAll(async () => {
    // 1. Complete customer signup
    const signupRes = await request(app)
      .post('/api/auth/complete-signup')
      .send({
        idToken: customerToken,
        role: UserRole.CUSTOMER,
        name: 'Vikram Reddy',
        email: `vikram_${timestamp}@prosthyd.in`
      });

    expect(signupRes.status).toBe(201);
    customerId = signupRes.body.user.id;
  });

  afterAll(async () => {
    if (createdBookingId) {
      await prisma.message.deleteMany({ where: { bookingId: createdBookingId } });
      await prisma.booking.deleteMany({ where: { id: createdBookingId } });
    }
    if (bookedSlotId) {
      await prisma.availabilitySlot.update({
        where: { id: bookedSlotId },
        data: { isBooked: false }
      }).catch(() => {});
    }
    if (customerId) {
      await prisma.user.deleteMany({ where: { id: customerId } });
    }
    await prisma.$disconnect();
  });

  it('Phase 1: Customer configures venue and coordination contact profile', async () => {
    const updateRes = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        name: 'Vikram Reddy (GM)',
        venueName: 'Prost Jubilee Hills',
        city: 'Road 45, Jubilee Hills, Hyderabad',
        contactPhone: '+919876599999'
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.user.venueName).toBe('Prost Jubilee Hills');
    expect(updateRes.body.user.city).toBe('Road 45, Jubilee Hills, Hyderabad');
    expect(updateRes.body.user.contactPhone).toBe('+919876599999');

    // Verify GET /api/users/me
    const getRes = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.user.venueName).toBe('Prost Jubilee Hills');
    expect(getRes.body.stats.activeBookingsCount).toBe(0);
  });

  it('Phase 2: Customer searches catalog with multi-dimensional filters (date, budget, genre)', async () => {
    const searchRes = await request(app)
      .get('/api/artists')
      .query({
        date: '2026-11-01',
        minFee: 25000,
        maxFee: 40000,
        genres: 'Rock,Indie'
      });

    expect(searchRes.status).toBe(200);
    expect(Array.isArray(searchRes.body.artists)).toBe(true);
    expect(searchRes.body.artists.length).toBeGreaterThan(0);

    const match = searchRes.body.artists[0];
    expect(match.verificationStatus).toBe('VERIFIED');
    expect(match.baseFee).toBeGreaterThanOrEqual(25000);
    expect(match.baseFee).toBeLessThanOrEqual(40000);

    const openSlot = match.availabilitySlots.find((s: any) => s.date === '2026-11-01' && !s.isBooked);
    expect(openSlot).toBeDefined();

    bookedArtistId = match.id;
    bookedSlotId = openSlot.id;
  });

  it('Phase 3: Customer books open slot with pre-filled venue data', async () => {
    // Read profile to verify pre-fill capability
    const profileRes = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${customerToken}`);

    const prefilledLocation = `${profileRes.body.user.venueName}, ${profileRes.body.user.city}`;
    expect(prefilledLocation).toBe('Prost Jubilee Hills, Road 45, Jubilee Hills, Hyderabad');

    const bookingRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        artistId: bookedArtistId,
        slotId: bookedSlotId,
        eventType: 'Sunday Sunset Live Stage',
        eventLocation: prefilledLocation,
        notes: 'Full house anticipated. Sound engineer on board at 4:30 PM.'
      });

    expect(bookingRes.status).toBe(201);
    expect(bookingRes.body.booking.status).toBe(BookingStatus.REQUESTED);
    expect(bookingRes.body.booking.eventLocation).toBe(prefilledLocation);
    createdBookingId = bookingRes.body.booking.id;
  });

  it('Phase 4: Customer profile stats dynamically update to reflect active booking', async () => {
    const profileRes = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(profileRes.status).toBe(200);
    expect(profileRes.body.stats.activeBookingsCount).toBe(1);
    expect(profileRes.body.stats.completedBookingsCount).toBe(0);
  });
});
