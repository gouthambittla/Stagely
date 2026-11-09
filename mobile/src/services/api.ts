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
  onboardArtist: (body: any) => request<any>('/artists/onboard', { method: 'POST', body: JSON.stringify(body) }),
  updateSchedule: (slots: any[]) => request<any>('/artists/schedule', { method: 'POST', body: JSON.stringify({ slots }) }),
  getMyProfile: () => request<ArtistStudioProfileResponse>('/artists/my-profile'),
  updateArtistProfile: (body: UpdateArtistProfileInput) =>
    request<ArtistStudioProfileResponse>('/artists/my-profile', { method: 'PUT', body: JSON.stringify(body) }),

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
  getMessages: (bookingId: number) => request<{ messages: any[] }>(`/bookings/${bookingId}/messages`),
  sendMessage: (bookingId: number, content: string) =>
    request<any>(`/bookings/${bookingId}/messages`, { method: 'POST', body: JSON.stringify({ content }) }),

  // Admin
  getPendingArtists: () => request<{ pendingArtists: any[] }>('/admin/artists/pending'),
  verifyArtist: (id: number, status: 'VERIFIED' | 'REJECTED') =>
    request<any>(`/admin/artists/${id}/verify`, { method: 'PUT', body: JSON.stringify({ status }) })
};
