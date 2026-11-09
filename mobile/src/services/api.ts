import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getAuth, getIdToken } from './firebase';

const REQUEST_TIMEOUT_MS = 15000;

export class ApiError extends Error {
  status: number;
  body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function getDevFallbackUrl(): string {
  // If running in Expo Go or physical device connected to Metro, use the PC host IP
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost;

  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:5000/api`;
    }
  }

  // Android emulator loopback to host machine
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000/api';
  }
  // iOS simulator or Web
  return 'http://localhost:5000/api';
}

function getApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    if (__DEV__ && !envUrl.startsWith('https://') && !/localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.|^http:\/\/10\./.test(envUrl)) {
      console.warn(`[Stagely Config] EXPO_PUBLIC_API_URL is not https: ${envUrl}. Release builds must use https.`);
    }
    return envUrl.replace(/\/+$/, '');
  }

  if (__DEV__) {
    return getDevFallbackUrl();
  }

  throw new Error(
    '[Stagely Config] EXPO_PUBLIC_API_URL is not set. Release builds require an explicit https API URL (configure it in eas.json build profile env).'
  );
}

const API_BASE_URL = getApiBaseUrl();

if (__DEV__) {
  console.log(`[Stagely Config] API_BASE_URL: ${API_BASE_URL} (Platform: ${Platform.OS})`);
}

export async function getAuthToken(): Promise<string | null> {
  try {
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (currentUser) {
      return await getIdToken(currentUser);
    }
    return null;
  } catch (err) {
    if (__DEV__) console.warn('Failed to retrieve Firebase ID token:', err);
    return null;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  const method = options.method || 'GET';
  const url = `${API_BASE_URL}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startTime = Date.now();

  try {
    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      if (err?.name === 'AbortError') {
        if (__DEV__) console.warn(`[API Timeout] ${method} ${url} (${elapsed}ms)`);
        throw new ApiError('The request timed out. Please check your connection and try again.', 0);
      }
      if (__DEV__) console.warn(`[API Network Failure] ${method} ${url} (${elapsed}ms):`, err?.message || err);
      throw new ApiError(
        __DEV__
          ? `Cannot connect to backend server at ${API_BASE_URL}. Ensure the backend is running and reachable on this device.`
          : 'Unable to reach Stagely servers. Please check your internet connection and try again.',
        0
      );
    }

    const duration = Date.now() - startTime;
    let text = '';
    try {
      text = await response.text();
    } catch {
      text = '';
    }

    let data: any = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      if (__DEV__) console.warn(`[API Error ${response.status}] ${method} ${url} (${duration}ms):`, data);
      const message =
        data && typeof data === 'object' && typeof data.error === 'string' && data.error
          ? data.error
          : `Request failed (${response.status})`;
      throw new ApiError(message, response.status, data);
    }

    if (__DEV__) console.log(`[API Response ${response.status}] ${method} ${url} (${duration}ms):`, data);
    // 204 / empty body: keep previous behaviour of returning an empty object
    return (data === undefined ? {} : data) as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface ArtistFilterParams {
  location?: string;
  category?: string;
  search?: string;
  date?: string;
  minFee?: number;
  maxFee?: number;
  genres?: string;
}

export interface UserProfileResponse {
  user: {
    id: number;
    firebaseUid: string;
    email: string | null;
    phone: string | null;
    name: string | null;
    venueName: string | null;
    city: string | null;
    contactPhone: string | null;
    role: string;
    createdAt: string;
    updatedAt: string;
    artistProfile?: any;
  };
  stats: {
    activeBookingsCount: number;
    completedBookingsCount: number;
  };
}

export interface ArtistStudioProfileResponse {
  profile: {
    id: number;
    userId: number;
    artistName: string;
    category: string;
    genres: string;
    location: string;
    baseFee: number;
    bio?: string | null;
    requirements?: string | null;
    youtubeUrl?: string | null;
    instagramUrl?: string | null;
    verificationStatus: string;
    availabilitySlots: any[];
  };
  stats: {
    completedGigsCount: number;
    pendingRequestsCount: number;
    upcomingGigsCount: number;
  };
}

export interface UpdateArtistProfileInput {
  artistName?: string;
  category?: string;
  genres?: string[];
  location?: string;
  baseFee?: number;
  bio?: string;
  requirements?: string;
  youtubeUrl?: string;
  instagramUrl?: string;
}


export interface ReviewInput {
  rating: number;
  comment?: string;
  tags?: string[];
}

export interface ArtistReview {
  id: number;
  bookingId: number;
  artistId: number;
  customerId: number;
  rating: number;
  comment: string | null;
  tags: string | null;
  createdAt: string;
  customer: {
    id: number;
    name: string | null;
    venueName: string | null;
    city: string | null;
  };
}

export interface ArtistReviewsResponse {
  reviews: ArtistReview[];
  reviewCount: number;
  averageRating: number | null;
}


// ---------- Payments ----------

export type BookingStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'COMPLETED'
  | 'AWAITING_PAYMENT'
  | 'PAYMENT_EXPIRED'
  | 'CONFIRMED'
  | 'DISPUTED'
  | 'CANCELLED_BY_ARTIST'
  | 'CANCELLED_BY_CUSTOMER'
  | 'REFUNDED';

export interface CancellationBand {
  minHoursBefore: number;
  refundPercent: number;
}

export interface AppConfig {
  paymentsEnabled: boolean;
  platformFeePercent: number;
  paymentWindowHours: number;
  disputeWindowHours: number;
  customerCancellationPolicy: CancellationBand[];
}

export interface PayBookingResponse {
  orderId: string;
  keyId: string;
  amountPaise: number;
  checkoutUrl: string;
}

export interface PaymentStatusResponse {
  bookingId: number;
  bookingStatus: BookingStatus;
  paymentStatus: string | null;
  amountPaise: number | null;
  paymentDueAt: string | null;
}

export type PayoutStatus = 'NOT_STARTED' | 'PENDING' | 'ACTIVE' | 'REJECTED';

export interface PayoutAccount {
  status: PayoutStatus;
  legalName: string | null;
  ifsc: string | null;
  accountNumberMasked: string | null;
}

export interface PayoutAddress {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface PayoutDetailsInput {
  legalName: string;
  email: string;
  phone: string;
  pan: string;
  accountNumber: string;
  ifsc: string;
  address: PayoutAddress;
}

export interface PayoutBankUpdateInput {
  legalName: string;
  accountNumber: string;
  ifsc: string;
}

export interface DisputeMessage {
  content: string;
  createdAt: string;
  sender: { id: number; name: string | null; role: string };
}

export interface AdminDispute {
  id: number;
  status: BookingStatus;
  eventType?: string;
  eventLocation?: string;
  amountPaise: number | null;
  disputeReason: string | null;
  disputedAt: string | null;
  eventEndsAt?: string | null;
  artist: { id: number; artistName: string };
  customer: {
    id: number;
    name: string | null;
    venueName: string | null;
    email: string | null;
    phone: string | null;
  };
  slot: { date: string; startTime: string; endTime: string } | null;
  payment: {
    amountPaise: number;
    artistSharePaise: number;
    platformFeePaise: number;
    status: string;
  } | null;
  messages: DisputeMessage[];
}

export type DisputeOutcome = 'PAY_ARTIST' | 'REFUND' | 'SPLIT';

export const api = {
  // Auth
  syncFirebaseUser: (idToken: string) =>
    request<any>('/auth/firebase', { method: 'POST', body: JSON.stringify({ idToken }) }),
  completeSignup: (body: { idToken: string; role: string; name: string; email?: string; phone?: string }) =>
    request<any>('/auth/complete-signup', { method: 'POST', body: JSON.stringify(body) }),
  getMe: () => request<any>('/auth/me'),

  // User Profile
  getProfile: () => request<UserProfileResponse>('/users/me'),
  updateProfile: (body: { name?: string; venueName?: string; city?: string; contactPhone?: string }) =>
    request<{ user: any }>('/users/me', { method: 'PUT', body: JSON.stringify(body) }),

  // Discovery (Verified Artists only)
  getArtists: (params?: ArtistFilterParams) => {
    const cleanedParams: Record<string, string> = {};
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          cleanedParams[key] = String(val);
        }
      });
    }
    const query = new URLSearchParams(cleanedParams).toString();
    return request<{ artists: any[] }>(`/artists${query ? `?${query}` : ''}`);
  },
  getArtistById: (id: number) => request<{ artist: any; averageRating?: number | null; reviewCount?: number }>(`/artists/${id}`),

  // Artist Management
  onboardArtist: (body: Record<string, any> & { payout?: PayoutDetailsInput }) => request<any>('/artists/onboard', { method: 'POST', body: JSON.stringify(body) }),
  updateSchedule: (slots: any[]) => request<any>('/artists/schedule', { method: 'POST', body: JSON.stringify({ slots }) }),
  getMyProfile: () => request<ArtistStudioProfileResponse>('/artists/my-profile'),
  updateArtistProfile: (body: UpdateArtistProfileInput) =>
    request<ArtistStudioProfileResponse>('/artists/my-profile', { method: 'PUT', body: JSON.stringify(body) }),

  // Payouts (artist)
  getPayoutAccount: () => request<{ payoutAccount: PayoutAccount }>('/artists/payout-account'),
  setUpPayoutAccount: (body: PayoutDetailsInput) =>
    request<{ payoutAccount: PayoutAccount }>('/artists/payout-account', { method: 'POST', body: JSON.stringify(body) }),
  updatePayoutBank: (body: PayoutBankUpdateInput) =>
    request<{ payoutAccount: PayoutAccount }>('/artists/payout-account', { method: 'PUT', body: JSON.stringify(body) }),

  // Reviews & Ratings
  submitBookingReview: (bookingId: number, body: ReviewInput) =>
    request<{ message: string; review: any }>(`/bookings/${bookingId}/review`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  getArtistReviews: (artistId: number) =>
    request<ArtistReviewsResponse>(`/artists/${artistId}/reviews`),

  // Bookings & Messages
  createBooking: (body: any) => request<any>('/bookings', { method: 'POST', body: JSON.stringify(body) }),
  getBookings: () => request<{ bookings: any[] }>('/bookings'),
  respondToBooking: (id: number, action: 'ACCEPT' | 'DECLINED') =>
    request<any>(`/bookings/${id}/respond`, { method: 'PUT', body: JSON.stringify({ action }) }),
  completeBooking: (bookingId: number) =>
    request<{ message: string; booking: any }>(`/bookings/${bookingId}/complete`, { method: 'POST' }),
  payBooking: (bookingId: number) =>
    request<PayBookingResponse>(`/bookings/${bookingId}/pay`, { method: 'POST' }),
  getPaymentStatus: (bookingId: number) =>
    request<PaymentStatusResponse>(`/bookings/${bookingId}/payment-status`),
  cancelBooking: (bookingId: number, reason?: string) =>
    request<{ message: string; booking: any; refundPaise: number }>(`/bookings/${bookingId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(reason ? { reason } : {})
    }),
  disputeBooking: (bookingId: number, reason: string) =>
    request<{ message: string; booking: any }>(`/bookings/${bookingId}/dispute`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),
  getMessages: (bookingId: number) => request<{ messages: any[] }>(`/bookings/${bookingId}/messages`),
  sendMessage: (bookingId: number, content: string) =>
    request<any>(`/bookings/${bookingId}/messages`, { method: 'POST', body: JSON.stringify({ content }) }),

  // Config
  getConfig: () => request<AppConfig>('/config'),

  // Admin
  getDisputes: () => request<{ disputes: AdminDispute[] }>('/admin/disputes'),
  resolveDispute: (bookingId: number, outcome: DisputeOutcome, refundPaise?: number) =>
    request<{ message: string; booking: any }>(`/admin/disputes/${bookingId}/resolve`, {
      method: 'POST',
      body: JSON.stringify(outcome === 'SPLIT' ? { outcome, refundPaise } : { outcome })
    }),
  getPendingArtists: () => request<{ pendingArtists: any[] }>('/admin/artists/pending'),
  verifyArtist: (id: number, status: 'VERIFIED' | 'REJECTED') =>
    request<any>(`/admin/artists/${id}/verify`, { method: 'PUT', body: JSON.stringify({ status }) })
};
