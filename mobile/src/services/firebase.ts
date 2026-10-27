import type {
  ActionCodeSettings,
  ConfirmationResult,
  User as NativeUser,
  Auth as NativeAuth
} from '@react-native-firebase/auth';

export type User = NativeUser | any;
export type Auth = NativeAuth | any;
export type { ConfirmationResult, ActionCodeSettings };

let rnfbAuth: any = null;
let isNativeModuleAvailable = false;

try {
  rnfbAuth = require('@react-native-firebase/auth');
  // Attempt to probe if native TurboApp is active
  if (rnfbAuth && typeof rnfbAuth.getAuth === 'function') {
    const testAuth = rnfbAuth.getAuth();
    if (testAuth) {
      isNativeModuleAvailable = true;
    }
  }
} catch {
  isNativeModuleAvailable = false;
  console.log('📱 [Stagely Auth] Running in Expo Go mode (Mock OTP mode enabled).');
}

// In-memory auth state for Expo Go / dev mock fallback
let mockCurrentUser: any = null;
const authListeners: Array<(user: any) => void> = [];

function notifyListeners() {
  authListeners.forEach((fn) => fn(mockCurrentUser));
}

export function getAuth(): any {
  if (isNativeModuleAvailable && rnfbAuth) {
    try {
      return rnfbAuth.getAuth();
    } catch {
      // Fall through to mock if runtime fails
    }
  }
  return {
    get currentUser() {
      return mockCurrentUser;
    }
  };
}

export async function signInWithPhoneNumber(
  auth: any,
  phoneNumber: string
): Promise<ConfirmationResult> {
  if (isNativeModuleAvailable && rnfbAuth) {
    try {
      return await rnfbAuth.signInWithPhoneNumber(auth, phoneNumber);
    } catch (err: any) {
      console.warn('Native signInWithPhoneNumber failed, falling back to simulator:', err);
    }
  }

  // Expo Go Simulation Mode
  console.log(`📱 [Expo Go] Sending simulated OTP to ${phoneNumber}. Use code: 123456`);
  return {
    confirm: async (verificationCode: string) => {
      if (verificationCode !== '123456' && verificationCode !== '000000') {
        throw new Error('Invalid verification code. In Expo Go simulator, use 123456.');
      }

      // Generate consistent mock user for seed data or fresh user
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      let uid = `mock_user_${cleanPhone}`;
      let token = `mock_customer_token`;

      if (cleanPhone.endsWith('9800000001')) {
        uid = 'firebase_admin_uid_001';
        token = 'mock_admin_token';
      } else if (cleanPhone.endsWith('9800000002')) {
        uid = 'firebase_artist_uid_001';
        token = 'mock_artist_token';
      } else if (cleanPhone.endsWith('9800000005')) {
        uid = 'firebase_customer_uid_001';
        token = 'mock_customer_token';
      } else {
        uid = `firebase_new_uid_${cleanPhone.slice(-4)}`;
        token = `mock_new_user_${cleanPhone.slice(-4)}`;
      }

      const mockUser = {
        uid,
        phoneNumber,
        email: null,
        displayName: null,
        getIdToken: async () => token
      };

      mockCurrentUser = mockUser;
      notifyListeners();
      return { user: mockUser };
    }
  } as any;
}

export async function sendSignInLinkToEmail(
  auth: any,
  email: string,
  actionCodeSettings: ActionCodeSettings
): Promise<void> {
  if (isNativeModuleAvailable && rnfbAuth) {
    try {
      return await rnfbAuth.sendSignInLinkToEmail(auth, email, actionCodeSettings);
    } catch (err) {
      console.warn('Native sendSignInLinkToEmail failed, falling back to simulator:', err);
    }
  }

  console.log(`📱 [Expo Go] Simulated magic link sent to ${email}. Tap link simulation in console.`);
}

export function isSignInWithEmailLink(auth: any, emailLink: string): boolean {
  if (isNativeModuleAvailable && rnfbAuth) {
    try {
      return rnfbAuth.isSignInWithEmailLink(auth, emailLink);
    } catch {
      // Fall through
    }
  }
  return emailLink.includes('stagely') || emailLink.includes('apiKey');
}

export async function signInWithEmailLink(
  auth: any,
  email: string,
  emailLink: string
): Promise<any> {
  if (isNativeModuleAvailable && rnfbAuth) {
    try {
      return await rnfbAuth.signInWithEmailLink(auth, email, emailLink);
    } catch (err) {
      console.warn('Native signInWithEmailLink failed, falling back to simulator:', err);
    }
  }

  const mockUser = {
    uid: `mock_email_${email.replace(/[^a-zA-Z0-9]/g, '_')}`,
    email,
    phoneNumber: null,
    displayName: null,
    getIdToken: async () => `mock_new_user_${Date.now()}`
  };

  mockCurrentUser = mockUser;
  notifyListeners();
  return { user: mockUser };
}

export async function signOut(auth: any): Promise<void> {
  if (isNativeModuleAvailable && rnfbAuth) {
    try {
      await rnfbAuth.signOut(auth);
    } catch {
      // Fall through
    }
  }
  mockCurrentUser = null;
  notifyListeners();
}

export function onAuthStateChanged(
  auth: any,
  listener: (user: any) => void
): () => void {
  if (isNativeModuleAvailable && rnfbAuth) {
    try {
      return rnfbAuth.onAuthStateChanged(auth, listener);
    } catch {
      // Fall through
    }
  }

  authListeners.push(listener);
  // Initial callback with current state
  setTimeout(() => listener(mockCurrentUser), 0);

  return () => {
    const idx = authListeners.indexOf(listener);
    if (idx !== -1) authListeners.splice(idx, 1);
  };
}

export async function getIdToken(user: any): Promise<string> {
  if (user && typeof user.getIdToken === 'function') {
    return await user.getIdToken();
  }
  return 'mock_customer_token';
}

/**
 * Format phone number to standard E.164 format (+91 for India by default)
 */
export function formatPhoneNumber(input: string, countryCode = '+91'): string {
  const cleaned = input.replace(/\D/g, '');
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  if (cleaned.length === 10) {
    return `${countryCode}${cleaned}`;
  }
  if (input.startsWith('+')) {
    return `+${cleaned}`;
  }
  return `${countryCode}${cleaned}`;
}

/**
 * Validate standard 10-digit Indian mobile number or full international format
 */
export function isValidPhoneNumber(input: string): boolean {
  const cleaned = input.replace(/\D/g, '');
  if (cleaned.length === 10) return true;
  if (cleaned.startsWith('91') && cleaned.length === 12) return true;
  return cleaned.length >= 10 && cleaned.length <= 15;
}

/**
 * Action code settings for Firebase Passwordless Email Link
 */
export const emailLinkActionSettings: ActionCodeSettings = {
  url: 'https://stagely-b22eb.firebaseapp.com/__/auth/action',
  handleCodeInApp: true,
  iOS: {
    bundleId: 'com.stagely.app'
  },
  android: {
    packageName: 'com.stagely.app',
    installApp: true,
    minimumVersion: '1'
  }
};
