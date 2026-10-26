import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { VerificationStatus, UserRole } from '../src/types';

describe('Auth & Artist Onboarding API', () => {
  const testEmail = `artist_${Date.now()}@stagely.in`;

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await prisma.$disconnect();
  });

  it('registers artist and enforces PENDING_VERIFICATION on onboarding', async () => {
    // 1. Register new artist account
    const regRes = await request(app).post('/api/auth/register').send({
      email: testEmail,
      password: 'password123',
      role: UserRole.ARTIST
    });

    expect(regRes.status).toBe(201);
    expect(regRes.body.token).toBeDefined();
    expect(regRes.body.user.email).toBe(testEmail);
    expect(regRes.body.user.role).toBe(UserRole.ARTIST);

    const token = regRes.body.token;

    // 2. Complete onboarding form
    const onboardRes = await request(app)
      .post('/api/artists/onboard')
      .set('Authorization', `Bearer ${token}`)
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

  it('authenticates existing user and returns JWT token', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'admin@stagely.in',
      password: 'admin123'
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();
    expect(loginRes.body.user.role).toBe(UserRole.ADMIN);
  });
});
