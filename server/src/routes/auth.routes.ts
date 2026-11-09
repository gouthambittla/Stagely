import { UserRole } from '../types';
import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { sendError } from '../lib/http';

const router = Router();

const SELF_SIGNUP_ROLES: string[] = [UserRole.CUSTOMER, UserRole.ARTIST];

router.post('/firebase', async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      res.status(400).json({ error: 'idToken is required' });
      return;
    }
    const result = await AuthService.syncFirebaseUser(idToken);
    res.status(200).json(result);
  } catch (err) {
    sendError(res, err, 401);
  }
});

router.post('/complete-signup', async (req: Request, res: Response) => {
  try {
    const { idToken, role, name, email, phone } = req.body ?? {};
    if (!idToken || !role || !name) {
      res.status(400).json({ error: 'idToken, role, and name are required' });
      return;
    }
    // ADMIN accounts are provisioned out-of-band; clients may only self-register as bookers or artists.
    if (!SELF_SIGNUP_ROLES.includes(role)) {
      res.status(400).json({ error: 'role must be CUSTOMER or ARTIST' });
      return;
    }
    if (typeof idToken !== 'string' || typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      res.status(400).json({ error: 'name must be a non-empty string of at most 100 characters' });
      return;
    }
    const result = await AuthService.completeSignup({ idToken, role, name, email, phone });
    res.status(201).json(result);
  } catch (err) {
    sendError(res, err, 400);
  }
});

router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await AuthService.getMe(req.user!.id);
    res.status(200).json(result);
  } catch (err) {
    sendError(res, err, 404);
  }
});

export default router;
