# Workflows & State Machines

## 1. Firebase Passwordless Authentication Lifecycle
```
[User Launches App]
         │
         ├── Primary: Phone Number (+91) ──▶ SMS OTP (6 Digits) ──▶ Firebase ID Token
         └── Fallback: Email Address ─────▶ Magic Link Tap ────────▶ Firebase ID Token
                                                                            │
                                                                            ▼
                                                               Backend Verification
                                                                            │
                                               ┌────────────────────────────┴───────────────────────────┐
                                               ▼                                                        ▼
                                       [Existing User]                                            [New User]
                                               │                                                        │
                                        Load User Profile                                    Role & Name Selection
                                               │                                                        │
                                               ▼                                                        ▼
                                        Role Dashboard                                     Save Profile & Enter App
```

## 2. Artist Verification Lifecycle
```
[Artist Registers & Completes Onboarding]
                   │
                   ▼
       [Status: PENDING_VERIFICATION]
                   │
         Admin Review Panel
          ├── Approve ──▶ [Status: VERIFIED] (Searchable, visible to customers)
          └── Reject  ──▶ [Status: REJECTED] (Prompted to fix details)
```
- **Rule**: Only artists with `verificationStatus === 'VERIFIED'` appear in customer search and can receive booking requests.

---

## 3. Customer Profile & Discovery Flow
```
[Customer Configures Profile]
         │
         ├── Sets Venue Name (e.g. "Prost Jubilee Hills")
         ├── Sets Locality (e.g. "Road 45, Jubilee Hills, Hyderabad")
         └── Sets Event Coordination Phone (+91)
                   │
                   ▼
[Customer Explores Hyderabad Live Catalog]
         │
         ├── Applies Date Filter ──▶ Backend matches open AvailabilitySlot.isBooked === false
         ├── Sets Budget Tier (INR ₹) ──▶ Backend filters baseFee between minFee & maxFee
         └── Selects Genres ──▶ Backend matches multi-genre array (Rock, Sufi, Tollywood)
                   │
                   ▼
[Customer Selects Artist & Open Slot]
         │
         ▼
[Booking Request Pre-fills Saved Venue Address]
         │
         ▼
[Request Submitted -> In-App Chat Active]
```

---

## 4. Request-to-Book Lifecycle (Single Exclusive Offer Policy)
```
[Customer Selects Available Slot from 15-Day Calendar]
                   │
                   ▼
       Atomic Conflict Validation
 (Rejects 409 if any REQUESTED/ACCEPTED booking exists for artist on this date)
                   │
                   ▼
           [Status: REQUESTED]
   (Slot is immediately locked: isBooked = true;
    Date removed from public catalog discovery)
                   │
        Artist Review in Dashboard
          ├── Accept  ──▶ [Status: ACCEPTED] (Slot remains permanently locked)
          └── Decline ──▶ [Status: DECLINED] (Slot unlocked: isBooked = false; reopens for new offers)
```
- **Single Exclusive Offer Guarantee**: An artist can receive at most ONE active gig offer for any given date. Competing requests on the same date are rejected with `409 Conflict`.
- **Atomic Lock on Request**: As soon as a venue submits a request, the slot is locked (`isBooked = true`) and hidden from other venues in the catalog.
- **Auto-Release on Decline**: If the artist declines the request, the slot is atomically released (`isBooked = false`) so other venues can discover and book it.
- A dedicated chat thread is created when a booking enters `REQUESTED` so the customer and artist can converse regarding set times, sound setup, and logistics.

---

## 5. Artist Studio & Profile Management Flow
```
[Artist Opens Profile Tab (ArtistStudioScreen)]
         │
         ├── Fetches Live Profile & Gig Counters (GET /api/artists/my-profile)
         │     ├── Completed Shows Count (status === 'COMPLETED')
         │     ├── Upcoming Confirmed Gigs Count (status === 'ACCEPTED' && date >= today)
         │     ├── Pending Booking Requests Count (status === 'REQUESTED')
         │     └── (Earnings strictly omitted per user instruction)
         │
         ├── Technical Sound & Stage Rider Display
         │     └── Live view of backline, mics, monitors, and mixer needs
         │
         ├── Profile Customizer Modal (PUT /api/artists/my-profile)
         │     ├── Base Performance Fee in INR ₹ (min ₹1,000 threshold validation)
         │     ├── Technical Stage & Sound Rider specs
         │     ├── Genre tags & Biography
         │     └── Social & Streaming Links (YouTube, Instagram)
         │
         └── Schedule Quick-Access ──▶ Navigates to ScheduleManagerScreen
```

---


---

## 6. Verified Reviews & Reputation Lifecycle
```
[Gig Marked COMPLETED]
         │
         ▼
[Customer Opens MyBookingsScreen]
         │
         ├── Sees "★ Rate & Review Show" Button
         │
         ├── Opens Review Modal:
         │     ├── Selects 1–5 Star Rating (interactive)
         │     ├── Chooses Stage & Sound Highlights (e.g. "Crystal-Clear Audio", "Punctual Soundcheck")
         │     └── Inputs Qualitative Review Notes
         │
         ├── Submits (POST /api/bookings/:id/review)
         │     ├── Server verifies booking is COMPLETED and customer is authorized
         │     └── Review is locked 1:1 to bookingId
         │
         └── Dynamic Reputation Reflection:
               ├── ArtistDetailScreen: Average rating star badge + verified review cards
               └── ArtistStudioScreen: Shows live rating average & total review count
```

---

## 7. Running & Verifying the Application

### 6.1 Backend Server (`server/`)
```bash
cd server

# Install dependencies (isolated in server/node_modules)
npm install

# Push database schema & generate Prisma client
npx prisma db push

# Seed test data (Hyderabad bands, solo acoustic artists, admin, venue)
npm run db:seed

# Run automated test suite (44 tests passing across 12 suites)
npm test

# Launch backend API in development
npm run dev
```

### 6.2 Mobile Expo Client (`mobile/`)
```bash
cd mobile

# Typecheck compilation
npx tsc --noEmit

# Start Expo dev server
npx expo start

# Test on physical device:
# Scan the terminal QR code with the Expo Go app (Android / iOS)
```

---

## 8. Verification Evidence
All core journeys are verified via automated Jest tests (14 suites, 56 tests passing 100%):
- `tests/reviews.test.ts`: Verified review submission, 1–5 star validation, customer ownership check, duplicate prevention, and artist rating aggregation.
- `tests/e2e_reviews.test.ts`: End-to-end multi-venue gig completion, rating updates, public discovery rating reflection, and studio profile rating sync.
- `tests/scaffold.test.ts`: Enums and domain type parity.
- `tests/db.test.ts`: Prisma models, foreign key constraints, customer venue fields, 15-day slot cascades.
- `tests/auth_and_onboarding.test.ts`: Firebase token verification, profile creation, initial `PENDING_VERIFICATION` enforcement.
- `tests/auth_middleware.test.ts`: Token decoding and role-based access control.
- `tests/admin_verification.test.ts`: Admin role-guard (403 for non-admins) and status toggle to `VERIFIED`.
- `tests/booking_flow.test.ts`: Strict verified search filter, slot request, in-app messaging, and artist acceptance.
- `tests/profile_update.test.ts`: Customer profile retrieval, booking statistics aggregation, and venue field updates without mutating login phone.
- `tests/filter_artists.test.ts`: Multi-dimensional discovery query engine (date availability, INR budget brackets, multi-genre selection).
- `tests/artist_studio.test.ts`: Artist studio profile retrieval, show metrics aggregation without `totalEarnings`, base fee updates with ₹1,000 validation, and technical rider updates.
- `tests/e2e_marketplace.test.ts`: Complete end-to-end multi-persona journey.
- `tests/e2e_customer_experience.test.ts`: Complete end-to-end customer journey from profile setup to filtered discovery and pre-filled booking.
- `tests/e2e_artist_studio.test.ts`: Complete end-to-end artist studio journey covering onboarding, gig stats verification, rider customization, and fee updates.
