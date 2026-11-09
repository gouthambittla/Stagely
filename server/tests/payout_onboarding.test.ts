import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { setPaymentGateway } from '../src/lib/payments';
import { FakePaymentGateway, signFakeWebhook } from '../src/lib/payments/fake.gateway';
import { PayoutService } from '../src/services/payout.service';
import { VerificationStatus } from '../src/types';

const UID_PREFIX = 'firebase_new_uid_payout_';

describe('Artist payout setup (mandatory at onboarding when payments are on)', () => {
  let fake: FakePaymentGateway;
  let originalPaymentsEnabled: string | undefined;
  let seq = 0;

  const validProfile = {
    artistName: 'Payout Test Band',
    category: 'Band',
    genres: ['Indie'],
    location: 'Hyderabad',
    baseFee: 25000
  };
  const validPayout = {
    legalName: 'Asha Rao',
    email: 'asha.rao@example.com',
    phone: '+91 98480 22338',
    pan: 'abcpr1234k',
    accountNumber: '50100123456789',
    ifsc: 'hdfc0001234',
    address: { street1: '12 Road No 3', city: 'Hyderabad', state: 'Telangana', postalCode: '500034' }
  };

  /** Signs up a brand-new artist user and returns their auth header. */
  const newArtist = async () => {
    const token = `mock_new_user_payout_${Date.now()}_${++seq}`;
    await request(app).post('/api/auth/complete-signup').send({ idToken: token, role: 'ARTIST', name: 'Payout Tester' });
    return { Authorization: `Bearer ${token}` };
  };

  const onboard = (auth: Record<string, string>, body: object) => request(app).post('/api/artists/onboard').set(auth).send(body);
  const profileOf = async (auth: { Authorization: string }) => {
    const uid = auth.Authorization.replace('Bearer mock_new_user_', 'firebase_new_uid_');
    return prisma.artistProfile.findFirst({ where: { user: { firebaseUid: uid } } });
  };

  beforeAll(() => {
    originalPaymentsEnabled = process.env.PAYMENTS_ENABLED;
  });

  beforeEach(() => {
    process.env.PAYMENTS_ENABLED = 'true';
    fake = new FakePaymentGateway();
    setPaymentGateway(fake);
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { firebaseUid: { startsWith: UID_PREFIX } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.availabilitySlot.deleteMany({ where: { artist: { userId: { in: ids } } } });
    await prisma.artistProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.paymentEvent.deleteMany({ where: { eventId: { startsWith: 'evt_test_po_' } } });
    if (originalPaymentsEnabled === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = originalPaymentsEnabled;
    setPaymentGateway(null);
    await prisma.$disconnect();
  });

  describe('onboarding', () => {
    it('refuses to create a profile without payout details', async () => {
      const auth = await newArtist();
      const res = await onboard(auth, validProfile);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/payout/i);
      expect(await profileOf(auth)).toBeNull();
    });

    it.each([
      ['pan', 'ABCDE1234F', /PAN/],
      ['ifsc', 'HDFC1234567', /IFSC/],
      ['accountNumber', '12AB', /account number/i],
      ['phone', '12345', /phone/i],
      ['email', 'not-an-email', /email/i]
    ])('rejects a bad %s', async (field, value, message) => {
      const auth = await newArtist();
      const res = await onboard(auth, { ...validProfile, payout: { ...validPayout, [field]: value } });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(message);
      expect(await profileOf(auth)).toBeNull();
    });

    it('rejects a bad PIN code', async () => {
      const auth = await newArtist();
      const res = await onboard(auth, { ...validProfile, payout: { ...validPayout, address: { ...validPayout.address, postalCode: '12' } } });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/PIN/);
    });

    it('creates no profile when Razorpay rejects the details', async () => {
      const auth = await newArtist();
      fake.rejectNextAccount = true;
      const res = await onboard(auth, { ...validProfile, payout: validPayout });
      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/Razorpay/);
      expect(await profileOf(auth)).toBeNull();
    });

    it('creates the payout account and the profile, storing only masked details', async () => {
      const auth = await newArtist();
      const res = await onboard(auth, { ...validProfile, payout: validPayout });
      expect(res.status).toBe(201);
      expect(res.body.artistProfile.payoutStatus).toBe('PENDING');

      const profile = (await profileOf(auth))!;
      expect(profile.payoutAccountId).toMatch(/^acc_/);
      expect(profile).toMatchObject({ payoutIfsc: 'HDFC0001234', payoutAccountLast4: '6789', payoutLegalName: 'Asha Rao' });
      const stored = JSON.stringify(profile);
      expect(stored).not.toContain('50100123456789');
      expect(stored).not.toContain('ABCPR1234K');

      // Razorpay got the full, normalised details
      const account = fake.linkedAccounts.get(profile.payoutAccountId!)!;
      expect(account).toMatchObject({ accountNumber: '50100123456789', ifsc: 'HDFC0001234' });
    });

    it('keeps the old onboarding (no payout step) while payments are off', async () => {
      process.env.PAYMENTS_ENABLED = 'false';
      const auth = await newArtist();
      const res = await onboard(auth, validProfile);
      expect(res.status).toBe(201);
      expect(res.body.artistProfile.payoutStatus).toBe('NOT_STARTED');
    });
  });

  describe('viewing and editing', () => {
    const onboarded = async () => {
      const auth = await newArtist();
      expect((await onboard(auth, { ...validProfile, payout: validPayout })).status).toBe(201);
      return auth;
    };

    it('shows the artist their masked details, refreshing the status from Razorpay', async () => {
      const auth = await onboarded();
      let res = await request(app).get('/api/artists/payout-account').set(auth);
      expect(res.status).toBe(200);
      expect(res.body.payoutAccount).toEqual({
        status: 'PENDING',
        legalName: 'Asha Rao',
        ifsc: 'HDFC0001234',
        accountNumberMasked: 'XXXX6789'
      });

      fake.setLinkedAccountStatus((await profileOf(auth))!.payoutAccountId!, 'ACTIVE');
      res = await request(app).get('/api/artists/payout-account').set(auth);
      expect(res.body.payoutAccount.status).toBe('ACTIVE');
    });

    it('changes the bank account on the same linked account', async () => {
      const auth = await onboarded();
      const before = (await profileOf(auth))!;
      fake.setLinkedAccountStatus(before.payoutAccountId!, 'ACTIVE');

      const res = await request(app)
        .put('/api/artists/payout-account')
        .set(auth)
        .send({ legalName: 'Asha Rao', accountNumber: '000111222333', ifsc: 'ICIC0004321' });
      expect(res.status).toBe(200);
      expect(res.body.payoutAccount).toMatchObject({ accountNumberMasked: 'XXXX2333', ifsc: 'ICIC0004321', status: 'PENDING' });

      const after = (await profileOf(auth))!;
      expect(after.payoutAccountId).toBe(before.payoutAccountId);
      expect(fake.linkedAccounts.get(before.payoutAccountId!)!.accountNumber).toBe('000111222333');
    });

    it('rejects a bad edit', async () => {
      const auth = await onboarded();
      const res = await request(app).put('/api/artists/payout-account').set(auth).send({ legalName: 'Asha', accountNumber: '1', ifsc: 'X' });
      expect(res.status).toBe(400);
    });

    it('lets an artist who onboarded before payments set up payouts later, once', async () => {
      process.env.PAYMENTS_ENABLED = 'false';
      const auth = await newArtist();
      await onboard(auth, validProfile);
      process.env.PAYMENTS_ENABLED = 'true';

      expect((await request(app).put('/api/artists/payout-account').set(auth).send(validPayout)).status).toBe(409);
      const res = await request(app).post('/api/artists/payout-account').set(auth).send(validPayout);
      expect(res.status).toBe(201);
      expect(res.body.payoutAccount.status).toBe('PENDING');
      expect((await request(app).post('/api/artists/payout-account').set(auth).send(validPayout)).status).toBe(409);
    });

    it('is only for artists', async () => {
      const res = await request(app).get('/api/artists/payout-account').set({ Authorization: 'Bearer mock_customer_token' });
      expect(res.status).toBe(403);
    });
  });

  describe('activation', () => {
    it('picks up activation from a Razorpay account webhook', async () => {
      const auth = await newArtist();
      await onboard(auth, { ...validProfile, payout: validPayout });
      const accountId = (await profileOf(auth))!.payoutAccountId!;
      fake.setLinkedAccountStatus(accountId, 'ACTIVE');

      const raw = JSON.stringify({ entity: 'event', event: 'product.route.activated', account_id: accountId, payload: {} });
      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('X-Razorpay-Event-Id', `evt_test_po_${Date.now()}`)
        .set('X-Razorpay-Signature', signFakeWebhook(raw))
        .send(raw);
      expect(res.status).toBe(200);
      expect((await profileOf(auth))!.payoutStatus).toBe('ACTIVE');
    });

    it('picks up activation and rejection from the sweep', async () => {
      const a = await newArtist();
      const b = await newArtist();
      await onboard(a, { ...validProfile, payout: validPayout });
      await onboard(b, { ...validProfile, payout: validPayout });
      fake.setLinkedAccountStatus((await profileOf(a))!.payoutAccountId!, 'ACTIVE');
      fake.setLinkedAccountStatus((await profileOf(b))!.payoutAccountId!, 'REJECTED');

      expect(await PayoutService.refreshPendingAccounts()).toBeGreaterThanOrEqual(2);
      expect((await profileOf(a))!.payoutStatus).toBe('ACTIVE');
      expect((await profileOf(b))!.payoutStatus).toBe('REJECTED');

      // A rejected artist can try again with corrected details
      const retry = await request(app).post('/api/artists/payout-account').set(b).send(validPayout);
      expect(retry.status).toBe(201);
    });
  });

  describe('accepting bookings needs an active payout account', () => {
    it.each([
      ['NOT_STARTED', /set up payouts/i],
      ['PENDING', /being verified/i]
    ])('refuses to accept while payout status is %s', async (payoutStatus, message) => {
      const artist = await prisma.artistProfile.findFirstOrThrow({
        where: { verificationStatus: VerificationStatus.VERIFIED, user: { email: 'jammers@stagely.in' } }
      });
      const slot = await prisma.availabilitySlot.create({
        data: { artistId: artist.id, date: '2027-06-02', startTime: '20:00', endTime: '23:00' }
      });
      await prisma.artistProfile.update({ where: { id: artist.id }, data: { payoutStatus } });
      try {
        const req = await request(app)
          .post('/api/bookings')
          .set({ Authorization: 'Bearer mock_customer_token' })
          .send({ artistId: artist.id, slotId: slot.id, eventType: 'Gate Test', eventLocation: 'Hyderabad' });
        const res = await request(app)
          .put(`/api/bookings/${req.body.booking.id}/respond`)
          .set({ Authorization: 'Bearer mock_artist_token' })
          .send({ action: 'ACCEPT' });
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(message);
      } finally {
        await prisma.booking.deleteMany({ where: { slotId: slot.id } });
        await prisma.availabilitySlot.delete({ where: { id: slot.id } });
        await prisma.artistProfile.update({ where: { id: artist.id }, data: { payoutStatus: 'NOT_STARTED' } });
      }
    });
  });

  describe('privacy', () => {
    it('never sends payout identifiers in other API responses', async () => {
      const artist = await prisma.artistProfile.findFirstOrThrow({
        where: { verificationStatus: VerificationStatus.VERIFIED, user: { email: 'jammers@stagely.in' } }
      });
      await prisma.artistProfile.update({
        where: { id: artist.id },
        data: { payoutAccountId: 'acc_secret123', payoutLegalName: 'Secret Name', payoutIfsc: 'SECR0000001', payoutAccountLast4: '4321' }
      });
      try {
        const res = await request(app).get(`/api/artists/${artist.id}`);
        expect(res.status).toBe(200);
        const body = JSON.stringify(res.body);
        for (const secret of ['acc_secret123', 'Secret Name', 'SECR0000001', '4321']) {
          expect(body).not.toContain(secret);
        }
      } finally {
        await prisma.artistProfile.update({
          where: { id: artist.id },
          data: { payoutAccountId: null, payoutLegalName: null, payoutIfsc: null, payoutAccountLast4: null }
        });
      }
    });

    it('publishes the payments config', async () => {
      const res = await request(app).get('/api/config');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ paymentsEnabled: true, platformFeePercent: 10, disputeWindowHours: 48 });
      expect(res.body.customerCancellationPolicy).toHaveLength(3);
    });
  });
});
