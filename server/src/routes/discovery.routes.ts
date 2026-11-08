import { ReviewService } from '../services/review.service';
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { VerificationStatus } from '../types';
import { BookingService } from '../services/booking.service';
import { sendError, parseId, badRequest } from '../lib/http';

const router = Router();

// GET /api/artists - Public Catalog (STRICTLY VERIFIED ONLY)
router.get('/', async (req: Request, res: Response) => {
  try {
    // Release nights held by lapsed offers before computing availability
    await BookingService.expireStaleOffers();

    const { location, category, search, date, minFee, maxFee, genres } = req.query;

    const whereClause: any = {
      verificationStatus: VerificationStatus.VERIFIED
    };

    if (location && typeof location === 'string') {
      whereClause.location = { contains: location, mode: 'insensitive' };
    }

    if (category && typeof category === 'string') {
      whereClause.category = category;
    }

    const parseFee = (value: unknown, name: string) => {
      const fee = Number(value);
      if (typeof value !== 'string' || value.trim() === '' || !Number.isFinite(fee) || fee < 0) {
        throw badRequest(`${name} must be a non-negative number`);
      }
      return Math.floor(fee);
    };

    if (minFee !== undefined || maxFee !== undefined) {
      whereClause.baseFee = {};
      if (minFee !== undefined) {
        whereClause.baseFee.gte = parseFee(minFee, 'minFee');
      }
      if (maxFee !== undefined) {
        whereClause.baseFee.lte = parseFee(maxFee, 'maxFee');
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
          { artistName: { contains: search, mode: 'insensitive' } },
          { genres: { contains: search, mode: 'insensitive' } },
          { bio: { contains: search, mode: 'insensitive' } }
        ]
      });
    }

    if (genres && typeof genres === 'string') {
      const genreList = genres.split(',').map(g => g.trim()).filter(Boolean);
      if (genreList.length > 0) {
        andConditions.push({
          OR: genreList.map(g => ({
            genres: { contains: g, mode: 'insensitive' }
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
  } catch (err) {
    sendError(res, err, 500);
  }
});

// GET /api/artists/:id - Specific Artist Details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    await BookingService.expireStaleOffers();

    const id = parseId(req.params.id, 'artist id');
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
  } catch (err) {
    sendError(res, err, 500);
  }
});

export default router;
