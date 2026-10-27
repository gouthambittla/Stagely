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
  COMPLETED = 'COMPLETED'
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
