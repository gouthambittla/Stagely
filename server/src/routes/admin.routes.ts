import { Router, Response } from 'express';
import { AdminService } from '../services/admin.service';
import { authenticate, requireRole, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { UserRole, VerificationStatus } from '../types';
import { sendError, parseId } from '../lib/http';

const router = Router();

// Only ADMIN role can access these endpoints
router.use(authenticate, requireRole([UserRole.ADMIN]));

// GET pending artists queue
router.get('/artists/pending', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pendingArtists = await AdminService.getPendingArtists();
    res.status(200).json({ pendingArtists });
  } catch (err) {
    sendError(res, err, 500);
  }
});

// PUT verify or reject an artist
router.put('/artists/:id/verify', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const artistId = parseId(req.params.id, 'artist id');
    const { status } = req.body ?? {};

    if (!status || ![VerificationStatus.VERIFIED, VerificationStatus.REJECTED].includes(status)) {
      res.status(400).json({ error: 'Status must be VERIFIED or REJECTED' });
      return;
    }

    const updated = await AdminService.verifyArtist(artistId, status);
    res.status(200).json({
      message: `Artist status updated to ${status}`,
      artistProfile: updated
    });
  } catch (err) {
    sendError(res, err, 400);
  }
});

export default router;
