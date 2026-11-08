import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { BookingService } from '../services/booking.service';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

// GET /api/users/me
router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firebaseUid: true,
        email: true,
        phone: true,
        name: true,
        venueName: true,
        city: true,
        contactPhone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        artistProfile: true
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Lapsed offers must not count as active bookings
    await BookingService.expireStaleOffers();

    const todayStr = new Date().toISOString().split('T')[0];

    // Compute stats for bookings
    const activeBookingsCount = await prisma.booking.count({
      where: {
        customerId: userId,
        status: { in: ['REQUESTED', 'ACCEPTED'] }
      }
    });

    const completedBookingsCount = await prisma.booking.count({
      where: {
        customerId: userId,
        OR: [
          { status: 'COMPLETED' },
          {
            status: 'ACCEPTED',
            slot: {
              date: { lt: todayStr }
            }
          }
        ]
      }
    });

    res.json({
      user,
      stats: {
        activeBookingsCount,
        completedBookingsCount
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// PUT /api/users/me
router.put('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, venueName, city, contactPhone } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined && { name }),
        ...(venueName !== undefined && { venueName }),
        ...(city !== undefined && { city }),
        ...(contactPhone !== undefined && { contactPhone })
      },
      select: {
        id: true,
        firebaseUid: true,
        email: true,
        phone: true,
        name: true,
        venueName: true,
        city: true,
        contactPhone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        artistProfile: true
      }
    });

    res.json({ user: updatedUser });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
