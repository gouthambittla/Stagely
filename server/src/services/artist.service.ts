import { prisma } from '../lib/prisma';
import { VerificationStatus } from '../types';

export interface OnboardArtistInput {
  artistName: string;
  category: string;
  genres: string[];
  location: string;
  baseFee: number;
  bio?: string;
  requirements?: string;
  youtubeUrl?: string;
  instagramUrl?: string;
  availableSlots?: Array<{
    date: string;
    startTime: string;
    endTime: string;
  }>;
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

  static async updateSchedule(artistId: number, slots: Array<{ date: string; startTime: string; endTime: string }>) {
    // Add new slots if not already existing
    const createdSlots = [];
    for (const slot of slots) {
      const existing = await prisma.availabilitySlot.findFirst({
        where: {
          artistId,
          date: slot.date,
          startTime: slot.startTime
        }
      });

      if (!existing) {
        const created = await prisma.availabilitySlot.create({
          data: {
            artistId,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            isBooked: false
          }
        });
        createdSlots.push(created);
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
}
