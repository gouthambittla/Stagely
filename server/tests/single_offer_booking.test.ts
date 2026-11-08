import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { VerificationStatus, BookingStatus } from '../src/types';

describe('Single-Offer Booking Lock & Conflict Prevention Suite', () => {
  let customerToken: string;
  let artistToken: string;
  let secondCustomerToken: string;
  let verifiedArtistId: number;
  let testSlot1Id: number;
  let testSlot2Id: number;
  const testDate = '2026-12-01';

  beforeAll(async () => {
    customerToken = 'mock_customer_token';
    artistToken = 'mock_artist_token';
    secondCustomerToken = 'mock_new_user_cust_02';

    // Register second customer if not already present
    await request(app).post('/api/auth/complete-signup').send({
      idToken: secondCustomerToken,
      role: 'CUSTOMER',
      name: 'Second Venue Organizer',
      email: 'venue2@hyderabadbars.in'
    });

    const artist = await prisma.artistProfile.findFirst({
      where: {
        verificationStatus: VerificationStatus.VERIFIED,
        user: { email: 'jammers@stagely.in' }
      }
    });
    expect(artist).toBeDefined();
    verifiedArtistId = artist!.id;

    // Clean any prior bookings or slots for testDate
    await prisma.booking.deleteMany({
      where: {
        artistId: verifiedArtistId,
        slot: { date: testDate }
      }
    });
    await prisma.availabilitySlot.deleteMany({
      where: {
        artistId: verifiedArtistId,
        date: testDate
      }
    });

    // Create two slots on the same date for the artist
    const slot1 = await prisma.availabilitySlot.create({
      data: {
        artistId: verifiedArtistId,
        date: testDate,
        startTime: '19:00',
        endTime: '21:00',
        isBooked: false
      }
    });
    const slot2 = await prisma.availabilitySlot.create({
      data: {
        artistId: verifiedArtistId,
        date: testDate,
        startTime: '21:30',
        endTime: '23:30',
        isBooked: false
      }
    });

    testSlot1Id = slot1.id;
    testSlot2Id = slot2.id;
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({
      where: {
        artistId: verifiedArtistId,
        slot: { date: testDate }
      }
    });
    await prisma.availabilitySlot.deleteMany({
      where: {
        artistId: verifiedArtistId,
        date: testDate
      }
    });
    await prisma.$disconnect();
  });

  it('Step 1: Creating a booking request immediately locks the slot', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        artistId: verifiedArtistId,
        slotId: testSlot1Id,
        eventType: 'Exclusive Pub Live',
        eventLocation: 'Hard Rock Cafe, Banjara Hills',
        notes: 'Strict single offer verification'
      });

    expect(res.status).toBe(201);
    expect(res.body.booking.status).toBe(BookingStatus.REQUESTED);

    // Verify slot is immediately locked (isBooked: true)
    const slot = await prisma.availabilitySlot.findUnique({ where: { id: testSlot1Id } });
    expect(slot?.isBooked).toBe(true);
  });

  it('Step 2: Reject competing booking request on the same slot (already locked)', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${secondCustomerToken}`)
      .send({
        artistId: verifiedArtistId,
        slotId: testSlot1Id,
        eventType: 'Competing Event',
        eventLocation: 'Aura Jubilee Hills'
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already.*booked|already.*offer/i);
  });

  it('Step 3: Reject competing booking request on a DIFFERENT slot on the SAME date (single offer per night policy)', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${secondCustomerToken}`)
      .send({
        artistId: verifiedArtistId,
        slotId: testSlot2Id,
        eventType: 'Different Slot Same Night',
        eventLocation: 'Broadway Brewery'
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/active offer or confirmed booking for this date/i);
  });

  it('Step 4: Declining the active request unlocks the slot and frees the night', async () => {
    // Find the active requested booking
    const activeBooking = await prisma.booking.findFirst({
      where: {
        artistId: verifiedArtistId,
        slotId: testSlot1Id,
        status: BookingStatus.REQUESTED
      }
    });
    expect(activeBooking).toBeDefined();

    // Artist declines the offer
    const declineRes = await request(app)
      .put(`/api/bookings/${activeBooking!.id}/respond`)
      .set('Authorization', `Bearer ${artistToken}`)
      .send({ action: 'DECLINED' });

    expect(declineRes.status).toBe(200);
    expect(declineRes.body.booking.status).toBe(BookingStatus.DECLINED);

    // Verify slot is now unlocked (isBooked: false)
    const slot = await prisma.availabilitySlot.findUnique({ where: { id: testSlot1Id } });
    expect(slot?.isBooked).toBe(false);
  });

  it('Step 5: After decline, a new customer can successfully book that night', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${secondCustomerToken}`)
      .send({
        artistId: verifiedArtistId,
        slotId: testSlot1Id,
        eventType: 'Rescheduled Venue Gig',
        eventLocation: 'Aura Brewery'
      });

    expect(res.status).toBe(201);
    expect(res.body.booking.status).toBe(BookingStatus.REQUESTED);

    const slot = await prisma.availabilitySlot.findUnique({ where: { id: testSlot1Id } });
    expect(slot?.isBooked).toBe(true);

    // Artist accepts this booking
    const acceptRes = await request(app)
      .put(`/api/bookings/${res.body.booking.id}/respond`)
      .set('Authorization', `Bearer ${artistToken}`)
      .send({ action: 'ACCEPT' });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.booking.status).toBe(BookingStatus.ACCEPTED);

    const slotAfterAccept = await prisma.availabilitySlot.findUnique({ where: { id: testSlot1Id } });
    expect(slotAfterAccept?.isBooked).toBe(true);
  });
});
