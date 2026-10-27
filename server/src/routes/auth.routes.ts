import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

router.post('/firebase', async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      res.status(400).json({ error: 'idToken is required' });
      return;
    }
    const result = await AuthService.syncFirebaseUser(idToken);
    res.status(200).json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Firebase authentication failed' });
  }
});

router.post('/complete-signup', async (req: Request, res: Response) => {
  try {
    const { idToken, role, name, email, phone } = req.body;
    if (!idToken || !role || !name) {
      res.status(400).json({ error: 'idToken, role, and name are required' });
      return;
    }
    const result = await AuthService.completeSignup({ idToken, role, name, email, phone });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Signup completion failed' });
  }
});

router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await AuthService.getMe(req.user!.id);
    res.status(200).json(result);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'User not found' });
  }
});

export default router;
