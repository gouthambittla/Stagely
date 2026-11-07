# Stagely: Customer Experience Design Document
## Profile Management, Discovery Filters, Verified Badges & Streamlined Booking

**Date:** 2026-10-28  
**Status:** Ready for Review  
**Target Platform:** Mobile (iOS & Android via React Native Expo) + Node.js/Express Backend  

---

## 1. Intent & The Why
Event bookers, pub managers, and private hosts in India (centered around Hyderabad) rely on Stagely to discover and book vetted live talent without intermediaries or fraud. 

While the MVP provided the basic discovery catalog, rolling 15-day slot requests, and in-app messaging, four critical customer needs remain unaddressed:
1. **Host Profile Overhead:** Customers must repeatedly re-type their venue name and location for every booking request.
2. **Coarse Discovery:** Customers cannot filter artists by specific event dates (e.g., "Who is available this Saturday?"), budget brackets in INR ₹, or musical genres.
3. **Trust & Vetting Visibility:** While unverified artists are excluded on the backend, customer confidence requires explicit trust signals (e.g., "Stagely Verified", auditioned sound endorsement).
4. **Frictionless Booking & Transparency:** Booking requires clear fee summaries with zero hidden agency costs and direct continuity into logistics chat.

This design document specifies the architecture and user experience for the complete Customer side of Stagely.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
1. **Customer Profile Management:**
   - Dedicated "Profile" tab for Customers in mobile navigation.
   - Profile editor for Host Name, Venue/Organization Name (e.g., "Aura Brewery"), Default Locality (e.g., "Jubilee Hills"), and Contact Phone (+91).
   - Display summary of active and completed bookings.
   - Account security & logout actions.
2. **Verified Artist Trust Signals:**
   - Visual "Stagely Verified" badge with checkmark and clear vetting endorsement ("Auditioned & Vetted for Live Stage Sound").
   - Transparent performance fee display in Indian Rupees (INR ₹) with zero platform/middlemen markup.
   - Quick-access video/social links (YouTube live performance, Instagram profile).
3. **Multi-Dimensional Search & Filtering:**
   - Filter bottom sheet / modal in `ExploreScreen`:
     - **Date Availability:** Select specific calendar date to filter artists with open, unbooked slots on that date.
     - **Budget Range:** Tiered budget chips (< ₹20,000, ₹20,000–₹40,000, ₹40,000–₹70,000, ₹70,000+).
     - **Categories & Multi-Genre Selection:** Bands, Solo Musicians, Singers, DJs, Acoustic Duos; Rock, Bollywood, Sufi, Pop, Fusion.
     - **City & Coverage:** Primary search defaults to the entire metropolitan area (Hyderabad by default).
     - Active filter badge count, "Reset", and "Apply Filters".
4. **Streamlined Booking Experience:**
   - Pre-fill event venue location from customer's profile if available.
   - Interactive 15-day calendar slot selection with start and end times.
   - Upfront transparent pricing summary.
   - Seamless transition to in-app booking chat thread upon submission.

### Non-Goals
1. **In-App Payment Gateway / Escrow Integration:** Payments remain offline/direct agreement for this phase; no Razorpay/Stripe checkout SDK integration.
2. **Multiple Saved Venue Addresses:** Customers have a single primary venue/location in their profile for simplicity.
3. **Artist Reviews & Star Ratings:** Deferred to post-launch reputation milestone; admin vetting serves as the primary quality gate.

### Anti-Goals
- Never return `PENDING_VERIFICATION` or `REJECTED` artists in filtered results.
- Never allow a customer to request a slot that is already booked or outside the artist's availability window.
- Never expose unauthenticated endpoints for profile modification.

---

## 3. Approaches Considered & Selected

### Option 1: Lightweight Client-Side Filtering & Local Storage Cache
- **Summary:** Backend returns all verified artists; mobile client does date/budget/genre filtering in memory. Profile is stored in `AsyncStorage`.
- **Tradeoffs:** Quick to build, but fails to scale as artist count grows. Date filtering cannot reliably verify slots without huge payload transfers. Customer profile is lost across devices.
- **Verdict:** Rejected.

### Option 2: Full-Stack Integrated Engine with Prisma-Backed Filtering (Selected)
- **Summary:**
  - Backend: Extend Prisma `User` model with `venueName`, `city`, and `contactPhone`. Add `PUT /api/users/me` endpoint. Extend `GET /api/artists` with query filters (`minFee`, `maxFee`, `date`, `genres`, `category`, `location`).
  - Mobile: Dedicated `CustomerProfileScreen`, comprehensive Filter modal on `ExploreScreen`, elevated "Stagely Verified" badge, and streamlined booking flow with pre-filled venue data.
- **Tradeoffs:** Requires minor Prisma push and coordinated updates across `server/` and `mobile/`, but provides reliable database-level filtering, persistent profile across logins, and full automated Jest test coverage.
- **Verdict:** Approved by user.

### Option 3: Conversational Discovery Wizard ("Find Talent in 3 Steps")
- **Summary:** Replace catalog browsing with a 3-question guided wizard for event hosts.
- **Tradeoffs:** Adds friction for repeat bookers and venue managers who simply want to browse the roster.
- **Verdict:** Rejected.

---

## 4. Detailed Technical Specification & Resolved Architecture

### 4.1 Database Schema Updates (`server/prisma/schema.prisma`)
Update the `User` model to support customer venue details while preserving the immutable authenticated `phone` field:
```prisma
model User {
  id               Int            @id @default(autoincrement())
  firebaseUid      String         @unique
  email            String?        @unique
  phone            String?        @unique        // Primary authenticated Firebase phone
  name             String?
  venueName        String?                       // e.g., "Aura Brewery & Kitchen"
  city             String?                       // e.g., "Jubilee Hills, Hyderabad"
  contactPhone     String?                       // Event-day coordination number for host
  role             String                        // CUSTOMER, ARTIST, ADMIN
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  artistProfile    ArtistProfile?
  customerBookings Booking[]      @relation("CustomerBookings")
  sentMessages     Message[]      @relation("UserSentMessages")
}
```

### 4.2 Backend API Enhancements

#### 1. Profile Management Endpoints
- `GET /api/users/me`: Returns current user record including `venueName`, `city`, `contactPhone`, `phone`, `name`, and computed booking stats:
  - `activeBookingsCount`: Count of bookings where `status === 'REQUESTED'` OR (`status === 'ACCEPTED'` AND `slot.date >= today`).
  - `completedBookingsCount`: Count of bookings where `status === 'ACCEPTED'` AND `slot.date < today`.
- `PUT /api/users/me`: Updates `name`, `venueName`, `city`, and `contactPhone`. Role-protected via `verifyFirebaseAuth`. Does NOT mutate `phone` or `firebaseUid` to protect authentication integrity.

#### 2. Advanced Discovery Query Filters (`GET /api/artists`)
Query Parameters:
- `search?: string` (partial case-insensitive match on `artistName`, `bio`, or `genres`)
- `category?: string` (exact match on `category`)
- `genres?: string` (comma-separated list of genres; matches if artist contains any of the specified genres)
- `minFee?: number` (Prisma `baseFee: { gte: minFee }`)
- `maxFee?: number` (Prisma `baseFee: { lte: maxFee }`)
- `location?: string` (defaults to city-wide matching; Hyderabad artists service the entire city by default)
- `date?: string` (YYYY-MM-DD: checks `availabilitySlots: { some: { date: date, isBooked: false } }`)

### 4.3 Mobile Client Architecture (`mobile/`)

#### 1. Navigation Updates (`mobile/src/navigation/RootNavigator.tsx`)
Update Customer Tab Navigator to 3 tabs:
1. **Explore Tab**: `ExploreScreen` (Search, Filter modal, Verified Artists FlatList) & `ArtistDetailScreen` (Modal stack).
2. **Bookings Tab**: `MyBookingsScreen` & `ChatScreen`.
3. **Profile Tab**: `CustomerProfileScreen` (Profile details, Edit mode, Logout).

#### 2. Screen Implementations
- **`CustomerProfileScreen.tsx`**:
  - Displays user avatar initial, Name, Role badge (`CUSTOMER / HOST`), Venue Name, Location, Event-day Contact Phone, Email.
  - "Edit Profile" mode with inputs for Name, Venue Name, Location, Contact Phone.
  - Summary cards: "Upcoming & Active Bookings", "Past Events".
  - "Sign Out" button with confirmation alert.
- **`ExploreScreen.tsx` Filter Modal**:
  - Clean floating Filter button showing active filter count badge.
  - Bottom sheet with:
    - **Date Selector**: Horizontal scroll of next 15 days or "Any Date".
    - **Budget Selector**: Quick chips: All, < ₹20K, ₹20K–₹40K, ₹40K–₹70K, ₹70K+.
    - **Genre Selector**: Multi-select chips for Telugu Rock, Bollywood, Acoustic, Sufi, Pop, Jazz.
    - Action bar: "Clear All" and "Apply Filters".
- **`ArtistDetailScreen.tsx` Trust & Booking Polish**:
  - Trust card: Green checkmark badge, "Verified Live Act - Backline & Sound Audited".
  - Pricing transparency banner: `₹[baseFee] Standard 2-Hour Performance | Zero Platform Fee`.
  - Auto-fill Venue Location in booking form from Customer's saved `venueName` and `city`.

---

## 5. What is Left to the Builder
- Exact layout padding, dark mode color constants (`#0F172A`, `#1E293B`, `#38BDF8`, `#10B981`), and icon choices using `lucide-react-native`.
- Prisma index optimizations for `AvailabilitySlot (date, isBooked)`.
- Automated test coverage in `server/tests/`:
  - `profile_update.test.ts`: Authenticated customer updates profile; unauthenticated returns 401; asserts `phone` and `firebaseUid` remain intact.
  - `filter_artists.test.ts`: Filter by date checks slot availability; budget range assertions; multi-genre query assertions.
