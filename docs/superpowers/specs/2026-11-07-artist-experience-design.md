# Stagely: Artist Studio & Profile Manager Design Document

**Date:** 2026-11-07  
**Status:** In Review  
**Branch:** `feat/artist-experience`  
**Target Platform:** Mobile (React Native Expo) + Node.js/Express Backend  

---

## 1. Intent & Problem Statement
Performing live bands and solo musicians across Hyderabad need continuous control over their public portfolio and gig operations. Currently, after completing the onboarding wizard, the artist cannot:
1. Update their performance fee in INR ₹ as their market demand grows.
2. Update their stage and sound technical rider (e.g. changing vocal mic counts, PA specs, drum monitor needs).
3. Update musical genre tags, bio, or links to recent live YouTube and Instagram performances.
4. Track career metrics on Stagely: total earnings in INR ₹, completed shows, and pending venue requests.

This document designs the **Artist Studio & Profile Manager** to transform the Artist profile tab into an operational hub for live talent.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
1. **Full Profile Customization**:
   - Enable artists to edit their **Base Performance Fee (INR ₹)**, **Stage & Sound Rider**, **Genres**, **Bio**, and **Social Media Performance Links (YouTube / Instagram)**.
2. **Gig Analytics & Earnings Transparency**:
   - Provide clear lifetime metrics on the Artist Studio dashboard:
     - `totalEarnings`: Total INR ₹ earned from `COMPLETED` bookings.
     - `completedGigsCount`: Total successfully completed live performances.
     - `pendingRequestsCount`: Booking requests awaiting review.
     - `upcomingGigsCount`: Confirmed shows scheduled for upcoming dates.
3. **Seamless Studio UI & 4-State Architecture**:
   - Replace the static placeholder tab in `RootNavigator.tsx` with `ArtistStudioScreen.tsx` implementing Loading, Error, Empty, and Content states.
   - Quick one-tap access to the 15-day Schedule Manager and native alert Sign Out.
4. **Strict Security & Verification Integrity**:
   - Artists cannot self-grant `VERIFIED` status; `verificationStatus` remains strictly controlled by the Admin review gate.
   - All profile edits validated server-side.

### Non-Goals
1. **In-App Payout Gateways**: Payments remain direct/offline settlement for this milestone; no bank account IFSC payout transfers.
2. **Direct In-App Video Uploads**: External video hosting (YouTube / Instagram) remains the standard to keep mobile client lightweight and avoid CDN media storage costs.

### Anti-Goals
- Never allow an artist to modify another artist's profile.
- Never reset `verificationStatus` to `PENDING_VERIFICATION` on non-critical edits (fee, bio, sound rider).

---

## 3. Detailed Technical Specification

### 3.1 Backend Endpoints (`server/src/routes/artist.routes.ts`)

#### 1. Enhanced `GET /api/artists/my-profile`
- **Auth**: Required (`UserRole.ARTIST`).
- **Response**:
  ```json
  {
    "profile": {
      "id": 1,
      "artistName": "Jammers Hyderabad",
      "category": "Band",
      "genres": "[\"Fusion Rock\",\"Tollywood Retro\"]",
      "location": "Hyderabad",
      "baseFee": 35000,
      "bio": "Top-rated 5-piece Hyderabad live band...",
      "requirements": "Full PA sound system, 3 vocal microphones...",
      "youtubeUrl": "https://youtube.com/@jammersband",
      "instagramUrl": "https://instagram.com/jammers_hyd",
      "verificationStatus": "VERIFIED"
    },
    "stats": {
      "totalEarnings": 105000,
      "completedGigsCount": 3,
      "pendingRequestsCount": 1,
      "upcomingGigsCount": 2
    }
  }
  ```

#### 2. `PUT /api/artists/my-profile`
- **Auth**: Required (`UserRole.ARTIST`).
- **Request Body**:
  ```json
  {
    "artistName": "Jammers Hyderabad Live",
    "category": "Band",
    "genres": ["Fusion Rock", "Indie Rock", "Tollywood"],
    "baseFee": 40000,
    "bio": "Updated bio...",
    "requirements": "4 Vocal Mics, 2 Monitors, Stereo DI",
    "youtubeUrl": "https://youtube.com/@jammersband",
    "instagramUrl": "https://instagram.com/jammers_hyd"
  }
  ```
- **Validation**:
  - `baseFee` must be >= 1000.
  - Whitelist fields only. `verificationStatus`, `userId`, `id` are discarded.

---

### 3.2 Mobile Architecture (`mobile/src/screens/artist/ArtistStudioScreen.tsx`)

1. **Header & Verification Pill**:
   - Artist Name, Category, and status badge (`VERIFIED` in emerald green, `PENDING` in amber).
2. **Metrics Grid (4 Stat Cards)**:
   - Lifetime Gross Earnings (`₹[totalEarnings]`).
   - Completed Shows (`[completedGigsCount]`).
   - Upcoming Gigs (`[upcomingGigsCount]`).
   - Pending Requests (`[pendingRequestsCount]`).
3. **Live Profile Card & Sound Rider**:
   - Preview of how venue managers see their card.
   - Sound rider card with microphone icon and clear equipment checklist.
   - Clickable YouTube and Instagram buttons.
4. **Edit Mode Form**:
   - Base fee input with currency prefix `₹`.
   - Category picker & multi-genre chip selector.
   - Stage rider multiline text input.
   - Bio multiline text input.
   - YouTube and Instagram link inputs.
   - "Save Changes" and "Cancel" actions.
5. **Quick Studio Actions**:
   - "Manage 15-Day Availability" (opens `ScheduleManagerScreen`).
   - "Sign Out" with confirmation alert.

---

## 4. Verification & Testing Strategy
1. **Unit & API Tests (`server/tests/artist_studio.test.ts`)**:
   - Assert `GET /api/artists/my-profile` returns accurate earnings calculation.
   - Assert `PUT /api/artists/my-profile` updates fee, sound rider, and links.
   - Assert non-artists receive 403 Forbidden.
   - Assert attempting to mutate `verificationStatus` is ignored.
2. **End-to-End Suite (`server/tests/e2e_artist_studio.test.ts`)**:
   - Artist onboards -> updates profile -> receives booking -> completes gig -> verifies earnings increment.
3. **Mobile Client Verification**:
   - Run `npx tsc --noEmit` to verify type safety.
