import { BookingService } from './booking.service';
import { ReviewService } from './review.service';
import { prisma } from '../lib/prisma';
import { VerificationStatus } from '../types';

export interface OnboardArtistInput {
  artistName: string;
  category: string;
  genres: string[];
  location: string;
  baseFee: number;
  bio?: string | null;
  requirements?: string | null;
  youtubeUrl?: string | null;
  instagramUrl?: string | null;
  availableSlots?: Array<{
    date: string;
    startTime: string;
    endTime: string;
  }>;
}

export interface UpdateArtistInput {
  artistName?: string;
  category?: string;
  genres?: string[];
  location?: string;
  baseFee?: number;
  bio?: string | null;
  requirements?: string | null;
  youtubeUrl?: string | null;
  instagramUrl?: string | null;
}

export class ArtistService {
  static async onboard(userId: number, input: OnboardArtistInput) {
    const existing = await prisma.artistProfile.findUnique({ where: { userId } });
    if (existing) {
      throw new Error('Artist profile already exists for this user');
    }

    const artistProfile = await prisma.artistProfile.create({
      data: {
        userId,
        artistName: input.artistName,
        category: input.category,
        genres: JSON.stringify(input.genres),
        location: input.location,
        baseFee: input.baseFee,
        bio: input.bio,
        requirements: input.requirements,
        youtubeUrl: input.youtubeUrl,
        instagramUrl: input.instagramUrl,
        verificationStatus: VerificationStatus.PENDING_VERIFICATION,
        availabilitySlots: input.availableSlots && input.availableSlots.length > 0 ? {
          create: input.availableSlots.map(slot => ({
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            isBooked: false
          }))
        } : undefined
      },
      include: {
        availabilitySlots: true
      }
    });

    return artistProfile;
  }

  static async updateProfile(artistId: number, input: UpdateArtistInput) {
    const data: any = {};
    if (input.artistName !== undefined) data.artistName = input.artistName;
    if (input.category !== undefined) data.category = input.category;
    if (input.genres !== undefined) data.genres = JSON.stringify(input.genres);
    if (input.location !== undefined) data.location = input.location;
    if (input.baseFee !== undefined) data.baseFee = input.baseFee;
    if (input.bio !== undefined) data.bio = input.bio;
    if (input.requirements !== undefined) data.requirements = input.requirements;
    if (input.youtubeUrl !== undefined) data.youtubeUrl = input.youtubeUrl;
    if (input.instagramUrl !== undefined) data.instagramUrl = input.instagramUrl;

    return prisma.artistProfile.update({
      where: { id: artistId },
      data,
      include: {
        availabilitySlots: {
          orderBy: { date: 'asc' }
        }
      }
    });
  }

  static async updateSchedule(artistId: number, slots: Array<{ date: string; startTime: string; endTime: string }>) {
    for (const slot of slots) {
      const existing = await prisma.availabilitySlot.findFirst({
        where: {
          artistId,
          date: slot.date,
          startTime: slot.startTime
        }
      });

      if (!existing) {
        await prisma.availabilitySlot.create({
          data: {
            artistId,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            isBooked: false
          }
        });
      }
    }

    return prisma.availabilitySlot.findMany({
      where: { artistId },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
    });
  }

  static async getProfileByUserId(userId: number) {
    return prisma.artistProfile.findUnique({
      where: { userId },
      include: {
        availabilitySlots: {
          orderBy: { date: 'asc' }
        }
      }
    });
  }

  static async getArtistStats(artistId: number) {
    // Lapsed offers must not inflate the pending-requests count
    await BookingService.expireStaleOffers();

    const todayStr = new Date().toISOString().split('T')[0];

    const completedGigsCount = await prisma.booking.count({
      where: {
        artistId,
        status: 'COMPLETED'
      }
    });

    const pendingRequestsCount = await prisma.booking.count({
      where: {
        artistId,
        status: 'REQUESTED'
      }
    });

    const upcomingGigsCount = await prisma.booking.count({
      where: {
        artistId,
        status: 'ACCEPTED',
        slot: {
          date: { gte: todayStr }
        }
      }
    });

    const { averageRating, reviewCount } = await ReviewService.getArtistRatingSummary(artistId);

    return {
      averageRating,
      reviewCount,
      completedGigsCount,
      pendingRequestsCount,
      upcomingGigsCount
    };
  }
}
