# Payments (Escrow via Razorpay Route): Design & Implementation Plan

- **Date:** 2026-11-09
- **Status:** Approved 2026-11-09 (open decisions in §9 answered)
- **Author:** Claude, with Goutham

---

## 1. Intent

Stagely connects bookers (venues and event organisers) with artists. Today a booking moves `REQUESTED → ACCEPTED`, and money is settled offline. We want the platform to take payment so that:

- **Artists are protected:** the booker pays the full fee before the gig, so the artist never performs for a no-show or non-payer.
- **Bookers are protected:** the money is held, not paid out, until the gig has happened. If the artist doesn't turn up, the booker gets the money back.
- **Stagely earns a commission** on each completed booking.
- **Reviews unlock:** a booking finally reaches `COMPLETED`. Today nothing ever sets that status, so customers can't leave reviews.

## 2. Goals, non-goals, anti-goals

**Goals**
- The booker pays the full fee by UPI, card or netbanking after the artist accepts.
- Funds are held by Razorpay, never in Stagely's own bank account. RBI only allows licensed payment aggregators to hold money that belongs to others.
- The artist is paid only after the gig: either the booker confirms, or 48 hours pass with no dispute.
- The booker can report a problem within 48 hours. An admin then refunds the booker (fully or partly) or releases the money to the artist.
- Refunds are automatic when the artist cancels, or the booking otherwise fails before the gig.
- Everything works in Razorpay **Test Mode** before KYC is done.

**Non-goals (for this project)**
- Advance or part payments. It's full payment only.
- Payment by the artist (subscriptions, featured listings).
- GST invoicing and TDS (section 194-O) reporting. These are handled manually with a CA for now (see §11).
- The native `react-native-razorpay` SDK. It needs a custom dev build; we use hosted checkout first (see §6.4).
- Multiple currencies. It's INR only.

**Anti-goals: things that would make this a failure even if it "works"**
- A booker getting a gig free by staying silent. Silence **releases** the money; it does not refund it.
- The payout being tied to leaving a review. Reviews stay optional and honest.
- Stagely's server trusting the app's "payment succeeded" message. Only a signed webhook or a server-side API check counts.
- Double payouts, or a refund after a payout, caused by retries or races.

## 3. Constraints

- **Stack:** Express + TypeScript + Prisma 5 on Postgres, Jest + supertest (runs in band), and an Expo React Native app that currently runs in **Expo Go**, with no custom dev client.
- **Booking lock:** one active booking per artist per date (`slot.isBooked`), with offers expiring after 48 hours. Payment states must keep the slot locked correctly.
- **Background jobs:** the 5-minute sweep in `src/index.ts` already expires old offers. New time-based transitions go there too, along with lazy checks on reads, matching the existing pattern.
- **Webhook signatures** are computed over the **raw** request body. `app.ts` currently runs `express.json()` globally, so the webhook route must be mounted with `express.raw()` **before** the JSON parser.
- **Money** is stored as integer **paise** (`Int`). There is no floating-point money anywhere.
- **Production env validation** (`src/config/env.ts`) must require the Razorpay credentials when payments are enabled.

## 4. Approaches considered

| Approach | Summary | Trade-off | Verdict |
|---|---|---|---|
| **A. Razorpay Route with held transfers** | Each order carries a transfer to the artist's linked account with `on_hold: true`. Stagely releases the hold after completion, or reverses it and refunds on dispute. | Native escrow-style split, fully compliant. Route needs activation, and each artist needs KYC as a linked account. | **Chosen** |
| B. Collect into Stagely's account, then pay out via RazorpayX | Simple to picture. | Stagely would be holding third-party money, which is an RBI payment-aggregator compliance risk, and payouts cost extra. | Rejected |
| C. Cashfree Easy Split | Same model as A, often slightly cheaper fees. | Less mature React Native ecosystem and docs. | Fallback if Razorpay won't activate Route or fees matter more |
| D. Manual capture (authorise at request, capture on accept) | The booker pays when requesting. | Authorisations lapse after a few days, while an offer can sit for up to 48 hours plus. More complex for little gain. | Rejected for v1 |

Everything sits behind a `PaymentGateway` interface (§6.2), so switching to C later means writing a second adapter, not rewriting.

## 5. The flow (agreed)

```
Booker sends a request           → REQUESTED   (slot locked; expires in 48h: existing)
Artist accepts                   → AWAITING_PAYMENT  (payment due within 24h, capped at event start)
   └─ not paid in time           → PAYMENT_EXPIRED   (slot released, no money moved)
Booker pays (webhook confirmed)  → CONFIRMED   (money held by Razorpay, transfer on_hold)
   ├─ artist cancels             → CANCELLED_BY_ARTIST → full refund (automatic)
   └─ booker cancels             → CANCELLED_BY_CUSTOMER → refund per cancellation policy (§7)
Event end time passes:
   ├─ booker taps "Completed"    → COMPLETED → hold released → artist paid
   ├─ 48h pass, no dispute       → COMPLETED → hold released → artist paid
   └─ booker taps "Report a problem" (within 48h) → DISPUTED (money stays held)
         admin decides           → COMPLETED (artist paid)
                                 | REFUNDED (full refund to booker)
                                 | COMPLETED + partial refund (split)
After COMPLETED → the app takes the booker to the review screen (optional review)
```

### 5.1 Status changes

The new `Booking.status` values are:

| Status | Slot locked? | Money |
|---|---|---|
| `REQUESTED` (existing) | yes | none |
| `AWAITING_PAYMENT` (replaces `ACCEPTED` for new bookings) | yes | none |
| `PAYMENT_EXPIRED` | no | none |
| `CONFIRMED` | yes | held |
| `DISPUTED` | yes | held |
| `COMPLETED` (existing) | yes (the gig happened) | released to artist |
| `CANCELLED_BY_ARTIST` | no | refunded |
| `CANCELLED_BY_CUSTOMER` | no | refunded per policy |
| `REFUNDED` (admin ruled for the booker) | yes (date has passed) | refunded |
| `DECLINED`, `EXPIRED` (existing) | no | none |

**Legacy:** existing `ACCEPTED` bookings were made before payments existed and are settled offline. They keep `ACCEPTED`. The same 48-hour rule completes them with no payout step, which also fixes the review gap for them.

## 6. Design

### 6.1 Data model (Prisma)

```prisma
model Booking {
  // ...existing fields
  amountPaise     Int?       // fee locked when the booker requests (artist.baseFee * 100)
  paymentDueAt    DateTime?  // AWAITING_PAYMENT deadline
  eventEndsAt     DateTime?  // slot date + endTime, IST, computed once
  completedAt     DateTime?
  disputeReason   String?
  payment         Payment?
  @@index([status, paymentDueAt])
  @@index([status, eventEndsAt])
}

model Payment {
  id                 Int      @id @default(autoincrement())
  bookingId          Int      @unique
  booking            Booking  @relation(fields: [bookingId], references: [id])
  gatewayOrderId     String   @unique   // order_xxx
  gatewayPaymentId   String?  @unique   // pay_xxx
  gatewayTransferId  String?            // trf_xxx (artist share, on hold)
  amountPaise        Int                // total the booker paid
  artistSharePaise   Int
  platformFeePaise   Int
  status             String   // CREATED, CAPTURED, RELEASED, REFUNDED, PARTIALLY_REFUNDED, FAILED
  refundedPaise      Int      @default(0)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}

model PaymentEvent {               // webhook idempotency + audit trail
  id          Int      @id @default(autoincrement())
  eventId     String   @unique      // Razorpay x-razorpay-event-id
  type        String
  payload     Json
  processedAt DateTime @default(now())
}

model ArtistProfile {
  // ...existing fields
  payoutAccountId     String?   // Razorpay linked account id (acc_xxx)
  payoutStatus        String    @default("NOT_STARTED") // NOT_STARTED, PENDING, ACTIVE, REJECTED
  payoutLegalName     String?
  payoutIfsc          String?
  payoutAccountLast4  String?   // for the masked view only
}
```

We don't store raw bank account numbers or PAN. They go straight to Razorpay, and we keep only the linked-account ID, its status, and what the masked view needs (legal name, IFSC, last 4 digits).

### 6.2 Server modules

- `src/lib/payments/gateway.ts`: the `PaymentGateway` interface:
  - `createLinkedAccount`
  - `createOrderWithHeldTransfer`
  - `fetchPayment`
  - `releaseTransfer`
  - `reverseTransfer`
  - `refund`
  - `verifyWebhookSignature`
- `src/lib/payments/razorpay.gateway.ts`: the real adapter, using the official `razorpay` npm package.
- `src/lib/payments/fake.gateway.ts`: an in-memory fake for tests and for local development without keys. Selected when `NODE_ENV=test`, or when there are no keys and we're not in production.
- `src/services/payment.service.ts`: all money state changes. Every change happens in a transaction and is guarded by a conditional `updateMany` on the current status, the same pattern that fixed the booking race.
- `src/routes/payment.routes.ts`: the endpoints below.
- `src/routes/webhook.routes.ts`: mounted in `app.ts` **before** `express.json()`, using `express.raw({ type: 'application/json' })`.

### 6.3 API

| Method & path | Who | What |
|---|---|---|
| `POST /api/artists/onboard` (changed) | Artist | Now **requires** payout details (legal name, PAN, IFSC, account number) alongside the profile. The server validates formats, creates the Razorpay linked account, then creates the profile in one step. If the gateway rejects the details, onboarding fails and no profile is created. |
| `GET /api/artists/payout-account` | Artist | Returns the status plus masked details (account `XXXX1234`, IFSC, legal name). |
| `PUT /api/artists/payout-account` | Artist | Edits payout details. Updates the **same** linked account's bank details, so held transfers still land correctly. `payoutStatus` may drop back to `PENDING` while Razorpay re-verifies. Also used by legacy artists who onboarded before payments existed. |
| `PUT /api/bookings/:id/respond` (changed) | Artist | `ACCEPT` now leads to `AWAITING_PAYMENT`. It's refused if `payoutStatus !== ACTIVE`, with the message "Set up payouts before accepting". |
| `POST /api/bookings/:id/pay` | Customer | Creates (or reuses) a Razorpay order with a held transfer, and returns `{ orderId, keyId, amountPaise, checkoutUrl }`. |
| `GET /pay/:orderId` | Public (unguessable order ID) | A minimal server-rendered checkout page that loads Razorpay `checkout.js` (§6.4). |
| `POST /api/webhooks/razorpay` | Razorpay | Verifies the signature, deduplicates by event ID, then handles `payment.captured`, `payment.failed`, `refund.processed` and `transfer.processed`. |
| `GET /api/bookings/:id/payment-status` | Customer, artist | Lets the app poll after checkout. As a fallback, the server re-checks the payment with Razorpay if no webhook has arrived yet. |
| `POST /api/bookings/:id/complete` | Customer | Allowed only when `CONFIRMED` (or legacy `ACCEPTED`) and `now >= eventEndsAt`. Leads to `COMPLETED` and releases the transfer. |
| `POST /api/bookings/:id/dispute` | Customer | Allowed only when `CONFIRMED`, and within 48 hours after `eventEndsAt`. A reason is required. Leads to `DISPUTED`. |
| `POST /api/bookings/:id/cancel` | Customer or artist | Before the event only. Refunds per §7. |
| `GET /api/admin/disputes` | Admin | Lists disputed bookings, with the chat history. |
| `POST /api/admin/disputes/:id/resolve` | Admin | `{ outcome: 'PAY_ARTIST' \| 'REFUND' \| 'SPLIT', refundPaise? }` |

### 6.4 Mobile checkout (Expo Go-compatible)

1. The booker taps **Pay ₹X**, and the app calls `POST /bookings/:id/pay`.
2. The app opens `checkoutUrl` (`/pay/:orderId`) with `expo-web-browser`. The page runs Razorpay Standard Checkout for that order.
3. On success, the page redirects to the `stagely://payment-result` deep link (with an in-browser fallback message). The app then polls `payment-status` until it shows `CONFIRMED`.
4. The server only marks the booking paid on a signed webhook, or on its own API check of the payment. The redirect is just a UX hint.

**Later:** swap in `react-native-razorpay` once the app moves to an EAS dev build. Only the mobile side changes.

### 6.5 Background sweep additions (`src/index.ts`, every 5 minutes, plus lazy checks on reads)

- `AWAITING_PAYMENT` past `paymentDueAt` → `PAYMENT_EXPIRED`, and the slot is released.
- `CONFIRMED` (or legacy `ACCEPTED`) more than 48 hours after `eventEndsAt` → `COMPLETED`, and the transfer is released.
- Retry gateway calls that failed earlier. A booking can be `COMPLETED` while its payment is not yet `RELEASED`. The sweep retries the release, and the gateway calls are idempotent.

### 6.6 Money split

- `platformFeePaise = round(amountPaise × PLATFORM_FEE_PERCENT / 100)`
- `artistSharePaise = amountPaise − platformFeePaise`

The Razorpay gateway fee is deducted from Stagely's share (Razorpay charges the account owner), so the artist sees exactly what was promised.

### 6.7 Security and correctness rules

- Webhook HMAC is checked with `RAZORPAY_WEBHOOK_SECRET` over the raw body, using a constant-time comparison.
- A webhook whose event ID is already stored in `PaymentEvent` is skipped (idempotent).
- The amount is checked: the captured amount must equal `Payment.amountPaise`. If it doesn't, the payment is flagged and not confirmed.
- Every state change is a conditional update on the expected current status. If no row was updated, the request is a no-op or a 409.
- A refund after a release is impossible by construction. Resolving a dispute always reverses the transfer first.
- Card, UPI or bank details are never logged or stored. Webhook payloads are stored, and Razorpay already masks those.
- `env.ts`: when `PAYMENTS_ENABLED=true` in production, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are required.

## 7. Cancellation policy (confirmed 2026-11-09)

| Who cancels | When | Booker refund | Artist gets |
|---|---|---|---|
| Artist | any time before the event | 100% | 0 (repeat cancellations flagged for admin) |
| Booker | more than 7 days before the event | 100% | 0 |
| Booker | 1–7 days before | 50% | 50% minus platform fee |
| Booker | less than 24 hours before | 0% | 100% minus platform fee |

These numbers live in one config module (`src/config/payments.ts`), so changing them is a single-line edit.

## 8. New environment variables

```
PAYMENTS_ENABLED=true
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
PLATFORM_FEE_PERCENT=10          # confirmed
PAYMENT_WINDOW_HOURS=24
DISPUTE_WINDOW_HOURS=48
PUBLIC_BASE_URL=https://api.stagely.in   # used to build checkoutUrl
```

## 9. Decisions (answered by Goutham, 2026-11-09)

1. **Platform fee:** 10%.
2. **Cancellation policy:** the §7 numbers as written.
3. **Payment window after accept:** 24 hours, capped at event start.
4. **Payout setup is a mandatory step of artist profile creation**, and editable afterwards:
   - The onboarding wizard gains a 4th step, **Payout details**. The profile can't be created without it.
   - Artists can view (masked) and edit the details later from their profile.
   - Razorpay verifies linked accounts asynchronously, so a new artist may sit at `PENDING`. They are visible in search, but `ACCEPT` stays blocked until `payoutStatus = ACTIVE`, since money can't be routed before then.
   - Legacy artists (onboarded before payments) get a blocking **Add payout details** prompt on next app open.

## 10. What's left to the builder

- The exact Razorpay Route field names (`on_hold`, `on_hold_until`, the linked-account v2 API) must be checked against the current Razorpay docs while implementing.
- The visual design of the payment, dispute and payout-setup screens, following the existing app styles.
- Wording of the user-facing messages.

## 11. Outside the code (must happen before going live)

- Razorpay account **activation (KYC)** and **Route activation** for a marketplace.
- Public **Terms, Privacy, Refund & Cancellation, and Contact** pages. Razorpay checks these before approval.
- A CA consult on 18% GST on the commission, and TDS under section 194-O.
- Production webhook URL configured in the Razorpay dashboard.

---

# Implementation Plan

Each phase is a separate PR, test-driven (failing test first), and keeps `npm test` and typecheck green. Phases 1–4 are server-only and fully testable with the fake gateway, so no Razorpay keys are needed.

### Phase 0: Prerequisites (Goutham)
- [ ] Create a Razorpay account. Test Mode is enough.
- [ ] Generate test API keys and put them in `server/.env` (never in chat or git).
- [ ] Request or enable **Route** in the dashboard.
- [x] Answer the open decisions in §9.

### Phase 1: Completion and reviews (no money yet, ships immediately)
**Why first:** it fixes the review bug today, and it's the backbone the payout plugs into.
- [x] Migration: `Booking.eventEndsAt`, `completedAt`. Backfill `eventEndsAt` from slot date + `endTime` (IST).
- [x] `POST /api/bookings/:id/complete`: customer only, `ACCEPTED`, `now >= eventEndsAt`.
- [x] Sweep: `ACCEPTED` more than 48 hours after `eventEndsAt` → `COMPLETED`.
- [x] Tests:
  - Can't complete before the event ends.
  - The artist can't complete.
  - Auto-complete after 48 hours.
  - A review is possible after completion.
- [x] Mobile: a **Mark as completed** button on `MyBookingsScreen` after the event, which goes straight to the review screen.

### Phase 2: Payment core and fake gateway (server)
- [x] Add the `razorpay` dependency, the `PaymentGateway` interface, and the fake and Razorpay adapters.
- [x] Migration: `Payment`, `PaymentEvent`, the new booking fields, and the new statuses in `types/index.ts`.
- [x] `src/config/payments.ts`: fee %, windows and cancellation rules. Extend `env.ts` validation.
- [x] `createBooking` stores `amountPaise`. `respond ACCEPT` leads to `AWAITING_PAYMENT` with `paymentDueAt` (behind `PAYMENTS_ENABLED`; when off, the old `ACCEPTED` path stays).
- [x] `POST /bookings/:id/pay`: reuses an existing order and verifies ownership and status.
- [x] Sweep: `AWAITING_PAYMENT` past due → `PAYMENT_EXPIRED`, slot released.
- [x] Tests:
  - Order amount and split maths.
  - Only the booking's customer can pay.
  - A double `pay` call returns the same order.
  - Payment expiry releases the slot.
- [x] Note: the `ArtistProfile` payout columns (§6.1) were added in this phase's migration, because an order needs the artist's linked account. `pay` refuses with a 409 while it's missing. Onboarding that fills them is still Phase 5.
- [x] Note: `createLinkedAccount` moves to Phase 5 with the onboarding work that uses it.

### Phase 3: Webhooks and confirmation
- [ ] Mount the webhook route with `express.raw()` before `express.json()` in `app.ts`.
- [ ] Signature verification, event deduplication through `PaymentEvent`, and an amount check.
- [ ] `payment.captured` → `CONFIRMED`. `payment.failed` → stays `AWAITING_PAYMENT`.
- [ ] A capture that arrives after the booking is `PAYMENT_EXPIRED` (the booker paid at the last second) is refunded in full automatically, because the night may already be someone else's.
- [ ] `GET /bookings/:id/payment-status`, with a server-side fetch as a fallback.
- [ ] Tests:
  - A bad signature returns 401 and changes nothing.
  - A replayed event is a no-op.
  - A wrong amount is not confirmed.
  - Concurrent duplicate webhooks confirm the booking only once.

### Phase 4: Release, disputes, cancellations and refunds
- [ ] Completion (manual and the 48-hour sweep) releases the held transfer. Failed releases are retried by the sweep.
- [ ] `POST /bookings/:id/dispute`: within the window, reason required.
- [ ] `POST /bookings/:id/cancel` for both roles, with refunds per policy (transfer reversed first).
- [ ] Admin: `GET /admin/disputes` and `POST /admin/disputes/:id/resolve` (pay artist, refund, or split).
- [ ] Tests:
  - No release while disputed.
  - No refund after release.
  - The policy maths in each time band.
  - Only an admin can resolve.
  - Resolving twice is refused.

### Phase 5: Artist payouts onboarding
- [ ] `POST /api/artists/onboard` requires payout details and creates the linked account before the profile (all or nothing).
- [ ] `GET`/`PUT /api/artists/payout-account`: masked view and edit. Status is updated by webhook or polling.
- [ ] Block `ACCEPT` until `payoutStatus = ACTIVE`.
- [ ] Mobile: a 4th **Payout details** step in `OnboardingWizardScreen` (`Artist Setup (4/4)`), a **Payout details** edit screen reachable from the artist profile, and a blocking prompt for legacy artists with `NOT_STARTED`.
- [ ] Tests:
  - Onboarding without payout details is rejected (400) and creates no profile.
  - A gateway rejection during onboarding creates no profile.
  - PAN and IFSC format validation.
  - No raw account number or PAN is persisted; `GET` returns only masked values.
  - Edit updates the same linked account ID.
  - The accept gate while `PENDING`.

### Phase 6: Mobile checkout
- [ ] `GET /pay/:orderId` checkout page (server-rendered, loads `checkout.js`).
- [ ] App: a **Pay ₹X** button, `expo-web-browser` checkout, the `stagely://payment-result` deep link, and status polling.
- [ ] Status labels and colours for all new statuses. Buttons for **Report a problem** and **Cancel**.
- [ ] Admin app: a disputes list and a resolve screen.

### Phase 7: End-to-end in Razorpay Test Mode
- [ ] Run a local tunnel (`cloudflared` or `ngrok`) and register the test webhook.
- [ ] Walk the full path with `success@razorpay`: request, accept, pay, complete, transfer released.
- [ ] Walk the failure paths: failed payment, payment expiry, artist cancel (refund), dispute (refund and split).
- [ ] Update `docs/wiki/workflows.md` and `docs/wiki/architecture.md`.

### Phase 8: Go-live checklist
- [ ] KYC approved, Route live, live keys on the production server.
- [ ] Policy pages published.
- [ ] Production webhook configured, `PAYMENTS_ENABLED=true`.
- [ ] One real low-value booking (₹1–10) walked end to end, then refunded.
