/** Formats integer paise as rupees, e.g. 2500000 -> "₹25,000", 2500050 -> "₹25,000.50". */
export function formatPaise(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || !Number.isFinite(paise)) return '₹—';
  const rupees = paise / 100;
  const hasFraction = paise % 100 !== 0;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2
  })}`;
}

/** Amount a booking costs in paise; old bookings have no amountPaise, so fall back to the artist's fee. */
export function bookingAmountPaise(booking: any): number | null {
  if (typeof booking?.amountPaise === 'number') return booking.amountPaise;
  const fee = booking?.artist?.baseFee;
  return typeof fee === 'number' ? Math.round(fee * 100) : null;
}

/** Parses a rupee string ("1,250.50") to integer paise, or null if it isn't a valid amount. */
export function rupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  return parseInt(whole, 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
}
