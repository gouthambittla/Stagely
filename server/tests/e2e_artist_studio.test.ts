import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { UserRole } from '../src/types';

describe('E2E: Artist Studio & Profile Manager Lifecycle', () => {
  const timestamp = Date.now();
  const artistToken = `mock_new_user_e2e_artist_${timestamp}`;
  const customerToken = `mock_new_user_e2e_cust_${timestamp}`;

  let artistUserId: number;
  let artistProfileId: number;
  let customerUserId: number;
  const bookingIds: number[] = [];
  const slotIds: number[] = [];

  beforeAll(async () => {
    // 1. Artist Signup
    const artistSignup = await request(app)
      .post('/api/auth/complete-signup')
      .send({
        idToken: artistToken,
        role: UserRole.ARTIST,
        name: 'Sitar & Beats Collective Lead',
        email: `e2e_artist_${timestamp}@stagely.in`
      });
    expect(artistSignup.status).toBe(201);
    artistUserId = artistSignup.body.user.id;

    // 2. Onboard Artist Profile
    const onboardRes = await request(app)
      .post('/api/artists/onboard')
      .set('Authorization', `Bearer ${artistToken}`)
      .send({
        artistName: `Sitar & Beats Collective ${timestamp}`,
        category: 'Fusion Ensemble',
        genres: ['Classical Fusion', 'Electronic'],
        location: 'Bengaluru',
        baseFee: 35000,
        bio: 'Blending Indian classical sitar with modern ambient soundscapes.',
        requirements: '1 Sitar condenser mic, 1 Laptop DI box, 2 Vocal mics',
        youtubeUrl: 'https://youtube.com/@sitarbeats',
        instagramUrl: 'https://instagram.com/sitarbeats'
      });
    expect(onboardRes.status).toBe(201);
    artistProfileId = onboardRes.body.artistProfile.id;

    // 3. Customer Signup
    const customerSignup = await request(app)
      .post('/api/auth/complete-signup')
      .send({
        idToken: customerToken,
        role: UserRole.CUSTOMER,
        name: 'Festival Curator Bangalore',
        email: `e2e_cust_${timestamp}@stagely.in`
      });
    expect(customerSignup.status).toBe(201);
    customerUserId = customerSignup.body.user.id;
  });

  afterAll(async () => {
    // Cleanup bookings, slots, profile, users
    if (bookingIds.length > 0) {
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    }
    if (artistProfileId) {
      await prisma.availabilitySlot.deleteMany({ where: { artistId: artistProfileId } });
      await prisma.artistProfile.deleteMany({ where: { id: artistProfileId } });
    }
    await prisma.user.deleteMany({
      where: { id: { in: [artistUserId, customerUserId].filter(Boolean) } }
    });
    await prisma.$disconnect();
  });

  it('step 1: fetches fresh artist studio profile with zero gigs and strictly NO totalEarnings', async () => {
    const res = await request(app)
      .get('/api/artists/my-profile')
      .set('Authorization', `Bearer ${artistToken}`);

    expect(res.status).toBe(200);
    expect(res.body.profile).toBeDefined();
    expect(res.body.profile.artistName).toContain('Sitar & Beats Collective');
    expect(res.body.profile.baseFee).toBe(35000);
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.completedGigsCount).toBe(0);
    expect(res.body.stats.upcomingGigsCount).toBe(0);
    expect(res.body.stats.pendingRequestsCount).toBe(0);
    expect(res.body.stats.totalEarnings).toBeUndefined();
  });

  it('step 2: creates bookings (requested, accepted upcoming, and completed) and checks studio stats', async () => {
    // Create Slot 1: Pending request
    const slot1 = await prisma.availabilitySlot.create({
      data: {
        artistId: artistProfileId,
        date: '2026-12-01',
        startTime: '19:00',
        endTime: '22:00',
        isBooked: true
      }
    });
    slotIds.push(slot1.id);

    const b1 = await prisma.booking.create({
      data: {
        customerId: customerUserId,
        artistId: artistProfileId,
        slotId: slot1.id,
        eventType: 'Corporate Annual Gala',
        eventLocation: 'Indiranagar Club, Bengaluru',
        status: 'REQUESTED',
        notes: 'Needs premium acoustic sitar setup'
      }
    });
    bookingIds.push(b1.id);

    // Create Slot 2: Confirmed upcoming gig (date in future)
    const slot2 = await prisma.availabilitySlot.create({
      data: {
        artistId: artistProfileId,
        date: '2026-12-15',
        startTime: '20:00',
        endTime: '23:00',
        isBooked: true
      }
    });
    slotIds.push(slot2.id);

    const b2 = await prisma.booking.create({
      data: {
        customerId: customerUserId,
        artistId: artistProfileId,
        slotId: slot2.id,
        eventType: 'Open Air Music Fest',
        eventLocation: 'UB City Amphitheater, Bengaluru',
        status: 'ACCEPTED',
        notes: 'Main stage headline set'
      }
    });
    bookingIds.push(b2.id);

    // Create Slot 3: Completed gig (date in past)
    const slot3 = await prisma.availabilitySlot.create({
      data: {
        artistId: artistProfileId,
        date: '2026-10-20',
        startTime: '18:00',
        endTime: '21:00',
        isBooked: true
      }
    });
    slotIds.push(slot3.id);

    const b3 = await prisma.booking.create({
      data: {
        customerId: customerUserId,
        artistId: artistProfileId,
        slotId: slot3.id,
        eventType: 'Intimate Lounge Showcase',
        eventLocation: 'Koramangala Social, Bengaluru',
        status: 'COMPLETED',
        notes: 'Acoustic evening set'
      }
    });
    bookingIds.push(b3.id);

    // Fetch studio profile again
    const studioRes = await request(app)
      .get('/api/artists/my-profile')
      .set('Authorization', `Bearer ${artistToken}`);

    expect(studioRes.status).toBe(200);
    expect(studioRes.body.stats.completedGigsCount).toBe(1);
    expect(studioRes.body.stats.upcomingGigsCount).toBe(1);
    expect(studioRes.body.stats.pendingRequestsCount).toBe(1);
    // Explicit assertion: totalEarnings MUST NOT be returned
    expect(studioRes.body.stats.totalEarnings).toBeUndefined();
    expect(Object.keys(studioRes.body.stats)).toEqual(
      expect.arrayContaining(['completedGigsCount', 'upcomingGigsCount', 'pendingRequestsCount'])
    );
    expect(Object.keys(studioRes.body.stats)).not.toContain('totalEarnings');
  });

  it('step 3: updates performance fee, sound rider, genres, bio, and social media handles', async () => {
    const updatePayload = {
      artistName: `Sitar & Beats Collective (Touring) ${timestamp}`,
      category: 'Fusion Band',
      baseFee: 50000,
      genres: ['Classical Fusion', 'Live Electronica', 'Indian Ambient'],
      bio: 'Leading international Indian classical electronica ensemble. Winner of Bengaluru Independent Music Awards 2026.',
      requirements: '4 Direct Inputs, 1 Dedicated Drum Submixer, 2 Wireless Sennheiser Mics, 4 In-Ear Monitor Packs (stereo aux sends)',
      youtubeUrl: 'https://youtube.com/@sitarbeatsofficial',
      instagramUrl: 'https://instagram.com/sitarbeatslive'
    };

    const putRes = await request(app)
      .put('/api/artists/my-profile')
      .set('Authorization', `Bearer ${artistToken}`)
      .send(updatePayload);

    expect(putRes.status).toBe(200);
    expect(putRes.body.profile).toBeDefined();
    expect(putRes.body.profile.baseFee).toBe(50000);
    const parsedGenres = typeof putRes.body.profile.genres === 'string'
      ? JSON.parse(putRes.body.profile.genres)
      : putRes.body.profile.genres;
    expect(parsedGenres).toEqual(
      expect.arrayContaining(['Classical Fusion', 'Live Electronica', 'Indian Ambient'])
    );
    expect(putRes.body.profile.requirements).toContain('In-Ear Monitor Packs');
    expect(putRes.body.profile.instagramUrl).toBe('https://instagram.com/sitarbeatslive');
    expect(putRes.body.profile.youtubeUrl).toBe('https://youtube.com/@sitarbeatsofficial');
  });

  it('step 4: verifies updated profile reflects immediately with consistent show counts', async () => {
    const res = await request(app)
      .get('/api/artists/my-profile')
      .set('Authorization', `Bearer ${artistToken}`);

    expect(res.status).toBe(200);
    expect(res.body.profile.baseFee).toBe(50000);
    expect(res.body.profile.requirements).toContain('Sennheiser Mics');
    expect(res.body.stats.completedGigsCount).toBe(1);
    expect(res.body.stats.upcomingGigsCount).toBe(1);
    expect(res.body.stats.pendingRequestsCount).toBe(1);
    expect(res.body.stats.totalEarnings).toBeUndefined();
  });

  it('step 5: rejects invalid baseFee and rejects unauthorized requests', async () => {
    // Negative fee
    const badFeeRes = await request(app)
      .put('/api/artists/my-profile')
      .set('Authorization', `Bearer ${artistToken}`)
      .send({ baseFee: -500 });
    expect(badFeeRes.status).toBe(400);

    // Unauthenticated request
    const unauthRes = await request(app)
      .put('/api/artists/my-profile')
      .send({ baseFee: 40000 });
    expect(unauthRes.status).toBe(401);
  });
});
