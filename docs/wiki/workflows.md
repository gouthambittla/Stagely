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
          └── No answer by expiresAt ──▶ [Status: EXPIRED] (Slot unlocked automatically; reopens for new offers)
```
- **Single Exclusive Offer Guarantee**: An artist can receive at most ONE active gig offer for any given date. Competing requests on the same date are rejected with `409 Conflict`.
- **Atomic Lock on Request**: As soon as a venue submits a request, the slot is locked (`isBooked = true`) and hidden from other venues in the catalog.
- **Auto-Release on Decline**: If the artist declines the request, the slot is atomically released (`isBooked = false`) so other venues can discover and book it.
- **Auto-Expiry of Unanswered Offers**: Every request is stamped with `expiresAt` = 48 hours after the request, or the event start (IST) if sooner. Once it passes, the offer becomes `EXPIRED`, the slot is released, and the artist can no longer accept it (`409`). Expiry runs lazily before booking reads/writes, artist discovery, and dashboard stats, plus a 5-minute background sweep in the server process. Legacy requests without `expiresAt` expire 48 hours after `createdAt`.
- A dedicated chat thread is created when a booking enters `REQUESTED` so the customer and artist can converse regarding set times, sound setup, and logistics.

---

## 4a. Payments Lifecycle (Razorpay Route escrow, behind `PAYMENTS_ENABLED`)
```
Artist onboarding ── step 4: Payout details ──▶ Razorpay linked account (PENDING → ACTIVE)
                                                   (accept is blocked until ACTIVE)
REQUESTED ── artist accepts ──▶ AWAITING_PAYMENT (due in 24h, never past the event start)
   │                              ├── not paid in time ──▶ PAYMENT_EXPIRED (night released)
   │                              └── booker pays (hosted /pay/:orderId page → Razorpay)
   │                                   signed webhook or server check ──▶ CONFIRMED
   │                                   (artist share transferred with on_hold)
CONFIRMED
   ├── artist cancels (before start)   ──▶ CANCELLED_BY_ARTIST   (100% refund)
   ├── booker cancels (before start)   ──▶ CANCELLED_BY_CUSTOMER (100% >7d, 50% 1–7d, 0% <24h)
   ├── booker: Mark as Completed (after end) ──▶ COMPLETED ──▶ hold released, artist paid
   ├── 48h after the end, no dispute   ──▶ COMPLETED ──▶ hold released, artist paid
   └── booker: Report a problem (event start → 48h after end) ──▶ DISPUTED (money stays held)
         admin ruling ──▶ PAY_ARTIST → COMPLETED | REFUND → REFUNDED | SPLIT → COMPLETED + partial refund
```
- **Money only moves through settlement.** Every final status records how much the booker gets back (`Payment.refundTargetPaise`). `PaymentService.settleBooking` then reverses, refunds and releases on Razorpay, comparing against Razorpay's own refunded, reversed and hold figures, under a per-booking advisory lock. Retries never double-pay, and the 5-minute sweep retries anything unsettled.
- **The app is never trusted for "paid".** Only a signed webhook (HMAC over the raw body, deduplicated by event id) or the server's own query to Razorpay confirms a booking.
- **The fee** is 10% (`PLATFORM_FEE_PERCENT`). On a partial refund, the artist keeps the kept amount minus 10% of it.
- **Payout details:** PAN and the full account number go to Razorpay only. The profile keeps the account id, status, legal name, IFSC and last 4 digits, and those are stripped from every API response except the artist's own masked view.
- **Local development** without Razorpay keys uses a fake gateway: payout accounts activate instantly, and the checkout page shows a **Simulate successful payment** button.
- **Real Razorpay Test Mode:** see [payments-test-mode.md](payments-test-mode.md).

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
   ├── Booker taps "Mark as Completed" after the event ends (POST /api/bookings/:id/complete)
   └── or, if the booker does nothing, it completes 48h after the event ends
       (5-minute sweep in src/index.ts + lazily on GET /api/bookings)
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
- `tests/booking_completion.test.ts`: Event end time (IST, overnight gigs), booker-only completion after the event, double-completion refusal, and 48h auto-completion (sweep and lazy).
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
