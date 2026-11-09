import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import artistRoutes from './routes/artist.routes';
import adminRoutes from './routes/admin.routes';
import discoveryRoutes from './routes/discovery.routes';
import bookingRoutes from './routes/booking.routes';
import userRoutes from './routes/users.routes';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { prisma } from './lib/prisma';
import { sendError } from './lib/http';

const app = express();
const isTest = process.env.NODE_ENV === 'test';

// Behind a load balancer / reverse proxy, trust the first hop so req.ip and rate limits
// use the real client address. Set TRUST_PROXY to the number of proxy hops (default 0).
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 0));

app.use(helmet());

// Native mobile clients don't send an Origin header, so CORS only matters for browsers.
// CORS_ORIGINS (comma-separated) restricts browser origins; unset = allow any (dev).
const corsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors(corsOrigins.length > 0 ? { origin: corsOrigins } : undefined));

app.use(express.json({ limit: '100kb' }));

// Access log: method, path, status, latency. Request bodies are deliberately NOT logged:
// they carry Firebase ID tokens, phone numbers and private chat messages.
app.use((req, res, next) => {
  // Quiet under the test runner unless a test opts in
  if (process.env.NODE_ENV === 'test' && process.env.REQUEST_LOGGING !== 'true') return next();
  const startTime = Date.now();
  res.on('finish', () => {
    const status = res.statusCode;
    const tag = status < 400 ? '✅' : status < 500 ? '⚠️' : '❌';
    console.log(`${tag} ${req.method} ${req.originalUrl.split('?')[0]} -> ${status} (${Date.now() - startTime}ms) ip=${req.ip}`);
  });
  next();
});

// Liveness: the process is up. Cheap, no dependencies.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'stagely-api', timestamp: new Date().toISOString() });
});

// Readiness: the process can serve traffic (database reachable).
app.get('/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready' });
  } catch (err) {
    console.error('Readiness check failed:', err);
    res.status(503).json({ status: 'unavailable' });
  }
});

// Rate limiting (disabled under the test runner). Auth endpoints get a tighter budget.
const limiterDefaults = { standardHeaders: 'draft-7' as const, legacyHeaders: false, skip: () => isTest };
app.use('/api/auth', rateLimit({ ...limiterDefaults, windowMs: 15 * 60 * 1000, limit: 50 }));
app.use('/api', rateLimit({ ...limiterDefaults, windowMs: 60 * 1000, limit: 300 }));

// Mounted Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/artists', artistRoutes);
app.use('/api/artists', discoveryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/bookings', bookingRoutes);

// Unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler (malformed JSON, oversized bodies, anything passed to next(err))
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON body' });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body too large' });
    return;
  }
  sendError(res, err, typeof err?.status === 'number' ? err.status : 500);
});

export { app };
export default app;
