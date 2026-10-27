import express from 'express';
import request from 'supertest';
import { authenticate, requireRole, AuthenticatedRequest } from '../src/middlewares/auth.middleware';
import { UserRole } from '../src/types';

describe('Firebase Auth Middleware', () => {
  const app = express();
  app.use(express.json());

  app.get('/test/protected', authenticate, (req: AuthenticatedRequest, res) => {
    res.json({ message: 'success', user: req.user });
  });

  app.get('/test/admin-only', authenticate, requireRole([UserRole.ADMIN]), (req: AuthenticatedRequest, res) => {
    res.json({ message: 'admin access granted' });
  });

  it('rejects requests without Authorization header with 401', async () => {
    const res = await request(app).get('/test/protected');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Missing or malformed/i);
  });

  it('rejects invalid Firebase tokens with 401', async () => {
    const res = await request(app)
      .get('/test/protected')
      .set('Authorization', 'Bearer mock_invalid_token');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid or expired/i);
  });

  it('attaches db user to req.user on valid token', async () => {
    const res = await request(app)
      .get('/test/protected')
      .set('Authorization', 'Bearer mock_artist_token');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.role).toBe(UserRole.ARTIST);
    expect(res.body.user.firebaseUid).toBe('firebase_artist_uid_001');
  });

  it('enforces role authorization on admin-only route', async () => {
    // Artist fails
    const artistRes = await request(app)
      .get('/test/admin-only')
      .set('Authorization', 'Bearer mock_artist_token');
    expect(artistRes.status).toBe(403);

    // Admin succeeds
    const adminRes = await request(app)
      .get('/test/admin-only')
      .set('Authorization', 'Bearer mock_admin_token');
    expect(adminRes.status).toBe(200);
  });

  it('rejects token of user not yet in db with 401 USER_NOT_REGISTERED', async () => {
    const res = await request(app)
      .get('/test/protected')
      .set('Authorization', 'Bearer mock_new_user_999');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('USER_NOT_REGISTERED');
  });
});
