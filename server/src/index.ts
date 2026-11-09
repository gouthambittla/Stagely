import dotenv from 'dotenv';
dotenv.config();

import { loadEnv } from './config/env';

// Fail fast on bad configuration before anything connects or listens.
const env = loadEnv();

import app from './app';
import { prisma } from './lib/prisma';
import { BookingService } from './services/booking.service';
import { PaymentService } from './services/payment.service';

const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`🚀 Stagely API listening on port ${env.PORT} (${env.NODE_ENV})`);
  console.log(`   Health: /health   Readiness: /ready`);
});

// Background sweep: expire unanswered offers and unpaid acceptances so their nights reopen,
// and complete gigs the booker never confirmed, even with no traffic.
// (Reads and writes also do this lazily, so this is a backstop, not the only mechanism.)
const OFFER_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const offerSweep = setInterval(() => {
  BookingService.expireStaleOffers()
    .then((count) => {
      if (count > 0) console.log(`⏳ Expired ${count} unanswered booking offer(s)`);
    })
    .catch((err) => console.error('Offer expiry sweep failed:', err));
  BookingService.expireUnpaidBookings()
    .then((count) => {
      if (count > 0) console.log(`💸 Expired ${count} unpaid booking(s)`);
    })
    .catch((err) => console.error('Unpaid booking expiry sweep failed:', err));
  PaymentService.retryLateCaptureRefunds()
    .then((count) => {
      if (count > 0) console.log(`↩️ Refunded ${count} late payment(s)`);
    })
    .catch((err) => console.error('Late payment refund sweep failed:', err));
  // Complete first, then settle, so a gig that just auto-completed is paid out in the same tick
  BookingService.autoCompleteFinishedBookings()
    .then((count) => {
      if (count > 0) console.log(`✅ Auto-completed ${count} finished booking(s)`);
    })
    .catch((err) => console.error('Booking auto-complete sweep failed:', err))
    .then(() => PaymentService.settlePendingPayments())
    .then((count) => {
      if (count) console.log(`💰 Settled ${count} payment(s) (payouts released / refunds sent)`);
    })
    .catch((err) => console.error('Payment settlement sweep failed:', err));
}, OFFER_SWEEP_INTERVAL_MS);
offerSweep.unref();

const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

function shutdown(signal: string, exitCode = 0): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully...`);

  clearInterval(offerSweep);

  // Force-exit if in-flight requests or the DB don't drain in time
  const forceExit = setTimeout(() => {
    console.error('Graceful shutdown timed out; forcing exit.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close(async (closeErr) => {
    if (closeErr) console.error('Error closing HTTP server:', closeErr);
    try {
      await prisma.$disconnect();
    } catch (err) {
      console.error('Error disconnecting Prisma:', err);
    }
    console.log('Shutdown complete.');
    process.exit(closeErr ? 1 : exitCode);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  // State may be corrupt; log, then exit so the process manager restarts us cleanly.
  console.error('Uncaught exception:', err);
  shutdown('uncaughtException', 1);
});

export default server;
