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
- **Customer Experience Features**:
  - Slide-up bottom sheet filter modal with 15-day rolling calendar date selector, budget chips (< ₹20K, ₹20K–₹40K, ₹40K–₹70K, ₹70K+), and multi-select genres.
  - "Stagely Verified • Auditioned Live Stage Sound" trust badges on artist cards.
  - Pre-filled venue name & locality in booking forms directly from customer profile.
  - Dedicated `CustomerProfileScreen` with edit mode and active/completed gig statistics.

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

### 3. Core Entities
- **User**: Base account (`id`, `firebaseUid`, `email`, `phone`, `name`, `venueName`, `city`, `contactPhone`, `role`, `createdAt`, `updatedAt`).
- **ArtistProfile**: Linked to User (`artistName`, `category`, `genres`, `location`, `baseFee`, `bio`, `requirements`, `youtubeUrl`, `instagramUrl`, `verificationStatus: PENDING_VERIFICATION | VERIFIED | REJECTED`).
- **AvailabilitySlot**: Linked to ArtistProfile (`date`, `startTime`, `endTime`, `isBooked`).
- **Booking**: Linked to Customer and Artist (`slotId`, `eventLocation`, `eventType`, `status: REQUESTED | ACCEPTED | DECLINED | COMPLETED`, `notes`).
- **Message**: Linked to Booking/Conversation (`bookingId`, `senderId`, `content`, `createdAt`).
