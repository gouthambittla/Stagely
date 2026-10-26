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
    // 1. Verify artist exists and is verified
    const artist = await prisma.artistProfile.findUnique({
      where: { id: input.artistId }
    });
    if (!artist || artist.verificationStatus !== VerificationStatus.VERIFIED) {
      throw new Error('Artist is not available for bookings');
    }

    // 2. Verify slot is open
    const slot = await prisma.availabilitySlot.findUnique({
      where: { id: input.slotId }
    });
    if (!slot || slot.artistId !== input.artistId) {
      throw new Error('Invalid availability slot');
    }
    if (slot.isBooked) {
      throw new Error('This slot has already been booked');
    }

    // 3. Create booking
    const booking = await prisma.booking.create({
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

    return booking;
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

    // Transaction: update booking status and if accepted, mark slot as booked
    const result = await prisma.$transaction(async (tx) => {
      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: { status: newStatus },
        include: { slot: true, artist: true, customer: { select: { id: true, email: true } } }
      });

      if (action === 'ACCEPT') {
        await tx.availabilitySlot.update({
          where: { id: booking.slotId },
          data: { isBooked: true }
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
          slot: true
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
