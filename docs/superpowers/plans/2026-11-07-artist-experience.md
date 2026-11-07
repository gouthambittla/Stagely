# Artist Studio & Profile Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full Artist Studio & Profile Management: lifetime gross earnings & gig analytics, full profile editor (base fee in INR ₹, sound & PA requirements rider, genres, bio, YouTube/Instagram links), and integration into the mobile navigation. When complete, raise a GitHub Pull Request before merging.

**Branch:** `feat/artist-experience`

**Spec:** [docs/superpowers/specs/2026-11-07-artist-experience-design.md](file:///D:/Stagely/docs/superpowers/specs/2026-11-07-artist-experience-design.md)

---

### Task 1: Backend Profile Update & Earnings Calculation API

**Files:**
- Create: `server/tests/artist_studio.test.ts`
- Modify: `server/src/routes/artist.routes.ts`
- Modify: `server/src/services/artist.service.ts`

- [ ] **Step 1: Write failing test for `GET /api/artists/my-profile` analytics & `PUT /api/artists/my-profile`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `updateArtistProfile` service & routes**
- [ ] **Step 4: Run test to verify pass**
- [ ] **Step 5: Commit**

---

### Task 2: Mobile API Client Service & Types Extension

**Files:**
- Modify: `mobile/src/services/api.ts`

- [ ] **Step 1: Add `updateArtistProfile` method and typed response interface**
- [ ] **Step 2: Run TypeScript check (`npx tsc --noEmit`) to verify clean compilation**
- [ ] **Step 3: Commit**

---

### Task 3: Mobile Artist Studio Screen Implementation

**Files:**
- Create: `mobile/src/screens/artist/ArtistStudioScreen.tsx`

- [ ] **Step 1: Implement `ArtistStudioScreen` with 4 states, earnings stat cards, sound rider preview, and edit mode**
- [ ] **Step 2: Run TypeScript check (`npx tsc --noEmit`) to verify clean compilation**
- [ ] **Step 3: Commit**

---

### Task 4: Mount Artist Studio Screen in Navigation

**Files:**
- Modify: `mobile/src/navigation/RootNavigator.tsx`

- [ ] **Step 1: Replace placeholder profile tab with `ArtistStudioScreen`**
- [ ] **Step 2: Run TypeScript check (`npx tsc --noEmit`) to verify clean compilation**
- [ ] **Step 3: Commit**

---

### Task 5: End-to-End Verification & Wiki Documentation

**Files:**
- Create: `server/tests/e2e_artist_studio.test.ts`
- Modify: `docs/wiki/architecture.md`
- Modify: `docs/wiki/workflows.md`

- [ ] **Step 1: Create `server/tests/e2e_artist_studio.test.ts`**
- [ ] **Step 2: Run full backend test suite (`npm test`)**
- [ ] **Step 3: Run mobile TypeScript verification (`npx tsc --noEmit`)**
- [ ] **Step 4: Update Project Wiki documentation**
- [ ] **Step 5: Commit**

---

### Task 6: Push Branch & Raise Pull Request

- [ ] **Step 1: Push `feat/artist-experience` to GitHub**
- [ ] **Step 2: Raise PR using GitHub CLI (`gh pr create`)**
