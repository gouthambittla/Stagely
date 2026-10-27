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

## 2. Request-to-Book Lifecycle
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

## 3. Running & Verifying the Application

### 3.1 Backend Server (`server/`)
```bash
cd server

# Install dependencies (isolated in server/node_modules)
npm install

# Push database schema & generate Prisma client
npx prisma db push

# Seed test data (Hyderabad bands, solo acoustic artists, admin, venue)
npx ts-node prisma/seed.ts

# Run automated test suite (15 tests passing across 6 suites)
npm test

# Launch backend API in development
npm run dev
```

### 3.2 Mobile Expo Client (`mobile/`)
```bash
cd mobile

# Start Expo dev server
npx expo start

# Test on physical device:
# Scan the terminal QR code with the Expo Go app (Android / iOS)
```

---

## 4. Verification Evidence
All core journeys are verified via automated Jest tests:
- `tests/scaffold.test.ts`: Enums and domain type parity.
- `tests/db.test.ts`: Prisma models, foreign key constraints, 15-day slot cascades.
- `tests/auth_and_onboarding.test.ts`: Password hashing, JWT token generation, initial `PENDING_VERIFICATION` enforcement.
- `tests/admin_verification.test.ts`: Admin role-guard (403 for non-admins) and status toggle to `VERIFIED`.
- `tests/booking_flow.test.ts`: Strict verified search filter, slot request, in-app messaging, and artist acceptance.
- `tests/e2e_marketplace.test.ts`: Complete end-to-end multi-persona journey.
