import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { BookingService } from './services/booking.service';

const PORT = Number(process.env.PORT) || 5000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Stagely API server is running on http://0.0.0.0:${PORT}`);
  console.log(`   Local: http://localhost:${PORT}`);
  console.log(`   LAN:   http://192.168.1.37:${PORT}`);
  console.log(`   Health check: http://192.168.1.37:${PORT}/health`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Background sweep: expire unanswered booking offers so their nights reopen even with no traffic.
// (Reads and writes also expire lazily, so this is a backstop, not the only mechanism.)
const OFFER_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const offerSweep = setInterval(() => {
  BookingService.expireStaleOffers()
    .then((count) => {
      if (count > 0) console.log(`⏳ Expired ${count} unanswered booking offer(s)`);
    })
    .catch((err) => console.error('Offer expiry sweep failed:', err));
}, OFFER_SWEEP_INTERVAL_MS);
offerSweep.unref();

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

export default server;
