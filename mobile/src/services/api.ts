import { Platform } from 'react-native';
import { getAuth, getIdToken } from './firebase';

function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  // Android emulator loopback to host machine
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000/api';
  }
  // iOS simulator or Web
  return 'http://localhost:5000/api';
}

const API_BASE_URL = getApiBaseUrl();

console.log(`🌐 [Stagely Config] API_BASE_URL: ${API_BASE_URL} (Platform: ${Platform.OS})`);

export async function getAuthToken(): Promise<string | null> {
  try {
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (currentUser) {
      return await getIdToken(currentUser);
    }
    return null;
  } catch (err) {
    console.warn('Failed to retrieve Firebase ID token:', err);
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

  const startTime = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers
    });
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ [API Network Failure] ${method} ${url} (${elapsed}ms):`, err?.message || err);
    throw new Error(`Cannot connect to backend server at ${API_BASE_URL}. Ensure the backend is running and reachable on this device.`);
  }

  const duration = Date.now() - startTime;
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error(`⚠️ [API Error ${response.status}] ${method} ${url} (${duration}ms):`, data);
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  console.log(`✅ [API Response ${response.status}] ${method} ${url} (${duration}ms):`, data);
  return data as T;
}

export const api = {
  // Auth
  syncFirebaseUser: (idToken: string) =>
    request<any>('/auth/firebase', { method: 'POST', body: JSON.stringify({ idToken }) }),
  completeSignup: (body: { idToken: string; role: string; name: string; email?: string; phone?: string }) =>
    request<any>('/auth/complete-signup', { method: 'POST', body: JSON.stringify(body) }),
  getMe: () => request<any>('/auth/me'),

  // Discovery (Verified Artists only)
  getArtists: (params?: { location?: string; category?: string; search?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return request<{ artists: any[] }>(`/artists${query ? `?${query}` : ''}`);
  },
  getArtistById: (id: number) => request<{ artist: any }>(`/artists/${id}`),

  // Artist Management
  onboardArtist: (body: any) => request<any>('/artists/onboard', { method: 'POST', body: JSON.stringify(body) }),
  updateSchedule: (slots: any[]) => request<any>('/artists/schedule', { method: 'POST', body: JSON.stringify({ slots }) }),
  getMyProfile: () => request<{ profile: any }>('/artists/my-profile'),

  // Bookings & Messages
  createBooking: (body: any) => request<any>('/bookings', { method: 'POST', body: JSON.stringify(body) }),
  getBookings: () => request<{ bookings: any[] }>('/bookings'),
  respondToBooking: (id: number, action: 'ACCEPT' | 'DECLINED') =>
    request<any>(`/bookings/${id}/respond`, { method: 'PUT', body: JSON.stringify({ action }) }),
  getMessages: (bookingId: number) => request<{ messages: any[] }>(`/bookings/${bookingId}/messages`),
  sendMessage: (bookingId: number, content: string) =>
    request<any>(`/bookings/${bookingId}/messages`, { method: 'POST', body: JSON.stringify({ content }) }),

  // Admin
  getPendingArtists: () => request<{ pendingArtists: any[] }>('/admin/artists/pending'),
  verifyArtist: (id: number, status: 'VERIFIED' | 'REJECTED') =>
    request<any>(`/admin/artists/${id}/verify`, { method: 'PUT', body: JSON.stringify({ status }) })
};
