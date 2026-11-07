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

### 3. Core Entities
- **User**: Base account (`id`, `firebaseUid`, `email`, `phone`, `name`, `venueName`, `city`, `contactPhone`, `role`, `createdAt`, `updatedAt`).
- **ArtistProfile**: Linked to User (`artistName`, `category`, `genres`, `location`, `baseFee`, `bio`, `requirements`, `youtubeUrl`, `instagramUrl`, `verificationStatus: PENDING_VERIFICATION | VERIFIED | REJECTED`).
- **AvailabilitySlot**: Linked to ArtistProfile (`date`, `startTime`, `endTime`, `isBooked`).
- **Booking**: Linked to Customer and Artist (`slotId`, `eventLocation`, `eventType`, `status: REQUESTED | ACCEPTED | DECLINED | COMPLETED`, `notes`).
- **Review**: Linked to Booking (1:1), ArtistProfile (N:1), and Customer User (N:1) (`rating: 1-5`, `comment`, `tags`, `createdAt`).
- **Message**: Linked to Booking/Conversation (`bookingId`, `senderId`, `content`, `createdAt`).
