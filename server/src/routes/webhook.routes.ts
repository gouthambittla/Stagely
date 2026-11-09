import express, { Router, Request, Response } from 'express';
import { PaymentService, WebhookError } from '../services/payment.service';

const router = Router();

// POST /api/webhooks/razorpay
// Mounted before express.json(): the signature is an HMAC over the exact raw bytes.
router.post('/razorpay', express.raw({ type: '*/*', limit: '1mb' }), async (req: Request, res: Response) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  try {
    await PaymentService.handleWebhook(rawBody, req.get('x-razorpay-signature'), req.get('x-razorpay-event-id'));
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    if (err instanceof WebhookError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    // A non-2xx makes Razorpay retry; the event wasn't recorded because its transaction rolled back
    console.error('Webhook processing failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
