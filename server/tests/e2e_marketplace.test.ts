import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { VerificationStatus, BookingStatus, UserRole } from '../src/types';

describe('Stagely Complete Marketplace End-to-End Journey', () => {
  const timestamp = Date.now();
  const artistEmail = `e2e_artist_${timestamp}@stagely.in`;
  const customerEmail = `e2e_venue_${timestamp}@stagely.in`;
  const adminEmail = 'admin@stagely.in';

  let artistToken: string;
  let customerToken: string;
  let adminToken: string;
  let createdArtistId: number;
  let bookedSlotId: number;
  let createdBookingId: number;

  beforeAll(async () => {
    // 1. Authenticate as Admin
    const adminLogin = await request(app).post('/api/auth/login').send({
      email: adminEmail,
      password: 'admin123'
    });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.token;

    // 2. Register Customer (Venue Bookers)
    const custReg = await request(app).post('/api/auth/register').send({
      email: customerEmail,
      password: 'venuepassword123',
      role: UserRole.CUSTOMER
    });
    expect(custReg.status).toBe(201);
    customerToken = custReg.body.token;
  });

  afterAll(async () => {
    // Relational cleanup in reverse order
    if (createdBookingId) {
      await prisma.message.deleteMany({ where: { bookingId: createdBookingId } });
      await prisma.booking.deleteMany({ where: { id: createdBookingId } });
    }
    if (createdArtistId) {
      await prisma.availabilitySlot.deleteMany({ where: { artistId: createdArtistId } });
      await prisma.artistProfile.deleteMany({ where: { id: createdArtistId } });
    }
    await prisma.user.deleteMany({
      where: {
        email: { in: [artistEmail, customerEmail] }
      }
    });
    await prisma.$disconnect();
  });

  it('Phase 1: Artist registers and completes onboarding wizard', async () => {
    // 1. Register Artist User
    const regRes = await request(app).post('/api/auth/register').send({
      email: artistEmail,
      password: 'bandpassword123',
      role: UserRole.ARTIST
    });
    expect(regRes.status).toBe(201);
    artistToken = regRes.body.token;

    // 2. Artist Submits Onboarding Form
    const onboardRes = await request(app)
      .post('/api/artists/onboard')
      .set('Authorization', `Bearer ${artistToken}`)
      .send({
        artistName: `Banjara Beats ${timestamp}`,
        category: 'Band',
        genres: ['Tollywood Rock', 'Fusion Indie'],
        location: 'Hyderabad',
        baseFee: 32000,
        bio: 'Electric fusion live act performing regional and indie hits across Jubilee Hills.',
        requirements: 'Full PA setup, 2 vocal mics on stands, 1 bass amp, 2 stage monitors.',
        youtubeUrl: 'https://youtube.com/@banjarabeats',
        instagramUrl: 'https://instagram.com/banjarabeats',
        availableSlots: [
          { date: '2026-11-20', startTime: '20:00', endTime: '23:00' },
          { date: '2026-11-21', startTime: '20:00', endTime: '23:00' }
        ]
      });

    expect(onboardRes.status).toBe(201);
    expect(onboardRes.body.artistProfile.verificationStatus).toBe(VerificationStatus.PENDING_VERIFICATION);
    createdArtistId = onboardRes.body.artistProfile.id;
    bookedSlotId = onboardRes.body.artistProfile.availabilitySlots[0].id;
  });

  it('Phase 2: Fraud Isolation - Unverified artist is hidden from public discovery and bookable slots are blocked', async () => {
    // 1. Search catalog for Hyderabad
    const searchRes = await request(app).get('/api/artists?location=Hyderabad');
    expect(searchRes.status).toBe(200);

    const match = searchRes.body.artists.find((a: any) => a.id === createdArtistId);
    expect(match).toBeUndefined(); // MUST NOT BE FOUND

    // 2. Direct attempt to book unverified artist must be rejected
    const directBookAttempt = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        artistId: createdArtistId,
        slotId: bookedSlotId,
        eventType: 'Pub Night',
        eventLocation: 'Gachibowli, Hyderabad'
      });

    expect(directBookAttempt.status).toBe(400);
    expect(directBookAttempt.body.error).toContain('Artist is not available for bookings');
  });

  it('Phase 3: Admin Review Portal - Admin verifies the artist', async () => {
    // 1. Check pending queue
    const pendingRes = await request(app)
      .get('/api/admin/artists/pending')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(pendingRes.status).toBe(200);
    const inQueue = pendingRes.body.pendingArtists.find((a: any) => a.id === createdArtistId);
    expect(inQueue).toBeDefined();

    // 2. Admin approves application
    const verifyRes = await request(app)
      .put(`/api/admin/artists/${createdArtistId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: VerificationStatus.VERIFIED });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.artistProfile.verificationStatus).toBe(VerificationStatus.VERIFIED);
  });

  it('Phase 4: Verified Discovery & Request-to-Book Workflow', async () => {
    // 1. Catalog search now returns the newly verified artist
    const searchRes = await request(app).get(`/api/artists/${createdArtistId}`);
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.artist.verificationStatus).toBe(VerificationStatus.VERIFIED);
    expect(searchRes.body.artist.availabilitySlots.length).toBe(2);

    // 2. Customer books an open slot
    const bookingRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        artistId: createdArtistId,
        slotId: bookedSlotId,
        eventType: 'Live Saturday Night Show',
        eventLocation: 'Zero40 Brewing, Financial District, Hyderabad',
        notes: 'Stage setup opens at 6:30 PM. PA and lighting engineer provided on site.'
      });

    expect(bookingRes.status).toBe(201);
    expect(bookingRes.body.booking.status).toBe(BookingStatus.REQUESTED);
    createdBookingId = bookingRes.body.booking.id;
  });

  it('Phase 5: In-App Message Coordination & Artist Acceptance', async () => {
    // 1. Customer asks logistics question
    const custMsg = await request(app)
      .post(`/api/bookings/${createdBookingId}/messages`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ content: 'We have 2 Shure SM58 mics ready for your vocalists.' });

    expect(custMsg.status).toBe(201);

    // 2. Artist confirms via chat
    const artMsg = await request(app)
      .post(`/api/bookings/${createdBookingId}/messages`)
      .set('Authorization', `Bearer ${artistToken}`)
      .send({ content: 'Perfect! Looking forward to performing.' });

    expect(artMsg.status).toBe(201);

    // 3. Artist Reviews Request in Dashboard and Clicks "Accept"
    const acceptRes = await request(app)
      .put(`/api/bookings/${createdBookingId}/respond`)
      .set('Authorization', `Bearer ${artistToken}`)
      .send({ action: 'ACCEPT' });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.booking.status).toBe(BookingStatus.ACCEPTED);

    // 4. Verify slot is now locked
    const lockedSlot = await prisma.availabilitySlot.findUnique({ where: { id: bookedSlotId } });
    expect(lockedSlot?.isBooked).toBe(true);

    // 5. Customer checks their bookings list
    const customerBookings = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(customerBookings.status).toBe(200);
    const confirmedBooking = customerBookings.body.bookings.find((b: any) => b.id === createdBookingId);
    expect(confirmedBooking).toBeDefined();
    expect(confirmedBooking.status).toBe(BookingStatus.ACCEPTED);
  });
});
