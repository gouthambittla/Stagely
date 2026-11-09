# System Architecture & Tech Stack

## Architectural Choice: Option A (React Native Expo + Node.js Backend)

### 1. Mobile Client (`/mobile`)
- **Framework**: React Native with **Expo SDK** (TypeScript), following standards defined in [Senior React Native](../../.agents/skills/senior-react-native/SKILL.md).
- **Navigation**: Native tab navigation:
  - **Customer Persona**: 3 Tabs (`Explore`, `My Bookings`, `Profile`) + `ArtistDetailScreen` Modal Stack + In-App `ChatScreen`.
  - **Artist Persona**: 3 Tabs (`Requests`, `Schedule`, `Profile`) + 15-day rolling slot manager.
  - **Admin Persona**: Dedicated verification queue portal.
- **Styling**: Native styling following Apple HIG & Material 3 conventions, avoiding generic AI web-like modal anti-patterns.
- **Security**: `expo-secure-store` for Firebase auth credentials (never insecure `AsyncStorage`).
- **Screen States**: Every screen loading dynamic data strictly implements the 4 states: *Loading*, *Error*, *Empty*, and *Content*.
- **Target OS**: Android & iOS.
- **Customer Experience & Reviews Features**:
  - Slide-up bottom sheet filter modal with 15-day rolling calendar date selector, budget chips (< ₹20K, ₹20K–₹40K, ₹40K–₹70K, ₹70K+), and multi-select genres.
  - "Stagely Verified • Auditioned Live Stage Sound" trust badges on artist cards.
  - Pre-filled venue name & locality in booking forms directly from customer profile.
  - Dedicated `CustomerProfileScreen` with edit mode and active/completed gig statistics.
  - **Verified Reviews Submission**: In `MyBookingsScreen`, completed shows unlock a 1–5 star review modal with audio compliance tags (*"Punctual Soundcheck"*, *"Crystal-Clear Audio"*, *"High Crowd Energy"*, *"Great Song Selection"*, *"Professional Stage Presence"*, *"Seamless PA Setup"*).
  - **Public Stage Reviews**: `ArtistDetailScreen` showcases average rating badge (e.g. ⭐ 4.9) and verified testimonials with venue attribution.
- **Artist Experience & Studio Features**:
  - Dedicated `ArtistStudioScreen` acting as the profile management hub and gig operations center.
  - Gig metric cards for Completed Shows (`completedGigsCount`), Confirmed Upcoming Gigs (`upcomingGigsCount`), Pending Inquiries (`pendingRequestsCount`), and Stage Rating (`averageRating` & `reviewCount`) — strictly omitting any total earnings display.
  - Sound & Stage Technical Rider card showcasing live audio equipment requirements (microphones, monitors, mixers, DI boxes).
  - Studio Profile Customizer modal to update minimum performance fee (in INR ₹), sound rider, musical genres, artist bio, and social handles (Instagram, YouTube).
  - Quick action to open the 15-day rolling Schedule Manager.

### 2. Backend Server (`/server`)
- **Runtime**: Node.js with Express.js (TypeScript).
- **ORM**: Prisma ORM.
- **Database**: PostgreSQL (Prisma db push).
- **Authentication**: Firebase Authentication (Phone OTP primary, Passwordless Email Magic Link secondary) with Role-Based Access Control (`CUSTOMER`, `ARTIST`, `ADMIN`). Single Firebase ID token architecture verified server-side via `firebase-admin`. Immutable login phone credentials.
- **Communication**: REST endpoints + In-App Messaging threads.
- **Customer Profile & Discovery Services**:
  - `GET /api/users/me`: Returns user profile along with aggregated `activeBookingsCount` and `completedBookingsCount`.
  - `PUT /api/users/me`: Updates venue details (`name`, `venueName`, `city`, `contactPhone`) without mutating auth credentials.
  - `GET /api/artists`: Multi-dimensional discovery engine filtering by `date` (open slots only), budget range (`minFee`, `maxFee`), multi-genre selection (`genres`), `category`, and `search`.
  - `GET /api/artists/:id`: Specific verified artist details with aggregated `averageRating` and `reviewCount`.
- **Artist Studio & Profile Management Services**:
  - `GET /api/artists/my-profile`: Returns authenticated artist profile details and performance statistics (`completedGigsCount`, `upcomingGigsCount`, `pendingRequestsCount`, `averageRating`, `reviewCount`), strictly omitting any earnings calculations.
  - `PUT /api/artists/my-profile`: Updates artist fee (enforcing minimum ₹1,000 threshold), sound rider requirements, genres, bio, and social links with role-based validation.
- **Verified Reviews & Reputation Services**:
  - `POST /api/bookings/:id/review`: Allows only the booking customer to submit a 1–5 star verified review on `COMPLETED` bookings, with duplicate prevention and compliance tags.
  - `GET /api/artists/:id/reviews`: Public list of verified reviews for an artist with calculated `averageRating` and total `reviewCount`.
- **Payments (Razorpay Route escrow, behind `PAYMENTS_ENABLED`)**. See [workflows §4a](workflows.md) and [payments-test-mode.md](payments-test-mode.md).
  - `src/lib/payments/`: a `PaymentGateway` interface, the Razorpay adapter, and an in-memory fake (tests and keyless dev).
  - `src/services/payment.service.ts`: checkout, webhooks, confirmation, cancellation, disputes and the single settlement path. `src/services/payout.service.ts`: artist linked accounts.
  - Endpoints:
    - `GET /api/config`
    - `POST /api/bookings/:id/pay`
    - `GET /api/bookings/:id/payment-status`
    - `POST /api/bookings/:id/{complete,cancel,dispute}`
    - `GET|POST|PUT /api/artists/payout-account`
    - `GET /api/admin/disputes`
    - `POST /api/admin/disputes/:id/resolve`
    - `POST /api/webhooks/razorpay` (raw body, mounted before the JSON parser)
    - `GET /pay/:orderId` (hosted checkout page)

### 3. Core Entities
- **User**: Base account (`id`, `firebaseUid`, `email`, `phone`, `name`, `venueName`, `city`, `contactPhone`, `role`, `createdAt`, `updatedAt`).
- **ArtistProfile**: Linked to User (`artistName`, `category`, `genres`, `location`, `baseFee`, `bio`, `requirements`, `youtubeUrl`, `instagramUrl`, `verificationStatus: PENDING_VERIFICATION | VERIFIED | REJECTED`).
- **AvailabilitySlot**: Linked to ArtistProfile (`date`, `startTime`, `endTime`, `isBooked`).
- **Booking**: Linked to Customer and Artist (`slotId`, `eventLocation`, `eventType`, `status`, `notes`, `expiresAt`, `eventEndsAt`, `completedAt`, `amountPaise`, `paymentDueAt`, cancellation, dispute and resolution fields). The statuses are `REQUESTED | ACCEPTED | DECLINED | EXPIRED | COMPLETED | AWAITING_PAYMENT | PAYMENT_EXPIRED | CONFIRMED | DISPUTED | CANCELLED_BY_ARTIST | CANCELLED_BY_CUSTOMER | REFUNDED`.
- **Payment**: 1:1 with Booking. It holds the Razorpay order, payment and transfer ids, the amount and its split (in paise), `refundTargetPaise`, `refundedPaise` and `status`. It can't be deleted with its booking.
- **PaymentEvent**: The Razorpay webhook audit trail and idempotency key (`eventId` unique).
- **ArtistProfile payout fields**: `payoutAccountId`, `payoutProductId`, `payoutStatus`, `payoutLegalName`, `payoutIfsc`, `payoutAccountLast4`. PAN and the full account number are never stored.
- **Review**: Linked to Booking (1:1), ArtistProfile (N:1), and Customer User (N:1) (`rating: 1-5`, `comment`, `tags`, `createdAt`).
- **Message**: Linked to Booking/Conversation (`bookingId`, `senderId`, `content`, `createdAt`).

### Concurrency & Single-Offer Guarantee
To prevent double bookings and competing gig offers on the same night:
1. **Atomic Transactional Lock**: When `BookingService.createBooking` is invoked, it runs inside a Prisma `$transaction` that queries for any existing booking with status `REQUESTED` or `ACCEPTED` for that artist on that date.
2. If an active booking exists on that date, the request is immediately rejected with HTTP 409 Conflict.
3. Upon creating the booking in `REQUESTED` state, the corresponding `AvailabilitySlot` is atomically set to `isBooked = true`, removing it from the public catalog search.
4. If an artist chooses to `DECLINE` the request, the slot is atomically reset to `isBooked = false`, reopening the night for new bookings.
5. If the artist does not answer before `expiresAt` (48h TTL, capped at event start), `BookingService.expireStaleOffers()` marks the offer `EXPIRED` and releases the slot. Accept/decline transitions are guarded by `status = REQUESTED` in the update itself, so an offer that expires mid-response cannot be accepted.

### Production Configuration & Operations
- **Startup validation** (`server/src/config/env.ts`): the server refuses to start on invalid config. `DATABASE_URL` is required; in production, `FIREBASE_SERVICE_ACCOUNT` or `FIREBASE_PROJECT_ID` is required and `ALLOW_MOCK_AUTH=true` is rejected.
- **Mock auth**: `mock_*` tokens are honoured only under the test runner (`NODE_ENV=test`) or with `ALLOW_MOCK_AUTH=true` in development. They are never honoured in production. The mobile auth simulator is compiled in only for `__DEV__` builds.
- **Signup roles**: clients can self-register only as `CUSTOMER` or `ARTIST`. Admins are provisioned out-of-band.
- **HTTP hardening**: `helmet`, rate limits (`/api/auth` 50 requests per 15 minutes, `/api` 300 per minute, per IP), CORS allowlist via `CORS_ORIGINS`, `TRUST_PROXY` for load balancers, 100kb JSON body limit, JSON 404s and a central error handler. 5xx responses never include internal error text.
- **Logging**: access log of method, path, status, latency and IP. Request bodies are never logged.
- **Probes**: `GET /health` (liveness) and `GET /ready` (DB `SELECT 1`, returns 503 when unavailable).
- **Shutdown**: SIGTERM/SIGINT stop accepting connections, clear the offer-expiry sweep and disconnect Prisma, with a 10s forced exit if draining stalls.
- **Database**: deploy with `npm run db:migrate` (`prisma migrate deploy`). Migrations live in `server/prisma/migrations` (baseline `0_init`). For an existing database created with `db push`, baseline it once with `npx prisma migrate resolve --applied 0_init`.
- **Concurrency**: booking creation takes a Postgres transaction-scoped advisory lock per artist and date, and locks the slot with a conditional update. Two simultaneous requests can never both hold the same night.
- **Mobile builds**: `mobile/eas.json` defines development, preview and production profiles. Release builds require an https `EXPO_PUBLIC_API_URL` and fail fast without one.
- **CI** (`.github/workflows/ci.yml`): server typecheck, then migrate, seed and the full Jest suite against Postgres 16; mobile typecheck.
