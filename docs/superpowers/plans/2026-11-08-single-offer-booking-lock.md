# Single-Offer Booking Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce a strict single-offer-per-night booking constraint where an artist can have at most one active offer/booking for any date, automatically locking the slot upon booking request and unlocking it upon decline/cancellation/expiration.

**Architecture:** 
- Database Schema: Change `Booking.slotId` from unique 1:1 to 1:N on `AvailabilitySlot` so declined bookings do not prevent future booking requests on the same slot.
- Atomic Transaction (`BookingService.createBooking`): In a single `$transaction`, verify the slot is open and that the artist has NO other active booking (`REQUESTED` or `ACCEPTED`) on that same date. Atomically set `slot.isBooked = true` upon request creation.
- Release on Decline (`BookingService.respondToBooking`): When an artist declines (`DECLINED`), atomically set `slot.isBooked = false` so the slot and date reappear in catalog search.
- Date Collision Rejection: If a customer attempts to book any slot for an artist who already has an active offer or booking on that date, reject with `409 Conflict`.
- Mobile Dashboard & Search: Exclude slots with `isBooked: true` from discovery, and display the single exclusive offer on the artist dashboard.

**Tech Stack:** Express, TypeScript, Prisma (PostgreSQL), Jest, Supertest, React Native.

---

### Task 1: Update Prisma Schema & Push to Database
- **Files**: `server/prisma/schema.prisma`
- **Action**:
  - Remove `@unique` on `Booking.slotId` so a slot can record past declined bookings without blocking new requests after release.
  - In `AvailabilitySlot`, change relation to `bookings Booking[]`.
  - Run `prisma db push` and `prisma generate`.
- **Verification**: `npx prisma generate` succeeds without errors.

---

### Task 2: Implement Single-Offer Booking Service with Atomic Lock & Release (TDD)
- **Files**:
  - `server/tests/single_offer_booking.test.ts`
  - `server/src/services/booking.service.ts`
  - `server/src/routes/booking.routes.ts`
  - `server/src/types/index.ts`
- **Action**:
  - Write test suite `single_offer_booking.test.ts` covering:
    1. Creating a booking request immediately locks the slot (`slot.isBooked === true`).
    2. Attempting a second booking for the same artist on the same date (even with a different slot) is rejected with 409 conflict ("Artist already has an active offer or confirmed booking for this date").
    3. Attempting to book an already locked slot is rejected.
    4. Artist declining (`DECLINED`) the booking unlocks the slot (`slot.isBooked === false`).
    5. After being declined, the slot can be booked again by another customer.
    6. Artist accepting (`ACCEPTED`) locks the booking permanently.
  - In `booking.service.ts`:
    - Refactor `createBooking` to use `$transaction`:
      - Verify slot exists, belongs to artist, and `!slot.isBooked`.
      - Check for existing active booking (`status IN ['REQUESTED', 'ACCEPTED']`) for that artist on `slot.date`.
      - Create booking with `status: REQUESTED`.
      - Update slot with `isBooked: true`.
    - In `respondToBooking`:
      - If action is `DECLINED`, update booking status to `DECLINED` and set `slot.isBooked = false`.
      - If action is `ACCEPT`, update booking status to `ACCEPTED` and keep `slot.isBooked = true`.
- **Verification**: `npx jest tests/single_offer_booking.test.ts` passes 100%.

---

### Task 3: Regression Test Existing Booking Suites
- **Files**:
  - `server/tests/booking_flow.test.ts`
  - `server/tests/e2e_marketplace.test.ts`
  - `server/tests/e2e_customer_experience.test.ts`
- **Action**:
  - Run existing test suites to ensure backward compatibility with existing discovery, messaging, and review workflows.
- **Verification**: All server tests pass.

---

### Task 4: Update Mobile Dashboard & Schedule Screen Consistency
- **Files**:
  - `mobile/src/screens/artist/ArtistDashboardScreen.tsx`
  - `mobile/src/screens/artist/ScheduleManagerScreen.tsx`
- **Action**:
  - In `ArtistDashboardScreen.tsx`: Add badge or notice clarifying "Single Exclusive Offer" when in `REQUESTED` status, and indicate that declining will reopen the date for new offers.
  - In `ScheduleManagerScreen.tsx`: Ensure date with an active booking request is marked booked/held and cannot be toggled while active.
- **Verification**: Run TypeScript check `npx tsc --noEmit` in `mobile/`.

---

### Task 5: Documentation & Wiki Update
- **Files**:
  - `docs/wiki/architecture.md`
  - `docs/wiki/workflows.md`
- **Action**:
  - Update section 4 of `workflows.md` detailing the Single Exclusive Offer lifecycle (Atomic Lock on Request, Release on Decline).
  - Update `architecture.md` noting the concurrency control and date exclusion constraint.
- **Verification**: Git diff shows accurate documentation matching the new behavior.
