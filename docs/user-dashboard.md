# User Dashboards, Usernames & Auth Flows

Every signed-in user gets a dedicated dashboard with a unique username that
doubles as their public profile URL — `hazardnet.live/u/<username>`.

## Routes

| Route             | Page                                                                    | Access     |
| ----------------- | ----------------------------------------------------------------------- | ---------- |
| `/dashboard`      | **User dashboard** — Overview · Edit Profile · Account & Security · Connectors · Public Profile | Signed-in users (redirects to `/login?next=%2Fdashboard` otherwise) |
| `/u/:username`    | **Public profile** — the user's unique profile URL                       | Public (only when `profile_visibility = 'public'`) |
| `/login`, `/signup` | Auth pages — **email/password + Google + GitHub only** (Firebase Auth) | Public |

## One-time Firebase setup

1. **Authentication → Sign-in method** — enable **Email/Password**, **Google**
   and **GitHub**. These are the only three sign-in methods HazardNet offers;
   no other provider is enabled or surfaced.
2. **Authentication → Templates** — the sign-up flow sends the standard
   verification email from `signUpWithEmail`; keep the default verification
   link (`__/auth/action` handler) in place.
3. **Firestore → Rules** — authorise `profiles` (owner read/write; public read
   only when `profile_visibility = 'public'`), `user_connectors` (owner
   read/write) and `blog_articles` (published public read, superadmin write)
   via `firestore.rules`.
4. **Providers** — the Google/GitHub OAuth app wiring lives in
   [docs/oauth-provider-setup.md](oauth-provider-setup.md).

The first sign-in **bootstraps the `profiles` document** in Firestore from the
authenticated account (name, email, avatar, generated username), and then
stamps each subsequent login's `last_active_at`.

## How the flows work

### Sign-up (email/password)

```
/signup → name + unique username (validated while typing) + email + password
        → createUserWithEmailAndPassword (firebase/auth)
        → bootstrap profiles/<uid> in Firestore
        → verification email sent (sendEmailVerification)
        → signed in → /dashboard
```

Google / GitHub alternate: `signInWithPopup` completes on the same page and
bootstraps the identical Firestore profile from provider metadata.

### Email verification & password update

- After email/password sign-up, the account is created and signed in
  immediately; the verification email is sent for the email address.
- **Forgot password** sends a reset email whose link opens `/auth/callback`
  before landing on the password-update step.

### Username validation (while typing)

- Input is sanitized live: lowercase, `a–z`, `0–9`, `_` only.
- Rules: 3–20 chars, starts with a letter, no double/trailing underscore,
  not a reserved word.
- Availability is checked (debounced 450 ms) against the Firestore `profiles`
  collection; when the name is invalid or taken, suggestion chips appear
  (lowercase, underscore and numbered variants seeded from name/email). The
  same rules are mirrored in `scripts/db/003_user_dashboard.sql` as a
  self-host/analytics schema reference.

### Avatar pipeline (storage-friendly)

`src/lib/avatar.ts` center-crops to a square, downscales to ≤512×512 on a
canvas, encodes WebP (JPEG fallback) and iteratively compresses until the blob
fits ≈160 KB. It writes `photo_url` + `avatar_path` on the profile document —
replace-on-update keeps the profile lean.

### Connectors

Per-user integration state (Open-Meteo, NASA POWER, Sentinel Hub, IoT gateway,
WhatsApp, Twilio SMS, Slack, Discord, Email digest, Google Sheets, Zapier,
custom webhook) lives in the `user_connectors` Firestore collection.
Connect/disconnect upserts `(user_id, connector_key)` documents; non-secret
identifiers (webhook URL, phone number) are stored in the document.

## Client map

| File | Purpose |
| ---- | ------- |
| `frontend/src/services/firebase.ts` | Firebase app / auth / Firestore init |
| `frontend/src/context/AuthContext.tsx` | auth state, sign-up/sign-in, profile bootstrap, linking |
| `frontend/src/lib/oauthProviders.ts` | Google/GitHub provider registry + error mapping |
| `frontend/src/lib/username.ts` | sanitize / validate / suggest / availability |
| `frontend/src/lib/avatar.ts` | resize + upload + replace + delete |
| `frontend/src/lib/connectors.ts` | connector catalog + persistence |
| `frontend/src/lib/passwordStrength.ts` | shared strength scoring |
| `frontend/src/components/auth/AuthSocialButtons.tsx` | Google + GitHub sign-in buttons |
| `frontend/src/components/user/UsernameField.tsx` | live-validating username input |
| `frontend/src/components/user/UserAvatarField.tsx` | avatar upload UI |
| `frontend/src/components/user/dashboard/*` | dashboard sections + form primitives |
| `frontend/src/pages/UserDashboardPage.tsx` | `/dashboard` shell |
| `frontend/src/pages/PublicProfilePage.tsx` | `/u/:username` |
| `frontend/src/pages/LoginPage.tsx` / `SignUpPage.tsx` | `/login`, `/signup` (email/password + Google + GitHub) |
