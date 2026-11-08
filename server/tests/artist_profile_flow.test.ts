import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';

describe('Artist creation & profile update flow', () => {
  const token = 'mock_new_user_profile_flow_01';
  const uid = 'firebase_new_uid_profile_flow_01';
  const auth = { Authorization: `Bearer ${token}` };
  const validOnboard = {
    artistName: 'Flow Test Band',
    category: 'Band',
    genres: ['Sufi'],
    location: 'Hyderabad',
    baseFee: 20000,
    bio: 'Original bio',
    youtubeUrl: 'https://youtube.com/@flowtest',
    availableSlots: [{ date: '2027-04-10', startTime: '20:00', endTime: '23:00' }]
  };

  beforeAll(async () => {
    await request(app).post('/api/auth/complete-signup').send({ idToken: token, role: 'ARTIST', name: 'Flow Tester' });
  });

  afterAll(async () => {
    const user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
    if (user) {
      await prisma.availabilitySlot.deleteMany({ where: { artist: { userId: user.id } } });
      await prisma.artistProfile.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await prisma.$disconnect();
  });

  describe('onboarding validation', () => {
    const onboard = (body: unknown) => request(app).post('/api/artists/onboard').set(auth).send(body as object);

    it('rejects genres that are not an array of strings', async () => {
      const res = await onboard({ ...validOnboard, genres: 'Sufi' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/genres/i);
    });

    it('rejects a non-numeric or below-minimum baseFee', async () => {
      expect((await onboard({ ...validOnboard, baseFee: 'abc' })).status).toBe(400);
      expect((await onboard({ ...validOnboard, baseFee: 500 })).status).toBe(400);
    });

    it('rejects malformed availability slots', async () => {
      const res = await onboard({ ...validOnboard, availableSlots: [{ date: 'tomorrow', startTime: '8pm', endTime: '' }] });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/slot/i);
    });

    it('rejects a whitespace-only artist name', async () => {
      const res = await onboard({ ...validOnboard, artistName: '   ' });
      expect(res.status).toBe(400);
    });

    it('creates the profile and stores empty optional fields as null', async () => {
      const res = await onboard({ ...validOnboard, requirements: '', instagramUrl: '  ' });
      expect(res.status).toBe(201);
      expect(res.body.artistProfile.requirements).toBeNull();
      expect(res.body.artistProfile.instagramUrl).toBeNull();
    });
  });

  describe('profile updates are visible everywhere', () => {
    it('lets the artist clear optional fields by sending empty strings', async () => {
      const res = await request(app).put('/api/artists/my-profile').set(auth).send({ bio: '', youtubeUrl: '' });
      expect(res.status).toBe(200);
      expect(res.body.profile.bio).toBeNull();
      expect(res.body.profile.youtubeUrl).toBeNull();
    });

    it('rejects blanking the required artist name', async () => {
      const res = await request(app).put('/api/artists/my-profile').set(auth).send({ artistName: '  ' });
      expect(res.status).toBe(400);
    });

    it('rejects genres that are not an array on update', async () => {
      const res = await request(app).put('/api/artists/my-profile').set(auth).send({ genres: 'Rock' });
      expect(res.status).toBe(400);
    });

    it('returns the updated profile from the session sync the app uses on refresh', async () => {
      await request(app).put('/api/artists/my-profile').set(auth).send({ artistName: 'Flow Test Band Renamed', baseFee: 45000 });
      const sync = await request(app).post('/api/auth/firebase').send({ idToken: token });
      expect(sync.status).toBe(200);
      expect(sync.body.user.artistProfile.artistName).toBe('Flow Test Band Renamed');
      expect(sync.body.user.artistProfile.baseFee).toBe(45000);
    });
  });
});
