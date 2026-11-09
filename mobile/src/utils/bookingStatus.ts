import type { CancellationBand } from '../services/api';

export interface StatusTheme {
  label: string;
  bg: string;
  text: string;
  border: string;
}

const GREEN = { bg: '#064E3B', text: '#34D399', border: '#059669' };
const AMBER = { bg: '#451A03', text: '#F5A623', border: '#78350F' };
const RED = { bg: '#450A0A', text: '#F87171', border: '#7F1D1D' };
const GREY = { bg: '#1F2937', text: '#9CA3AF', border: '#4B5563' };
const PURPLE = { bg: '#1E1B4B', text: '#A78BFA', border: '#4338CA' };
const BLUE = { bg: '#0C2340', text: '#60A5FA', border: '#1D4ED8' };

const STATUS_THEMES: Record<string, StatusTheme> = {
  REQUESTED: { label: 'Requested', ...AMBER },
  ACCEPTED: { label: 'Accepted', ...GREEN },
  DECLINED: { label: 'Declined', ...RED },
  EXPIRED: { label: 'Expired', ...GREY },
  COMPLETED: { label: 'Completed', ...PURPLE },
  AWAITING_PAYMENT: { label: 'Awaiting payment', ...AMBER },
  PAYMENT_EXPIRED: { label: 'Payment window closed', ...GREY },
  CONFIRMED: { label: 'Confirmed', ...GREEN },
  DISPUTED: { label: 'Under review', ...BLUE },
  CANCELLED_BY_ARTIST: { label: 'Cancelled by artist', ...RED },
  CANCELLED_BY_CUSTOMER: { label: 'Cancelled by booker', ...RED },
  REFUNDED: { label: 'Refunded', ...GREY }
};

/** Human label + colours for a booking status (unknown statuses fall back to a neutral pill). */
export function getStatusTheme(status: string | null | undefined): StatusTheme {
  if (status && STATUS_THEMES[status]) return STATUS_THEMES[status];
  const fallbackLabel = status
    ? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ')
    : 'Unknown';
  return { label: fallbackLabel, bg: '#1E293B', text: '#94A3B8', border: '#334155' };
}

/** Event start as a Date (slot times are IST). */
export function getEventStart(booking: any): Date | null {
  const slot = booking?.slot;
  if (!slot?.date || !slot?.startTime) return null;
  const d = new Date(`${slot.date}T${slot.startTime}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getEventEnd(booking: any): Date | null {
  if (booking?.eventEndsAt) {
    const d = new Date(booking.eventEndsAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function isBeforeEventStart(booking: any, now = Date.now()): boolean {
  const start = getEventStart(booking);
  return start ? now < start.getTime() : false;
}

/** Refund percentage the booker would get if they cancelled right now. */
export function customerRefundPercent(
  booking: any,
  policy: CancellationBand[],
  now = Date.now()
): number {
  const start = getEventStart(booking);
  if (!start) return 0;
  const hoursBefore = (start.getTime() - now) / 3_600_000;
  const band = policy.find(b => b.minHoursBefore <= hoursBefore);
  return band ? band.refundPercent : 0;
}

/** Formats an ISO timestamp for display in IST, e.g. "9 Nov, 8:30 pm". */
export function formatDateTimeIST(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return d.toLocaleString();
  }
}
