# Firebase OTP & Magic Link Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace legacy email/password authentication with Firebase Phone OTP (primary) and Email Magic Link (fallback), unifying all authentication under Firebase ID tokens with zero passwords and zero JWTs.

**Architecture:** The mobile app leverages `@react-native-firebase/auth` for native Phone OTP verification and deep-linked Email Magic Links. Upon verification, the client obtains a Firebase ID token and exchanges it with the Node.js backend. The backend verifies the token via `firebase-admin`, provisions or retrieves users by `firebaseUid`, and guards all routes with a single Firebase auth middleware.

**Tech Stack:** React Native (Expo SDK 58), `@react-native-firebase/app`, `@react-native-firebase/auth`, Node.js / Express, `firebase-admin`, Prisma ORM (PostgreSQL/SQLite), Jest, Supertest.

**Spec:** [docs/superpowers/specs/2026-10-27-firebase-otp-auth-design.md](file:///D:/Stagely/docs/superpowers/specs/2026-10-27-firebase-otp-auth-design.md)

## Global Constraints

- **Single token type:** Only Firebase ID tokens are accepted for API requests; `jsonwebtoken` and `bcryptjs` are completely removed.
- **Clean DB slate:** `passwordHash` column is purged; `firebaseUid` is required and unique (`String @unique`).
- **App Bundle ID / Package Name:** `com.stagely.app` for both Android and iOS in `app.json`.
- **Firebase Project ID:** `stagely-b22eb`.
- **Role & Name flow:** Brand new users must pick their role (`CUSTOMER` or `ARTIST`) and enter their display name immediately after OTP verification before entering the app.
- **Admin simplicity:** Admin uses the same Firebase OTP login; their role is flagged as `ADMIN` directly in the database.

## Review Focus

1. **Unregistered user attempting authenticated route:** If a user verifies via Firebase but has not submitted the `RoleAndNameScreen` (`/auth/complete-signup`), API requests return `401 Unauthorized` with `code: 'USER_NOT_REGISTERED'`.
2. **Expired or malformed Firebase ID token:** Backend middleware catches Firebase token errors gracefully and returns `401` with clear error messages instead of throwing 500 errors.
3. **Invalid or malformed phone number input:** Mobile UI validates E.164 phone format (+91 prefix default) before triggering Firebase SMS.
4. **Resend OTP throttling:** OTP screen prevents rapid-fire resend requests with a 30-second cooldown timer.
5. **Deep link cold start:** App properly parses email magic link whether opened in background or launched fresh from a closed state.

---

### Task 1: Database Schema Reset & Seed Update

**Files:**
- Modify: `server/prisma/schema.prisma`
- Modify: `server/prisma/seed.ts`
- Test: `server/tests/db.test.ts`

**Interfaces:**
- Consumes: Prisma CLI
- Produces: `User` model with `firebaseUid String @unique`, `email String? @unique`, `phone String? @unique`, `name String?`, `role String`.

- [ ] **Step 1: Write test for new User model schema**

Verify `User` model requires `firebaseUid` and allows optional `email` and `phone` without `passwordHash`.

```typescript
// server/tests/db.test.ts
it('creates user with firebaseUid and no passwordHash', async () => {
  const user = await prisma.user.create({
    data: {
      firebaseUid: 'test_firebase_uid_123',
      phone: '+919876543210',
      name: 'Rohan Sharma',
      role: 'CUSTOMER'
    }
  });
  expect(user.id).toBeDefined();
  expect(user.firebaseUid).toBe('test_firebase_uid_123');
  expect((user as any).passwordHash).toBeUndefined();
  await prisma.user.delete({ where: { id: user.id } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/db.test.ts` in `server/`
Expected: FAIL due to schema requiring `passwordHash` and missing `firebaseUid`.

- [ ] **Step 3: Update `server/prisma/schema.prisma` and push reset**

Remove `passwordHash` and add `firebaseUid`, `phone`, and `name`:

```prisma
model User {
  id          Int            @id @default(autoincrement())
  firebaseUid String         @unique
  email       String?        @unique
  phone       String?        @unique
  name        String?
  role        String         // CUSTOMER, ARTIST, ADMIN
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  artistProfile    ArtistProfile?
  customerBookings Booking[]      @relation("CustomerBookings")
  sentMessages     Message[]      @relation("UserSentMessages")
}
```

Run: `npx prisma db push --force-reset`

- [ ] **Step 4: Update `server/prisma/seed.ts`**

Update seed data to use mock Firebase UIDs (`firebase_admin_uid_001`, `firebase_artist_uid_001`, etc.) without `passwordHash`.
Run: `npm run db:seed`

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test tests/db.test.ts` in `server/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/seed.ts server/tests/db.test.ts
git commit -m "feat(db): update User schema for Firebase UID and reset database"
```

---

### Task 2: Backend Firebase Admin SDK & Middleware

**Files:**
- Create: `server/src/lib/firebase.ts`
- Modify: `server/src/middlewares/auth.middleware.ts`
- Modify: `server/package.json`
- Test: `server/tests/auth_middleware.test.ts`

**Interfaces:**
- Consumes: `firebase-admin`
- Produces: `authenticate(req, res, next)` middleware, `requireRole(roles)` middleware. `req.user` shape: `{ id: number; firebaseUid: string; email?: string; phone?: string; role: UserRole }`.

- [ ] **Step 1: Install `firebase-admin` and remove `jsonwebtoken` / `bcryptjs`**

Run: `npm install firebase-admin && npm uninstall jsonwebtoken bcryptjs @types/jsonwebtoken @types/bcryptjs` in `server/`.

- [ ] **Step 2: Create `server/src/lib/firebase.ts` with mock/test mode support**

Provide a Firebase Admin wrapper that verifies ID tokens using `admin.auth().verifyIdToken()`, with test-mode bypass when `NODE_ENV === 'test'` or `FIREBASE_AUTH_EMULATOR_HOST` is set.

- [ ] **Step 3: Write test for `authenticate` middleware**

```typescript
// server/tests/auth_middleware.test.ts
it('rejects requests without Authorization header with 401', async () => { ... });
it('rejects invalid Firebase tokens with 401', async () => { ... });
it('attaches db user to req.user on valid token', async () => { ... });
```

- [ ] **Step 4: Update `server/src/middlewares/auth.middleware.ts`**

Implement token verification using `verifyFirebaseToken()` and database lookup via `prisma.user.findUnique({ where: { firebaseUid } })`.

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test tests/auth_middleware.test.ts` in `server/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/firebase.ts server/src/middlewares/auth.middleware.ts server/package.json
git commit -m "feat(server): implement Firebase ID token verification middleware"
```

---

### Task 3: Backend Auth Endpoints & Service Update

**Files:**
- Modify: `server/src/services/auth.service.ts`
- Modify: `server/src/routes/auth.routes.ts`
- Test: `server/tests/auth_and_onboarding.test.ts`

**Interfaces:**
- Consumes: `verifyFirebaseToken(idToken: string)`
- Produces:
  - `POST /api/auth/firebase` (Body: `{ idToken }` -> `{ user }` or `{ isNewUser: true, firebaseUid }`)
  - `POST /api/auth/complete-signup` (Body: `{ idToken, role, name, email?, phone? }` -> `{ user }`)
  - `GET /api/auth/me` (Headers: `Authorization: Bearer <idToken>` -> `{ user }`)

- [ ] **Step 1: Update `auth_and_onboarding.test.ts` with Firebase flow tests**

```typescript
// server/tests/auth_and_onboarding.test.ts
it('returns isNewUser: true when Firebase UID does not exist in db', async () => {
  const res = await request(app).post('/api/auth/firebase').send({ idToken: 'mock_new_artist_token' });
  expect(res.status).toBe(200);
  expect(res.body.isNewUser).toBe(true);
});

it('completes signup with role and name, then logs in', async () => {
  const res = await request(app).post('/api/auth/complete-signup').send({
    idToken: 'mock_new_artist_token',
    role: 'ARTIST',
    name: 'Kabir Music'
  });
  expect(res.status).toBe(201);
  expect(res.body.user.role).toBe('ARTIST');
  expect(res.body.user.name).toBe('Kabir Music');
});
```

- [ ] **Step 2: Update `server/src/services/auth.service.ts`**

Implement `AuthService.syncFirebaseUser(idToken)` and `AuthService.completeSignup({ idToken, role, name, email, phone })`.
Remove legacy `AuthService.login` and `AuthService.register` methods.

- [ ] **Step 3: Update `server/src/routes/auth.routes.ts`**

Map `/firebase` and `/complete-signup` routes, and guard `/me` with the new Firebase `authenticate` middleware.

- [ ] **Step 4: Run server test suite**

Run: `npm test` in `server/`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/auth.service.ts server/src/routes/auth.routes.ts server/tests/auth_and_onboarding.test.ts
git commit -m "feat(server): add Firebase auth exchange and complete-signup endpoints"
```

---

### Task 4: Mobile App Firebase Configuration & Prebuild Prep

**Files:**
- Modify: `mobile/app.json`
- Modify: `mobile/package.json`
- Create: `mobile/src/services/firebase.ts`

**Interfaces:**
- Consumes: `google-services.json`, `GoogleService-Info.plist`
- Produces: configured `@react-native-firebase/app` and `@react-native-firebase/auth` instances.

- [ ] **Step 1: Install `@react-native-firebase/app` and `@react-native-firebase/auth`**

Run: `npx expo install @react-native-firebase/app @react-native-firebase/auth` in `mobile/`.

- [ ] **Step 2: Update `mobile/app.json` with bundle IDs, URL scheme, and config plugins**

```json
{
  "expo": {
    "name": "Stagely",
    "slug": "stagely",
    "scheme": "stagely",
    "ios": {
      "bundleIdentifier": "com.stagely.app",
      "googleServicesFile": "./GoogleService-Info.plist"
    },
    "android": {
      "package": "com.stagely.app",
      "googleServicesFile": "./google-services.json"
    },
    "plugins": [
      "@react-native-firebase/app",
      "@react-native-firebase/auth"
    ]
  }
}
```

- [ ] **Step 3: Create `mobile/src/services/firebase.ts`**

Export typed Firebase Auth helpers (`auth()`, phone sign-in, email link validation).

- [ ] **Step 4: Commit**

```bash
git add mobile/app.json mobile/package.json mobile/src/services/firebase.ts
git commit -m "feat(mobile): configure Firebase SDK and Expo native plugins"
```

---

### Task 5: Mobile AuthContext & API Client Overhaul

**Files:**
- Modify: `mobile/src/context/AuthContext.tsx`
- Modify: `mobile/src/services/api.ts`

**Interfaces:**
- Consumes: Firebase Auth SDK, `mobile/src/services/api.ts`
- Produces: `useAuth()` hook providing:
  - `user: User | null`
  - `isLoading: boolean`
  - `isNewUser: boolean`
  - `sendPhoneOtp(phone: string): Promise<any>`
  - `verifyPhoneOtp(code: string): Promise<void>`
  - `sendEmailLink(email: string): Promise<void>`
  - `completeSignup(role: UserRole, name: string): Promise<void>`
  - `logout(): Promise<void>`

- [ ] **Step 1: Update `mobile/src/services/api.ts`**

Update `request()` helper to retrieve the fresh ID token directly via `auth().currentUser?.getIdToken()` for all outgoing API requests instead of `SecureStore`.
Add `api.syncFirebaseUser(idToken)` and `api.completeSignup(payload)`.

- [ ] **Step 2: Rewrite `mobile/src/context/AuthContext.tsx`**

Subscribe to `auth().onAuthStateChanged`. When a Firebase user is active, exchange ID token with backend:
- If backend returns `{ user }` -> set `user` and `isNewUser = false`.
- If backend returns `{ isNewUser: true }` -> set `isNewUser = true`.
Implement `sendPhoneOtp`, `verifyPhoneOtp`, `sendEmailLink`, and `completeSignup`.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/context/AuthContext.tsx mobile/src/services/api.ts
git commit -m "feat(mobile): overhaul AuthContext and API client for Firebase ID tokens"
```

---

### Task 6: Mobile Screens & Navigation Implementation

**Files:**
- Create: `mobile/src/screens/auth/PhoneLoginScreen.tsx`
- Create: `mobile/src/screens/auth/OtpVerificationScreen.tsx`
- Create: `mobile/src/screens/auth/EmailLinkScreen.tsx`
- Create: `mobile/src/screens/auth/RoleAndNameScreen.tsx`
- Delete: `mobile/src/screens/AuthScreen.tsx`
- Modify: `mobile/src/navigation/RootNavigator.tsx`

**Interfaces:**
- Consumes: `useAuth()`
- Produces: Complete passwordless login experience adhering to Stagely's dark aesthetic (`#0B0D13`, `#F5A623`).

- [ ] **Step 1: Implement `PhoneLoginScreen.tsx`**
Hero branding, +91 phone number input with formatting, "Send OTP" CTA, and "Use email instead" toggle.

- [ ] **Step 2: Implement `OtpVerificationScreen.tsx`**
6-digit OTP code input, auto-submit when all 6 digits entered, 30s resend timer, and edit phone number back-action.

- [ ] **Step 3: Implement `EmailLinkScreen.tsx`**
Email address input, "Send Magic Link" action, waiting confirmation view, and URL deep-link listener using `expo-linking`.

- [ ] **Step 4: Implement `RoleAndNameScreen.tsx`**
Shown for new users: Booker vs Artist role cards, full name text input, and "Complete Setup" CTA.

- [ ] **Step 5: Update `mobile/src/navigation/RootNavigator.tsx`**
Conditionally route:
1. `isLoading` -> Loading spinner
2. Not authenticated -> `PhoneLoginScreen` (switches to `OtpVerificationScreen` or `EmailLinkScreen`)
3. Authenticated but `isNewUser` -> `RoleAndNameScreen`
4. Authenticated -> Role-based tabs (Customer, Artist, or Admin)
Delete unused `AuthScreen.tsx`.

- [ ] **Step 6: Verify TypeScript compilation in `mobile/`**
Run: `npx tsc --noEmit` in `mobile/`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/screens/auth/ mobile/src/navigation/RootNavigator.tsx
git commit -m "feat(mobile): implement OTP, email link, and onboarding screens"
```

---

### Task 7: End-to-End Verification & Wiki Documentation

**Files:**
- Modify: `docs/wiki/architecture.md`
- Modify: `docs/wiki/workflows.md`

- [ ] **Step 1: Run full server test suite**
Run: `npm test` in `server/`
Expected: All backend tests pass.

- [ ] **Step 2: Verify mobile type safety and linting**
Run: `npx tsc --noEmit` in `mobile/`
Expected: 0 errors.

- [ ] **Step 3: Update `docs/wiki/architecture.md` and `docs/wiki/workflows.md`**
Document the Firebase OTP architecture, schema changes, and updated authentication diagrams.

- [ ] **Step 4: Commit**

```bash
git add docs/wiki/
git commit -m "docs: update project wiki with Firebase OTP authentication architecture"
```
