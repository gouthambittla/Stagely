import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { VerificationStatus, UserRole } from '../src/types';

describe('Auth & Artist Onboarding API (Firebase)', () => {
  const newArtistToken = `mock_new_user_artist_${Date.now()}`;
  let registeredUserId: number;

  afterAll(async () => {
    if (registeredUserId) {
      await prisma.user.deleteMany({ where: { id: registeredUserId } });
    }
    await prisma.$disconnect();
  });

  it('detects new user when Firebase UID is not yet registered', async () => {
    const res = await request(app)
      .post('/api/auth/firebase')
      .send({ idToken: newArtistToken });

    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(true);
    expect(res.body.firebaseUid).toBeDefined();
  });

  it('completes signup for new user with role and name', async () => {
    const res = await request(app)
      .post('/api/auth/complete-signup')
      .send({
        idToken: newArtistToken,
        role: UserRole.ARTIST,
        name: 'Charminar Chords Lead'
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.role).toBe(UserRole.ARTIST);
    expect(res.body.user.name).toBe('Charminar Chords Lead');
    registeredUserId = res.body.user.id;
  });

  it('returns existing user on subsequent /api/auth/firebase calls', async () => {
    const res = await request(app)
      .post('/api/auth/firebase')
      .send({ idToken: newArtistToken });

    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(false);
    expect(res.body.user.id).toBe(registeredUserId);
    expect(res.body.user.name).toBe('Charminar Chords Lead');
  });

  it('allows authenticated user to fetch own profile via GET /api/auth/me', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${newArtistToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(registeredUserId);
    expect(res.body.role).toBe(UserRole.ARTIST);
  });

  it('allows authenticated artist to complete onboarding wizard', async () => {
    const onboardRes = await request(app)
      .post('/api/artists/onboard')
      .set('Authorization', `Bearer ${newArtistToken}`)
      .send({
        artistName: 'Charminar Chords',
        category: 'Band',
        genres: ['Indie Rock', 'Sufi Fusion'],
        location: 'Hyderabad',
        baseFee: 30000,
        requirements: 'Full PA and sound monitor',
        youtubeUrl: 'https://youtube.com/@charminarchords',
        instagramUrl: 'https://instagram.com/charminarchords',
        availableSlots: [
          { date: '2026-11-10', startTime: '19:00', endTime: '22:00' },
          { date: '2026-11-11', startTime: '19:00', endTime: '22:00' }
        ]
      });

    expect(onboardRes.status).toBe(201);
    expect(onboardRes.body.artistProfile.artistName).toBe('Charminar Chords');
    expect(onboardRes.body.artistProfile.verificationStatus).toBe(VerificationStatus.PENDING_VERIFICATION);
    expect(onboardRes.body.artistProfile.baseFee).toBe(30000);
    expect(onboardRes.body.artistProfile.availabilitySlots.length).toBe(2);
  });
});
