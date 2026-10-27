import {
  getAuth,
  signInWithPhoneNumber,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
  onAuthStateChanged,
  getIdToken,
  User,
  ConfirmationResult,
  ActionCodeSettings,
  Auth
} from '@react-native-firebase/auth';

export {
  getAuth,
  signInWithPhoneNumber,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
  onAuthStateChanged,
  getIdToken,
  User,
  ConfirmationResult,
  ActionCodeSettings,
  Auth
};

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
