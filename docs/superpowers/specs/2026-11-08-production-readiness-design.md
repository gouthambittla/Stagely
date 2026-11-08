# Production Readiness Hardening — Design

**Date:** 2026-11-08
**Requested by:** project owner ("go through the repo, make the improvements, production level code; do it without asking questions; raise a separate PR").
**Decision mode:** owner was away and opted out of questions. Every call below is Claude's, listed so it can be reviewed in the PR.

## Intent
Close the gaps that would make Stagely unsafe or fragile in a real deployment (security holes, leaky errors, unguarded config, race conditions, missing ops basics) without changing product behaviour or rewriting working features.

## How findings were gathered
Two read-only audits (server, mobile) plus a repo-level pass (git hygiene, CI, migrations). Critical claims were re-verified by reading the code before acting.

## Goals (in this PR)
### Server — security
1. **Privilege escalation at signup**: `POST /api/auth/complete-signup` trusted `role` from the body, so anyone could self-register as `ADMIN`. Whitelist `CUSTOMER | ARTIST`.
2. **Mock-token auth bypass**: `mock_*` tokens were accepted whenever `NODE_ENV !== 'production'` (unset/typo ⇒ full admin bypass). Now only when `NODE_ENV === 'test'` or `ALLOW_MOCK_AUTH=true`, and never in production (startup refuses that combination).
3. **Firebase init**: a bad `FIREBASE_SERVICE_ACCOUNT` fails fast instead of silently falling back (and no longer logs the parse error that can echo the credential).
4. **Request logging**: stop logging request bodies (they contain Firebase ID tokens, phone numbers, messages). Log method, path, status, duration only.
5. **Error responses**: central error handler; 5xx responses return a generic message (no Prisma/internal text); 4xx keep their intentional messages. JSON 404 handler; malformed JSON → 400.
6. **Input validation**: positive-integer id parsing on all `:id` routes (400 instead of leaking Prisma errors); length limits on booking text fields and messages; empty messages rejected.
7. **Authorization**: only `CUSTOMER`s can create bookings; artists can't book themselves. Permission/not-found service errors return 403/404 instead of 400.
8. **HTTP hardening**: `helmet`, rate limiting (strict on `/api/auth`, general on `/api`), CORS allowlist via `CORS_ORIGINS` (permissive when unset, since native apps don't send `Origin`), `trust proxy` via env.

### Server — correctness & ops
9. **Double-booking race**: two concurrent requests could both pass the `isBooked` read. Slot lock becomes a conditional update (`isBooked=false → true`, must affect 1 row), and same-artist-same-date requests serialize on a Postgres transaction-scoped advisory lock.
10. **Env validation at startup** (zod): `DATABASE_URL` required, `PORT` numeric, etc. Remove the hardcoded LAN IP from startup logs.
11. **Graceful shutdown**: stop accepting connections, clear the expiry sweep, `prisma.$disconnect()`, forced-exit timeout; log `unhandledRejection` / exit on `uncaughtException`.
12. **Readiness probe**: `GET /ready` runs `SELECT 1` (503 on failure); `/health` stays a cheap liveness check.
13. **Indexes** for the hot queries (bookings by customer/artist/slot/status/expiry, messages by booking, reviews by artist, artists by verification status).
14. **Migrations**: add a baseline Prisma migration and `db:migrate` (`prisma migrate deploy`) for deployments; `db:push` stays for local prototyping.
15. **Case-insensitive search** (Postgres `mode: 'insensitive'`).
16. Delete dead route files (`routes/users.ts`, `routes/artists.ts`); fix `.env.example` (drop unused `JWT_SECRET`, document Firebase/CORS/mock-auth vars).

### Mobile
17. **API base URL**: release builds use only `EXPO_PUBLIC_API_URL` (must be https); Metro host / emulator fallbacks only in `__DEV__`.
18. **Mock auth in release**: every simulated-auth fallback (OTP `123456`, fake email links, `mock_customer_token`) gated behind `__DEV__`; release builds surface the real error.
19. **API client**: 15s timeout, `ApiError` carrying HTTP status, safe error-body parsing, dev-only logging (no PII in release logs).
20. **Error boundary** around the app; missing `.catch` on promise chains.
21. `eas.json` with development / preview / production profiles; declare `expo-constants` dependency.

### Repo
22. **CI** (GitHub Actions): server type-check + full test suite against a Postgres service (migrate + seed), mobile type-check.

## Non-goals (deliberately deferred — need product decisions or device testing)
- **Booking → COMPLETED transition.** Nothing ever marks a booking `COMPLETED`, so reviews can never be submitted in production. Real bug, but choosing *who/when* completes a gig is a product decision → top follow-up.
- Converting string columns to Prisma enums / `String[]` / `Json` (data migration risk).
- Mobile navigation rewrite to React Navigation stacks (Android back button, deep links) — needs device testing.
- Chat send-failure UX and polling backoff; per-screen error states.
- Pagination on artist search.

## Anti-goals
- No change to the happy-path API contract the mobile app depends on (existing tests must stay green unmodified, except where they encoded the insecure behaviour).
- No feature removal for real users; the dev mock-auth flow keeps working locally with `ALLOW_MOCK_AUTH=true`.

## Approaches considered
- **A. One hardening PR, server + mobile + CI (chosen).** The owner asked for one separate PR; the items share a theme and reviewers get a single checklist.
- B. One PR per area (security / ops / mobile). Cleaner review, but the owner explicitly asked for "another PR", and stacking 3–4 PRs on an unmerged base adds merge overhead while they're away.
- C. Full validation-library rewrite of every route (zod per endpoint). More thorough, but a large diff that touches every handler; deferred in favour of targeted validation where input reaches the DB or storage unbounded.
