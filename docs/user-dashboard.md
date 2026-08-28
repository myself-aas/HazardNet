# User Dashboards, Usernames & Auth Flows

Every signed-in user gets a dedicated dashboard with a unique username that
doubles as their public profile URL — `hazardnet.live/u/<username>`.

## Routes

| Route             | Page                                                                    | Access     |
| ----------------- | ----------------------------------------------------------------------- | ---------- |
| `/dashboard`      | **User dashboard** — Overview · Edit Profile · Account & Security · Connectors · Public Profile | Signed-in users (redirects to `/login?next=%2Fdashboard` otherwise) |
| `/u/:username`    | **Public profile** — the user's unique profile URL                       | Public (only when `profile_visibility = 'public'`) |
| `/set-password`   | **Password setup** after clicking the email-verification link            | Verification session |
| `/login`, `/signup` | Auth pages — social sign-in puts **Connect with Google first**, then a compact side-by-side icon row of every other provider, then the email form | Public |

## One-time Supabase setup

1. **Run the schema** — open *Supabase → SQL Editor* and execute
   [`scripts/db/003_user_dashboard.sql`](../scripts/db/003_user_dashboard.sql).
   It is idempotent and adds:
   - ~40 profile columns (identity, contact, location, farm profile, socials,
     notification & privacy preferences, telemetry).
   - A **unique case-insensitive `username`** with reserved-word protection
     (`is_username_available()`, `reserved_usernames` table).
   - A `handle_new_user` trigger that auto-creates a profile row (with a
     generated username) for every new auth user.
   - The `user_connectors` table (per-user integration state).
   - A public **`avatars` storage bucket** (2 MB limit, images only) with
     per-user folder policies.
   - RLS: owners always read/write their row; anonymous visitors can read
     rows only when `profile_visibility = 'public'`.

2. **Allow-list redirect URLs** — *Authentication → URL Configuration*:
   - `<origin>/auth/callback`
   - `<origin>/auth/callback?next=/set-password`

3. **Email templates** — *Authentication → Emails*. The sign-up flow uses the
   **Magic Link** template (`signInWithOtp` with `shouldCreateUser: true`), so
   the emailed link both verifies the address and opens the session that lets
   the user choose a password on `/set-password`. Keep `{{ .ConfirmationURL }}`
   in the template body.

4. **Providers** — enable Google (and any other providers you want in the
   icon row) per [docs/oauth-provider-setup.md](oauth-provider-setup.md).

## How the flows work

### Sign-up (passwordless verification link)

```
/signup → name + unique username (validated while typing) + email
        → "Send verification link"  (supabase.auth.signInWithOtp,
                                      shouldCreateUser: true)
        → inbox link → /auth/callback (code exchange)
        → /set-password → strength-metered password → /dashboard
```

Existing accounts: entering their email sends a magic-link sign-in that ends
on the same `/set-password` page, where they can update their password.

### Username validation (while typing)

- Input is sanitized live: lowercase, `a–z`, `0–9`, `_` only.
- Rules: 3–20 chars, starts with a letter, no double/trailing underscore,
  not a reserved word — all mirrored in SQL (`is_username_available`).
- Availability is checked (debounced 450 ms) against `profiles`; when the name
  is invalid or taken, suggestion chips appear (lowercase, underscore and
  numbered variants seeded from name/email).

### Avatar pipeline (storage-friendly)

`src/lib/avatar.ts` center-crops to a square, downscales to ≤512×512 on a
canvas, encodes WebP (JPEG fallback) and iteratively compresses until the blob
fits ≈160 KB. It uploads to `avatars/<uid>/avatar-<timestamp>.<ext>`, writes
`photo_url` + `avatar_path` on the profile, then **deletes the previous
object** — replace-on-update keeps the bucket tiny.

### Connectors

Per-user integration state (Open-Meteo, NASA POWER, Sentinel Hub, IoT gateway,
WhatsApp, Twilio SMS, Slack, Discord, Email digest, Google Sheets, Zapier,
custom webhook) lives in `user_connectors`. Connect/disconnect upserts
`(user_id, connector_key)` rows; non-secret identifiers (webhook URL, phone
number) are stored in the `config` jsonb.

## Client map

| File | Purpose |
| ---- | ------- |
| `frontend/src/lib/username.ts` | sanitize / validate / suggest / availability |
| `frontend/src/lib/avatar.ts` | resize + upload + replace + delete |
| `frontend/src/lib/connectors.ts` | connector catalog + persistence |
| `frontend/src/lib/passwordStrength.ts` | shared strength scoring |
| `frontend/src/components/auth/AuthSocialButtons.tsx` | Google-first CTA + provider icon row |
| `frontend/src/components/user/UsernameField.tsx` | live-validating username input |
| `frontend/src/components/user/UserAvatarField.tsx` | avatar upload UI |
| `frontend/src/components/user/dashboard/*` | dashboard sections + form primitives |
| `frontend/src/pages/UserDashboardPage.tsx` | `/dashboard` shell |
| `frontend/src/pages/PublicProfilePage.tsx` | `/u/:username` |
| `frontend/src/pages/SetPasswordPage.tsx` | `/set-password` |
