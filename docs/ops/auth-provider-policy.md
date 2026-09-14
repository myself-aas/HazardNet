# Authentication policy: email/password, Google and GitHub

## Application behavior

HazardNet supports exactly these sign-in methods:

- **Email/password**: signup takes name, username, email, password and confirmation;
  profile identity is saved and a standard Firebase email-verification message is sent.
  Verification does not create a passwordless session. If delivery fails after account
  creation, the page offers a resend rather than attempting another signup.
- **Google**: Firebase `GoogleAuthProvider` with account selection.
- **GitHub**: Firebase `GithubAuthProvider` with `user:email`, not repository access.

The same allowlist governs account linking. Other providers are rejected at runtime,
not merely hidden. Native Firebase `providerData` drives connected-account state.
A social method cannot be removed without another supported method remaining;
concurrent changes in the same client are serialized. Provider collisions instruct
users to sign in with the existing method and explicitly link accounts; no automatic
account merge or credential storage is performed.

The login/signup pages show two labeled social buttons, not a large icon grid.
Signup consent is required for either registration path. Recovery validates Firebase
`oobCode` and calls `confirmPasswordReset`; it does not require an authenticated session.
`/set-password` is for already signed-in users adding/updating a password.
Email changes use `verifyBeforeUpdateEmail` and do not preemptively save the new email.

OAuth is popup-based. Firebase owns `/__/auth/handler`. `/auth/callback` can finish an
SDK-managed redirect but rejects legacy magic-link/PKCE/implicit-token URLs and never
claims success merely because some user was already signed in. Post-auth destinations
are local paths only. Passwordless implementation and obsolete provider glyphs/setup
instructions were removed. Public social-profile links (e.g. LinkedIn) remain profile
links, not sign-in methods.

## Required Firebase/provider console configuration

These configuration changes are **not performed by frontend code**:

1. Firebase Authentication → Sign-in method: enable **Email/Password**, **Google**
   and **GitHub** only. Turn **Email link (passwordless sign-in)** off. Disable any
   Microsoft, Apple, LinkedIn, Discord, Slack, Twitter, Figma, ORCID/custom OIDC or
   other sign-in provider previously enabled.
2. Before disabling a legacy provider, arrange a supported linked method for affected
   accounts; do not delete identities/accounts indiscriminately or strand existing users.
   Hiding providers is not equivalent to server-side disablement. Existing Firebase
   sessions are not forcibly revoked by this frontend refactor.
3. Set Google's support email and GitHub's OAuth application client ID/secret in
   Firebase, never frontend environment variables. Use the exact Firebase callback
   shown in the console, typically `https://<auth-domain>/__/auth/handler`.
4. Firebase Authentication → Settings → Authorized domains: allow production domains
   and explicitly approved development/preview hosts. Do not assume a new Arena or
   Vercel preview hostname is already authorized. Unauthorized-domain and popup-blocked
   errors have actionable UI guidance.
5. Keep the default Firebase-hosted verification/reset email handlers unless configuring
   a reviewed custom action handler. `/update-password?oobCode=...` supports password
   resets only, not every Firebase email action. Verification uses the Firebase-hosted
   handler with a continue URL to `/login`; it does not route to `/auth/callback`.
6. Match Firebase's password policy to the application requirements (8+ characters,
   uppercase, lowercase, number, symbol); enable email-enumeration protection.

## Verification checklist

- Register an email/password account; confirm profile name/username, verification resend,
  signed-in dashboard access, logout and password login.
- Complete Google and GitHub popups on each authorized deployment host; test cancel,
  popup blocking, disabled-provider and account-collision cases.
- Link/unlink supported methods; password-only and social-only accounts must remain
  recoverable. Verify no unsupported provider is offered or newly accepted by Firebase.
- Reset a password while signed out; reject absent/expired/reused codes and mismatches.
- Reject external `next` destinations and obsolete sign-in links.

Automated tests use mocked Firebase SDK calls and cover the provider factory, runtime
allowlist, signup/profile writes, verification/change-email, identity guards, safe URLs,
callback StrictMode behavior, reset code consumption and frontend controls. Live provider
consent screens and console settings require a separate configured integration check.
