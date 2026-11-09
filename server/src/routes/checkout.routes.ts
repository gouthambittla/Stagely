import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getPaymentGateway } from '../lib/payments';
import { FakePaymentGateway } from '../lib/payments/fake.gateway';
import { PaymentService } from '../services/payment.service';
import { BookingStatus } from '../types';

/**
 * Hosted checkout. The app opens /pay/:orderId?return=<app url> in an in-app browser; the page
 * runs Razorpay Standard Checkout for that order and then sends the browser back to the app.
 * The redirect is only a UX hint: the booking is confirmed by the signed webhook (or the
 * server's own check with Razorpay), never by this page.
 */
const router = Router();

const ORDER_ID_RE = /^order_[A-Za-z0-9]{6,40}$/;
/** Where the page may send the browser back to: the app's own scheme, or Expo Go in development. */
const ALLOWED_RETURN_PROTOCOLS = new Set(['stagely:', 'exp:', 'exps:']);

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** JSON safe to embed inside a <script> block. */
const jsonForScript = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

const formatInr = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function safeReturnUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 500) return null;
  try {
    const url = new URL(raw);
    return ALLOWED_RETURN_PROTOCOLS.has(url.protocol) ? raw : null;
  } catch {
    return null;
  }
}

function withParams(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

function isSimulationAllowed(): boolean {
  return getPaymentGateway() instanceof FakePaymentGateway && process.env.NODE_ENV !== 'production';
}

function page(res: Response, status: number, title: string, body: string, nonce?: string, extraCsp = '') {
  res.removeHeader('Cross-Origin-Opener-Policy'); // Razorpay opens bank/UPI windows
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      `script-src ${nonce ? `'nonce-${nonce}' ` : ''}https://checkout.razorpay.com`,
      'frame-src https://*.razorpay.com',
      'connect-src https://*.razorpay.com',
      "img-src 'self' data: https:",
      "style-src 'unsafe-inline'",
      "form-action 'self'",
      "base-uri 'none'",
      extraCsp
    ]
      .filter(Boolean)
      .join('; ')
  );
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Stagely</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0B0D13;color:#E2E8F0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
  .card{background:#131722;border:1px solid #1E293B;border-radius:16px;padding:24px;max-width:420px;width:100%}
  h1{font-size:20px;margin:0 0 8px;color:#fff} p{color:#94A3B8;line-height:1.5;margin:8px 0}
  .amount{font-size:32px;font-weight:800;color:#F5A623;margin:12px 0}
  button,.btn{display:block;width:100%;box-sizing:border-box;text-align:center;text-decoration:none;background:#F5A623;color:#0B0D13;border:0;border-radius:10px;padding:14px;font-weight:700;font-size:16px;margin-top:16px;cursor:pointer}
  .secondary{background:transparent;color:#94A3B8;border:1px solid #334155}
  .msg{color:#F87171} .note{font-size:12px}
</style></head><body><main class="card">${body}</main></body></html>`);
}

// GET /pay/:orderId?return=stagely://payment-result
router.get('/:orderId', async (req: Request, res: Response) => {
  const { orderId } = req.params;
  const returnUrl = safeReturnUrl(req.query.return);
  const backLink = (status: string, bookingId?: number) =>
    returnUrl
      ? `<a class="btn" href="${escapeHtml(withParams(returnUrl, { status, ...(bookingId ? { bookingId: String(bookingId) } : {}) }))}">Back to Stagely</a>`
      : '<p class="note">You can close this page and return to the Stagely app.</p>';

  if (!ORDER_ID_RE.test(orderId)) {
    page(res, 404, 'Payment link not found', `<h1>Payment link not found</h1><p>Please start the payment again from the app.</p>${backLink('error')}`);
    return;
  }

  try {
    const payment = await prisma.payment.findUnique({
      where: { gatewayOrderId: orderId },
      include: { booking: { include: { artist: true, slot: true } } }
    });
    if (!payment) {
      page(res, 404, 'Payment link not found', `<h1>Payment link not found</h1><p>Please start the payment again from the app.</p>${backLink('error')}`);
      return;
    }
    const { booking } = payment;

    if (booking.status !== BookingStatus.AWAITING_PAYMENT) {
      const paid = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.DISPUTED].includes(booking.status as BookingStatus);
      page(
        res,
        200,
        paid ? 'Already paid' : 'Payment closed',
        paid
          ? `<h1>This booking is already paid</h1><p>Nothing more to pay.</p>${backLink('success', booking.id)}`
          : `<h1>This payment link is no longer valid</h1><p>The booking is ${escapeHtml(booking.status.toLowerCase().replace(/_/g, ' '))}.</p>${backLink('closed', booking.id)}`
      );
      return;
    }

    const gateway = getPaymentGateway();
    const description = `${booking.artist.artistName} · ${booking.slot.date} ${booking.slot.startTime}`;
    const summary = `<h1>Pay for your booking</h1>
      <p>${escapeHtml(booking.artist.artistName)}<br>${escapeHtml(booking.eventType)} · ${escapeHtml(booking.slot.date)}, ${escapeHtml(booking.slot.startTime)}–${escapeHtml(booking.slot.endTime)}</p>
      <div class="amount">${escapeHtml(formatInr(payment.amountPaise))}</div>
      <p class="note">Stagely holds your payment safely and only pays the artist after the gig. If the artist cancels, you get it all back.</p>`;

    if (isSimulationAllowed()) {
      const action = `/pay/${encodeURIComponent(orderId)}/simulate${returnUrl ? `?return=${encodeURIComponent(returnUrl)}` : ''}`;
      page(
        res,
        200,
        'Test payment',
        `${summary}<p class="note">Development server with no Razorpay keys: this simulates a successful payment.</p>
         <form method="post" action="${escapeHtml(action)}"><button type="submit">Simulate successful payment</button></form>
         ${returnUrl ? `<a class="btn secondary" href="${escapeHtml(withParams(returnUrl, { status: 'cancelled', bookingId: String(booking.id) }))}">Cancel</a>` : ''}`
      );
      return;
    }

    const nonce = crypto.randomBytes(16).toString('base64');
    const options = {
      key: gateway.keyId,
      amount: payment.amountPaise,
      currency: 'INR',
      order_id: orderId,
      name: 'Stagely',
      description,
      theme: { color: '#F5A623' }
    };
    const returns = returnUrl
      ? {
          success: withParams(returnUrl, { status: 'success', bookingId: String(booking.id) }),
          cancelled: withParams(returnUrl, { status: 'cancelled', bookingId: String(booking.id) })
        }
      : null;

    page(
      res,
      200,
      'Pay',
      `${summary}<button id="pay" type="button">Pay ${escapeHtml(formatInr(payment.amountPaise))}</button>
       <p id="msg" class="msg" role="status"></p>
       <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
       <script nonce="${nonce}">
         (function () {
           var options = ${jsonForScript(options)};
           var returns = ${jsonForScript(returns)};
           var msg = document.getElementById('msg');
           function back(kind) {
             if (returns) { window.location.href = returns[kind]; }
             else { msg.style.color = '#94A3B8'; msg.textContent = kind === 'success' ? 'Payment received. You can return to the Stagely app.' : 'Payment not completed.'; }
           }
           options.handler = function () { back('success'); };
           options.modal = { ondismiss: function () { back('cancelled'); } };
           if (typeof Razorpay === 'undefined') { msg.textContent = 'Could not load the payment form. Check your connection and reload.'; return; }
           var rzp = new Razorpay(options);
           rzp.on('payment.failed', function (r) {
             msg.textContent = 'Payment failed' + (r && r.error && r.error.description ? ': ' + r.error.description : '') + '. You can try again.';
           });
           document.getElementById('pay').onclick = function () { rzp.open(); };
           rzp.open();
         })();
       </script>`,
      nonce
    );
  } catch (err) {
    console.error('Checkout page failed:', err);
    page(res, 500, 'Something went wrong', `<h1>Something went wrong</h1><p>Please try again from the app.</p>${backLink('error')}`);
  }
});

// POST /pay/:orderId/simulate - Development only (fake gateway): pay the order as if Razorpay had
router.post('/:orderId/simulate', async (req: Request, res: Response) => {
  if (!isSimulationAllowed()) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const { orderId } = req.params;
  const returnUrl = safeReturnUrl(req.query.return);
  try {
    const fake = getPaymentGateway() as FakePaymentGateway;
    const payment = await prisma.payment.findUnique({ where: { gatewayOrderId: orderId } });
    if (!payment || !fake.orders.has(orderId)) {
      res.status(404).json({ error: 'Unknown order' });
      return;
    }
    const alreadyCaptured = [...fake.payments.values()].some((p) => p.orderId === orderId && p.status === 'captured');
    if (!alreadyCaptured) fake.simulateCapture(orderId);
    await PaymentService.reconcileOrder(orderId);

    const target = returnUrl
      ? withParams(returnUrl, { status: 'success', bookingId: String(payment.bookingId) })
      : `/pay/${encodeURIComponent(orderId)}`;
    res.redirect(303, target);
  } catch (err) {
    console.error('Simulated payment failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
