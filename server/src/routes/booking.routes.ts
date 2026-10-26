import { Router, Response } from 'express';
import { BookingService } from '../services/booking.service';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// POST /api/bookings - Submit booking request
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { artistId, slotId, eventType, eventLocation, notes } = req.body;
    if (!artistId || !slotId || !eventType || !eventLocation) {
      res.status(400).json({ error: 'artistId, slotId, eventType, and eventLocation are required' });
      return;
    }

    const booking = await BookingService.createBooking({
      customerId: req.user!.id,
      artistId: Number(artistId),
      slotId: Number(slotId),
      eventType,
      eventLocation,
      notes
    });

    res.status(201).json({ message: 'Booking request sent successfully', booking });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to submit booking' });
  }
});

// GET /api/bookings - Get user's bookings
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bookings = await BookingService.getBookingsForUser(req.user!.id, req.user!.role);
    res.status(200).json({ bookings });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch bookings' });
  }
});

// PUT /api/bookings/:id/respond - Artist accepts or declines
router.put('/:id/respond', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bookingId = parseInt(req.params.id, 10);
    const { action } = req.body; // 'ACCEPT' | 'DECLINED'

    if (!['ACCEPT', 'DECLINED'].includes(action)) {
      res.status(400).json({ error: 'action must be ACCEPT or DECLINED' });
      return;
    }

    const booking = await BookingService.respondToBooking(bookingId, req.user!.id, action);
    res.status(200).json({ message: `Booking ${action.toLowerCase()}ed`, booking });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to respond to booking' });
  }
});

// POST /api/bookings/:id/messages - Send message
router.post('/:id/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bookingId = parseInt(req.params.id, 10);
    const { content } = req.body;
    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Message content is required' });
      return;
    }

    const message = await BookingService.addMessage(bookingId, req.user!.id, content.trim());
    res.status(201).json({ message });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to send message' });
  }
});

// GET /api/bookings/:id/messages - View messages
router.get('/:id/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bookingId = parseInt(req.params.id, 10);
    const messages = await BookingService.getMessages(bookingId, req.user!.id);
    res.status(200).json({ messages });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to fetch messages' });
  }
});

export default router;
