import { prisma } from '../lib/prisma';

export interface CreateReviewInput {
  bookingId: number;
  customerId: number;
  rating: number;
  comment?: string;
  tags?: string[];
}

export class ReviewService {
  static async createReview(input: CreateReviewInput) {
    const { bookingId, customerId, rating, comment, tags } = input;

    if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      throw new Error('Rating must be an integer between 1 and 5');
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId }
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (booking.customerId !== customerId) {
      throw new Error('Not authorized: Only the customer who booked this show can review it');
    }

    if (booking.status !== 'COMPLETED') {
      throw new Error('Reviews can only be submitted for COMPLETED gigs');
    }

    const existingReview = await prisma.review.findUnique({
      where: { bookingId }
    });

    if (existingReview) {
      throw new Error('This booking has already been reviewed');
    }

    const tagsJson = tags && tags.length > 0 ? JSON.stringify(tags) : null;

    return prisma.review.create({
      data: {
        bookingId,
        artistId: booking.artistId,
        customerId,
        rating,
        comment,
        tags: tagsJson
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            venueName: true,
            city: true
          }
        }
      }
    });
  }

  static async getArtistReviews(artistId: number) {
    const reviews = await prisma.review.findMany({
      where: { artistId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            venueName: true,
            city: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const reviewCount = reviews.length;
    let averageRating: number | null = null;
    if (reviewCount > 0) {
      const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
      averageRating = Math.round((sum / reviewCount) * 10) / 10;
    }

    return {
      reviews,
      reviewCount,
      averageRating
    };
  }

  static async getArtistRatingSummary(artistId: number) {
    const aggregations = await prisma.review.aggregate({
      where: { artistId },
      _avg: { rating: true },
      _count: { rating: true }
    });

    const reviewCount = aggregations._count.rating || 0;
    const averageRating = aggregations._avg.rating !== null && aggregations._avg.rating !== undefined
      ? Math.round(aggregations._avg.rating * 10) / 10
      : null;

    return {
      reviewCount,
      averageRating
    };
  }
}
