# Payments: Razorpay Test Mode Walkthrough (Phase 7)

The automated suite (`tests/e2e_payments.test.ts` and friends) runs the whole payments flow against an in-memory **fake** Razorpay. This page is the manual check against **real Razorpay Test Mode**. It's the first time the real adapter (`server/src/lib/payments/razorpay.gateway.ts`) talks to Razorpay, so go slowly, and note anything that differs from what's below.

No real money moves in Test Mode.

## 1. One-time setup

1. **Razorpay account.** Sign up at dashboard.razorpay.com. Test Mode works before KYC.
2. **Route.** In the dashboard, open *Route* (Account & Settings → Products, or the Route page) and request activation for a marketplace. Route must be on for linked accounts and held transfers.
3. **API keys.** Switch the dashboard to **Test Mode**, then go to *Account & Settings → API Keys → Generate Test Key*. Put the keys in `server/.env` (never in git or chat):
   ```
   PAYMENTS_ENABLED=true
   RAZORPAY_KEY_ID=rzp_test_...
   RAZORPAY_KEY_SECRET=...
   RAZORPAY_WEBHOOK_SECRET=<any long random string; the same one goes in the dashboard below>
   PUBLIC_BASE_URL=https://<your-tunnel-host>
   ```
   With all three Razorpay values set, the server uses the real adapter. Without them it uses the fake.
4. **Tunnel.** Razorpay must reach your laptop for webhooks, and the phone must reach the checkout page:
   ```
   cloudflared tunnel --url http://localhost:5000
   # or: ngrok http 5000
   ```
   Use the https URL it prints as `PUBLIC_BASE_URL`. Restart the server after changing `.env`.
5. **Webhook.** Go to *Account & Settings → Webhooks → Add New Webhook*:
   - URL: `https://<your-tunnel-host>/api/webhooks/razorpay`
   - Secret: the same `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `payment.failed`, `order.paid`, `transfer.processed`, `refund.processed`, and every `product.route.*` / `account.*` event offered.
6. **App.** Point the mobile app at the tunnel URL (its API base URL setting), then start it with `npx expo start` and open it in Expo Go.

## 2. Things to watch the first time

These were written from the Razorpay SDK's TypeScript types and haven't yet been checked against the live API. If any of them fails, the server log shows Razorpay's error description.

| Where | What to check |
|---|---|
| Artist onboarding → `createLinkedAccount` | `accounts.create` accepts `business_type: 'individual'`, `profile.category` / `subcategory` (defaults `others`/`others`, overridable with `RAZORPAY_ROUTE_CATEGORY` / `RAZORPAY_ROUTE_SUBCATEGORY`), and the registered address. Razorpay may want a specific category for performers; pick one from their list. |
| Same | `stakeholders.create` with `kyc.pan`, then `products.requestProductConfiguration('route')` and `products.edit` with `settlements` succeed. In Test Mode the product usually activates quickly or instantly. |
| Payout status | The artist's status moves `PENDING → ACTIVE`, either from a `product.route.*` webhook or the 5-minute sweep. The webhook handler re-fetches status from Razorpay, so the payload shape only needs to contain the `acc_…` id (it checks `account_id` and `payload.account.entity.id`). |
| Pay → order | `orders.create` with `transfers: [{ account, amount, currency, on_hold: 1 }]` succeeds, and the dashboard shows the order with a transfer to the linked account. |
| After payment | The transfer shows **on hold**. `transfer.processed` arrives and the payment row gets its `gatewayTransferId`. |
| Release | `transfers.edit(id, { on_hold: 0 })` releases the hold. Confirm in *Route → Transfers*. |
| Refund / reversal | `transfers.reverse(id, { amount })` then `payments.refund(id, { amount })`. For late payments, `payments.refund(id, { amount, reverse_all: 1 })`. |

## 3. Walk the paths

Use the test card `4111 1111 1111 1111` (any future expiry, any CVV), or UPI ID `success@razorpay`. For a failure, use UPI `failure@razorpay`.

**Happy path**
1. Sign up as a new artist. The wizard shows **step 4/4: Payout details**. Fill it in with test bank details (Razorpay's docs list test account numbers and IFSCs).
2. An admin verifies the artist. Wait for the payout status to become *Active*: Studio → Payout details.
3. Add availability. As a booker, request the artist.
4. The artist accepts. The booker sees **Pay ₹X**. Tap it, and the browser opens the Stagely checkout page, then Razorpay.
5. Pay. The browser returns to the app, which polls, and the booking shows **Confirmed**.
   - Check: the order is paid, and the transfer to the linked account is **on hold**.
6. Time travel: in the DB, set the slot `date` to yesterday and `Booking.eventEndsAt` to an hour ago.
7. The booker taps **Mark as Completed**. The transfer hold is released, and the payment row is `RELEASED`.

**Failure paths**
- **Failed payment:** pay with `failure@razorpay`. The booking stays *Awaiting payment*, and **Pay** works again on the same order.
- **Payment expiry:** set `Booking.paymentDueAt` to the past. Within 5 minutes (or on refresh) the booking becomes *Payment expired* and the date opens up again.
- **Artist cancels:** on a confirmed booking, the artist taps **Cancel**. The booker gets a full refund, and the transfer is reversed.
- **Booker cancels 1–7 days out:** gives a 50% refund. The artist's transfer is partly reversed, then the rest is released.
- **Dispute → refund:** time travel past the event start, then the booker taps **Report a problem**. Admin → Disputes → **Full refund**.
- **Dispute → split:** same, but choose **Split** with an amount. The booker gets that amount back, and the artist keeps the rest minus 10%.
- **Webhook replay:** in the dashboard, re-send a delivered `payment.captured`. Nothing changes (it's deduplicated).

## 4. Before going live (Phase 8)

- KYC approved, Route live, **live** keys on the production server, production webhook configured.
- Terms, Privacy, Refund & Cancellation, and Contact pages published. Razorpay checks these.
- CA consulted on GST on the commission and TDS (194-O).
- One real ₹1–10 booking walked end to end, then refunded.
