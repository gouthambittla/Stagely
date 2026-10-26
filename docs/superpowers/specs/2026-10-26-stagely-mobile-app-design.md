# Stagely: Mobile Application Design Document

**Date:** 2026-10-26  
**Status:** Approved  
**Target Platform:** Mobile (iOS & Android via React Native Expo) + Node.js/Express Backend  

---

## 1. Intent & The Why
Live music and live performances are experiencing rapid growth across India, especially in metropolitan cultural hubs like Hyderabad. Pubs, bars, clubs, wedding planners, and private party hosts actively seek live bands, solo musicians, dancers, and performance artists. 

However, booking live talent today is fragmented, reliant on word-of-mouth or informal agency contacts, prone to fraud (impersonation/fake bands), and lacks clear scheduling transparency.

**Stagely** is a two-sided mobile marketplace that bridges the gap between live performing artists and customers/event hosts. It simplifies artist onboarding, enforces manual admin verification to guarantee authenticity, and provides a clear request-and-accept booking system with rolling 15-day availability.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
1. **Two-Sided Mobile Experience**: Seamless role-based mobile experience for both Customers (hosts/bookers) and Artists.
2. **Artist Onboarding Wizard**: A flexible multi-step setup collecting:
   - Artist/Band Name, Primary Category (Musician, Band, Solo, Dancer, etc.), and Genres.
   - Base City/Location (e.g., Hyderabad, Bengaluru, etc.).
   - Standard Performance Fee (in INR ₹).
   - Bio, YouTube performance link, Instagram handle.
   - Basic Stage & Sound Requirements (e.g., "Needs 2 vocal mics and standard PA", "Brings own acoustic amp").
   - Rolling 15-Day Availability Calendar (selecting available dates/time slots).
3. **Manual Verification Gate**: All new artist profiles enter `PENDING_VERIFICATION` status. An Admin review workflow allows platform admins to vet artists personally and mark them `VERIFIED`.
4. **Customer Discovery**: Public browsing of `VERIFIED` artists only, filterable by genre, city, and date.
5. **Request-to-Book Lifecycle**:
   - Customer picks an available slot and submits an event booking request.
   - Initial status: `REQUESTED`.
   - Artist receives notification/alert in their dashboard and can **Accept** or **Decline**.
   - If accepted: transitions to `ACCEPTED` / `CONFIRMED`.
6. **In-App Messaging**: Direct chat thread between customer and artist created upon booking request to coordinate event logistics.
7. **Role Dashboards**:
   - Artist: Incoming booking requests, schedule manager, profile editor.
   - Customer: Active bookings, pending requests, and booking history.

### Non-Goals (MVP Scope)
1. **Anti-Leakage Phone Masking / Escrow**: Gray-boxed for this phase; no VoIP masking or escrow deposit logic.
2. **Complex Equipment Negotiation Engine**: No dynamic sound engineer add-on marketplace; simple text-based stage requirement disclosure is sufficient.
3. **Custom Video Streaming / Reels Player**: No in-app video uploads or reel feed; external verified links (YouTube / Instagram) used instead.
4. **Automated AI Verification**: Manual personal review by admin is the primary verification mechanism; AI-assisted verification is deferred to later versions.

### Anti-Goals
- Never display `PENDING_VERIFICATION` or `REJECTED` artists in public search results.
- Never automatically confirm a booking slot without explicit artist acceptance.

---

## 3. Architecture & Tech Stack

### Selected Approach: Option A (React Native Expo + Node.js Backend)
* **Mobile Client (`/apps/mobile` or `/client`)**:
  - Framework: React Native with **Expo SDK** (TypeScript).
  - Navigation: Expo Router or React Navigation (native tabs and stacks).
  - UI Styling: NativeWind (Tailwind CSS for React Native) or React Native Paper / custom polished components.
  - Testing & Dev: Instant mobile testing on iOS & Android devices using Expo Go.
* **Backend API (`/apps/server` or `/server`)**:
  - Runtime: Node.js with Express.js (TypeScript).
  - Database: PostgreSQL (with SQLite support for zero-config local development).
  - ORM: Prisma ORM for schema migrations and type-safe database queries.
  - Auth: JWT-based authentication with role claims (`CUSTOMER`, `ARTIST`, `ADMIN`).
  - Chat: WebSockets (Socket.io) or database-backed polling/REST messaging.

### Alternatives Considered & Rejected
1. **Flutter (Dart)**: Compiles to native code, but requires Dart and heavy Android SDK/emulator setups locally. Rejected in favor of unified TypeScript.
2. **Mobile-First PWA (Next.js)**: Runs in browser, but lacks native gesture fluidity, native bottom sheets, and native push alert reliability required for booking notifications.

---

## 4. Key Workflows & State Machines

### 4.1 Artist Verification State Machine
```
[User Signs Up as Artist]
           │
           ▼
[Completes Onboarding Form & 15-Day Calendar]
           │
           ▼
[Status: PENDING_VERIFICATION] (Hidden from public catalog)
           │
   Admin Review Portal
     ├── Approve ──▶ [Status: VERIFIED] (Live in search, badge displayed)
     └── Reject  ──▶ [Status: REJECTED] (Prompted to update info)
```

### 4.2 Booking State Machine
```
[Customer Selects Open Slot & Submits Request]
           │
           ▼
[Status: REQUESTED] ──▶ In-App Chat Thread Created
           │
    Artist Decision
     ├── Accept  ──▶ [Status: ACCEPTED / CONFIRMED] (Slot locked on calendar)
     └── Decline ──▶ [Status: DECLINED] (Slot released back to open)
```

---

## 5. What is Left to the Builder
- Detailed Prisma database schema naming and relations.
- Exact REST API route definitions (`/api/auth/*`, `/api/artists/*`, `/api/bookings/*`, `/api/admin/*`, `/api/messages/*`).
- Screen layout hierarchy and navigation tab configuration (Tabs: Explore, Bookings, Messages, Profile).
- Seed script with mock Hyderabad artists (e.g., Telugu rock bands, acoustic duos, jazz performers) and sample slots for immediate testing.
