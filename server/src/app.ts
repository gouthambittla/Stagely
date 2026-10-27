import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import artistRoutes from './routes/artist.routes';
import adminRoutes from './routes/admin.routes';
import discoveryRoutes from './routes/discovery.routes';
import bookingRoutes from './routes/booking.routes';

const app = express();

app.use(cors());
app.use(express.json());

// API Request/Response Console Logger Middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const method = req.method;
  const path = req.originalUrl || req.url;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  const sanitizedBody = req.body ? { ...req.body } : {};
  if (sanitizedBody.password) sanitizedBody.password = '******';

  console.log(`📡 [API Inbound] ${method} ${path}`, {
    from: ip,
    body: Object.keys(sanitizedBody).length ? sanitizedBody : undefined
  });

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const status = res.statusCode;
    const tag = status < 400 ? '✅' : status < 500 ? '⚠️' : '❌';
    console.log(`${tag} [API Outbound] ${method} ${path} -> ${status} (${duration}ms)`);
  });

  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'stagely-api', timestamp: new Date().toISOString() });
});

// Mounted Routes
app.use('/api/auth', authRoutes);
app.use('/api/artists', artistRoutes);
app.use('/api/artists', discoveryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/bookings', bookingRoutes);

export default app;
