/**
 * Payment settings. Read from the environment on every call so tests (and a restart with new
 * env) see the current values; env.ts validates them at startup.
 */

const numberFromEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

export interface PaymentsConfig {
  /** When false, an accepted booking stays ACCEPTED and is settled offline (pre-payments flow). */
  enabled: boolean;
  /** Stagely's commission on each booking. */
  platformFeePercent: number;
  /** How long the booker has to pay after the artist accepts (capped at the event start). */
  paymentWindowHours: number;
  /** After the event: time to confirm or report a problem before the gig auto-completes. */
  disputeWindowHours: number;
  /** Public origin of this API, used to build the hosted checkout link. */
  publicBaseUrl: string;
}

export function paymentsConfig(): PaymentsConfig {
  return {
    enabled: process.env.PAYMENTS_ENABLED === 'true',
    platformFeePercent: numberFromEnv('PLATFORM_FEE_PERCENT', 10),
    paymentWindowHours: numberFromEnv('PAYMENT_WINDOW_HOURS', 24),
    disputeWindowHours: numberFromEnv('DISPUTE_WINDOW_HOURS', 48),
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, '')
  };
}

/** Splits a booking amount into Stagely's fee and the artist's share. Integer paise only. */
export function splitAmount(
  amountPaise: number,
  platformFeePercent: number
): { platformFeePaise: number; artistSharePaise: number } {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new Error('amountPaise must be a positive integer');
  }
  if (!(platformFeePercent >= 0 && platformFeePercent < 100)) {
    throw new Error('platformFeePercent must be in [0, 100)');
  }
  const platformFeePaise = Math.round((amountPaise * platformFeePercent) / 100);
  return { platformFeePaise, artistSharePaise: amountPaise - platformFeePaise };
}

/**
 * Booker cancellation refunds, by how long before the event start they cancel (confirmed
 * 2026-11-09). Bands are checked in order; the first whose `minHoursBefore` is met applies.
 * Artist cancellations always refund 100%.
 */
export const CUSTOMER_CANCELLATION_POLICY: ReadonlyArray<{ minHoursBefore: number; refundPercent: number }> = [
  { minHoursBefore: 7 * 24, refundPercent: 100 },
  { minHoursBefore: 24, refundPercent: 50 },
  { minHoursBefore: 0, refundPercent: 0 }
];

/** Refund percentage for a booker who cancels `hoursBeforeEvent` hours before the event starts. */
export function customerRefundPercent(hoursBeforeEvent: number): number {
  const band = CUSTOMER_CANCELLATION_POLICY.find((b) => hoursBeforeEvent >= b.minHoursBefore);
  return band ? band.refundPercent : 0;
}

/**
 * What the artist keeps when the booker gets `refundPaise` back: the kept amount minus Stagely's
 * fee on it, at the same ratio as the original split (so no refund gives exactly artistSharePaise).
 */
export function artistShareAfterRefund(
  payment: { amountPaise: number; platformFeePaise: number },
  refundPaise: number
): number {
  const kept = payment.amountPaise - refundPaise;
  if (kept <= 0) return 0;
  return kept - Math.round((kept * payment.platformFeePaise) / payment.amountPaise);
}
