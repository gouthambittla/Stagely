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

/** How long an artist has to answer a booking request before it lapses and the night reopens. */
export const OFFER_TTL_HOURS = 48;
const HOUR_MS = 60 * 60 * 1000;
/** Slots are stored as local wall-clock date/time; the marketplace operates in IST. */
const MARKET_UTC_OFFSET = '+05:30';

/**
 * An offer lapses after OFFER_TTL_HOURS, or at the event start if that comes first
 * (an artist can't usefully accept a gig that has already begun).
 */
export function computeOfferExpiry(slot: { date: string; startTime: string }, now: Date = new Date()): Date {
  const ttlExpiry = new Date(now.getTime() + OFFER_TTL_HOURS * HOUR_MS);
  const eventStart = new Date(`${slot.date}T${slot.startTime}:00${MARKET_UTC_OFFSET}`);
  if (!isNaN(eventStart.getTime()) && eventStart > now && eventStart < ttlExpiry) {
    return eventStart;
  }
  return ttlExpiry;
}

export class BookingService {
  /**
   * Marks lapsed REQUESTED offers as EXPIRED and releases their slots so the night
   * becomes bookable again. Safe to call often (lazily on reads/writes and from a sweep).
   * Returns the number of offers expired.
   */
  static async expireStaleOffers(now: Date = new Date()): Promise<number> {
    const legacyCutoff = new Date(now.getTime() - OFFER_TTL_HOURS * HOUR_MS);

    return prisma.$transaction(async (tx) => {
      const stale = await tx.booking.findMany({
        where: {
          status: BookingStatus.REQUESTED,
          OR: [
            { expiresAt: { lte: now } },
            // Requests created before expiresAt existed fall back to createdAt + TTL
            { expiresAt: null, createdAt: { lte: legacyCutoff } }
          ]
        },
        select: { id: true, slotId: true }
      });
      if (stale.length === 0) return 0;

      // Guard on status so a concurrent accept/decline is never overwritten
      const { count } = await tx.booking.updateMany({
        where: { id: { in: stale.map((b) => b.id) }, status: BookingStatus.REQUESTED },
        data: { status: BookingStatus.EXPIRED }
      });

      // Release each slot unless some other active booking still holds it
      const slotIds = [...new Set(stale.map((b) => b.slotId))];
      for (const slotId of slotIds) {
        const stillHeld = await tx.booking.findFirst({
          where: { slotId, status: { in: [BookingStatus.REQUESTED, BookingStatus.ACCEPTED] } }
        });
        if (!stillHeld) {
          await tx.availabilitySlot.update({ where: { id: slotId }, data: { isBooked: false } });
        }
      }

      return count;
    });
  }

  static async createBooking(input: CreateBookingInput) {
    // Lapsed offers must not keep holding the night
    await BookingService.expireStaleOffers();

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
          status: BookingStatus.REQUESTED,
          expiresAt: computeOfferExpiry(slot)
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
    await BookingService.expireStaleOffers();

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

    if (booking.status === BookingStatus.EXPIRED) {
      const err: any = new Error('This offer has expired and can no longer be accepted or declined');
      err.statusCode = 409;
      throw err;
    }

    if (booking.status !== BookingStatus.REQUESTED) {
      throw new Error(`Cannot respond to a booking with status ${booking.status}`);
    }

    const newStatus = action === 'ACCEPT' ? BookingStatus.ACCEPTED : BookingStatus.DECLINED;

    // Transaction: update booking status and lock or release the slot
    const result = await prisma.$transaction(async (tx) => {
      // Only transition if the offer is still open (it may have just expired or been answered)
      const { count } = await tx.booking.updateMany({
        where: { id: bookingId, status: BookingStatus.REQUESTED },
        data: { status: newStatus }
      });
      if (count === 0) {
        const err: any = new Error('This offer is no longer open (it may have expired or already been answered)');
        err.statusCode = 409;
        throw err;
      }
      const updatedBooking = await tx.booking.findUniqueOrThrow({
        where: { id: bookingId },
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
    await BookingService.expireStaleOffers();

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
