import { ReviewService } from '../services/review.service';
import { Router, Response } from 'express';
import { ArtistService } from '../services/artist.service';
import { authenticate, requireRole, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { UserRole } from '../types';
import { sendError, parseId, parseText } from '../lib/http';
import { parseBaseFee, parseGenres, parseOptionalText, parseSlots } from '../lib/artistValidation';

const router = Router();

// Onboard current artist user
router.post('/onboard', authenticate, requireRole([UserRole.ARTIST]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body ?? {};
    const artistProfile = await ArtistService.onboard(req.user!.id, {
      artistName: parseText(body.artistName, 'artistName', { required: true, max: 100 })!,
      category: parseText(body.category, 'category', { required: true, max: 50 })!,
      genres: parseGenres(body.genres),
      location: parseText(body.location, 'location', { required: true, max: 100 })!,
      baseFee: parseBaseFee(body.baseFee),
      bio: parseOptionalText(body.bio, 'bio', 2000),
      requirements: parseOptionalText(body.requirements, 'requirements', 2000),
      youtubeUrl: parseOptionalText(body.youtubeUrl, 'youtubeUrl', 300),
      instagramUrl: parseOptionalText(body.instagramUrl, 'instagramUrl', 300),
      availableSlots: parseSlots(body.availableSlots)
    });

    res.status(201).json({ message: 'Onboarding completed successfully', artistProfile });
  } catch (err) {
    sendError(res, err, 400);
  }
});

// Update or add 15-day availability schedule
router.post('/schedule', authenticate, requireRole([UserRole.ARTIST]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await ArtistService.getProfileByUserId(req.user!.id);
    if (!profile) {
      res.status(404).json({ error: 'Artist profile not found. Complete onboarding first.' });
      return;
    }

    if (!Array.isArray(req.body?.slots)) {
      res.status(400).json({ error: 'slots array is required' });
      return;
    }

    const updatedSlots = await ArtistService.updateSchedule(profile.id, parseSlots(req.body.slots));
    res.status(200).json({ slots: updatedSlots });
  } catch (err) {
    sendError(res, err, 400);
  }
});

// Get current logged-in artist profile with gig statistics
router.get('/my-profile', authenticate, requireRole([UserRole.ARTIST]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await ArtistService.getProfileByUserId(req.user!.id);
    if (!profile) {
      res.status(404).json({ error: 'Artist profile not found' });
      return;
    }

    const stats = await ArtistService.getArtistStats(profile.id);
    res.status(200).json({ profile, stats });
  } catch (err) {
    sendError(res, err, 500);
  }
});

// Update current logged-in artist profile
router.put('/my-profile', authenticate, requireRole([UserRole.ARTIST]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await ArtistService.getProfileByUserId(req.user!.id);
    if (!profile) {
      res.status(404).json({ error: 'Artist profile not found' });
      return;
    }

    const body = req.body ?? {};
    const updatedProfile = await ArtistService.updateProfile(profile.id, {
      artistName: body.artistName === undefined ? undefined : parseText(body.artistName, 'artistName', { required: true, max: 100 }),
      category: body.category === undefined ? undefined : parseText(body.category, 'category', { required: true, max: 50 }),
      genres: body.genres === undefined ? undefined : parseGenres(body.genres),
      location: body.location === undefined ? undefined : parseText(body.location, 'location', { required: true, max: 100 }),
      baseFee: body.baseFee === undefined ? undefined : parseBaseFee(body.baseFee),
      bio: parseOptionalText(body.bio, 'bio', 2000),
      requirements: parseOptionalText(body.requirements, 'requirements', 2000),
      youtubeUrl: parseOptionalText(body.youtubeUrl, 'youtubeUrl', 300),
      instagramUrl: parseOptionalText(body.instagramUrl, 'instagramUrl', 300)
    });

    const stats = await ArtistService.getArtistStats(profile.id);
    res.status(200).json({ profile: updatedProfile, stats });
  } catch (err) {
    sendError(res, err, 400);
  }
});


// GET /api/artists/:id/reviews - Publicly fetch verified artist reviews
router.get('/:id/reviews', async (req, res: Response) => {
  try {
    const artistId = parseId(req.params.id, 'artist id');
    const data = await ReviewService.getArtistReviews(artistId);
    res.status(200).json(data);
  } catch (err) {
    sendError(res, err, 500);
  }
});

export default router;
