import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { UserRole } from '../src/types';

describe('Artist Studio & Profile Management API', () => {
  const timestamp = Date.now();
  const artistToken = `mock_new_user_art_${timestamp}`;
  const customerToken = `mock_new_user_cust_${timestamp}`;
  let artistUserId: number;
  let artistProfileId: number;
  let customerUserId: number;

  beforeAll(async () => {
    // 1. Register Artist
    const artistSignup = await request(app)
      .post('/api/auth/complete-signup')
      .send({
        idToken: artistToken,
        role: UserRole.ARTIST,
        name: 'Studio Test Band Lead',
        email: `studio_artist_${timestamp}@stagely.in`
      });
    expect(artistSignup.status).toBe(201);
    artistUserId = artistSignup.body.user.id;

    // 2. Onboard Artist Profile
    const onboardRes = await request(app)
      .post('/api/artists/onboard')
      .set('Authorization', `Bearer ${artistToken}`)
      .send({
        artistName: `The Deccan Project ${timestamp}`,
        category: 'Band',
        genres: ['Fusion Rock', 'Tollywood Indie'],
        location: 'Hyderabad',
        baseFee: 30000,
        bio: 'High-energy regional live acts across Jubilee Hills.',
        requirements: '2 Vocal Mics, 1 Drum Kit, Stereo PA System',
        youtubeUrl: 'https://youtube.com/@deccanproject',
        instagramUrl: 'https://instagram.com/deccanproject',
        availableSlots: [
          { date: '2026-11-15', startTime: '19:00', endTime: '22:00' }
        ]
      });
    expect(onboardRes.status).toBe(201);
    artistProfileId = onboardRes.body.artistProfile.id;

    // 3. Register Customer
    const custSignup = await request(app)
      .post('/api/auth/complete-signup')
      .send({
        idToken: customerToken,
        role: UserRole.CUSTOMER,
        name: 'Studio Customer',
        email: `studio_cust_${timestamp}@stagely.in`
      });
    expect(custSignup.status).toBe(201);
    customerUserId = custSignup.body.user.id;
  });

  afterAll(async () => {
    if (artistProfileId) {
      await prisma.availabilitySlot.deleteMany({ where: { artistId: artistProfileId } });
      await prisma.artistProfile.deleteMany({ where: { id: artistProfileId } });
    }
    await prisma.user.deleteMany({
      where: { id: { in: [artistUserId, customerUserId].filter(Boolean) } }
    });
    await prisma.$disconnect();
  });

  it('retrieves artist profile with gig statistics without totalEarnings', async () => {
    const res = await request(app)
      .get('/api/artists/my-profile')
      .set('Authorization', `Bearer ${artistToken}`);

    expect(res.status).toBe(200);
    expect(res.body.profile).toBeDefined();
    expect(res.body.profile.artistName).toContain('The Deccan Project');
    expect(res.body.stats).toBeDefined();
    expect(typeof res.body.stats.completedGigsCount).toBe('number');
    expect(typeof res.body.stats.pendingRequestsCount).toBe('number');
    expect(typeof res.body.stats.upcomingGigsCount).toBe('number');
    // totalEarnings MUST NOT be shown or exposed
    expect(res.body.stats.totalEarnings).toBeUndefined();
  });

  it('updates artist performance fee, sound rider, and social links', async () => {
    const res = await request(app)
      .put('/api/artists/my-profile')
      .set('Authorization', `Bearer ${artistToken}`)
      .send({
        artistName: `The Deccan Project Live ${timestamp}`,
        category: 'Band',
        baseFee: 38000,
        genres: ['Fusion Rock', 'Progressive Carnatic', 'Tollywood'],
        bio: 'Award-winning live fusion band from Begumpet.',
        requirements: '4 Wireless Vocal Mics, 2 In-Ear Monitor lines, Stereo DI boxes',
        youtubeUrl: 'https://youtube.com/@deccanprojectlive',
        instagramUrl: 'https://instagram.com/deccanprojectlive'
      });

    expect(res.status).toBe(200);
    expect(res.body.profile.baseFee).toBe(38000);
    expect(res.body.profile.requirements).toContain('4 Wireless Vocal Mics');
    expect(res.body.profile.bio).toContain('Award-winning');
  });

  it('rejects baseFee lower than minimum ₹1,000 threshold', async () => {
    const res = await request(app)
      .put('/api/artists/my-profile')
      .set('Authorization', `Bearer ${artistToken}`)
      .send({
        baseFee: 500
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('1,000');
  });

  it('rejects access from customers or unauthenticated users', async () => {
    const noAuth = await request(app).put('/api/artists/my-profile').send({ baseFee: 40000 });
    expect(noAuth.status).toBe(401);

    const custAuth = await request(app)
      .put('/api/artists/my-profile')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ baseFee: 40000 });
    expect(custAuth.status).toBe(403);
  });
});
