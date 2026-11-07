# Implementation Plan: Verified Reviews & Reputation Engine

This plan implements the **Verified Reviews & Reputation Engine** milestone on branch `feat/reviews-and-ratings`.

## User Review Requirements
- Every change is verified with tests before committing.
- Commit format: `type(scope): description`.
- Dedicated branch `feat/reviews-and-ratings` with a Pull Request raised via `gh pr create` before merging.
- Strictly no file reading permission prompts.

---

### Task 1: Database Schema & Migration
- **Files**: `server/prisma/schema.prisma`
- **Action**: Add `Review` model linked to `Booking` (1:1), `ArtistProfile` (1:N), and `User` (1:N). Run `npx prisma db push` and `npx prisma generate`.
- **Verification**: Database push succeeds, Prisma client generates types cleanly.

---

### Task 2: Backend Review Service, Routes & Unit Tests (TDD)
- **Files**:
  - `server/tests/reviews.test.ts`
  - `server/src/services/review.service.ts`
  - `server/src/routes/review.routes.ts`
  - `server/src/services/artist.service.ts`
  - `server/src/app.ts`
- **Action**:
  - Write unit tests in `reviews.test.ts` asserting:
    - Rejection if booking is not COMPLETED.
    - Rejection if requester is not the customer who booked it.
    - Rejection if rating < 1 or > 5.
    - Rejection if already reviewed (unique bookingId).
    - Success creation and calculation of average rating and total review count.
  - Implement `ReviewService` and route endpoints:
    - `POST /api/bookings/:id/review`
    - `GET /api/artists/:id/reviews`
  - Update `artist.service.ts` so `GET /api/artists/:id` and `GET /api/artists/my-profile` return `averageRating` and `reviewCount`.
- **Verification**: `npx jest tests/reviews.test.ts` passes 100%.

---

### Task 3: Mobile API Client Types & Endpoints
- **Files**: `mobile/src/services/api.ts`
- **Action**:
  - Add `Review`, `ReviewInput`, and `ArtistReviewsResponse` interfaces.
  - Add `submitBookingReview` and `getArtistReviews` API methods.
  - Update `Artist` and `ArtistStudioProfileResponse` to include `averageRating?: number | null` and `reviewCount?: number`.
- **Verification**: `npx tsc --noEmit` passes with 0 errors in `mobile/`.

---

### Task 4: Customer Review Modal in `MyBookingsScreen`
- **Files**: `mobile/src/screens/customer/MyBookingsScreen.tsx`
- **Action**:
  - For bookings with `status === 'COMPLETED'`, render **"★ Rate & Review Show"** button (or reviewed badge if already rated).
  - Implement full review modal:
    - Interactive 1–5 star rating picker.
    - Quick sound compliance tags (*"Punctual Soundcheck"*, *"Crystal-Clear Audio"*, *"High Crowd Energy"*, *"Great Song Selection"*, *"Professional Stage Presence"*).
    - Qualitative feedback text area.
    - Submit handler with instant optimistic update / re-fetch.
- **Verification**: `npx tsc --noEmit` passes with 0 errors.

---

### Task 5: Verified Stage Reviews on `ArtistDetailScreen`
- **Files**: `mobile/src/screens/customer/ArtistDetailScreen.tsx`
- **Action**:
  - Add star rating summary badge in the artist header (`⭐ 4.9 (18 reviews)`).
  - Add **"Verified Stage Reviews"** section displaying authentic venue reviews with star ratings, venue attribution, and compliance tags.
  - Add friendly empty state if no reviews exist yet.
- **Verification**: `npx tsc --noEmit` passes with 0 errors.

---

### Task 6: End-to-End Test & Project Wiki Documentation
- **Files**:
  - `server/tests/e2e_reviews.test.ts`
  - `docs/wiki/architecture.md`
  - `docs/wiki/workflows.md`
- **Action**:
  - Write and run full E2E test covering the complete review lifecycle: booking completion -> review submission -> public artist detail rating updates -> studio profile rating update.
  - Run full server test suite (`npm test`) ensuring all test suites pass.
  - Update Project Wiki documentation.
- **Verification**: Full server test suite passes 100%.

---

### Task 7: Push & Open Pull Request
- **Files**: Entire branch `feat/reviews-and-ratings`
- **Action**:
  - Push branch to `origin/feat/reviews-and-ratings`.
  - Create Pull Request using `gh pr create`.
  - Present PR link to the user.
- **Verification**: PR exists on GitHub and link is verified.
