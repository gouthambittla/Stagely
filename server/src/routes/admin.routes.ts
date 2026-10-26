import { Router, Response } from 'express';
import { AdminService } from '../services/admin.service';
import { authenticate, requireRole, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { UserRole, VerificationStatus } from '../types';

const router = Router();

// Only ADMIN role can access these endpoints
router.use(authenticate, requireRole([UserRole.ADMIN]));

// GET pending artists queue
router.get('/artists/pending', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pendingArtists = await AdminService.getPendingArtists();
    res.status(200).json({ pendingArtists });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch pending artists' });
  }
});

// PUT verify or reject an artist
router.put('/artists/:id/verify', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const artistId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (!status || ![VerificationStatus.VERIFIED, VerificationStatus.REJECTED].includes(status)) {
      res.status(400).json({ error: 'Status must be VERIFIED or REJECTED' });
      return;
    }

    const updated = await AdminService.verifyArtist(artistId, status);
    res.status(200).json({
      message: `Artist status updated to ${status}`,
      artistProfile: updated
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update verification status' });
  }
});

export default router;
