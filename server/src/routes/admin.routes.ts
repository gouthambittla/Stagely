import { Router, Response } from 'express';
import { AdminService } from '../services/admin.service';
import { PaymentService } from '../services/payment.service';
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

// GET /api/admin/disputes - Open disputes with reason, chat history and payment
router.get('/disputes', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const disputes = await PaymentService.listDisputes();
    res.status(200).json({ disputes });
  } catch (err) {
    sendError(res, err, 500);
  }
});

// POST /api/admin/disputes/:id/resolve - { outcome: 'PAY_ARTIST' | 'REFUND' | 'SPLIT', refundPaise? }
router.post('/disputes/:id/resolve', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bookingId = parseId(req.params.id, 'booking id');
    const { outcome, refundPaise } = req.body ?? {};
    const booking = await PaymentService.resolveDispute(bookingId, outcome, refundPaise);
    res.status(200).json({ message: `Dispute resolved: ${outcome}`, booking });
  } catch (err) {
    sendError(res, err, 400);
  }
});

export default router;
