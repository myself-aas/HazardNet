# OAuth Provider Setup — Social Sign-Up / Sign-In

HazardNet's social authentication runs on **Supabase Auth** (PKCE redirect
flow). The frontend (`frontend/src/lib/oauthProviders.ts` is the registry)
starts the flow with `supabase.auth.signInWithOAuth({ provider })`, the user
authenticates at the provider, and Supabase exchanges the code server-side.
**No provider secrets ever touch the frontend** — each provider only needs a
client ID/secret configured once in the Supabase dashboard.

Supported providers: **LinkedIn, GitHub, Slack, Discord, X (Twitter),
Figma** — plus Google, Microsoft, Apple and ORCID (custom OIDC).

## One-time wiring (all providers)

Every provider follows the same three steps:

1. **Create a developer app** with the provider (links in the table below).
2. **Copy the OAuth callback/redirect URL** into that app:
   ```
   https://<PROJECT_REF>.supabase.co/auth/v1/callback
   ```
   (`<PROJECT_REF>` is the id of your Supabase project.)
3. **Paste the client ID/secret** into Supabase → Authentication → Sign In /
   Up → Providers → *provider* → Enable.

Also add the site callback to **Authentication → URL Configuration → Redirect
URLs** so Supabase can send users back after login:

```
https://www.hazardnet.live/auth/callback
http://localhost:3000/auth/callback
```

| Provider | Create app at | Supabase guide | Notes |
| --- | --- | --- | --- |
| LinkedIn | https://www.linkedin.com/developers/apps/new | [auth-linkedin](https://supabase.com/docs/guides/auth/social-clients/auth-linkedin) | Enable the **"Sign In with LinkedIn using OpenID Connect"** product on the app; request `openid profile email`. |
| GitHub | https://github.com/settings/applications/new | [auth-github](https://supabase.com/docs/guides/auth/social-clients/auth-github) | OAuth app; scopes `read:user user:email` are requested automatically. |
| Slack | https://api.slack.com/apps?new_app=1 | [auth-slack](https://supabase.com/docs/guides/auth/social-clients/auth-slack) | Enable **Sign in with Slack** user scopes (`users:read email`). |
| Discord | https://discord.com/developers/applications | [auth-discord](https://supabase.com/docs/guides/auth/social-clients/auth-discord) | Add the callback under **OAuth2 → Redirects**; scopes `identify email`. |
| X (Twitter) | https://developer.x.com/en/portal/dashboard | [auth-twitter](https://supabase.com/docs/guides/auth/social-clients/auth-twitter) | Set up **OAuth 2.0** user authentication (not OAuth 1.0a). X only releases emails for approved developer accounts; users without an email are prompted to add one at first sign-up. |
| Figma | https://www.figma.com/developers/ | [auth-figma](https://supabase.com/docs/guides/auth/social-clients/auth-figma) | Standard OAuth app under Figma developer settings. |
| Google | https://console.cloud.google.com/apis/credentials | [auth-google](https://supabase.com/docs/guides/auth/social-clients/auth-google) | Configure the OAuth consent screen + web client. |
| Microsoft | https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade | [auth-azure](https://supabase.com/docs/guides/auth/social-clients/auth-azure) | Azure app registration; redirect URL same as above. |
| Apple | https://developer.apple.com/account/resources/identifiers/list/serviceId | [auth-apple](https://supabase.com/docs/guides/auth/social-clients/auth-apple) | Create a Services ID (Sign in with Apple). |
| ORCID | https://orcid.org/developer-tools | [auth-orcid](https://supabase.com/docs/guides/auth/social-clients/auth-orcid) | Configured as a **custom OIDC** provider in Supabase (name the custom provider `orcid`). |

## Frontend behavior

- **Buttons** live in `frontend/src/components/auth/AuthSocialButtons.tsx`
  (sign-in and sign-up pages). Per product spec the prominent **Connect with
  Google** button renders immediately after the email/password fields, then
  every other provider appears as compact side-by-side circular icons
  (`SECONDARY_AFTER_GOOGLE_PROVIDER_IDS` in `src/lib/oauthProviders.ts`).
- **Callback** (`/auth/callback`, `AuthCallbackPage.tsx`) exchanges the code
  via the Supabase client, shows success/failure states with actionable
  hints, and returns the user to the page they started from
  (`sessionStorage: hazardnet.auth.returnTo`).
- **Sign-up**: passwordless — we send a verification (magic) link that opens
  `/set-password` where the user chooses their password. The first social
  sign-in automatically creates the user's `profiles` row seeded from
  provider metadata (name, email, avatar, generated username).
- **Account linking**: Profile → **Connected Accounts & Social Sign-In**
  links/unlinks providers to the signed-in account
  (`linkIdentity`/`unlinkIdentity`). The last remaining sign-in method cannot
  be disconnected (enforced client-side and by Supabase).
- **Errors** (`describeOAuthError` in `oauthProviders.ts`) translate provider
  failures into fixes: disabled provider, redirect URL not allow-listed,
  cancelled authorization, expired state, already-linked identity, email
  conflicts.

## Environment

Social sign-in itself needs no frontend env vars beyond the existing
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. If those are absent
the UI still renders, but starting a flow explains that authentication is
unconfigured (a mock client is used — see `lib/supabase.ts`).

## Security notes

- Authorization codes are exchanged with PKCE by supabase-js; the client
  never sees provider client secrets.
- Sessions persist in browser storage with auto-refresh; sign-out clears
  session plus local caches.
- Provider tokens (if you later request API scopes beyond login) are stored
  server-side by Supabase only when explicitly enabled — HazardNet requests
  login-level scopes only.
