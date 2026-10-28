# Customer Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full-stack customer capabilities for Stagely: Customer Profile management, multi-dimensional search & filtering (date availability, budget tiers in INR ₹, multi-genre selection), verified artist trust badges, and pre-filled streamlined booking.

**Architecture:** Extend backend Prisma schema with customer venue/contact fields, implement dedicated profile and expanded artist query filters in Express.js REST API with automated Jest/Supertest coverage, and enhance the React Native mobile client with a native Customer Profile tab, bottom-sheet Filter modal, and pre-filled booking flow.

**Tech Stack:** React Native (Expo SDK 58, TypeScript), Node.js, Express.js, Prisma ORM, Jest, Supertest, `lucide-react-native`.

**Spec:** [docs/superpowers/specs/2026-10-28-customer-experience-design.md](file:///D:/Stagely/docs/superpowers/specs/2026-10-28-customer-experience-design.md)

## Global Constraints

- **Single token type:** All authenticated requests use Firebase ID tokens verified via `verifyFirebaseAuth`.
- **Authentication integrity:** `User.phone` and `User.firebaseUid` are immutable login credentials; host event-day contact phone is stored in `contactPhone`.
- **Currency formatting:** All fees and budgets are handled and formatted in Indian Rupees (INR ₹).
- **Default coverage:** Hyderabad live acts service venues across the entire city by default.
- **Strict verification gate:** Artists in `PENDING_VERIFICATION` or `REJECTED` must NEVER be returned in any customer search or filter queries.
- **Four screen states:** All screens fetching dynamic data must implement Loading, Error, Empty, and Content states.

## Review Focus

1. **Attempting to mutate login phone:** `PUT /api/users/me` payload containing `phone` or `firebaseUid` must NOT alter the user's authenticated login credentials.
2. **Date filter with already-booked slot:** `GET /api/artists?date=YYYY-MM-DD` must only match artists who have at least one unbooked (`isBooked === false`) slot on that date.
3. **Multi-genre filtering:** Passing multiple comma-separated genres (`genres=Rock,Bollywood`) must return artists that match any of the selected genres.
4. **Unauthenticated profile access:** Requests to `GET /api/users/me` or `PUT /api/users/me` without a valid Firebase token must return `401 Unauthorized`.
5. **Booking pre-fill fallback:** If customer profile has not set `venueName` or `city`, booking location input gracefully defaults to blank without crashing or submitting `undefined`.

---

### Task 1: Database Schema Migration & User Profile Model

**Files:**
- Modify: `server/prisma/schema.prisma`
- Modify: `server/prisma/seed.ts`
- Test: `server/tests/db.test.ts`

**Interfaces:**
- Consumes: Prisma CLI
- Produces: `User` model with `venueName String?`, `city String?`, `contactPhone String?`.

- [ ] **Step 1: Write the failing test for new User model fields**

```typescript
// server/tests/db.test.ts
it('creates customer user with venueName, city, and contactPhone without breaking firebaseUid', async () => {
  const user = await prisma.user.create({
    data: {
      firebaseUid: 'test_customer_venue_uid_999',
      phone: '+919876500000',
      name: 'Vikram Reddy',
      venueName: 'Aura Brewery & Kitchen',
      city: 'Jubilee Hills, Hyderabad',
      contactPhone: '+919988776655',
      role: 'CUSTOMER'
    }
  });
  expect(user.id).toBeDefined();
  expect(user.venueName).toBe('Aura Brewery & Kitchen');
  expect(user.contactPhone).toBe('+919988776655');
  expect(user.city).toBe('Jubilee Hills, Hyderabad');
  await prisma.user.delete({ where: { id: user.id } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/db.test.ts` in `server/`  
Expected: FAIL due to `venueName` not existing on `UserCreateInput`.

- [ ] **Step 3: Update `server/prisma/schema.prisma` and push database**

Add fields to `User`:
```prisma
model User {
  id               Int            @id @default(autoincrement())
  firebaseUid      String         @unique
  email            String?        @unique
  phone            String?        @unique
  name             String?
  venueName        String?
  city             String?
  contactPhone     String?
  role             String
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  artistProfile    ArtistProfile?
  customerBookings Booking[]      @relation("CustomerBookings")
  sentMessages     Message[]      @relation("UserSentMessages")
}
```

Run: `npx prisma db push` in `server/`

- [ ] **Step 4: Update `server/prisma/seed.ts` with customer venue sample data**

Add `venueName: 'Heart Cup Coffee'`, `city: 'Jubilee Hills, Hyderabad'`, `contactPhone: '+919849012345'` to seed customer user.  
Run: `npm run db:seed` in `server/`

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/db.test.ts` in `server/`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/seed.ts server/tests/db.test.ts
git commit -m "feat(db): add venueName, city, and contactPhone to User model"
```

---

### Task 2: Backend Profile Management Endpoints & Aggregation

**Files:**
- Create: `server/tests/profile_update.test.ts`
- Create: `server/src/routes/users.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Consumes: `verifyFirebaseAuth` middleware, Prisma Client.
- Produces: `GET /api/users/me`, `PUT /api/users/me`.

- [ ] **Step 1: Write failing tests for profile retrieval and update**

```typescript
// server/tests/profile_update.test.ts
import request from 'supertest';
import { app } from '../src/app';

describe('Customer Profile API', () => {
  const customerToken = 'mock_cust_profile_token_001';

  beforeAll(async () => {
    await request(app)
      .post('/api/auth/complete-signup')
      .send({
        idToken: customerToken,
        role: 'CUSTOMER',
        name: 'Venue Host Suresh'
      });
  });

  it('retrieves user profile with booking counts', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.name).toBe('Venue Host Suresh');
    expect(res.body.stats).toBeDefined();
    expect(typeof res.body.stats.activeBookingsCount).toBe('number');
    expect(typeof res.body.stats.completedBookingsCount).toBe('number');
  });

  it('updates customer venue details without altering login phone', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        name: 'Suresh Kumar',
        venueName: 'Tabula Rasa Bar',
        city: 'Jubilee Hills, Hyderabad',
        contactPhone: '+919988771122',
        phone: '+910000000000' // Must be ignored
      });

    expect(res.status).toBe(200);
    expect(res.body.user.venueName).toBe('Tabula Rasa Bar');
    expect(res.body.user.contactPhone).toBe('+919988771122');
    expect(res.body.user.phone).not.toBe('+910000000000');
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/profile_update.test.ts` in `server/`  
Expected: FAIL (404 on `/api/users/me`).

- [ ] **Step 3: Implement `server/src/routes/users.ts` and mount in `app.ts`**

Implement `GET /api/users/me` computing `activeBookingsCount` and `completedBookingsCount`, and `PUT /api/users/me` whitelist-updating `name`, `venueName`, `city`, `contactPhone`. Mount `usersRouter` at `/api/users` in `app.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/profile_update.test.ts` in `server/`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/users.ts server/src/app.ts server/tests/profile_update.test.ts
git commit -m "feat(api): implement GET and PUT /api/users/me with booking statistics"
```

---

### Task 3: Backend Multi-Dimensional Artist Discovery Query Engine

**Files:**
- Create: `server/tests/filter_artists.test.ts`
- Modify: `server/src/routes/artists.ts`

**Interfaces:**
- Consumes: Prisma Client, `ArtistProfile`, `AvailabilitySlot`.
- Produces: `GET /api/artists` handling `date`, `minFee`, `maxFee`, `genres`, `category`, `location`, `search`.

- [ ] **Step 1: Write failing tests for advanced discovery filters**

```typescript
// server/tests/filter_artists.test.ts
import request from 'supertest';
import { app } from '../src/app';

describe('Advanced Artist Discovery Filters', () => {
  it('filters artists by date availability for open slots', async () => {
    const res = await request(app)
      .get('/api/artists')
      .query({ date: '2026-11-01' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.artists)).toBe(true);
    res.body.artists.forEach((artist: any) => {
      const hasSlot = artist.availabilitySlots.some((s: any) => s.date === '2026-11-01' && !s.isBooked);
      expect(hasSlot).toBe(true);
    });
  });

  it('filters artists by budget range in INR', async () => {
    const res = await request(app)
      .get('/api/artists')
      .query({ minFee: 15000, maxFee: 35000 });

    expect(res.status).toBe(200);
    res.body.artists.forEach((artist: any) => {
      expect(artist.baseFee).toBeGreaterThanOrEqual(15000);
      expect(artist.baseFee).toBeLessThanOrEqual(35000);
    });
  });

  it('filters artists by multi-genre query parameter', async () => {
    const res = await request(app)
      .get('/api/artists')
      .query({ genres: 'Rock,Sufi' });

    expect(res.status).toBe(200);
    res.body.artists.forEach((artist: any) => {
      const genres = typeof artist.genres === 'string' ? JSON.parse(artist.genres) : artist.genres;
      const matches = genres.some((g: string) => /rock|sufi/i.test(g));
      expect(matches).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/filter_artists.test.ts` in `server/`  
Expected: FAIL (filters not handled in query).

- [ ] **Step 3: Update `server/src/routes/artists.ts` query builder**

Enhance `GET /api/artists` route with Prisma conditions:
- `where.baseFee`: `{ gte: minFeeNum, lte: maxFeeNum }`.
- `where.availabilitySlots`: `{ some: { date: dateStr, isBooked: false } }` if `date` is provided.
- `where.OR` across parsed `genres` array items.
- Retain strict `verificationStatus: 'VERIFIED'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/filter_artists.test.ts` in `server/`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/artists.ts server/tests/filter_artists.test.ts
git commit -m "feat(api): expand GET /api/artists with date, budget, and multi-genre filters"
```

---

### Task 4: Mobile API Client Service & Types Extension

**Files:**
- Modify: `mobile/src/services/api.ts`

**Interfaces:**
- Produces:
  - `api.getProfile(): Promise<{ user: any; stats: { activeBookingsCount: number; completedBookingsCount: number } }>`
  - `api.updateProfile(data: { name?: string; venueName?: string; city?: string; contactPhone?: string }): Promise<{ user: any }>`
  - `api.getArtists(filters: ArtistFilters): Promise<{ artists: any[] }>`

- [ ] **Step 1: Update `mobile/src/services/api.ts` with typed methods**

Add `getProfile()`, `updateProfile()`, and update `ArtistFilterParams` to accept `minFee`, `maxFee`, `date`, `genres`.

- [ ] **Step 2: Run TypeScript check to verify clean compilation**

Run: `npx tsc --noEmit` in `mobile/`  
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/services/api.ts
git commit -m "feat(mobile): add profile endpoints and filter parameters to api service"
```

---

### Task 5: Mobile Customer Profile Screen & Tab Navigation

**Files:**
- Create: `mobile/src/screens/customer/CustomerProfileScreen.tsx`
- Modify: `mobile/src/navigation/RootNavigator.tsx`

**Interfaces:**
- Consumes: `api.getProfile()`, `api.updateProfile()`, `useAuth()`.
- Produces: `CustomerProfileScreen` component and Customer Tab Navigator with 3 tabs: Explore, Bookings, Profile.

- [ ] **Step 1: Create `mobile/src/screens/customer/CustomerProfileScreen.tsx`**

Implement screen covering the 4 states (Loading, Error, Empty, Content):
- View mode: Displays user initial avatar, Display Name, Role badge (`CUSTOMER / HOST`), Venue Name, Location, Event Contact Phone, and summary stats cards ("Active Bookings", "Past Events").
- Edit mode: Toggleable form inputs for Name, Venue Name, Location, and Event Contact Phone with "Save Changes" and "Cancel" buttons.
- Sign Out button with native `Alert.alert` confirmation calling `signOut()`.

- [ ] **Step 2: Update `mobile/src/navigation/RootNavigator.tsx` customer tab bar**

Wire `CustomerProfileScreen` into the bottom tab navigator alongside `ExploreScreen` and `MyBookingsScreen`. Use `User` icon from `lucide-react-native`.

- [ ] **Step 3: Run TypeScript check to verify types**

Run: `npx tsc --noEmit` in `mobile/`  
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/customer/CustomerProfileScreen.tsx mobile/src/navigation/RootNavigator.tsx
git commit -m "feat(mobile): add CustomerProfileScreen and add Profile tab to customer navigation"
```

---

### Task 6: Mobile Filter Modal & Verified Artist Badging in Explore Screen

**Files:**
- Modify: `mobile/src/screens/customer/ExploreScreen.tsx`

**Interfaces:**
- Consumes: `api.getArtists()`, `lucide-react-native` icons.
- Produces: Bottom sheet Filter modal with Date, Budget tiers, Multi-Genre selection, and Stagely Verified trust badges.

- [ ] **Step 1: Enhance `ExploreScreen.tsx` with Filter modal & badge**

- Add floating / inline "Filters" button with active filter counter badge.
- Implement slide-up Modal with:
  - 15-day horizontal date selector.
  - Budget chips: All, < ₹20K, ₹20K–₹40K, ₹40K–₹70K, ₹70K+.
  - Multi-select genre tags: Telugu Rock, Bollywood, Acoustic, Sufi, Pop, Fusion.
  - "Clear Filters" and "Apply Filters" actions.
- Update `renderArtistCard` to show prominent "Stagely Verified" badge with checkmark and tooltip/caption ("Auditioned & Vetted for Live Sound").

- [ ] **Step 2: Run TypeScript check to verify**

Run: `npx tsc --noEmit` in `mobile/`  
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/customer/ExploreScreen.tsx
git commit -m "feat(mobile): add filter modal and verified trust badges to ExploreScreen"
```

---

### Task 7: Streamlined Booking Flow & Pre-Filled Venue Data

**Files:**
- Modify: `mobile/src/screens/customer/ArtistDetailScreen.tsx`

**Interfaces:**
- Consumes: `api.getProfile()`, `api.createBooking()`.
- Produces: Transparent pricing breakdown banner, auto-populated venue location from profile, and seamless chat navigation.

- [ ] **Step 1: Update `ArtistDetailScreen.tsx`**

- Fetch current customer profile on mount via `api.getProfile()`. If `user.venueName` and `user.city` are present, pre-populate `eventLocation` input (e.g. `${user.venueName}, ${user.city}`).
- Add transparent pricing summary banner: `₹[baseFee] Standard 2-Hour Live Performance | Zero Hidden Agency Fee`.
- Upon successful booking submission, alert user and provide direct navigation to `MyBookingsScreen` / chat thread.

- [ ] **Step 2: Run TypeScript check to verify**

Run: `npx tsc --noEmit` in `mobile/`  
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/customer/ArtistDetailScreen.tsx
git commit -m "feat(mobile): pre-populate venue in booking form and add fee transparency banner"
```

---

### Task 8: End-to-End Test Suite & Project Wiki Update

**Files:**
- Create: `server/tests/e2e_customer_experience.test.ts`
- Modify: `docs/wiki/architecture.md`
- Modify: `docs/wiki/workflows.md`

**Interfaces:**
- Consumes: All server routes and database seed.
- Produces: Comprehensive automated regression test asserting profile update, multi-parameter filtered search, and pre-filled booking flow.

- [ ] **Step 1: Create `server/tests/e2e_customer_experience.test.ts`**

Write end-to-end integration test exercising:
1. Customer registers and sets profile (`name`, `venueName: 'Prost Jubilee Hills'`, `contactPhone`).
2. Verified search filtered by `date` and `budget` (`minFee` & `maxFee`).
3. Customer books matching slot with pre-filled venue info.
4. Customer profile stats reflect 1 active booking.

- [ ] **Step 2: Run entire server test suite**

Run: `npm test` in `server/`  
Expected: All 8 test suites pass.

- [ ] **Step 3: Run mobile TypeScript verification**

Run: `npx tsc --noEmit` in `mobile/`  
Expected: 0 errors.

- [ ] **Step 4: Update `docs/wiki/architecture.md` and `docs/wiki/workflows.md`**

Document the new `User` schema fields, discovery query parameters, and customer profile lifecycle.

- [ ] **Step 5: Commit**

```bash
git add server/tests/e2e_customer_experience.test.ts docs/wiki/
git commit -m "test(e2e): verify end-to-end customer experience and update project wiki"
```
