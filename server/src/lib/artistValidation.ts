import { badRequest, parseText } from './http';

export const MIN_BASE_FEE = 1000;
export const MAX_BASE_FEE = 10_000_000;
const MAX_GENRES = 15;
const MAX_SLOTS = 60;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Optional text: '' or whitespace means "clear it" (null); undefined means "leave unchanged". */
export function parseOptionalText(value: unknown, name: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const parsed = parseText(value, name, { max });
  return parsed ? parsed : null;
}

export function parseBaseFee(value: unknown): number {
  const fee = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof fee !== 'number' || !Number.isInteger(fee)) {
    throw badRequest('baseFee must be a whole number of rupees');
  }
  if (fee < MIN_BASE_FEE) throw badRequest('Base fee must be at least ₹1,000');
  if (fee > MAX_BASE_FEE) throw badRequest('Base fee is too large');
  return fee;
}

export function parseGenres(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_GENRES) {
    throw badRequest(`genres must be a non-empty array of up to ${MAX_GENRES} strings`);
  }
  const genres = value.map((g) => {
    if (typeof g !== 'string' || g.trim() === '' || g.trim().length > 50) {
      throw badRequest('each genre must be a non-empty string of at most 50 characters');
    }
    return g.trim();
  });
  return Array.from(new Set(genres));
}

export interface SlotInput {
  date: string;
  startTime: string;
  endTime: string;
}

export function parseSlots(value: unknown): SlotInput[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_SLOTS) {
    throw badRequest(`availability slots must be an array of at most ${MAX_SLOTS} entries`);
  }
  const seen = new Set<string>();
  const slots: SlotInput[] = [];
  for (const raw of value) {
    const s = raw as Partial<SlotInput> | null;
    if (
      !s ||
      typeof s.date !== 'string' || !DATE_RE.test(s.date) ||
      typeof s.startTime !== 'string' || !TIME_RE.test(s.startTime) ||
      typeof s.endTime !== 'string' || !TIME_RE.test(s.endTime)
    ) {
      throw badRequest('each availability slot needs date YYYY-MM-DD and startTime/endTime HH:mm');
    }
    const key = `${s.date}|${s.startTime}`;
    if (seen.has(key)) continue; // duplicate slot would violate the unique index
    seen.add(key);
    slots.push({ date: s.date, startTime: s.startTime, endTime: s.endTime });
  }
  return slots;
}
