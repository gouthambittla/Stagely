# Firebase OTP Auth — Design Document

## Intent & Why

Stagely currently uses email + password authentication. Users in India expect phone-first, passwordless login — OTP on phone, no passwords to remember. This change replaces the entire auth system with Firebase Authentication: **phone OTP as the primary login** and **email magic link as the secondary option**. Passwords go away entirely. The admin (a single user) also moves to Firebase, so there's one unified auth system with no JWT.

## Goals

- **Phone OTP primary login:** user enters phone number → receives 6-digit SMS OTP via Firebase → verifies → in.
- **Email magic link secondary:** user taps "Use email instead" → enters email → receives magic link → taps link → deep links back into the app → in.
- **Single auth system:** Firebase ID tokens for all API calls, for all roles (Customer, Artist, Admin). No JWT, no bcrypt, no password storage.
- **New user onboarding:** after first-time verification, new users pick their role (Booker vs Artist) and enter their name before entering the app.
- **Deep linking:** email magic link opens the app directly on both iOS and Android.
- **Admin simplicity:** admin is one user (the owner). They log in the same way (phone or email link). Their `role: ADMIN` is set directly in the database.

## Non-Goals

- Social login (Google, Apple, Facebook) — not now.
- Admin panel or admin-specific auth flow — admin logs in like everyone else.
- Password reset / forgot password — no passwords exist.
- Email verification as a separate step — Firebase handles verification implicitly.
- Multi-factor authentication.

## Anti-Goals (What Would Make This a Failure)

- Two authentication systems running in parallel (JWT + Firebase tokens). The point is to simplify to one.
- Users needing to create a password at any point in the flow.
- Email magic link opening in a browser instead of deep linking back to the app.
- Existing API endpoints breaking because the auth middleware changed.

## Constraints

- **Expo managed workflow:** the mobile app uses Expo SDK 58. Firebase phone auth requires `@react-native-firebase/auth` which needs a **development build** (not Expo Go). This means running `expo prebuild` and building with EAS or locally.
- **Deep linking configuration:** email magic link requires URL scheme and universal/app links configured in `app.json` and Firebase console.
- **Firebase project required:** a Firebase project must be created with Authentication enabled (Phone and Email Link providers).
- **Fresh database start:** database will be reset clean, purging `passwordHash` entirely and seeding with Firebase UID-based test accounts.
- **All existing API routes** (`/api/bookings/*`, `/api/artists/*`, `/api/admin/*`, `/api/auth/me`) must continue working — only the token verification mechanism changes.

## Approaches Considered

### Approach A: Firebase for phone OTP + custom server-side email OTP ❌

Firebase handles phone verification on the client. For email, the server generates a 6-digit code, stores it temporarily, sends it via an email service (SendGrid/Resend), and verifies it. Server issues its own JWT after either verification.

**Rejected because:** two different verification systems to maintain, still need JWT, need to set up and pay for an email delivery service, more server-side complexity.

### Approach B: Fully custom OTP (no Firebase) ❌

Server handles both phone and email OTP itself using SMS gateway (MSG91/Twilio) and email service (SendGrid/Resend).

**Rejected because:** SMS gateway cost from day one, no Android auto-read OTP, need to handle SMS delivery reliability in India, much more backend work, still need JWT.

### Approach C: Firebase for everything (phone OTP + email magic link) ✅ — Chosen

Both phone OTP and email magic link go through Firebase Auth. All users (including admin) get Firebase ID tokens. Server verifies Firebase ID tokens only — no JWT, no bcrypt.

**Chosen because:**
- Single auth system — one middleware, one token type
- Firebase handles SMS delivery, auto-read on Android, email delivery, token refresh
- No secrets to manage (no JWT_SECRET)
- No passwords stored anywhere
- Free tier: 10K phone verifications/month
- Simplest possible server middleware

## Detailed Design

### 1. Firebase Setup (One-Time)

- Create a Firebase project (or use existing if one exists)
- Enable Authentication providers: **Phone** and **Email Link (Passwordless)**
- Download `google-services.json` (Android) and `GoogleService-Info.plist` (iOS)
- Set up Firebase Admin SDK credentials on the server (service account key)
- Configure authorized domains and dynamic links for email magic link deep linking

### 2. Database Schema Changes

```prisma
model User {
  id          Int            @id @default(autoincrement())
  firebaseUid String         @unique       // Firebase UID — required primary foreign link
  email       String?        @unique       // Optional — users signing up via phone may add later
  phone       String?        @unique       // Optional — users signing up via email may add later
  name        String?                      // Collected during new-user onboarding
  role        String                       // CUSTOMER, ARTIST, ADMIN
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  artistProfile    ArtistProfile?
  customerBookings Booking[]      @relation("CustomerBookings")
  sentMessages     Message[]      @relation("UserSentMessages")
}
```

**Clean Slate Strategy:**
- `passwordHash` is completely purged from the schema — no legacy columns or tech debt.
- `firebaseUid` is strictly required (`String @unique`).
- Database will be reset clean via `prisma migrate reset` or `prisma db push --force-reset`.
- Seed scripts will be updated to use Firebase UIDs for sample artists and admin.

### 3. Server-Side Changes

#### 3a. New Firebase Auth Middleware

Replace the JWT-based `authenticate` middleware with a Firebase ID token verifier:

```
authenticateFirebase middleware:
1. Extract Bearer token from Authorization header
2. Call admin.auth().verifyIdToken(token)
3. Look up User by firebaseUid from the decoded token
4. If user not found → return 401 (user must complete onboarding first)
5. Attach user to req.user (same shape: { id, email, role })
6. Call next()
```

The `requireRole` middleware stays exactly as-is — it only reads `req.user.role`.

#### 3b. New Auth Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/firebase` | No (receives Firebase ID token in body) | Exchanges Firebase ID token for user data. If user exists by `firebaseUid`, returns user. If not, returns `{ isNewUser: true }`. |
| `POST` | `/api/auth/complete-signup` | No (receives Firebase ID token in body) | For new users: receives Firebase ID token + `role` + `name`, creates User record, returns user data. |
| `GET` | `/api/auth/me` | Yes (Firebase ID token) | Returns current user with artistProfile (unchanged behavior, new middleware). |

#### 3c. Removed

- `POST /api/auth/register` — replaced by `/auth/complete-signup`
- `POST /api/auth/login` — replaced by `/auth/firebase`
- `bcryptjs` dependency — removed
- `jsonwebtoken` dependency — removed
- `JWT_SECRET` — removed

#### 3d. New Dependencies (Server)

- `firebase-admin` — for `admin.auth().verifyIdToken()`

### 4. Mobile-Side Changes

#### 4a. New Dependencies

- `@react-native-firebase/app` — Firebase core
- `@react-native-firebase/auth` — Firebase Auth (phone OTP + email link)
- Expo config plugin for Firebase (or manual native config via `expo prebuild`)

#### 4b. New Screen Flow

**Current flow:**
```
LandingScreen (role pick) → AuthScreen (email+password) → Dashboard
```

**New flow:**
```
PhoneLoginScreen (phone input, "Use email instead" link)
  ├─ Phone path → OtpVerificationScreen (6-digit code input) → Firebase ID token
  └─ Email path → EmailLinkScreen (email input, "Check your inbox" state) → deep link back → Firebase ID token
      ↓
  Server: POST /auth/firebase with token
      ↓
  Existing user? → Dashboard
  New user? → RoleAndNameScreen (role picker + name input) → POST /auth/complete-signup → Dashboard
```

**Screens to create:**
1. **PhoneLoginScreen** — phone number input with country code (+91 default), "Use email instead" link at bottom. Replaces LandingScreen + AuthScreen for non-admin flow.
2. **OtpVerificationScreen** — 6-digit code input with auto-focus, auto-submit, resend timer. Shows after Firebase sends SMS.
3. **EmailLinkScreen** — email input → submit → "Check your inbox" waiting state. Handles incoming deep link from magic link.
4. **RoleAndNameScreen** — role picker (Booker vs Artist) + name text input. Shown only for new users.

**Screens to remove:**
- `AuthScreen.tsx` — replaced entirely

**Screens to modify:**
- `LandingScreen.tsx` — becomes the PhoneLoginScreen (or is replaced by it). The role selection cards move to RoleAndNameScreen.

#### 4c. AuthContext Changes

```typescript
interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseAuthTypes.User | null;
  isLoading: boolean;
  isNewUser: boolean;
  sendPhoneOtp: (phoneNumber: string) => Promise<ConfirmationResult>;
  verifyPhoneOtp: (code: string) => Promise<void>;
  sendEmailLink: (email: string) => Promise<void>;
  completeSignup: (role: UserRole, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}
```

Key changes:
- `login()` and `register()` replaced by `sendPhoneOtp()`, `verifyPhoneOtp()`, `sendEmailLink()`, `completeSignup()`
- `firebaseUser` tracked separately from the backend `user` (Firebase auth may succeed before the user record exists in the database)
- `isNewUser` flag drives whether to show RoleAndNameScreen
- Token management moves to Firebase SDK (auto-refresh, `getIdToken()` on every API call)

#### 4d. API Client Changes

The `api.ts` request function changes how it gets the token:

```
Before: token = await getAuthToken()  // from SecureStore
After:  token = await auth().currentUser?.getIdToken()  // from Firebase SDK
```

`expo-secure-store` is no longer needed for auth token storage (Firebase SDK manages its own token persistence). It may still be used for other app data.

#### 4e. Deep Linking Configuration

For email magic link to open the app:

**`app.json` additions:**
```json
{
  "expo": {
    "scheme": "stagely",
    "ios": {
      "bundleIdentifier": "com.stagely.app",
      "associatedDomains": ["applinks:stagely.page.link"]
    },
    "android": {
      "package": "com.stagely.app",
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [{ "scheme": "https", "host": "stagely.page.link", "pathPrefix": "/" }],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}
```

**Firebase Console:**
- Set up Firebase Dynamic Links (or use custom domain) for email action links
- Configure `actionCodeSettings` with the app's URL scheme and bundle ID / package name

### 5. Navigation Changes

The `RootNavigator` conditional rendering logic updates:

```
1. isLoading → Loading spinner (unchanged)
2. No firebaseUser → PhoneLoginScreen
3. firebaseUser exists but no backend user (isNewUser) → RoleAndNameScreen
4. user.role === 'ADMIN' → AdminVerificationScreen (unchanged)
5. user.role === 'ARTIST' without profile → OnboardingWizardScreen (unchanged)
6. user.role === 'ARTIST' with profile → Artist tabs (unchanged)
7. user.role === 'CUSTOMER' → Customer tabs (unchanged)
```

Only steps 2 and 3 change. Everything after authentication is identical.

### 6. Admin Setup

The admin user (single user — the project owner) is set up by:

1. Admin logs in via phone or email link like any user
2. After their User record is created (via complete-signup with any role), manually update their `role` to `'ADMIN'` in the database:
   ```sql
   UPDATE "User" SET role = 'ADMIN' WHERE "firebaseUid" = '<admin-firebase-uid>';
   ```
3. Alternatively, a seed script can check the Firebase UID and set admin role.

No separate admin auth flow needed.

## What's Left to the Builder

- Exact UI styling of new screens (should match existing dark theme: `#0B0D13` background, `#F5A623` accents, existing typography)
- Country code picker implementation details (default to +91, whether to support other codes)
- OTP auto-read implementation details on Android
- Resend OTP timer duration (30s or 60s is standard)
- Error messages and edge case handling (network errors, invalid phone format, expired OTP)
- Firebase project naming and configuration details
- Whether to keep `expo-secure-store` dependency for non-auth storage or remove it
- Prisma migration strategy (whether to drop and recreate for dev, or write a proper migration)
- Deep link domain choice (Firebase Dynamic Links vs custom domain)
- Bundle identifier / package name for iOS and Android (used `com.stagely.app` as placeholder)
