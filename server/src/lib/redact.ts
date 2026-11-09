/**
 * Payout details that must never leave the server inside a general API response. Booking lists,
 * chat and discovery all embed the artist row, so rather than trusting every query to exclude
 * them, they're stripped from all JSON output. The artist sees their own (masked) details via
 * GET /api/artists/payout-account, which uses different field names.
 */
const REDACTED_KEYS = new Set([
  'payoutAccountId',
  'payoutProductId',
  'payoutLegalName',
  'payoutIfsc',
  'payoutAccountLast4'
]);

export function redactSensitiveJson(key: string, value: unknown): unknown {
  return REDACTED_KEYS.has(key) ? undefined : value;
}
