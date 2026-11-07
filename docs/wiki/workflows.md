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

## 4. Request-to-Book Lifecycle
```
[Customer Selects Available Slot from 15-Day Calendar]
                   │
                   ▼
          [Status: REQUESTED]
                   │
        Artist Review in Dashboard
          ├── Accept  ──▶ [Status: ACCEPTED] (Slot locked on calendar)
          └── Decline ──▶ [Status: DECLINED] (Slot released back to open pool)
```
- A dedicated chat thread is created when a booking enters `REQUESTED` so the customer and artist can converse regarding set times, sound setup, and logistics.

---

## 5. Running & Verifying the Application

### 5.1 Backend Server (`server/`)
```bash
cd server

# Install dependencies (isolated in server/node_modules)
npm install

# Push database schema & generate Prisma client
npx prisma db push

# Seed test data (Hyderabad bands, solo acoustic artists, admin, venue)
npm run db:seed

# Run automated test suite (35 tests passing across 10 suites)
npm test

# Launch backend API in development
npm run dev
```

### 5.2 Mobile Expo Client (`mobile/`)
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

## 6. Verification Evidence
All core journeys are verified via automated Jest tests (10 suites, 35 tests passing):
- `tests/scaffold.test.ts`: Enums and domain type parity.
- `tests/db.test.ts`: Prisma models, foreign key constraints, customer venue fields, 15-day slot cascades.
- `tests/auth_and_onboarding.test.ts`: Firebase token verification, profile creation, initial `PENDING_VERIFICATION` enforcement.
- `tests/auth_middleware.test.ts`: Token decoding and role-based access control.
- `tests/admin_verification.test.ts`: Admin role-guard (403 for non-admins) and status toggle to `VERIFIED`.
- `tests/booking_flow.test.ts`: Strict verified search filter, slot request, in-app messaging, and artist acceptance.
- `tests/profile_update.test.ts`: Customer profile retrieval, booking statistics aggregation, and venue field updates without mutating login phone.
- `tests/filter_artists.test.ts`: Multi-dimensional discovery query engine (date availability, INR budget brackets, multi-genre selection).
- `tests/e2e_marketplace.test.ts`: Complete end-to-end multi-persona journey.
- `tests/e2e_customer_experience.test.ts`: Complete end-to-end customer journey from profile setup to filtered discovery and pre-filled booking.
