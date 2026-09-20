# Auth Fixes — 2026-09-20

## Summary

Sign-up, sign-in (email/password) and OAuth (Google, GitHub) were reported broken.
Root cause analysis found **multiple interacting bugs** across config, Firestore,
CSP, and AuthContext utilities.

---

## Root Causes

### 1. Firestore Database ID Divergence (Critical)
- `.env.example` shipped `VITE_FIREBASE_FIRESTORE_DATABASE_ID=default`
- Code default is `ai-studio-hazardnet-55b49dbf-625b-492b-9cff-feabd729e843`
- Vercel template says `(default)`
- Firebase JS SDK expects `(default)` for default DB, not bare `default`. Passing
  `getFirestore(app, 'default')` looks for a database literally named `default`,
  which does not exist → all Firestore ops (profiles, username check, login count)
  fail.
- `firebase.json` only deployed rules to `(default)`, not to the named DB, so
  the named DB had deny-all.

**Fix:**
- `frontend/src/lib/config.ts`: normalize `default` / `(default)` / empty → `null`
  and respect explicit env var; fallback to AI-Studio only when env var absent.
- `frontend/src/services/firebase.ts`: `resolveFirestore()` handles null correctly.
- `backend/db.js`: same normalization.
- `firebase.json`: deploy rules to both `(default)` and `ai-studio-...`.
- `.env.example`: updated to AI-Studio id with comment.
- `docs/PRODUCTION_RUNBOOK.md`: updated.

### 2. `updateUserProfile` Snake Case Bug (Critical)
- Original: `key.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`)`
- `photoURL` → `photo_u_r_l` (wrong), should be `photo_url`
- `avatarPath` worked by luck, but `photoURL` broke avatar updates.
- Same bug in `saveAssessment`.

**Fix:**
- Robust `toSnakeCase()`:
  ```ts
  str.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
     .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
     .toLowerCase()
  ```
- `photoURL` → `photo_url`, `firstName` → `first_name`, etc.
- Applied to both `updateUserProfile` and `saveAssessment`.
- `toProfile` now handles both snake and camel spellings as fallback.

### 3. `recordLogin` Using `updateDoc` (High)
- `updateDoc` fails if profile doc does not exist (race after OAuth sign-up).
- Failure was caught and warned, but login count never recorded.

**Fix:** Use `setDoc(..., {merge:true})` so it creates doc if missing.

### 4. `writeProfile` / `bootstrapProfile` Not Resilient
- Used `setDoc` merge but didn't handle reserved usernames.
- `seedFromIdentity` could generate reserved word (`admin`, `api`, etc).

**Fix:**
- `ensureNonReservedUsername()` appends suffix if reserved.
- `seedFromIdentity` now checks reserved and avoids trailing underscores.
- `writeProfile` uses `setDoc` merge and includes `uid` field.

### 5. OAuth Popup Blocked / Redirect Not Handled
- Only `signInWithPopup` used. On mobile or strict browsers, popup blocked →
  error, no fallback.
- `AuthCallbackPage` only waited for auth state, not `getRedirectResult`.
- `signInWithOAuth` ignored `?next=` param when on auth screen (always returned `/`).

**Fix:**
- `services/firebase.ts`: `signInWithPopupOrRedirect` fallback to `signInWithRedirect` when popup blocked.
- `AuthContext`: `signInWithOAuth` now reads `?next=` from URL, respects explicit `nextTo`, stores returnTo, and tries redirect fallback.
- `AuthCallbackPage`: handles `getRedirectResult` + `authStateReady` + `onAuthStateChanged`.
- Added `handleRedirectResult` helper.
- `AuthSocialButtons`: passes `nextTo` from query param.

### 6. CSP Blocking Auth (High)
- `vercel.json` and `frontend/vercel.json` CSP `script-src 'self'` plus ad networks only.
- Missing `https://www.gstatic.com`, `https://apis.google.com` for Firebase Auth.
- `connect-src` allowed `https:` (broad) but not explicit.
- `frame-src` and `form-action` too restrictive for OAuth.

**Fix:**
- `backend/security/csp.js` is canonical source — added:
  - `AUTH_SCRIPT_ORIGINS`: gstatic, apis.google, googletagmanager, google.com
  - `AUTH_CONNECT_ORIGINS`: *.googleapis.com, *.firebaseio.com, *.firebaseapp.com, *.gstatic.com, *.github.com, api.github.com, github.com
  - `AUTH_FRAME_ORIGINS`: *.firebaseapp.com, accounts.google.com, github.com
  - `AUTH_FORM_ACTION_ORIGINS`: same
- Updated CSP string to include them.
- Updated `vercel.json` and `frontend/vercel.json` to match canonical CSP.
- Updated `__tests__/securityHeadersParity.test.js` to allow auth origins and check them.

### 7. Username Availability Returns True on Error
- `checkUsernameAvailability` caught errors and returned `true` (available) to avoid blocking.
- Could allow duplicate usernames if Firestore offline.

**Fix:** Keep returning true on error (to avoid blocking sign-up offline) but log warning. Added reserved check before query.

### 8. Avatar Upload Using `updateDoc`
- `avatar.ts` used `updateDoc` which fails if profile missing.

**Fix:** Use `setDoc` merge.

### 9. Missing Auth Persistence
- No explicit persistence set; could default to session or none in some environments.

**Fix:** `setPersistence(auth, browserLocalPersistence)` on init.

### 10. Error Messages Inconsistent
- Login and signup had duplicated error parsing logic.

**Fix:** Created `frontend/src/lib/authErrors.ts` with `parseAuthError` and `withAuthErrorHandling`, used in Login/Signup pages.

---

## Files Changed

- `frontend/src/lib/config.ts` — normalize Firestore DB ID
- `frontend/src/services/firebase.ts` — fix DB resolve, persistence, popup→redirect fallback, providers
- `backend/db.js` — same DB normalization
- `firebase.json` — deploy rules to both DBs
- `backend/security/csp.js` — add auth origins to CSP
- `vercel.json` + `frontend/vercel.json` — updated CSP
- `__tests__/securityHeadersParity.test.js` — allow auth origins
- `frontend/src/context/AuthContext.tsx` — major rewrite: toSnakeCase, toProfile fallback, ensureNonReservedUsername, setDoc merge, OAuth redirect handling, account-exists handling, next param
- `frontend/src/lib/username.ts` — avoid reserved in seed
- `frontend/src/lib/oauthProviders.ts` — improved error messages
- `frontend/src/components/auth/AuthSocialButtons.tsx` — pass nextTo, improved hint
- `frontend/src/pages/AuthCallbackPage.tsx` — handle redirect result
- `frontend/src/lib/avatar.ts` — setDoc merge
- `frontend/src/pages/LoginPage.tsx` + `SignUpPage.tsx` — use authErrors
- `frontend/src/lib/authErrors.ts` — new centralized error handling
- `.env.example` + `docs/PRODUCTION_RUNBOOK.md` — fix DB id docs

---

## Recommendations

### Immediate (Owner Actions)

1. **Enable providers in Firebase Console:**
   - Authentication → Sign-in method → Enable Email/Password, Google, GitHub
   - For GitHub: create OAuth app at https://github.com/settings/developers
     - Callback URL: `https://hazardnet-aas48424.firebaseapp.com/__/auth/handler`
     - Copy Client ID/Secret to Firebase console
   - For Google: ensure OAuth consent screen configured, authorized domains include `hazardnet.live`, `www.hazardnet.live`, `localhost`

2. **Add authorized domains:**
   - Firebase Console → Authentication → Settings → Authorized domains
   - Add `hazardnet.live`, `www.hazardnet.live`, `localhost`

3. **Deploy Firestore rules to both databases:**
   ```bash
   firebase deploy --only firestore
   ```
   Verify rules exist for both `(default)` and `ai-studio-hazardnet-...` in console.

4. **Set Vercel env vars:**
   - `VITE_FIREBASE_FIRESTORE_DATABASE_ID=ai-studio-hazardnet-55b49dbf-625b-492b-9cff-feabd729e843`
   - Ensure `VITE_FIREBASE_*` vars match `firebase-applet-config.json`
   - `FRONTEND_ORIGIN=https://www.hazardnet.live,https://hazardnet.live`

5. **Test flows:**
   - Email sign-up → should create auth user + profile doc + send verification
   - Email sign-in → should load profile + record login count
   - Google sign-in → popup (allow popups) → profile bootstrap → redirect to `?next=` if present
   - GitHub sign-in → same
   - Popup blocked → should fallback to redirect → land on `/auth/callback` → auto-return

### Medium Term

- Move avatar storage from Firestore data URL to Firebase Storage (currently stores base64 in Firestore, inefficient, 1MB limit).
- Add rate limiting to auth endpoints (prevent brute force).
- Add email enumeration protection (Firebase already does, but UI should not leak).
- Consider adding `fetchSignInMethodsForEmail` UX: if user tries Google with email that exists via password, show which provider to use.
- Add E2E tests for auth flows (Playwright).

### Long Term

- Consolidate Firebase config to single source (`firebase-applet-config.json` or env vars, not both).
- Decide authoritative Firestore DB: `(default)` vs `ai-studio-...` — currently code uses ai-studio, but Vercel template says (default). Pick one and update all docs.
- Implement proper username uniqueness enforcement via Cloud Function or transaction (currently only client-side check, race possible).
- Review `profiles` public read rule — currently `allow get, list: if true` exposes all profiles. Should restrict to owner or only public fields.

---

## Testing

- `tsc --noEmit --skipLibCheck` passes for auth files (remaining errors are pre-existing jest-axe missing).
- Security parity test updated to allow auth origins.
- Manual testing needed for actual Firebase project (requires credentials).

---

## How to Verify Fix

1. `cd frontend && npm run build` — should succeed
2. Check `dist/404.html` contains CSP with `gstatic.com` and `googleapis.com`
3. Sign-up with new email → Firestore `profiles/{uid}` created with `username`, `photo_url`, `email`
4. Sign-in with same email → `last_login_at` and `login_count` updated
5. Click Google button → popup → allow → signed in, profile has `photo_url` from Google
6. Click GitHub button → same
7. Block popups → click Google → should redirect to Google → back to `/auth/callback` → success
8. Try sign-up with existing email → error "already exists" with link to sign-in
9. Try username that is reserved (`admin`) → validation error, suggestions shown
10. Update profile (e.g., change displayName) → Firestore doc updates, `photo_url` still correct (not `photo_u_r_l`)

---

## References

- Firebase Auth docs: https://firebase.google.com/docs/auth/web/google-signin
- GitHub OAuth: https://firebase.google.com/docs/auth/web/github-auth
- Firestore multi-DB: https://firebase.google.com/docs/firestore/manage-databases
- CSP for Firebase Auth: https://firebase.google.com/docs/auth/web/auth-state-persistence
