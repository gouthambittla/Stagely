import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { UserRole } from '../src/types';

describe('E2E: Verified Reviews & Reputation Engine Lifecycle', () => {
  const timestamp = Date.now();
  const artistToken = `mock_new_user_e2e_rev_art_${timestamp}`;
  const venueA_Token = `mock_new_user_e2e_rev_vA_${timestamp}`;
  const venueB_Token = `mock_new_user_e2e_rev_vB_${timestamp}`;

  let artistUserId: number;
  let artistProfileId: number;
  let venueA_UserId: number;
  let venueB_UserId: number;
  const slotIds: number[] = [];
  const bookingIds: number[] = [];

  beforeAll(async () => {
    // 1. Artist Signup & Onboarding
    const artistSignup = await request(app)
      .post('/api/auth/complete-signup')
      .send({
        idToken: artistToken,
        role: UserRole.ARTIST,
        name: 'The Deccan Brass Ensemble',
        email: `deccan_brass_${timestamp}@stagely.in`
      });
    expect(artistSignup.status).toBe(201);
    artistUserId = artistSignup.body.user.id;

    const onboardRes = await request(app)
      .post('/api/artists/onboard')
      .set('Authorization', `Bearer ${artistToken}`)
      .send({
        artistName: `The Deccan Brass Ensemble ${timestamp}`,
        category: 'Band',
        genres: ['Brass Jazz', 'Funk', 'Fusion'],
        location: 'Hyderabad',
        baseFee: 32000,
        bio: 'Premier live brass ensemble playing soul-funk and regional hits.',
        requirements: '4 Wireless Instrument Mics, 2 Vocal Mics, Stereo Sub'
      });
    expect(onboardRes.status).toBe(201);
    artistProfileId = onboardRes.body.artistProfile.id;

    // Verify artist
    await prisma.artistProfile.update({
      where: { id: artistProfileId },
      data: { verificationStatus: 'VERIFIED' }
    });

    // 2. Venue Host A Signup
    const venueASignup = await request(app)
      .post('/api/auth/complete-signup')
      .send({
        idToken: venueA_Token,
        role: UserRole.CUSTOMER,
        name: 'Fat Pigeon Manager',
        email: `fat_pigeon_${timestamp}@stagely.in`
      });
    expect(venueASignup.status).toBe(201);
    venueA_UserId = venueASignup.body.user.id;

    await prisma.user.update({
      where: { id: venueA_UserId },
      data: { venueName: 'Fat Pigeon Bar & Grill', city: 'Hyderabad' }
    });

    // 3. Venue Host B Signup
    const venueBSignup = await request(app)
      .post('/api/auth/complete-signup')
      .send({
        idToken: venueB_Token,
        role: UserRole.CUSTOMER,
        name: 'Prost Jubilee Curator',
        email: `prost_${timestamp}@stagely.in`
      });
    expect(venueBSignup.status).toBe(201);
    venueB_UserId = venueBSignup.body.user.id;

    await prisma.user.update({
      where: { id: venueB_UserId },
      data: { venueName: 'Prost Brewpub', city: 'Hyderabad' }
    });
  });

  afterAll(async () => {
    await prisma.review.deleteMany({
      where: { artistId: artistProfileId }
    });
    if (bookingIds.length > 0) {
      await prisma.booking.deleteMany({
        where: { id: { in: bookingIds } }
      });
    }
    if (artistProfileId) {
      await prisma.availabilitySlot.deleteMany({ where: { artistId: artistProfileId } });
      await prisma.artistProfile.deleteMany({ where: { id: artistProfileId } });
    }
    await prisma.user.deleteMany({
      where: { id: { in: [artistUserId, venueA_UserId, venueB_UserId].filter(Boolean) } }
    });
    await prisma.$disconnect();
  });

  it('step 1: initially artist has null rating and 0 reviews', async () => {
    const res = await request(app).get(`/api/artists/${artistProfileId}/reviews`);
    expect(res.status).toBe(200);
    expect(res.body.reviewCount).toBe(0);
    expect(res.body.averageRating).toBeNull();
    expect(res.body.reviews).toHaveLength(0);
  });

  it('step 2: completed gig for Venue A receives 5-star verified review with audio compliance tags', async () => {
    const slotA = await prisma.availabilitySlot.create({
      data: {
        artistId: artistProfileId,
        date: '2026-10-10',
        startTime: '20:00',
        endTime: '23:00',
        isBooked: true
      }
    });
    slotIds.push(slotA.id);

    const bookingA = await prisma.booking.create({
      data: {
        customerId: venueA_UserId,
        artistId: artistProfileId,
        slotId: slotA.id,
        eventType: 'Weekend Pub Night',
        eventLocation: 'Fat Pigeon, Road 45, Jubilee Hills',
        status: 'COMPLETED'
      }
    });
    bookingIds.push(bookingA.id);

    const reviewRes = await request(app)
      .post(`/api/bookings/${bookingA.id}/review`)
      .set('Authorization', `Bearer ${venueA_Token}`)
      .send({
        rating: 5,
        comment: 'Electrifying brass horn section and completely punctual soundcheck!',
        tags: ['Punctual Soundcheck', 'Crystal-Clear Audio', 'High Crowd Energy']
      });

    expect(reviewRes.status).toBe(201);
    expect(reviewRes.body.review).toBeDefined();
    expect(reviewRes.body.review.rating).toBe(5);
    expect(reviewRes.body.review.tags).toContain('Punctual Soundcheck');

    // Verify rating after 1 review
    const artistRes = await request(app).get(`/api/artists/${artistProfileId}/reviews`);
    expect(artistRes.body.averageRating).toBe(5.0);
    expect(artistRes.body.reviewCount).toBe(1);
  });

  it('step 3: completed gig for Venue B receives 4-star verified review, updating average to 4.5', async () => {
    const slotB = await prisma.availabilitySlot.create({
      data: {
        artistId: artistProfileId,
        date: '2026-10-18',
        startTime: '19:30',
        endTime: '22:30',
        isBooked: true
      }
    });
    slotIds.push(slotB.id);

    const bookingB = await prisma.booking.create({
      data: {
        customerId: venueB_UserId,
        artistId: artistProfileId,
        slotId: slotB.id,
        eventType: 'Craft Beer Fest Headline',
        eventLocation: 'Prost Jubilee Hills',
        status: 'COMPLETED'
      }
    });
    bookingIds.push(bookingB.id);

    const reviewRes = await request(app)
      .post(`/api/bookings/${bookingB.id}/review`)
      .set('Authorization', `Bearer ${venueB_Token}`)
      .send({
        rating: 4,
        comment: 'Solid crowd puller, very professional live mix.',
        tags: ['Great Song Selection', 'Professional Stage Presence']
      });

    expect(reviewRes.status).toBe(201);
    expect(reviewRes.body.review.rating).toBe(4);

    // Verify aggregated rating: (5 + 4) / 2 = 4.5
    const reviewsRes = await request(app).get(`/api/artists/${artistProfileId}/reviews`);
    expect(reviewsRes.status).toBe(200);
    expect(reviewsRes.body.averageRating).toBe(4.5);
    expect(reviewsRes.body.reviewCount).toBe(2);
    expect(reviewsRes.body.reviews).toHaveLength(2);
  });

  it('step 4: public artist detail and artist studio profile reflect rating of 4.5 without totalEarnings', async () => {
    // Public profile
    const publicRes = await request(app).get(`/api/artists/${artistProfileId}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.averageRating).toBe(4.5);
    expect(publicRes.body.reviewCount).toBe(2);

    // Artist Studio profile
    const studioRes = await request(app)
      .get('/api/artists/my-profile')
      .set('Authorization', `Bearer ${artistToken}`);
    expect(studioRes.status).toBe(200);
    expect(studioRes.body.stats.averageRating).toBe(4.5);
    expect(studioRes.body.stats.reviewCount).toBe(2);
    expect(studioRes.body.stats.completedGigsCount).toBe(2);
    // Explicit assertion: strictly NO totalEarnings
    expect(studioRes.body.stats.totalEarnings).toBeUndefined();
  });

  it('step 5: security guards reject unauthorized review attempts', async () => {
    // Venue B trying to review Venue A's booking
    const fakeReview = await request(app)
      .post(`/api/bookings/${bookingIds[0]}/review`)
      .set('Authorization', `Bearer ${venueB_Token}`)
      .send({ rating: 1 });
    expect(fakeReview.status).toBe(403);

    // Venue A trying to submit a second review for the same booking
    const duplicateReview = await request(app)
      .post(`/api/bookings/${bookingIds[0]}/review`)
      .set('Authorization', `Bearer ${venueA_Token}`)
      .send({ rating: 5 });
    expect(duplicateReview.status).toBe(400);
  });
});
