import { prisma } from '../lib/prisma';
import { BookingStatus, VerificationStatus, UserRole } from '../types';

export interface CreateBookingInput {
  customerId: number;
  artistId: number;
  slotId: number;
  eventType: string;
  eventLocation: string;
  notes?: string;
}

export class BookingService {
  static async createBooking(input: CreateBookingInput) {
    return prisma.$transaction(async (tx) => {
      // 1. Verify artist exists and is verified
      const artist = await tx.artistProfile.findUnique({
        where: { id: input.artistId }
      });
      if (!artist || artist.verificationStatus !== VerificationStatus.VERIFIED) {
        const err: any = new Error('Artist is not available for bookings');
        err.statusCode = 400;
        throw err;
      }

      // 2. Verify slot exists and is open
      const slot = await tx.availabilitySlot.findUnique({
        where: { id: input.slotId }
      });
      if (!slot || slot.artistId !== input.artistId) {
        const err: any = new Error('Invalid availability slot');
        err.statusCode = 400;
        throw err;
      }
      if (slot.isBooked) {
        const err: any = new Error('This slot has already been booked or has an active offer');
        err.statusCode = 409;
        throw err;
      }

      // 3. Strict Single-Offer / Night Collision Check:
      // Ensure artist has NO other active booking (REQUESTED or ACCEPTED) on the same date
      const activeBookingOnDate = await tx.booking.findFirst({
        where: {
          artistId: input.artistId,
          slot: { date: slot.date },
          status: { in: [BookingStatus.REQUESTED, BookingStatus.ACCEPTED] }
        }
      });
      if (activeBookingOnDate) {
        const err: any = new Error('This artist already has an active offer or confirmed booking for this date');
        err.statusCode = 409;
        throw err;
      }

      // 4. Create booking in REQUESTED state
      const booking = await tx.booking.create({
        data: {
          customerId: input.customerId,
          artistId: input.artistId,
          slotId: input.slotId,
          eventType: input.eventType,
          eventLocation: input.eventLocation,
          notes: input.notes,
          status: BookingStatus.REQUESTED
        },
        include: {
          artist: true,
          slot: true,
          customer: { select: { id: true, email: true } }
        }
      });

      // 5. Immediately lock the slot exclusively for this request
      await tx.availabilitySlot.update({
        where: { id: input.slotId },
        data: { isBooked: true }
      });

      return booking;
    });
  }

  static async respondToBooking(bookingId: number, artistUserId: number, action: 'ACCEPT' | 'DECLINED') {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { artist: true }
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (booking.artist.userId !== artistUserId) {
      throw new Error('Unauthorized to respond to this booking');
    }

    if (booking.status !== BookingStatus.REQUESTED) {
      throw new Error(`Cannot respond to a booking with status ${booking.status}`);
    }

    const newStatus = action === 'ACCEPT' ? BookingStatus.ACCEPTED : BookingStatus.DECLINED;

    // Transaction: update booking status and lock or release the slot
    const result = await prisma.$transaction(async (tx) => {
      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: { status: newStatus },
        include: { slot: true, artist: true, customer: { select: { id: true, email: true } } }
      });

      if (action === 'ACCEPT') {
        // Keep slot locked
        await tx.availabilitySlot.update({
          where: { id: booking.slotId },
          data: { isBooked: true }
        });
      } else if (action === 'DECLINED') {
        // Release the slot back to the open pool
        await tx.availabilitySlot.update({
          where: { id: booking.slotId },
          data: { isBooked: false }
        });
      }

      return updatedBooking;
    });

    return result;
  }

  static async addMessage(bookingId: number, senderId: number, content: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { artist: true }
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    // Ensure sender is either the customer or the artist
    if (booking.customerId !== senderId && booking.artist.userId !== senderId) {
      throw new Error('Unauthorized to post messages to this booking');
    }

    const message = await prisma.message.create({
      data: {
        bookingId,
        senderId,
        content
      },
      include: {
        sender: { select: { id: true, email: true, role: true } }
      }
    });

    return message;
  }

  static async getMessages(bookingId: number, userId: number) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { artist: true }
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (booking.customerId !== userId && booking.artist.userId !== userId) {
      throw new Error('Unauthorized to view messages for this booking');
    }

    return prisma.message.findMany({
      where: { bookingId },
      include: {
        sender: { select: { id: true, email: true, role: true } }
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  static async getBookingsForUser(userId: number, role: UserRole) {
    if (role === UserRole.CUSTOMER) {
      return prisma.booking.findMany({
        where: { customerId: userId },
        include: {
          artist: true,
          slot: true,
          review: true
        },
        orderBy: { createdAt: 'desc' }
      });
    } else if (role === UserRole.ARTIST) {
      const artist = await prisma.artistProfile.findUnique({ where: { userId } });
      if (!artist) return [];
      return prisma.booking.findMany({
        where: { artistId: artist.id },
        include: {
          customer: { select: { id: true, email: true } },
          slot: true
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    return [];
  }
}
