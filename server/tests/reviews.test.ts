import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { UserRole } from '../src/types';

describe('Verified Reviews & Ratings API', () => {
  const timestamp = Date.now();
  const artistToken = `mock_new_user_rev_art_${timestamp}`;
  const customerToken = `mock_new_user_rev_cust_${timestamp}`;
  const otherCustomerToken = `mock_new_user_rev_other_${timestamp}`;

  let artistUserId: number;
  let artistProfileId: number;
  let customerUserId: number;
  let otherCustomerUserId: number;
  let completedSlotId: number;
  let completedBookingId: number;
  let pendingSlotId: number;
  let pendingBookingId: number;

  beforeAll(async () => {
    // 1. Artist Signup & Onboarding
    const artSignup = await request(app)
      .post('/api/auth/complete-signup')
      .send({
        idToken: artistToken,
        role: UserRole.ARTIST,
        name: 'The Hyderabad Jazz Trio',
        email: `jazz_lead_${timestamp}@stagely.in`
      });
    expect(artSignup.status).toBe(201);
    artistUserId = artSignup.body.user.id;

    const onboardRes = await request(app)
      .post('/api/artists/onboard')
      .set('Authorization', `Bearer ${artistToken}`)
      .send({
        artistName: `The Hyderabad Jazz Trio ${timestamp}`,
        category: 'Jazz Band',
        genres: ['Jazz', 'Swing', 'Blues'],
        location: 'Hyderabad',
        baseFee: 28000,
        bio: 'Classic jazz standards and smooth swing.',
        requirements: 'Upright bass DI, 2 Vocal Mics, Drum Kit'
      });
    expect(onboardRes.status).toBe(201);
    artistProfileId = onboardRes.body.artistProfile.id;

    // Verify artist profile so it is publicly accessible
    await prisma.artistProfile.update({
      where: { id: artistProfileId },
      data: { verificationStatus: 'VERIFIED' }
    });

    // 2. Customer 1 (Reviewer) Signup
    const custSignup = await request(app)
      .post('/api/auth/complete-signup')
      .send({
        idToken: customerToken,
        role: UserRole.CUSTOMER,
        name: 'Soma Bar Manager',
        email: `soma_mgr_${timestamp}@stagely.in`
      });
    expect(custSignup.status).toBe(201);
    customerUserId = custSignup.body.user.id;

    // 3. Customer 2 (Other) Signup
    const otherSignup = await request(app)
      .post('/api/auth/complete-signup')
      .send({
        idToken: otherCustomerToken,
        role: UserRole.CUSTOMER,
        name: 'Another Host',
        email: `other_host_${timestamp}@stagely.in`
      });
    expect(otherSignup.status).toBe(201);
    otherCustomerUserId = otherSignup.body.user.id;

    // 4. Create Slots and Bookings
    // A completed booking
    const slot1 = await prisma.availabilitySlot.create({
      data: {
        artistId: artistProfileId,
        date: '2026-10-15',
        startTime: '20:00',
        endTime: '23:00',
        isBooked: true
      }
    });
    completedSlotId = slot1.id;

    const b1 = await prisma.booking.create({
      data: {
        customerId: customerUserId,
        artistId: artistProfileId,
        slotId: completedSlotId,
        eventType: 'Sunday Jazz Brunch',
        eventLocation: 'Soma Wine Bar, Jubilee Hills',
        status: 'COMPLETED',
        notes: 'Smooth acoustic jazz set'
      }
    });
    completedBookingId = b1.id;

    // A pending booking (not completed)
    const slot2 = await prisma.availabilitySlot.create({
      data: {
        artistId: artistProfileId,
        date: '2026-12-05',
        startTime: '19:00',
        endTime: '22:00',
        isBooked: true
      }
    });
    pendingSlotId = slot2.id;

    const b2 = await prisma.booking.create({
      data: {
        customerId: customerUserId,
        artistId: artistProfileId,
        slotId: pendingSlotId,
        eventType: 'Winter Gala',
        eventLocation: 'Soma Rooftop',
        status: 'REQUESTED'
      }
    });
    pendingBookingId = b2.id;
  });

  afterAll(async () => {
    await prisma.review.deleteMany({
      where: { artistId: artistProfileId }
    });
    if (completedBookingId || pendingBookingId) {
      await prisma.booking.deleteMany({
        where: { id: { in: [completedBookingId, pendingBookingId].filter(Boolean) } }
      });
    }
    if (artistProfileId) {
      await prisma.availabilitySlot.deleteMany({ where: { artistId: artistProfileId } });
      await prisma.artistProfile.deleteMany({ where: { id: artistProfileId } });
    }
    await prisma.user.deleteMany({
      where: { id: { in: [artistUserId, customerUserId, otherCustomerUserId].filter(Boolean) } }
    });
    await prisma.$disconnect();
  });

  it('rejects review if booking is not COMPLETED', async () => {
    const res = await request(app)
      .post(`/api/bookings/${pendingBookingId}/review`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        rating: 5,
        comment: 'Great show!'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/completed/i);
  });

  it('rejects review if user is not the booking customer', async () => {
    const res = await request(app)
      .post(`/api/bookings/${completedBookingId}/review`)
      .set('Authorization', `Bearer ${otherCustomerToken}`)
      .send({
        rating: 5,
        comment: 'I did not book this show but I want to review'
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/authorized|permission/i);
  });

  it('rejects review with invalid rating (less than 1 or greater than 5)', async () => {
    const resTooLow = await request(app)
      .post(`/api/bookings/${completedBookingId}/review`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ rating: 0 });
    expect(resTooLow.status).toBe(400);

    const resTooHigh = await request(app)
      .post(`/api/bookings/${completedBookingId}/review`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ rating: 6 });
    expect(resTooHigh.status).toBe(400);
  });

  it('successfully creates a verified review with sound compliance tags', async () => {
    const res = await request(app)
      .post(`/api/bookings/${completedBookingId}/review`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        rating: 5,
        comment: 'Incredible sound balance and the crowd loved the Latin jazz tunes!',
        tags: ['Punctual Soundcheck', 'Crystal-Clear Audio', 'High Crowd Energy']
      });

    expect(res.status).toBe(201);
    expect(res.body.review).toBeDefined();
    expect(res.body.review.rating).toBe(5);
    expect(res.body.review.comment).toContain('Incredible sound balance');
    expect(res.body.review.tags).toContain('Crystal-Clear Audio');
  });

  it('rejects duplicate review on the same booking', async () => {
    const res = await request(app)
      .post(`/api/bookings/${completedBookingId}/review`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        rating: 4,
        comment: 'Trying to review again'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already.*reviewed/i);
  });

  it('fetches artist reviews with averageRating and reviewCount', async () => {
    const res = await request(app).get(`/api/artists/${artistProfileId}/reviews`);

    expect(res.status).toBe(200);
    expect(res.body.averageRating).toBe(5.0);
    expect(res.body.reviewCount).toBe(1);
    expect(Array.isArray(res.body.reviews)).toBe(true);
    expect(res.body.reviews.length).toBe(1);
    expect(res.body.reviews[0].customer.name).toBe('Soma Bar Manager');
  });

  it('includes averageRating and reviewCount in GET /api/artists/:id and GET /api/artists/my-profile', async () => {
    const publicArtistRes = await request(app).get(`/api/artists/${artistProfileId}`);
    expect(publicArtistRes.status).toBe(200);
    expect(publicArtistRes.body.averageRating).toBe(5.0);
    expect(publicArtistRes.body.reviewCount).toBe(1);

    const studioRes = await request(app)
      .get('/api/artists/my-profile')
      .set('Authorization', `Bearer ${artistToken}`);
    expect(studioRes.status).toBe(200);
    expect(studioRes.body.stats.averageRating).toBe(5.0);
    expect(studioRes.body.stats.reviewCount).toBe(1);
  });
});
