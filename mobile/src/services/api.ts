import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';
const TOKEN_KEY = 'stagely_jwt_token';

export async function getAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearAuthToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data as T;
}

export const api = {
  // Auth
  register: (body: any) => request<any>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: any) => request<any>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
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
