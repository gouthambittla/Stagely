import { Router, Response } from 'express';
import { ArtistService } from '../services/artist.service';
import { authenticate, requireRole, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { UserRole } from '../types';

const router = Router();

// Onboard current artist user
router.post('/onboard', authenticate, requireRole([UserRole.ARTIST]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { artistName, category, genres, location, baseFee, bio, requirements, youtubeUrl, instagramUrl, availableSlots } = req.body;
    if (!artistName || !category || !genres || !location || baseFee === undefined) {
      res.status(400).json({ error: 'artistName, category, genres, location, and baseFee are required' });
      return;
    }

    const artistProfile = await ArtistService.onboard(req.user!.id, {
      artistName,
      category,
      genres,
      location,
      baseFee: Number(baseFee),
      bio,
      requirements,
      youtubeUrl,
      instagramUrl,
      availableSlots
    });

    res.status(201).json({ message: 'Onboarding completed successfully', artistProfile });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Onboarding failed' });
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

    const { slots } = req.body;
    if (!Array.isArray(slots)) {
      res.status(400).json({ error: 'slots array is required' });
      return;
    }

    const updatedSlots = await ArtistService.updateSchedule(profile.id, slots);
    res.status(200).json({ slots: updatedSlots });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update schedule' });
  }
});

// Get current logged-in artist profile
router.get('/my-profile', authenticate, requireRole([UserRole.ARTIST]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await ArtistService.getProfileByUserId(req.user!.id);
    if (!profile) {
      res.status(404).json({ error: 'Artist profile not found' });
      return;
    }
    res.status(200).json({ profile });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch profile' });
  }
});

export default router;
