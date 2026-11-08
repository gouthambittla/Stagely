export interface DecodedFirebaseToken {
  uid: string;
  email?: string;
  phone_number?: string;
  name?: string;
}

let appInstance: any = null;

function getFirebaseApp(): any {
  if (!appInstance) {
    // Dynamic import to avoid ESM transform issues in test runners
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const apps = getApps();
    if (apps.length > 0) {
      appInstance = apps[0];
    } else {
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        let serviceAccount: unknown;
        try {
          serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } catch {
          // Fail fast instead of silently running on other credentials; don't log the value.
          throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON');
        }
        appInstance = initializeApp({
          credential: cert(serviceAccount as any)
        });
      } else if (process.env.NODE_ENV !== 'test') {
        appInstance = initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || 'stagely-b22eb'
        });
      }
    }
  }
  return appInstance;
}

/**
 * Mock `mock_*` tokens bypass Firebase entirely, so they are only honoured in the test
 * runner, or in local development when explicitly opted into with ALLOW_MOCK_AUTH=true.
 * They are never honoured in production, whatever else is set.
 */
export function isMockAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'production') return false;
  return env.NODE_ENV === 'test' || env.ALLOW_MOCK_AUTH === 'true';
}

export async function verifyFirebaseIdToken(token: string): Promise<DecodedFirebaseToken> {
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Missing Firebase ID token');
  }
  // Mock tokens for the test suite and opt-in local development (Expo Go simulator flow)
  if (isMockAuthEnabled() && token.startsWith('mock_')) {
    if (token === 'mock_invalid_token') {
      throw new Error('Invalid or expired Firebase ID token');
    }
    if (token === 'mock_admin_token') {
      return {
        uid: 'firebase_admin_uid_001',
        email: 'admin@stagely.in',
        phone_number: '+919800000001',
        name: 'Stagely Admin'
      };
    }
    if (token === 'mock_artist_token') {
      return {
        uid: 'firebase_artist_uid_001',
        email: 'jammers@stagely.in',
        phone_number: '+919800000002',
        name: 'Jammers Hyderabad Lead'
      };
    }
    if (token === 'mock_customer_token') {
      return {
        uid: 'firebase_customer_uid_001',
        email: 'organizer@breweryhyd.in',
        phone_number: '+919800000005',
        name: 'Brewery Hyd Events'
      };
    }
    if (token.startsWith('mock_new_user_')) {
      const uidSuffix = token.replace('mock_new_user_', '');
      return {
        uid: `firebase_new_uid_${uidSuffix}`,
        phone_number: `+9199000000${uidSuffix}`,
        email: `newuser_${uidSuffix}@stagely.in`
      };
    }
    return {
      uid: token.replace('mock_', 'firebase_'),
      email: `${token.replace('mock_', '')}@stagely.in`,
      phone_number: '+919876543210'
    };
  }

  const app = getFirebaseApp();
  if (!app) {
    throw new Error('Firebase Admin app not initialized');
  }
  const { getAuth } = require('firebase-admin/auth');
  const decoded = await getAuth(app).verifyIdToken(token);
  return {
    uid: decoded.uid,
    email: decoded.email,
    phone_number: decoded.phone_number,
    name: decoded.name
  };
}
