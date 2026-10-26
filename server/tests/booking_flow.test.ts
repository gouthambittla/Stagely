import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { VerificationStatus, BookingStatus, UserRole } from '../src/types';

describe('Discovery & Booking Flow', () => {
  let customerToken: string;
  let artistToken: string;
  let verifiedArtistId: number;
  let availableSlotId: number;
  let createdBookingId: number;

  beforeAll(async () => {
    // 1. Customer login
    const custLogin = await request(app).post('/api/auth/login').send({
      email: 'organizer@breweryhyd.in',
      password: 'password123'
    });
    customerToken = custLogin.body.token;

    // 2. Artist login (Jammers)
    const artLogin = await request(app).post('/api/auth/login').send({
      email: 'jammers@stagely.in',
      password: 'password123'
    });
    artistToken = artLogin.body.token;

    // 3. Find verified artist and slot
    const artist = await prisma.artistProfile.findFirst({
      where: { verificationStatus: VerificationStatus.VERIFIED },
      include: { availabilitySlots: { where: { isBooked: false } } }
    });
    expect(artist).toBeDefined();
    verifiedArtistId = artist!.id;
    expect(artist!.availabilitySlots.length).toBeGreaterThan(0);
    availableSlotId = artist!.availabilitySlots[0].id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('discovery only returns VERIFIED artists and excludes PENDING or REJECTED', async () => {
    const res = await request(app).get('/api/artists?location=Hyderabad');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.artists)).toBe(true);
    expect(res.body.artists.length).toBeGreaterThan(0);

    // Assert strict verification isolation
    for (const artist of res.body.artists) {
      expect(artist.verificationStatus).toBe(VerificationStatus.VERIFIED);
    }
  });

  it('allows customer to submit a booking request for an open slot', async () => {
    const bookRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        artistId: verifiedArtistId,
        slotId: availableSlotId,
        eventType: 'Weekend Pub Live',
        eventLocation: 'Aura Brewery, Jubilee Hills, Hyderabad',
        notes: '2-hour energetic Telugu-Hindi rock set with drum kit setup'
      });

    expect(bookRes.status).toBe(201);
    expect(bookRes.body.booking.status).toBe(BookingStatus.REQUESTED);
    expect(bookRes.body.booking.artistId).toBe(verifiedArtistId);
    expect(bookRes.body.booking.slotId).toBe(availableSlotId);
    createdBookingId = bookRes.body.booking.id;
  });

  it('allows customer and artist to exchange messages in the booking thread', async () => {
    // Customer sends message
    const msg1Res = await request(app)
      .post(`/api/bookings/${createdBookingId}/messages`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ content: 'Hi, does your band need us to provide drum kit mics?' });

    expect(msg1Res.status).toBe(201);
    expect(msg1Res.body.message.content).toBe('Hi, does your band need us to provide drum kit mics?');

    // Artist replies
    const msg2Res = await request(app)
      .post(`/api/bookings/${createdBookingId}/messages`)
      .set('Authorization', `Bearer ${artistToken}`)
      .send({ content: 'Hello! Yes please, standard 4-mic drum set works.' });

    expect(msg2Res.status).toBe(201);

    // Get messages list
    const getMsgsRes = await request(app)
      .get(`/api/bookings/${createdBookingId}/messages`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(getMsgsRes.status).toBe(200);
    expect(getMsgsRes.body.messages.length).toBe(2);
  });

  it('allows artist to ACCEPT the booking request and locks the slot', async () => {
    const acceptRes = await request(app)
      .put(`/api/bookings/${createdBookingId}/respond`)
      .set('Authorization', `Bearer ${artistToken}`)
      .send({ action: 'ACCEPT' });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.booking.status).toBe(BookingStatus.ACCEPTED);

    // Verify slot is now locked (isBooked: true)
    const updatedSlot = await prisma.availabilitySlot.findUnique({ where: { id: availableSlotId } });
    expect(updatedSlot?.isBooked).toBe(true);
  });
});
