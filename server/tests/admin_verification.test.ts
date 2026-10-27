import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { VerificationStatus, UserRole } from '../src/types';

describe('Admin Verification API', () => {
  let adminToken: string;
  let customerToken: string;
  let pendingArtistId: number;

  beforeAll(async () => {
    adminToken = 'mock_admin_token';
    customerToken = 'mock_customer_token';

    // Create a fresh pending artist for this test suite
    const pendingUser = await prisma.user.create({
      data: {
        firebaseUid: `mock_pending_${Date.now()}`,
        email: `pending_${Date.now()}@stagely.in`,
        name: 'Test Pending Collective Lead',
        role: UserRole.ARTIST,
        artistProfile: {
          create: {
            artistName: 'Test Pending Collective',
            category: 'Band',
            genres: JSON.stringify(['Fusion']),
            location: 'Hyderabad',
            baseFee: 20000,
            verificationStatus: VerificationStatus.PENDING_VERIFICATION
          }
        }
      },
      include: { artistProfile: true }
    });
    pendingArtistId = pendingUser.artistProfile!.id;
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
