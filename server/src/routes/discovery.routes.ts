import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { VerificationStatus } from '../types';

const router = Router();

// GET /api/artists - Public Catalog (STRICTLY VERIFIED ONLY)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { location, category, search } = req.query;

    const whereClause: any = {
      verificationStatus: VerificationStatus.VERIFIED
    };

    if (location && typeof location === 'string') {
      whereClause.location = { contains: location };
    }

    if (category && typeof category === 'string') {
      whereClause.category = category;
    }

    if (search && typeof search === 'string') {
      whereClause.OR = [
        { artistName: { contains: search } },
        { genres: { contains: search } },
        { bio: { contains: search } }
      ];
    }

    const artists = await prisma.artistProfile.findMany({
      where: whereClause,
      include: {
        availabilitySlots: {
          where: { isBooked: false },
          orderBy: { date: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ artists });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to search artists' });
  }
});

// GET /api/artists/:id - Specific Artist Details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const artist = await prisma.artistProfile.findUnique({
      where: { id },
      include: {
        availabilitySlots: {
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
        }
      }
    });

    if (!artist || artist.verificationStatus !== VerificationStatus.VERIFIED) {
      res.status(404).json({ error: 'Artist not found or not verified' });
      return;
    }

    res.status(200).json({ artist });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch artist profile' });
  }
});

export default router;
