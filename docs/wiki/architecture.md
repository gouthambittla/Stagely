# System Architecture & Tech Stack

## Architectural Choice: Option A (React Native Expo + Node.js Backend)

### 1. Mobile Client (`/apps/mobile` or `/client`)
- **Framework**: React Native with **Expo SDK** (TypeScript), following standards defined in [Senior React Native](../../.agents/skills/senior-react-native/SKILL.md).
- **Navigation**: Native tab navigation (Explore, Bookings, Messages, Profile) & stack modals (using native `formSheet` presentations).
- **Styling**: Native styling following Apple HIG & Material 3 conventions, avoiding generic AI web-like modal anti-patterns.
- **Security**: `expo-secure-store` for JWT auth credentials (never insecure `AsyncStorage`).
- **Screen States**: Every screen loading dynamic data strictly implements the 4 states: *Loading*, *Error*, *Empty*, and *Content*.
- **Target OS**: Android & iOS.
- **Device Features**: Camera/photo gallery for profile avatar, native date pickers for schedule management, push notifications for booking requests.

### 2. Backend Server (`/apps/server` or `/server`)
- **Runtime**: Node.js with Express.js (TypeScript).
- **ORM**: Prisma ORM.
- **Database**: PostgreSQL (SQLite supported locally for friction-free prototyping).
- **Authentication**: JWT with Role-Based Access Control (`CUSTOMER`, `ARTIST`, `ADMIN`).
- **Communication**: REST endpoints + In-App Messaging threads.

### 3. Core Entities
- **User**: Base account (`id`, `email`, `passwordHash`, `role`, `createdAt`).
- **ArtistProfile**: Linked to User (`artistName`, `category`, `genres`, `location`, `fee`, `bio`, `requirements`, `youtubeUrl`, `instagramUrl`, `verificationStatus: PENDING_VERIFICATION | VERIFIED | REJECTED`).
- **AvailabilitySlot**: Linked to ArtistProfile (`date`, `startTime`, `endTime`, `isBooked`).
- **Booking**: Linked to Customer and Artist (`slotId`, `eventLocation`, `eventType`, `status: REQUESTED | ACCEPTED | DECLINED | COMPLETED`, `notes`).
- **Message**: Linked to Booking/Conversation (`senderId`, `receiverId`, `content`, `timestamp`).
