export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  ARTIST = 'ARTIST',
  ADMIN = 'ADMIN'
}

export enum VerificationStatus {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED'
}

export enum BookingStatus {
  REQUESTED = 'REQUESTED',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
  COMPLETED = 'COMPLETED',
  /** Artist accepted; the booker must pay before paymentDueAt. */
  AWAITING_PAYMENT = 'AWAITING_PAYMENT',
  /** The booker didn't pay in time; the night is released. */
  PAYMENT_EXPIRED = 'PAYMENT_EXPIRED',
  /** Paid; money held by Razorpay until the gig completes. */
  CONFIRMED = 'CONFIRMED',
  /** The booker reported a problem; money stays held until an admin resolves it. */
  DISPUTED = 'DISPUTED',
  CANCELLED_BY_ARTIST = 'CANCELLED_BY_ARTIST',
  CANCELLED_BY_CUSTOMER = 'CANCELLED_BY_CUSTOMER',
  /** An admin ruled for the booker after a dispute. */
  REFUNDED = 'REFUNDED'
}

/** Statuses that keep the artist's night taken: no other offer can be made for that date. */
export const NIGHT_HOLDING_STATUSES: BookingStatus[] = [
  BookingStatus.REQUESTED,
  BookingStatus.ACCEPTED,
  BookingStatus.AWAITING_PAYMENT,
  BookingStatus.CONFIRMED,
  BookingStatus.DISPUTED
];

export enum PaymentStatus {
  CREATED = 'CREATED',
  CAPTURED = 'CAPTURED',
  RELEASED = 'RELEASED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  FAILED = 'FAILED'
}

export interface AuthUser {
  id: number;
  firebaseUid: string;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  role: UserRole;
}

export interface ArtistProfileData {
  id?: number;
  userId: number;
  artistName: string;
  category: string;
  genres: string[];
  location: string;
  baseFee: number;
  bio?: string;
  requirements?: string;
  youtubeUrl?: string;
  instagramUrl?: string;
  verificationStatus: VerificationStatus;
}
