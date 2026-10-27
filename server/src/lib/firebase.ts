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
        try {
          const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
          appInstance = initializeApp({
            credential: cert(serviceAccount)
          });
        } catch (err) {
          console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT, falling back to default credential:', err);
          appInstance = initializeApp();
        }
      } else if (process.env.NODE_ENV !== 'test') {
        appInstance = initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || 'stagely-b22eb'
        });
      }
    }
  }
  return appInstance;
}

export async function verifyFirebaseIdToken(token: string): Promise<DecodedFirebaseToken> {
  // Test mode mock tokens support
  if (process.env.NODE_ENV === 'test' && token.startsWith('mock_')) {
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
