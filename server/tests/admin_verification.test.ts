import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { VerificationStatus, UserRole } from '../src/types';

describe('Admin Verification API', () => {
  let adminToken: string;
  let customerToken: string;
  let pendingArtistId: number;

  beforeAll(async () => {
    // 1. Login as Admin
    const adminLogin = await request(app).post('/api/auth/login').send({
      email: 'admin@stagely.in',
      password: 'admin123'
    });
    adminToken = adminLogin.body.token;

    // 2. Login as Customer
    const customerLogin = await request(app).post('/api/auth/login').send({
      email: 'organizer@breweryhyd.in',
      password: 'password123'
    });
    customerToken = customerLogin.body.token;

    // 3. Find the seeded pending artist (Deccan Groove Collective)
    const pendingProfile = await prisma.artistProfile.findFirst({
      where: { verificationStatus: VerificationStatus.PENDING_VERIFICATION }
    });
    expect(pendingProfile).toBeDefined();
    pendingArtistId = pendingProfile!.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects unauthenticated or customer attempts to access admin verification', async () => {
    // No token
    const noTokenRes = await request(app).get('/api/admin/artists/pending');
    expect(noTokenRes.status).toBe(401);

    // Customer token
    const customerRes = await request(app)
      .get('/api/admin/artists/pending')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(customerRes.status).toBe(403);

    // Customer attempting to verify
    const verifyAttemptRes = await request(app)
      .put(`/api/admin/artists/${pendingArtistId}/verify`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: VerificationStatus.VERIFIED });
    expect(verifyAttemptRes.status).toBe(403);
  });

  it('allows admin to list pending artists and verify an artist', async () => {
    // 1. List pending
    const listRes = await request(app)
      .get('/api/admin/artists/pending')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.pendingArtists)).toBe(true);
    const found = listRes.body.pendingArtists.find((a: any) => a.id === pendingArtistId);
    expect(found).toBeDefined();
    expect(found.verificationStatus).toBe(VerificationStatus.PENDING_VERIFICATION);

    // 2. Admin approves and verifies the artist
    const verifyRes = await request(app)
      .put(`/api/admin/artists/${pendingArtistId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: VerificationStatus.VERIFIED });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.artistProfile.verificationStatus).toBe(VerificationStatus.VERIFIED);

    // 3. Verify in database
    const dbProfile = await prisma.artistProfile.findUnique({ where: { id: pendingArtistId } });
    expect(dbProfile?.verificationStatus).toBe(VerificationStatus.VERIFIED);
  });
});
