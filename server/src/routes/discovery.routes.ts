import { ReviewService } from '../services/review.service';
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { VerificationStatus } from '../types';

const router = Router();

// GET /api/artists - Public Catalog (STRICTLY VERIFIED ONLY)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { location, category, search, date, minFee, maxFee, genres } = req.query;

    const whereClause: any = {
      verificationStatus: VerificationStatus.VERIFIED
    };

    if (location && typeof location === 'string') {
      whereClause.location = { contains: location };
    }

    if (category && typeof category === 'string') {
      whereClause.category = category;
    }

    if (minFee !== undefined || maxFee !== undefined) {
      whereClause.baseFee = {};
      if (minFee !== undefined) {
        whereClause.baseFee.gte = parseInt(minFee as string, 10);
      }
      if (maxFee !== undefined) {
        whereClause.baseFee.lte = parseInt(maxFee as string, 10);
      }
    }

    if (date && typeof date === 'string') {
      whereClause.availabilitySlots = {
        some: {
          date: date,
          isBooked: false
        }
      };
    }

    const andConditions: any[] = [];

    if (search && typeof search === 'string') {
      andConditions.push({
        OR: [
          { artistName: { contains: search } },
          { genres: { contains: search } },
          { bio: { contains: search } }
        ]
      });
    }

    if (genres && typeof genres === 'string') {
      const genreList = genres.split(',').map(g => g.trim()).filter(Boolean);
      if (genreList.length > 0) {
        andConditions.push({
          OR: genreList.map(g => ({
            genres: { contains: g }
          }))
        });
      }
    }

    if (andConditions.length > 0) {
      whereClause.AND = andConditions;
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

    const { averageRating, reviewCount } = await ReviewService.getArtistRatingSummary(artist.id);
    res.status(200).json({ artist, averageRating, reviewCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch artist profile' });
  }
});

export default router;
