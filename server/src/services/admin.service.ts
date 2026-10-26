import { prisma } from '../lib/prisma';
import { VerificationStatus } from '../types';

export class AdminService {
  static async getPendingArtists() {
    return prisma.artistProfile.findMany({
      where: {
        verificationStatus: VerificationStatus.PENDING_VERIFICATION
      },
      include: {
        user: {
          select: { id: true, email: true, createdAt: true }
        },
        availabilitySlots: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  static async verifyArtist(artistId: number, status: VerificationStatus) {
    if (![VerificationStatus.VERIFIED, VerificationStatus.REJECTED].includes(status)) {
      throw new Error('Status must be either VERIFIED or REJECTED');
    }

    const artist = await prisma.artistProfile.findUnique({ where: { id: artistId } });
    if (!artist) {
      throw new Error('Artist not found');
    }

    const updated = await prisma.artistProfile.update({
      where: { id: artistId },
      data: { verificationStatus: status },
      include: {
        user: { select: { id: true, email: true } },
        availabilitySlots: true
      }
    });

    return updated;
  }
}
