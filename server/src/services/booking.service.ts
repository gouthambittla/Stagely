import { prisma } from '../lib/prisma';
import { BookingStatus, VerificationStatus, UserRole, NIGHT_HOLDING_STATUSES } from '../types';
import { paymentsConfig } from '../config/payments';
import { Prisma } from '@prisma/client';
import { conflict, forbidden, notFound } from '../lib/http';

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

/**
 * After a gig ends the booker has this long to mark it completed (or, once payments land,
 * report a problem). After that it completes on its own, so silence never blocks the artist.
 */
export const AUTO_COMPLETE_AFTER_HOURS = paymentsConfig().disputeWindowHours;

/**
 * Once the artist accepts, the booker has PAYMENT_WINDOW_HOURS to pay, but never past the
 * event start (an unpaid gig must not go ahead).
 */
export function computePaymentDue(slot: { date: string; startTime: string }, now: Date = new Date()): Date {
  const windowEnd = new Date(now.getTime() + paymentsConfig().paymentWindowHours * HOUR_MS);
  const eventStart = new Date(`${slot.date}T${slot.startTime}:00${MARKET_UTC_OFFSET}`);
  if (!isNaN(eventStart.getTime()) && eventStart < windowEnd) {
    return eventStart;
  }
  return windowEnd;
}

/** Frees each slot's night unless some other live booking still holds it. */
async function releaseSlotsIfFree(tx: Prisma.TransactionClient, slotIds: number[]): Promise<void> {
  for (const slotId of [...new Set(slotIds)]) {
    const stillHeld = await tx.booking.findFirst({
      where: { slotId, status: { in: NIGHT_HOLDING_STATUSES } }
    });
    if (!stillHeld) {
      await tx.availabilitySlot.update({ where: { id: slotId }, data: { isBooked: false } });
    }
  }
}

/**
 * When the gig finishes: the slot's date + endTime, read as IST. A slot whose end time is not
 * after its start time runs past midnight, so it ends on the following day.
 */
export function computeEventEnd(slot: { date: string; startTime: string; endTime: string }): Date {
  const end = new Date(`${slot.date}T${slot.endTime}:00${MARKET_UTC_OFFSET}`);
  if (slot.endTime <= slot.startTime) {
    end.setTime(end.getTime() + 24 * HOUR_MS);
  }
  return end;
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
      await releaseSlotsIfFree(tx, stale.map((b) => b.slotId));

      return count;
    });
  }

  /**
   * Marks AWAITING_PAYMENT bookings past their payment deadline as PAYMENT_EXPIRED and
   * releases their nights. No money has moved, so nothing to refund. Safe to call often.
   */
  static async expireUnpaidBookings(now: Date = new Date()): Promise<number> {
    return prisma.$transaction(async (tx) => {
      const unpaid = await tx.booking.findMany({
        where: { status: BookingStatus.AWAITING_PAYMENT, paymentDueAt: { lte: now } },
        select: { id: true, slotId: true }
      });
      if (unpaid.length === 0) return 0;

      // Guard on status so a payment confirmed at the last moment is never overwritten
      const { count } = await tx.booking.updateMany({
        where: { id: { in: unpaid.map((b) => b.id) }, status: BookingStatus.AWAITING_PAYMENT },
        data: { status: BookingStatus.PAYMENT_EXPIRED }
      });

      await releaseSlotsIfFree(tx, unpaid.map((b) => b.slotId));
      return count;
    });
  }

  static async createBooking(input: CreateBookingInput) {
    // Lapsed offers and unpaid acceptances must not keep holding the night
    await BookingService.expireStaleOffers();
    await BookingService.expireUnpaidBookings();

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

      // Serialize offers for the same artist on the same night. Without this, two concurrent
      // requests (same slot, or different slots on one date) can both pass the checks below
      // under READ COMMITTED. The lock is transaction-scoped and released on commit/rollback.
      const slotForLock = await tx.availabilitySlot.findUnique({
        where: { id: input.slotId },
        select: { date: true }
      });
      if (slotForLock) {
        await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(${input.artistId}::int4, hashtext(${slotForLock.date}))) AS l`;
      }

      // 2. Verify slot exists and is open (re-read after acquiring the lock)
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
      // Ensure artist has NO other live booking (requested, accepted, paid...) on the same date
      const activeBookingOnDate = await tx.booking.findFirst({
        where: {
          artistId: input.artistId,
          slot: { date: slot.date },
          status: { in: NIGHT_HOLDING_STATUSES }
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
          expiresAt: computeOfferExpiry(slot),
          eventEndsAt: computeEventEnd(slot),
          // Lock in today's fee; later fee edits don't change an existing booking
          amountPaise: artist.baseFee * 100
        },
        include: {
          artist: true,
          slot: true,
          customer: { select: { id: true, email: true } }
        }
      });

      // 5. Immediately lock the slot exclusively for this request. Conditional on the slot
      // still being open, so a lost race fails (and rolls back) instead of double-booking.
      const { count: locked } = await tx.availabilitySlot.updateMany({
        where: { id: input.slotId, isBooked: false },
        data: { isBooked: true }
      });
      if (locked !== 1) {
        const err: any = new Error('This slot has already been booked or has an active offer');
        err.statusCode = 409;
        throw err;
      }

      return booking;
    });
  }

  static async respondToBooking(bookingId: number, artistUserId: number, action: 'ACCEPT' | 'DECLINED') {
    await BookingService.expireStaleOffers();

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { artist: true, slot: true }
    });

    if (!booking) {
      throw notFound('Booking not found');
    }

    if (booking.artist.userId !== artistUserId) {
      throw forbidden('Unauthorized to respond to this booking');
    }

    if (booking.status === BookingStatus.EXPIRED) {
      const err: any = new Error('This offer has expired and can no longer be accepted or declined');
      err.statusCode = 409;
      throw err;
    }

    if (booking.status !== BookingStatus.REQUESTED) {
      throw new Error(`Cannot respond to a booking with status ${booking.status}`);
    }

    // With payments on, an accepted booking waits for the booker to pay; otherwise it's
    // settled offline as before.
    const paymentsOn = paymentsConfig().enabled;
    const newStatus =
      action === 'ACCEPT'
        ? paymentsOn
          ? BookingStatus.AWAITING_PAYMENT
          : BookingStatus.ACCEPTED
        : BookingStatus.DECLINED;
    const paymentDueAt = newStatus === BookingStatus.AWAITING_PAYMENT ? computePaymentDue(booking.slot) : null;

    // Transaction: update booking status and lock or release the slot
    const result = await prisma.$transaction(async (tx) => {
      // Only transition if the offer is still open (it may have just expired or been answered)
      const { count } = await tx.booking.updateMany({
        where: { id: bookingId, status: BookingStatus.REQUESTED },
        data: { status: newStatus, paymentDueAt }
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

  /**
   * Completes ACCEPTED bookings whose event ended more than AUTO_COMPLETE_AFTER_HOURS ago.
   * Safe to call often (lazily on reads and from the sweep). Returns the number completed.
   */
  static async autoCompleteFinishedBookings(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - AUTO_COMPLETE_AFTER_HOURS * HOUR_MS);
    const { count } = await prisma.booking.updateMany({
      where: { status: BookingStatus.ACCEPTED, eventEndsAt: { lte: cutoff } },
      data: { status: BookingStatus.COMPLETED, completedAt: now }
    });
    return count;
  }

  /** The booker confirms the gig happened. Only allowed once the event has ended. */
  static async completeBooking(bookingId: number, customerId: number, now: Date = new Date()) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { slot: true } });
    if (!booking) {
      throw notFound('Booking not found');
    }
    if (booking.customerId !== customerId) {
      throw forbidden('Only the booker can mark this gig as completed');
    }
    if (booking.status !== BookingStatus.ACCEPTED) {
      throw conflict(`Cannot complete a booking with status ${booking.status}`);
    }
    const eventEndsAt = booking.eventEndsAt ?? computeEventEnd(booking.slot);
    if (now < eventEndsAt) {
      throw conflict('A gig can only be marked completed after the event has ended');
    }

    // Conditional on status so a concurrent auto-complete or double tap can't apply twice
    const { count } = await prisma.booking.updateMany({
      where: { id: bookingId, status: BookingStatus.ACCEPTED },
      data: { status: BookingStatus.COMPLETED, completedAt: now, eventEndsAt }
    });
    if (count === 0) {
      throw conflict('This booking has already been completed');
    }

    return prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { artist: true, slot: true, review: true }
    });
  }

  static async addMessage(bookingId: number, senderId: number, content: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { artist: true }
    });

    if (!booking) {
      throw notFound('Booking not found');
    }

    // Ensure sender is either the customer or the artist
    if (booking.customerId !== senderId && booking.artist.userId !== senderId) {
      throw forbidden('Unauthorized to post messages to this booking');
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
      throw notFound('Booking not found');
    }

    if (booking.customerId !== userId && booking.artist.userId !== userId) {
      throw forbidden('Unauthorized to view messages for this booking');
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
    await BookingService.expireUnpaidBookings();
    await BookingService.autoCompleteFinishedBookings();

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
