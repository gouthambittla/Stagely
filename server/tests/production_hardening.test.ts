import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { verifyFirebaseIdToken } from '../src/lib/firebase';
import { VerificationStatus } from '../src/types';

describe('Production hardening', () => {
  const customerToken = 'mock_customer_token';
  const artistToken = 'mock_artist_token';
  const secondCustomerToken = 'mock_new_user_cust_02';
  const raceDate = '2027-02-14';
  let artistId: number;

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
    artistId = artist!.id;
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { artistId, slot: { date: raceDate } } });
    await prisma.availabilitySlot.deleteMany({ where: { artistId, date: raceDate } });
    await prisma.user.deleteMany({ where: { firebaseUid: 'firebase_new_uid_admin_wannabe' } });
    await prisma.$disconnect();
  });

  describe('signup privilege escalation', () => {
    it('refuses to let a client self-register as ADMIN', async () => {
      const res = await request(app).post('/api/auth/complete-signup').send({
        idToken: 'mock_new_user_admin_wannabe',
        role: 'ADMIN',
        name: 'Not An Admin'
      });
      expect(res.status).toBe(400);
      const user = await prisma.user.findUnique({ where: { firebaseUid: 'firebase_new_uid_admin_wannabe' } });
      expect(user).toBeNull();
    });
  });

  describe('mock-token gate', () => {
    const originalEnv = { ...process.env };
    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('rejects mock tokens when NODE_ENV is unset and mock auth is not explicitly enabled', async () => {
      delete process.env.NODE_ENV;
      delete process.env.ALLOW_MOCK_AUTH;
      await expect(verifyFirebaseIdToken('mock_admin_token')).rejects.toThrow();
    });

    it('rejects mock tokens in production even if ALLOW_MOCK_AUTH is set', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_MOCK_AUTH = 'true';
      await expect(verifyFirebaseIdToken('mock_admin_token')).rejects.toThrow();
    });

    it('accepts mock tokens in development only when ALLOW_MOCK_AUTH=true', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_MOCK_AUTH = 'true';
      await expect(verifyFirebaseIdToken('mock_admin_token')).resolves.toMatchObject({ uid: 'firebase_admin_uid_001' });
    });
  });

  describe('booking authorization and concurrency', () => {
    it('only customers can create bookings', async () => {
      const slot = await prisma.availabilitySlot.create({
        data: { artistId, date: raceDate, startTime: '17:00', endTime: '18:00' }
      });
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${artistToken}`)
        .send({ artistId, slotId: slot.id, eventType: 'Self booking', eventLocation: 'Nowhere' });
      expect(res.status).toBe(403);
    });

    it('lets exactly one of two simultaneous requests win the same slot', async () => {
      const slot = await prisma.availabilitySlot.create({
        data: { artistId, date: raceDate, startTime: '20:00', endTime: '22:00' }
      });
      const send = (token: string) =>
        request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${token}`)
          .send({ artistId, slotId: slot.id, eventType: 'Race', eventLocation: 'Race Venue' });

      const results = await Promise.all([send(customerToken), send(secondCustomerToken)]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409]);

      const active = await prisma.booking.count({
        where: { slotId: slot.id, status: { in: ['REQUESTED', 'ACCEPTED'] } }
      });
      expect(active).toBe(1);
    });
  });

  describe('input validation', () => {
    it('returns 400 for a non-numeric artist id', async () => {
      const res = await request(app).get('/api/artists/not-a-number');
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-numeric booking id', async () => {
      const res = await request(app)
        .put('/api/bookings/abc/respond')
        .set('Authorization', `Bearer ${artistToken}`)
        .send({ action: 'ACCEPT' });
      expect(res.status).toBe(400);
    });

    it('rejects whitespace-only and oversized chat messages', async () => {
      const customer = await prisma.user.findUniqueOrThrow({ where: { firebaseUid: 'firebase_customer_uid_001' } });
      const slot = await prisma.availabilitySlot.create({
        data: { artistId, date: raceDate, startTime: '12:00', endTime: '13:00', isBooked: true }
      });
      const booking = await prisma.booking.create({
        data: { customerId: customer.id, artistId, slotId: slot.id, eventType: 'Chat test', eventLocation: 'Venue' }
      });
      const send = (content: string) =>
        request(app)
          .post(`/api/bookings/${booking!.id}/messages`)
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ content });
      expect((await send('   ')).status).toBe(400);
      expect((await send('x'.repeat(2001))).status).toBe(400);
    });
  });

  describe('error handling', () => {
    it('returns JSON 404 for unknown routes', async () => {
      const res = await request(app).get('/api/does-not-exist');
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });

    it('returns 400 JSON for malformed JSON bodies', async () => {
      const res = await request(app)
        .post('/api/auth/complete-signup')
        .set('Content-Type', 'application/json')
        .send('{"broken":');
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('does not leak internal error details on 500', async () => {
      const spy = jest
        .spyOn(prisma.artistProfile, 'findMany')
        .mockRejectedValueOnce(new Error('Invalid `prisma.artistProfile.findMany()` invocation: secret internals'));
      const res = await request(app).get('/api/artists');
      spy.mockRestore();
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toMatch(/prisma|secret internals/i);
    });
  });

  describe('ops', () => {
    it('exposes a readiness probe that checks the database', async () => {
      const res = await request(app).get('/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
    });

    it('sets standard security headers', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('never logs request bodies (they carry ID tokens and phone numbers)', async () => {
      process.env.REQUEST_LOGGING = 'true';
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await request(app).post('/api/auth/firebase').send({ idToken: 'mock_super_secret_token_value' });
      const logged = logSpy.mock.calls.map((c) => JSON.stringify(c)).join('\n');
      logSpy.mockRestore();
      delete process.env.REQUEST_LOGGING;
      expect(logged).toContain('/api/auth/firebase'); // the access log actually ran
      expect(logged).not.toContain('mock_super_secret_token_value');
    });
  });

  describe('search', () => {
    it('matches artist names case-insensitively', async () => {
      const res = await request(app).get('/api/artists?search=jammers');
      expect(res.status).toBe(200);
      expect(res.body.artists.some((a: any) => a.artistName === 'Jammers Hyderabad')).toBe(true);
    });
  });
});
