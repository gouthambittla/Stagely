import { ReviewService } from '../services/review.service';
import { Router, Response } from 'express';
import { BookingService } from '../services/booking.service';
import { authenticate, requireRole, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { UserRole } from '../types';

const MAX_MESSAGE_LENGTH = 2000;
import { sendError, parseId, parseText } from '../lib/http';

const router = Router();

router.use(authenticate);

// POST /api/bookings - Submit booking request
// Only bookers (customers) can send offers; artists and admins cannot book acts.
router.post('/', requireRole([UserRole.CUSTOMER]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { artistId, slotId, eventType, eventLocation, notes } = req.body ?? {};
    if (!artistId || !slotId || !eventType || !eventLocation) {
      res.status(400).json({ error: 'artistId, slotId, eventType, and eventLocation are required' });
      return;
    }

    const booking = await BookingService.createBooking({
      customerId: req.user!.id,
      artistId: parseId(artistId, 'artistId'),
      slotId: parseId(slotId, 'slotId'),
      eventType: parseText(eventType, 'eventType', { required: true, max: 120 })!,
      eventLocation: parseText(eventLocation, 'eventLocation', { required: true, max: 300 })!,
      notes: parseText(notes, 'notes', { max: 2000 })
    });

    res.status(201).json({ message: 'Booking request sent successfully', booking });
  } catch (err) {
    sendError(res, err, 400);
  }
});

// GET /api/bookings - Get user's bookings
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bookings = await BookingService.getBookingsForUser(req.user!.id, req.user!.role);
    res.status(200).json({ bookings });
  } catch (err) {
    sendError(res, err, 500);
  }
});

// PUT /api/bookings/:id/respond - Artist accepts or declines
router.put('/:id/respond', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bookingId = parseId(req.params.id, 'booking id');
    const { action } = req.body ?? {}; // 'ACCEPT' | 'DECLINED'

    if (!['ACCEPT', 'DECLINED'].includes(action)) {
      res.status(400).json({ error: 'action must be ACCEPT or DECLINED' });
      return;
    }

    const booking = await BookingService.respondToBooking(bookingId, req.user!.id, action);
    res.status(200).json({ message: `Booking ${action.toLowerCase()}ed`, booking });
  } catch (err) {
    sendError(res, err, 400);
  }
});

// POST /api/bookings/:id/complete - Booker confirms the gig happened (after the event ends)
router.post('/:id/complete', requireRole([UserRole.CUSTOMER]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bookingId = parseId(req.params.id, 'booking id');
    const booking = await BookingService.completeBooking(bookingId, req.user!.id);
    res.status(200).json({ message: 'Booking marked as completed', booking });
  } catch (err) {
    sendError(res, err, 400);
  }
});

// POST /api/bookings/:id/messages - Send message
router.post('/:id/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bookingId = parseId(req.params.id, 'booking id');
    const content = parseText(req.body?.content, 'Message content', { required: true, max: MAX_MESSAGE_LENGTH })!;

    const message = await BookingService.addMessage(bookingId, req.user!.id, content);
    res.status(201).json({ message });
  } catch (err) {
    sendError(res, err, 400);
  }
});

// GET /api/bookings/:id/messages - View messages
router.get('/:id/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bookingId = parseId(req.params.id, 'booking id');
    const messages = await BookingService.getMessages(bookingId, req.user!.id);
    res.status(200).json({ messages });
  } catch (err) {
    sendError(res, err, 400);
  }
});


// POST /api/bookings/:id/review - Customer reviews completed gig
router.post('/:id/review', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bookingId = parseId(req.params.id, 'booking id');
    const { rating, comment, tags } = req.body ?? {};

    if (tags !== undefined && (!Array.isArray(tags) || tags.length > 10 || tags.some((t: unknown) => typeof t !== 'string' || t.length > 40))) {
      res.status(400).json({ error: 'tags must be an array of up to 10 short strings' });
      return;
    }

    if (rating === undefined || rating === null) {
      res.status(400).json({ error: 'rating is required' });
      return;
    }

    const review = await ReviewService.createReview({
      bookingId,
      customerId: req.user!.id,
      rating: Number(rating),
      comment: parseText(comment, 'comment', { max: 1000 }),
      tags
    });

    res.status(201).json({ message: 'Review submitted successfully', review });
  } catch (err) {
    sendError(res, err, 400);
  }
});

export default router;
