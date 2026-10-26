# Stagely Mobile Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational full-stack mobile application for Stagely (React Native Expo + Node.js/Express + Prisma) covering artist onboarding with 15-day availability, manual admin verification, customer artist discovery in Hyderabad, request-to-book workflow, and in-app booking messaging.

**Architecture:** Monorepo structure containing `server/` (Node.js + Express + Prisma ORM + TypeScript) and `mobile/` (React Native Expo + TypeScript). The server exposes a REST API with JWT authentication and role-based access control (`CUSTOMER`, `ARTIST`, `ADMIN`), while the mobile client delivers native tab navigation, multi-step onboarding, and real-time-capable booking/messaging interfaces.

**Tech Stack:** React Native (Expo SDK, TypeScript), Node.js (Express, TypeScript, Prisma ORM, SQLite/PostgreSQL, Jest, Supertest, JWT).

**Spec:** [docs/superpowers/specs/2026-10-26-stagely-mobile-app-design.md](../../superpowers/specs/2026-10-26-stagely-mobile-app-design.md)

## Global Constraints

- Platform: React Native (Expo) for mobile client (iOS/Android), Node.js/Express for backend API.
- All monetary amounts must be handled and formatted in Indian Rupees (INR ₹).
- Default seed/location defaults centered on Hyderabad and Indian live music contexts.
- Strict state isolation: Artists in `PENDING_VERIFICATION` or `REJECTED` must NEVER be returned in public customer search.
- Bookings must never auto-confirm without explicit artist acceptance.

## Review Focus

1. Unverified artist visibility leak: Search query without status filter returns pending artist. Must assert `status === 'VERIFIED'` in all discovery queries.
2. Double booking race condition: Two customers requesting the exact same slot on the same date. First accepted booking locks the slot; subsequent requests on that slot are rejected.
3. Unauthorized verification: Non-admin user sending a request to approve an artist. Must return 403 Forbidden.
4. Booking state jump: Attempting to accept a booking that has already been declined or cancelled.
5. Slot availability outside 15-day window: Artist trying to schedule beyond a rolling 15-day range.

---

### Task 1: Project Workspace Scaffolding & Shared Types

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/types/index.ts`
- Create: `server/tests/scaffold.test.ts`
- Create: `mobile/package.json`
- Create: `mobile/tsconfig.json`
- Create: `mobile/app.json`

**Interfaces:**
- Produces: `UserRole` (`'CUSTOMER' | 'ARTIST' | 'ADMIN'`), `VerificationStatus` (`'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED'`), `BookingStatus` (`'REQUESTED' | 'ACCEPTED' | 'DECLINED' | 'COMPLETED'`)

- [ ] **Step 1: Write the failing test for shared types & environment**

```typescript
// server/tests/scaffold.test.ts
import { UserRole, VerificationStatus, BookingStatus } from '../src/types';

describe('Shared Domain Types', () => {
  it('should define core domain roles and status enumerations', () => {
    expect(UserRole.ARTIST).toBe('ARTIST');
    expect(VerificationStatus.PENDING_VERIFICATION).toBe('PENDING_VERIFICATION');
    expect(BookingStatus.REQUESTED).toBe('REQUESTED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/tests/scaffold.test.ts`  
Expected: FAIL (modules not found)

- [ ] **Step 3: Implement project scaffolding and type definitions**

Initialize `server/` with Express/TypeScript/Jest dependencies, create `server/src/types/index.ts` exporting `UserRole`, `VerificationStatus`, `BookingStatus`, and initialize `mobile/` Expo package setup.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest server/tests/scaffold.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server mobile
git commit -m "chore: scaffold server and mobile workspace packages with domain types"
```

---

### Task 2: Backend Database Schema & Prisma Configuration

**Files:**
- Create: `server/prisma/schema.prisma`
- Create: `server/src/lib/prisma.ts`
- Create: `server/prisma/seed.ts`
- Test: `server/tests/db.test.ts`

**Interfaces:**
- Consumes: `UserRole`, `VerificationStatus`, `BookingStatus`
- Produces: Prisma Client with `User`, `ArtistProfile`, `AvailabilitySlot`, `Booking`, `Message` models

- [ ] **Step 1: Write the failing test for Prisma database models**

```typescript
// server/tests/db.test.ts
import { prisma } from '../src/lib/prisma';

describe('Database Models', () => {
  it('creates an artist user with an unverified profile and 15-day slots', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'band@stagely.in',
        passwordHash: 'hashed_secret',
        role: 'ARTIST',
        artistProfile: {
          create: {
            artistName: 'Hyderabad Fusion Collective',
            category: 'Band',
            genres: JSON.stringify(['Fusion Rock', 'Telugu Indie']),
            location: 'Hyderabad',
            baseFee: 25000,
            requirements: '2 Vocal Mics, 1 Drum Kit, Stereo PA System',
            verificationStatus: 'PENDING_VERIFICATION'
          }
        }
      },
      include: { artistProfile: true }
    });
    expect(user.artistProfile?.verificationStatus).toBe('PENDING_VERIFICATION');
    expect(user.artistProfile?.baseFee).toBe(25000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/tests/db.test.ts`  
Expected: FAIL (Prisma client not generated)

- [ ] **Step 3: Define schema.prisma and generate Prisma Client**

Define models `User`, `ArtistProfile`, `AvailabilitySlot`, `Booking`, `Message` with foreign keys and cascade rules. Run `npx prisma db push` and write `seed.ts` with mock Hyderabad bands.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest server/tests/db.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/prisma server/src/lib/prisma.ts server/tests/db.test.ts
git commit -m "feat(db): configure Prisma schema with models and relationships"
```

---

### Task 3: Auth & Artist Onboarding API

**Files:**
- Create: `server/src/services/auth.service.ts`
- Create: `server/src/routes/auth.routes.ts`
- Create: `server/src/services/artist.service.ts`
- Create: `server/src/routes/artist.routes.ts`
- Create: `server/src/app.ts`
- Test: `server/tests/auth_and_onboarding.test.ts`

**Interfaces:**
- Produces: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/artists/onboard`, `POST /api/artists/schedule`

- [ ] **Step 1: Write the failing test for registration and artist onboarding**

```typescript
// server/tests/auth_and_onboarding.test.ts
import request from 'supertest';
import app from '../src/app';

describe('Auth & Artist Onboarding API', () => {
  it('registers artist and enforces PENDING_VERIFICATION on onboarding', async () => {
    const regRes = await request(app).post('/api/auth/register').send({
      email: 'newartist@stagely.in',
      password: 'password123',
      role: 'ARTIST'
    });
    const token = regRes.body.token;

    const onboardRes = await request(app)
      .post('/api/artists/onboard')
      .set('Authorization', `Bearer ${token}`)
      .send({
        artistName: 'Jammers Hyderabad',
        category: 'Band',
        genres: ['Rock', 'Tollywood Acoustic'],
        location: 'Hyderabad',
        baseFee: 30000,
        requirements: 'Full PA and sound monitor',
        youtubeUrl: 'https://youtube.com/@jammers',
        instagramUrl: 'https://instagram.com/jammers',
        availableDates: ['2026-11-01', '2026-11-02']
      });

    expect(onboardRes.status).toBe(201);
    expect(onboardRes.body.artistProfile.verificationStatus).toBe('PENDING_VERIFICATION');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/tests/auth_and_onboarding.test.ts`  
Expected: FAIL (app or routes not implemented)

- [ ] **Step 3: Implement Auth and Artist Onboarding services and routes**

Implement password hashing (bcrypt), JWT token generator/verifier middleware, `onboard` controller creating profile with `PENDING_VERIFICATION`, and slot scheduler for the 15-day range.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest server/tests/auth_and_onboarding.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes server/src/services server/tests/auth_and_onboarding.test.ts
git commit -m "feat(api): implement auth and artist onboarding routes"
```

---

### Task 4: Admin Verification API & Workflow

**Files:**
- Create: `server/src/middlewares/auth.middleware.ts`
- Create: `server/src/routes/admin.routes.ts`
- Create: `server/src/services/admin.service.ts`
- Test: `server/tests/admin_verification.test.ts`

**Interfaces:**
- Produces: `GET /api/admin/artists/pending`, `PUT /api/admin/artists/:id/verify` (`status: VERIFIED | REJECTED`)

- [ ] **Step 1: Write the failing test for admin verification security and status flip**

```typescript
// server/tests/admin_verification.test.ts
import request from 'supertest';
import app from '../src/app';

describe('Admin Verification API', () => {
  it('prevents non-admin from approving artists and allows admin to verify', async () => {
    // Non-admin token
    const userRes = await request(app).post('/api/auth/login').send({
      email: 'customer@stagely.in',
      password: 'password123'
    });
    const customerToken = userRes.body.token;

    const unauthRes = await request(app)
      .put('/api/admin/artists/1/verify')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'VERIFIED' });
    expect(unauthRes.status).toBe(403);

    // Admin token
    const adminRes = await request(app).post('/api/auth/login').send({
      email: 'admin@stagely.in',
      password: 'adminpassword'
    });
    const adminToken = adminRes.body.token;

    const verifyRes = await request(app)
      .put('/api/admin/artists/1/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'VERIFIED' });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.verificationStatus).toBe('VERIFIED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/tests/admin_verification.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement admin role guard and verification controllers**

Add `requireAdmin` middleware check and status transition logic (`VERIFIED` or `REJECTED`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest server/tests/admin_verification.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/admin.routes.ts server/src/middlewares/auth.middleware.ts server/tests/admin_verification.test.ts
git commit -m "feat(api): implement admin verification queue and role-protected approval"
```

---

### Task 5: Customer Discovery, Request-to-Book & Messaging API

**Files:**
- Create: `server/src/routes/discovery.routes.ts`
- Create: `server/src/routes/booking.routes.ts`
- Create: `server/src/routes/message.routes.ts`
- Create: `server/src/services/booking.service.ts`
- Test: `server/tests/booking_flow.test.ts`

**Interfaces:**
- Produces: `GET /api/artists` (strict `status: 'VERIFIED'`), `POST /api/bookings` (`status: 'REQUESTED'`), `PUT /api/bookings/:id/respond` (`ACCEPTED | DECLINED`), `GET /api/bookings/:id/messages`, `POST /api/bookings/:id/messages`

- [ ] **Step 1: Write the failing test for discovery and the request-to-book cycle**

```typescript
// server/tests/booking_flow.test.ts
import request from 'supertest';
import app from '../src/app';

describe('Discovery & Booking Flow', () => {
  it('only returns VERIFIED artists in search, allows booking request, and artist accepts', async () => {
    // 1. Search only returns VERIFIED
    const searchRes = await request(app).get('/api/artists?location=Hyderabad');
    expect(searchRes.status).toBe(200);
    searchRes.body.forEach((artist: any) => {
      expect(artist.verificationStatus).toBe('VERIFIED');
    });

    // 2. Customer books slot
    const bookRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        artistId: 1,
        slotId: 10,
        eventType: 'Pub Live Gig',
        eventLocation: 'Jubilee Hills, Hyderabad',
        notes: '2-hour acoustic set'
      });
    expect(bookRes.status).toBe(201);
    expect(bookRes.body.status).toBe('REQUESTED');

    // 3. Artist accepts
    const acceptRes = await request(app)
      .put(`/api/bookings/${bookRes.body.id}/respond`)
      .set('Authorization', `Bearer ${artistToken}`)
      .send({ action: 'ACCEPT' });
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.status).toBe('ACCEPTED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/tests/booking_flow.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement discovery filter, booking lifecycle, and message endpoints**

Implement strict query scoping (`where: { verificationStatus: 'VERIFIED' }`), booking creation with linked conversation thread, and slot reservation locking upon acceptance.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest server/tests/booking_flow.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes server/src/services server/tests/booking_flow.test.ts
git commit -m "feat(api): implement verified discovery, request-to-book lifecycle, and messages"
```

---

### Task 6: Mobile Client Architecture, Navigation & Landing Screen

**Files:**
- Create: `mobile/src/navigation/RootNavigator.tsx`
- Create: `mobile/src/screens/LandingScreen.tsx`
- Create: `mobile/src/screens/AuthScreen.tsx`
- Create: `mobile/src/context/AuthContext.tsx`
- Create: `mobile/src/services/api.ts`
- Test: `mobile/__tests__/navigation.test.tsx`

**Interfaces:**
- Consumes: Backend Auth APIs
- Produces: Navigation container with role-specific tab navigators (Customer, Artist, Admin)

- [ ] **Step 1: Write test for LandingScreen role selection and Auth routing**

```typescript
// mobile/__tests__/navigation.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import LandingScreen from '../src/screens/LandingScreen';

describe('LandingScreen', () => {
  it('renders "Find Artist" and "I am an Artist" action triggers', () => {
    const mockNavigate = jest.fn();
    const { getByText } = render(<LandingScreen navigation={{ navigate: mockNavigate } as any} />);
    
    expect(getByText('Find Live Artists')).toBeTruthy();
    expect(getByText('I am an Artist')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix mobile test navigation.test.tsx`  
Expected: FAIL

- [ ] **Step 3: Implement Landing screen, Auth Context, and RootNavigator**

Create polished Landing UI with brand aesthetics, Auth state persistence using `expo-secure-store` (per `senior-react-native` guidelines), and role-conditional tabs.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix mobile test navigation.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src mobile/__tests__
git commit -m "feat(mobile): add navigation stack, auth context, and role-based landing screen"
```

---

### Task 7: Mobile Client: Artist Onboarding & 15-Day Availability Wizard

**Files:**
- Create: `mobile/src/screens/artist/OnboardingWizardScreen.tsx`
- Create: `mobile/src/screens/artist/ScheduleManagerScreen.tsx`
- Create: `mobile/src/components/AvailabilityCalendar.tsx`
- Test: `mobile/__tests__/onboarding.test.tsx`

**Interfaces:**
- Consumes: `POST /api/artists/onboard`, `POST /api/artists/schedule`
- Produces: Multi-step form with category, genres, base fee (₹), requirements, and 15-day date picker.

- [ ] **Step 1: Write test for onboarding step progression and payload submission**

```typescript
// mobile/__tests__/onboarding.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import OnboardingWizardScreen from '../src/screens/artist/OnboardingWizardScreen';

describe('OnboardingWizardScreen', () => {
  it('collects artist requirements, fee, and displays pending verification notice', () => {
    const { getByPlaceholderText, getByText } = render(<OnboardingWizardScreen />);
    expect(getByPlaceholderText('Stage / Band Name')).toBeTruthy();
    expect(getByPlaceholderText('Standard Performance Fee (₹)')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix mobile test onboarding.test.tsx`  
Expected: FAIL

- [ ] **Step 3: Implement multi-step onboarding wizard and rolling 15-day scheduler**

Add step indicator, form validation, Indian Rupee formatting, equipment requirement fields, and status banner indicating `PENDING_VERIFICATION`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix mobile test onboarding.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/artist mobile/src/components mobile/__tests__/onboarding.test.tsx
git commit -m "feat(mobile): build artist onboarding wizard with 15-day schedule picker"
```

---

### Task 8: Mobile Client: Customer Discovery & Request-to-Book UI

**Files:**
- Create: `mobile/src/screens/customer/ExploreScreen.tsx`
- Create: `mobile/src/screens/customer/ArtistDetailScreen.tsx`
- Create: `mobile/src/screens/customer/BookSlotModal.tsx`
- Create: `mobile/src/screens/customer/MyBookingsScreen.tsx`
- Test: `mobile/__tests__/discovery_and_booking.test.tsx`

**Interfaces:**
- Consumes: `GET /api/artists`, `POST /api/bookings`
- Produces: Customer marketplace interface with verified badges, slot selection, and request submission.

- [ ] **Step 1: Write test for ExploreScreen rendering verified artists and initiating booking**

```typescript
// mobile/__tests__/discovery_and_booking.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import ExploreScreen from '../src/screens/customer/ExploreScreen';

describe('Customer Explore & Booking', () => {
  it('shows verified badge and displays artist performance fee in INR', () => {
    const mockArtists = [{
      id: 1,
      artistName: 'Hyderabad Fusion Collective',
      category: 'Band',
      baseFee: 25000,
      verificationStatus: 'VERIFIED',
      location: 'Hyderabad'
    }];
    const { getByText } = render(<ExploreScreen initialArtists={mockArtists} />);
    expect(getByText('Hyderabad Fusion Collective')).toBeTruthy();
    expect(getByText('₹25,000')).toBeTruthy();
    expect(getByText('Verified')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix mobile test discovery_and_booking.test.tsx`  
Expected: FAIL

- [ ] **Step 3: Implement Explore catalog, Artist profile card, and Booking modal**

Build filterable artist list by genre/city, detail view showcasing requirements and social links, slot booking bottom sheet, and My Bookings tab.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix mobile test discovery_and_booking.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/customer mobile/__tests__/discovery_and_booking.test.tsx
git commit -m "feat(mobile): implement customer discovery catalog, artist details, and booking modal"
```

---

### Task 9: Mobile Client: In-App Chat & Artist Decision Hub

**Files:**
- Create: `mobile/src/screens/artist/ArtistDashboardScreen.tsx`
- Create: `mobile/src/screens/common/ChatScreen.tsx`
- Create: `mobile/src/screens/admin/AdminVerificationScreen.tsx`
- Test: `mobile/__tests__/artist_dashboard.test.tsx`

**Interfaces:**
- Consumes: `PUT /api/bookings/:id/respond`, `GET/POST /api/bookings/:id/messages`, `PUT /api/admin/artists/:id/verify`
- Produces: Artist request review cards (Accept / Decline), instant chat thread UI, Admin verification queue UI.

- [ ] **Step 1: Write test for Artist decision actions and message thread display**

```typescript
// mobile/__tests__/artist_dashboard.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ArtistDashboardScreen from '../src/screens/artist/ArtistDashboardScreen';

describe('Artist Dashboard Decisions', () => {
  it('renders incoming booking requests with Accept and Decline actions', () => {
    const mockRequests = [{
      id: 101,
      customerName: 'Aura Brewery',
      eventType: 'Weekend Pub Live',
      date: '2026-11-05',
      status: 'REQUESTED'
    }];
    const onAccept = jest.fn();
    const { getByText } = render(<ArtistDashboardScreen requests={mockRequests} onAccept={onAccept} />);
    
    expect(getByText('Aura Brewery')).toBeTruthy();
    fireEvent.press(getByText('Accept'));
    expect(onAccept).toHaveBeenCalledWith(101);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix mobile test artist_dashboard.test.tsx`  
Expected: FAIL

- [ ] **Step 3: Implement Artist dashboard, Chat screen, and Admin verification panel**

Add incoming request cards with one-tap Accept/Decline, chat conversation interface with optimistic message sending, and admin vetting portal with Approve/Reject toggles.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix mobile test artist_dashboard.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/artist mobile/src/screens/common mobile/src/screens/admin mobile/__tests__/artist_dashboard.test.tsx
git commit -m "feat(mobile): build artist decision cards, in-app chat, and admin verification UI"
```

---

### Task 10: Full End-to-End Verification & Wiki Documentation Update

**Files:**
- Create: `server/tests/e2e_marketplace.test.ts`
- Modify: `docs/wiki/workflows.md`
- Modify: `docs/wiki/README.md`

- [ ] **Step 1: Write E2E integration test executing the complete marketplace journey**

```typescript
// server/tests/e2e_marketplace.test.ts
// Test asserts full cycle:
// 1. Artist signs up & onboards -> status is PENDING_VERIFICATION
// 2. Public search does NOT list the artist
// 3. Admin verifies artist -> status flips to VERIFIED
// 4. Public search now returns the artist
// 5. Customer books an open slot -> status is REQUESTED
// 6. Customer & Artist exchange messages in chat thread
// 7. Artist accepts booking -> status flips to ACCEPTED, slot becomes booked
```

- [ ] **Step 2: Run E2E test and verify failure before wiring**

Run: `npx jest server/tests/e2e_marketplace.test.ts`  
Expected: FAIL

- [ ] **Step 3: Wire full journey and verify all assertions pass**

Run: `npx jest server/tests/e2e_marketplace.test.ts`  
Expected: PASS with 100% lifecycle coverage

- [ ] **Step 4: Update Project Wiki with deployment notes, run commands, and test evidence**

Update `docs/wiki/workflows.md` and `docs/wiki/architecture.md` with operational setup guide.

- [ ] **Step 5: Commit**

```bash
git add server/tests docs/wiki
git commit -m "test(e2e): verify end-to-end artist lifecycle, booking flow, and update project wiki"
```
