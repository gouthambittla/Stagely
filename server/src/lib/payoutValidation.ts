import { badRequest } from './http';
import { BankDetailsInput } from './payments';

/** An individual's PAN: 5 letters (4th is P for a person), 4 digits, 1 letter. */
const PAN_RE = /^[A-Z]{3}P[A-Z][0-9]{4}[A-Z]$/;
/** IFSC: 4-letter bank code, a zero, then a 6-character branch code. */
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^[0-9]{9,18}$/;
const PINCODE_RE = /^[1-9][0-9]{5}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface PayoutDetails extends BankDetailsInput {
  email: string;
  phone: string;
  pan: string;
  address: { street1: string; street2?: string; city: string; state: string; postalCode: string };
}

function text(value: unknown, name: string, max: number, required = true): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`${name} is required`);
    return undefined;
  }
  if (typeof value !== 'string') throw badRequest(`${name} must be text`);
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (required && !trimmed) throw badRequest(`${name} is required`);
  if (trimmed.length > max) throw badRequest(`${name} is too long`);
  return trimmed || undefined;
}

/** Name on the bank account, account number and IFSC. Used for edits and as part of full setup. */
export function parseBankDetails(body: unknown): BankDetailsInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const legalName = text(b.legalName, 'Legal name (as on bank account)', 120)!;
  if (legalName.length < 3) throw badRequest('Legal name (as on bank account) is too short');

  const accountNumber = String(b.accountNumber ?? '').replace(/\s/g, '');
  if (!ACCOUNT_RE.test(accountNumber)) throw badRequest('Bank account number must be 9 to 18 digits');

  const ifsc = String(b.ifsc ?? '').trim().toUpperCase();
  if (!IFSC_RE.test(ifsc)) throw badRequest('IFSC code looks wrong (e.g. HDFC0001234)');

  return { legalName, accountNumber, ifsc };
}

/** Everything Razorpay needs to create an artist's payout (linked) account. */
export function parsePayoutDetails(body: unknown): PayoutDetails {
  if (!body || typeof body !== 'object') throw badRequest('Payout details are required');
  const b = body as Record<string, unknown>;
  const bank = parseBankDetails(b);

  const email = text(b.email, 'Email', 120)!.toLowerCase();
  if (!EMAIL_RE.test(email)) throw badRequest('Email looks wrong');

  const phone = String(b.phone ?? '').replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
  if (!/^[6-9][0-9]{9}$/.test(phone)) throw badRequest('Phone must be a 10-digit Indian mobile number');

  const pan = String(b.pan ?? '').trim().toUpperCase();
  if (!PAN_RE.test(pan)) throw badRequest('PAN looks wrong (an individual PAN looks like ABCPE1234F)');

  const a = (b.address ?? {}) as Record<string, unknown>;
  const postalCode = String(a.postalCode ?? '').trim();
  if (!PINCODE_RE.test(postalCode)) throw badRequest('PIN code must be 6 digits');

  return {
    ...bank,
    email,
    phone,
    pan,
    address: {
      street1: text(a.street1, 'Address line 1', 100)!,
      street2: text(a.street2, 'Address line 2', 100, false),
      city: text(a.city, 'City', 60)!,
      state: text(a.state, 'State', 60)!,
      postalCode
    }
  };
}

/** XXXX1234 for display. */
export const maskAccount = (last4: string | null | undefined) => (last4 ? `XXXX${last4}` : null);
