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
