import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';

describe('Customer Profile API', () => {
  const customerToken = 'mock_cust_profile_token_001';
  const firebaseUid = 'firebase_cust_profile_token_001';

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: {
        OR: [
          { firebaseUid },
          { firebaseUid: customerToken },
          { email: 'cust_profile_token_001@stagely.in' }
        ]
      }
    });

    await request(app)
      .post('/api/auth/complete-signup')
      .send({
        idToken: customerToken,
        role: 'CUSTOMER',
        name: 'Venue Host Suresh'
      });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        OR: [
          { firebaseUid },
          { firebaseUid: customerToken },
          { email: 'cust_profile_token_001@stagely.in' }
        ]
      }
    });
    await prisma.$disconnect();
  });

  it('retrieves user profile with booking counts', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.name).toBe('Venue Host Suresh');
    expect(res.body.stats).toBeDefined();
    expect(typeof res.body.stats.activeBookingsCount).toBe('number');
    expect(typeof res.body.stats.completedBookingsCount).toBe('number');
  });

  it('updates customer venue details without altering login phone', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        name: 'Suresh Kumar',
        venueName: 'Tabula Rasa Bar',
        city: 'Jubilee Hills, Hyderabad',
        contactPhone: '+919988771122',
        phone: '+910000000000' // Must be ignored
      });

    expect(res.status).toBe(200);
    expect(res.body.user.venueName).toBe('Tabula Rasa Bar');
    expect(res.body.user.contactPhone).toBe('+919988771122');
    expect(res.body.user.phone).not.toBe('+910000000000');
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });
});
