# OAuth Provider Setup — Social Sign-Up / Sign-In

HazardNet's social authentication runs on **Firebase Authentication**. The
frontend (`frontend/src/lib/oauthProviders.ts` is the registry) starts the
flow with `signInWithPopup(auth, provider)`, the user authenticates at the
provider, and Firebase exchanges the credential. **No provider secrets ever
touch the frontend** — each enabled provider only needs its client ID/secret
configured once in the Firebase console.

Supported providers: **Google, GitHub** — exactly these two, plus
email/password. No other identity provider (ORCID, LinkedIn, Microsoft, Apple,
Slack, …) is enabled or surfaced anywhere.

## One-time wiring (all providers)

Every provider follows the same three steps:

1. **Create a developer app** with the provider (links in the table below).
2. **Copy the OAuth callback/redirect URL** into that app:
   ```
   https://hazardnet-aas48424.firebaseapp.com/__/auth/handler
   ```
3. **Paste the client ID/secret** into Firebase → Authentication → Sign-in
   method → *provider* → Enable.

Also add the site domain to **Authentication → Settings → Authorized
domains** so Firebase can complete the popup:

```
www.hazardnet.live
hazardnet.live
localhost
```

| Provider | Create app at | Firebase guide | Notes |
| --- | --- | --- | --- |
| Google | https://console.cloud.google.com/apis/credentials | [google-signin](https://firebase.google.com/docs/auth/web/google-signin) | Configure the OAuth consent screen + web client. |
| GitHub | https://github.com/settings/developers | [github-auth](https://firebase.google.com/docs/auth/web/github-auth) | OAuth app; scopes `read:user user:email` are requested automatically. |

## Frontend behavior

- **Buttons** live in `frontend/src/components/auth/AuthSocialButtons.tsx`
  (sign-in and sign-up pages). Two full-width buttons render — **Continue
  with Google** and **Continue with GitHub** — beneath the email/password
  form (`SUPPORTED_PROVIDER_IDS` in `src/lib/oauthProviders.ts`).
- **Popup**: sign-in completes in a popup (`signInWithPopup`), so the user
  never leaves the page. `/auth/callback` (`AuthCallbackPage.tsx`) remains as
  a fallback landing page for any redirect/email-link visit and returns the
  user to the page they started from
  (`sessionStorage: hazardnet.auth.returnTo`).
- **Sign-up**: email + password creates the account immediately; the
  `profiles` document is written to Firestore at first sign-up. A Firebase
  verification email is sent automatically. Email magic links continue to
  land on `/auth/callback`.
- **Account linking**: Profile → **Connected Accounts & Social Sign-In**
  links/unlinks Google and GitHub to the signed-in account
  (`linkIdentity`/`unlinkIdentity`). The last remaining sign-in method cannot
  be disconnected.
- **Errors** (`describeOAuthError` in `oauthProviders.ts`) translate Firebase
  failures into fixes: disabled provider, unauthorized domain,
  account-exists-with-different-credential, cancelled authorization, and
  network problems.

## Environment

Social sign-in and email/password auth use the public Firebase web config in
`frontend/src/lib/config.ts` (overridable with the `VITE_FIREBASE_*` build
values — all public-by-design and committed in `.env.example`).

## Security notes

- Firebase exchanges credentials while the client never sees provider client
  secrets (only the public web app id is shipped; client IDs are public by
  design).
- Sessions persist in the Firebase auth SDK; sign-out clears the session and
  local caches.
- HazardNet requests login-level scopes only.
