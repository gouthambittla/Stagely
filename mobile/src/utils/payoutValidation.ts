import type { PayoutBankUpdateInput, PayoutDetailsInput } from '../services/api';

/** Mirrors server/src/lib/payoutValidation.ts so artists get friendly errors before submitting. */
const PAN_RE = /^[A-Z]{3}P[A-Z][0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^[0-9]{9,18}$/;
const PINCODE_RE = /^[1-9][0-9]{5}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface PayoutFormValues {
  legalName: string;
  email: string;
  phone: string;
  pan: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifsc: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  postalCode: string;
}

export type PayoutFormField = keyof PayoutFormValues;

export function emptyPayoutForm(prefill: Partial<PayoutFormValues> = {}): PayoutFormValues {
  return {
    legalName: '',
    email: '',
    phone: '',
    pan: '',
    accountNumber: '',
    confirmAccountNumber: '',
    ifsc: '',
    street1: '',
    street2: '',
    city: '',
    state: '',
    postalCode: '',
    ...prefill
  };
}

/** Strips +91 / 91 / 0 and separators, as the server does. */
export function normalizeIndianPhone(raw: string | null | undefined): string {
  return String(raw ?? '')
    .replace(/[\s-]/g, '')
    .replace(/^(\+91|91|0)(?=\d{10}$)/, '');
}

const squash = (s: string) => s.trim().replace(/\s+/g, ' ');

type Result<T> = { ok: true; value: T } | { ok: false; field: PayoutFormField; error: string };

export function validateBankDetails(v: PayoutFormValues): Result<PayoutBankUpdateInput> {
  const legalName = squash(v.legalName);
  if (legalName.length < 3) {
    return { ok: false, field: 'legalName', error: 'Enter your full name exactly as on your bank account.' };
  }
  if (legalName.length > 120) return { ok: false, field: 'legalName', error: 'Legal name is too long.' };

  const accountNumber = v.accountNumber.replace(/\s/g, '');
  if (!ACCOUNT_RE.test(accountNumber)) {
    return { ok: false, field: 'accountNumber', error: 'Bank account number must be 9 to 18 digits.' };
  }
  if (v.confirmAccountNumber.replace(/\s/g, '') !== accountNumber) {
    return { ok: false, field: 'confirmAccountNumber', error: 'Account numbers do not match.' };
  }

  const ifsc = v.ifsc.trim().toUpperCase();
  if (!IFSC_RE.test(ifsc)) {
    return { ok: false, field: 'ifsc', error: 'IFSC code looks wrong (e.g. HDFC0001234).' };
  }
  return { ok: true, value: { legalName, accountNumber, ifsc } };
}

export function validatePayoutDetails(v: PayoutFormValues): Result<PayoutDetailsInput> {
  const bank = validateBankDetails(v);
  if (!bank.ok) return bank;

  const email = v.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, field: 'email', error: 'Enter a valid email address.' };

  const phone = normalizeIndianPhone(v.phone);
  if (!/^[6-9][0-9]{9}$/.test(phone)) {
    return { ok: false, field: 'phone', error: 'Phone must be a 10-digit Indian mobile number.' };
  }

  const pan = v.pan.trim().toUpperCase();
  if (!PAN_RE.test(pan)) {
    return { ok: false, field: 'pan', error: 'PAN looks wrong. An individual PAN looks like ABCPE1234F.' };
  }

  const street1 = squash(v.street1);
  if (!street1) return { ok: false, field: 'street1', error: 'Address line 1 is required.' };
  if (street1.length > 100) return { ok: false, field: 'street1', error: 'Address line 1 is too long.' };
  const street2 = squash(v.street2);
  if (street2.length > 100) return { ok: false, field: 'street2', error: 'Address line 2 is too long.' };
  const city = squash(v.city);
  if (!city) return { ok: false, field: 'city', error: 'City is required.' };
  const state = squash(v.state);
  if (!state) return { ok: false, field: 'state', error: 'State is required.' };
  const postalCode = v.postalCode.trim();
  if (!PINCODE_RE.test(postalCode)) return { ok: false, field: 'postalCode', error: 'PIN code must be 6 digits.' };

  return {
    ok: true,
    value: {
      ...bank.value,
      email,
      phone,
      pan,
      address: { street1, ...(street2 ? { street2 } : {}), city, state, postalCode }
    }
  };
}
