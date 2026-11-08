# Design Specification: Verified Reviews & Reputation Engine

## 1. Overview
Stagely relies on trust between venue hosts/event planners and performing live artists. To eliminate informal, unverifiable claims and ensure live sound quality standards, this milestone introduces a **Verified Reviews & Reputation Engine** (`feat/reviews-and-ratings`).

Only customers who have a confirmed and **COMPLETED** booking can submit a review. Reviews are publicly attached to the artist's profile, boosting discovery visibility for top-rated acts.

---

## 2. Core Personas & Use Cases

### Customer (Venue Manager / Event Host)
- Views completed bookings in `MyBookingsScreen`.
- Clicks **"Rate and Review Show"** for a completed gig.
- Selects 1–5 stars, writes qualitative feedback, and selects sound/performance tags (e.g., *"Flawless Live Sound Mix"*, *"Punctual Soundcheck"*, *"Electrifying Crowd Energy"*).
- Submits review, which is instantly locked to that specific `bookingId`.

### Booker / Event Planner (Discovery Phase)
- Browses artists on `ExploreScreen` and `ArtistDetailScreen`.
- Sees verified rating stars and review count (e.g. ⭐ 4.9 (18 reviews)).
- Reads authentic feedback from verified local venues (e.g., "Prost Jubilee Hills", "Fat Pigeon").

### Artist (Studio Phase)
- Views their live average rating and total review count in `ArtistStudioScreen` alongside completed shows.
- Knows that building a reputation on Stagely leads to higher booking volume.

---

## 3. Database Schema (`server/prisma/schema.prisma`)

Add a `Review` model:
```prisma
model Review {
  id         Int           @id @default(autoincrement())
  bookingId  Int           @unique
  booking    Booking       @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  artistId   Int
  artist     ArtistProfile @relation(fields: [artistId], references: [id], onDelete: Cascade)
  customerId Int
  customer   User          @relation(fields: [customerId], references: [id])
  rating     Int           // 1 to 5 integer
  comment    String?
  tags       String?       // JSON string array e.g. ["Punctual", "Great Crowd Energy"]
  createdAt  DateTime      @default(now())
}
```

Relationships:
- `Booking` has optional 1:1 relation to `Review`.
- `ArtistProfile` has 1:Many relation to `Review`.
- `User` has 1:Many relation to `Review` as author/customer.

---

## 4. API Endpoints

### 4.1 `POST /api/bookings/:id/review`
- **Auth**: Customer who booked the gig.
- **Preconditions**:
  - `booking.status === 'COMPLETED'`.
  - Booking belongs to authenticated user.
  - No existing review for this `bookingId` (1 review per booking).
- **Body**:
  - `rating`: integer from 1 to 5 (required).
  - `comment`: optional string.
  - `tags`: optional string array (e.g. `["Sound Quality", "Punctual"]`).
- **Response**: 201 Created with created `Review` object.

### 4.2 `GET /api/artists/:id/reviews`
- **Auth**: Public or authenticated.
- **Response**:
  - `reviews`: Array of reviews including `id`, `rating`, `comment`, `tags`, `createdAt`, and customer info (`name`, `venueName`, `city`).
  - `averageRating`: Float rounded to 1 decimal place (e.g., 4.8) or `null` if 0 reviews.
  - `reviewCount`: Total count of reviews.

### 4.3 Enhanced `GET /api/artists` and `GET /api/artists/:id`
- Include aggregated `averageRating` and `reviewCount` in artist profile response.

### 4.4 Enhanced `GET /api/artists/my-profile`
- Include aggregated `averageRating` and `reviewCount` in studio profile response.

---

## 5. Mobile UI & Client Experience

### 5.1 `MyBookingsScreen`
- For completed bookings:
  - If not yet reviewed: Displays prominent gold **"★ Rate & Review Show"** button.
  - If already reviewed: Displays **"★ Rated {rating}/5"** badge with review summary.
- Review Modal:
  - Interactive 5-star rating selector.
  - Preset quick tags:
    - *"Punctual Soundcheck"*
    - *"Crystal-Clear Audio"*
    - *"High Crowd Energy"*
    - *"Great Song Selection"*
    - *"Professional Stage Presence"*
  - Review notes input.
  - Submit button with loading spinner and error handling.

### 5.2 `ArtistDetailScreen`
- Header summary: `⭐ {averageRating} ({reviewCount} reviews)` badge.
- Dedicated **"Verified Stage Reviews"** section:
  - Shows list of verified review cards with venue attribution.
  - Displays tags as gold/dark chips.
  - Empty state when no reviews yet: *"Be the first venue to review this artist after their show!"*

### 5.3 `ArtistStudioScreen`
- Adds Average Rating card in the metrics row alongside Completed Shows, Upcoming Gigs, and Pending Requests.

---

## 6. Verification & Quality Gates
- **Server TDD**: `server/tests/reviews.test.ts` and `server/tests/e2e_reviews.test.ts`.
- **Database Push**: `npx prisma db push` in `server/`.
- **Client TypeScript**: `npx tsc --noEmit` passing with 0 errors in `mobile/`.
- **Project Wiki**: Update `docs/wiki/architecture.md` and `docs/wiki/workflows.md`.
