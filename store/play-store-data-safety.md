# Google Play Data Safety form (Phase 9 scaffold)

## Data collection and security

All declarations here match what the app does today (Phase 9). If features added after 1.0 change collection, this form MUST be re-answered before rollout.

### Is data encrypted in transit?
> **No — app does not transmit user data in v1.** Alerts are fetched via anonymous HTTPS GET from public sources; no identifying headers, no cookies, no session, no request body. There is no backend API of our own in v1 (per Phase 6/7 deferral of EAS push server / user accounts).

### Is there a way for users to request data deletion?
> **Not applicable** — no user data leaves the device in v1. Saved places and settings live in AsyncStorage/SecureStore on-device; clearing app data or uninstalling removes everything.

### Does the app collect or share any of the following required user data types?

| Data type | Collected? | Shared? | Purpose | Handled ephemerally? | Optional? |
|---|---|---|---|---|---|
| Personal info (name, email, phone) | **No** | No | — | — | — |
| Financial info | No | No | — | — | — |
| Location — approximate | **Yes (if user grants)** | **No** | Show district-level alert for user's current location. Stored only in memory for current session and in the on-device cache keyed by hashed place id if user explicitly saves a place. Never uploaded. | No — persists only as a saved place if user adds one | Optional — user can deny |
| Location — precise | **Yes (if user grants)** | **No** | Same as approximate, used for first saved place "Use my location". Coordinates stored on-device only in saved places, never transmitted. | No — persisted only as saved place | Optional |
| Location — in background | **No** | No | We never request background location (Foreground-only when in use). | — | — |
| Photos & videos | **Yes (if user grants)** | **No** | Optional crowd-sourced reports: camera or media picker is used only when user taps "Take photo / Choose photo". Photos are NOT uploaded in v1 (networking deferred to Phase 9b) and remain on-device. | Yes — stored only in report queue | Optional |
| Camera (runtime) | **Yes (if user grants)** | **No** | Optional report photos only; never used in background. | Yes | Optional |
| Microphone | No | No | — | — | — |
| Contacts | No | No | — | — | — |
| Health & fitness | No | No | — | — | — |
| Messages | No | No | — | — | — |
| Files & docs | **Cache only** | No | Offline alert articles/images. Not scanned or uploaded. | Cached to app cache dir | N/A |
| App activity (page views, taps, in-app search, installs, other user-generated content) | **Opt-in crash reports only in 9b** | Sentry (if enabled) | Crash + performance telemetry (opt-in). No district names, no saved-place labels, no coordinates (see `telemetry/index.ts` redaction). | Sent only when opt-in crash reports are enabled | Opt-in |
| Web browsing | No | No | In-app browser is never used; external links open in Safari/Custom Tabs. | — | — |
| Device IDs (advertising, IMEI) | No | No | — | — | — |
| Crash logs | Opt-in (9b) | Sentry | Anonymous crash reports only. Stack redacted; no PII. | Sent after opt-in | Opt-in |
| Performance diagnostics | Opt-in (9b) | Sentry | Cold-start TTFC, screen render timing. No PII. | Opt-in | Opt-in |
| Push notifications token (FCM/APNs) | When user enables notifications | **Not transmitted in v1** | Token is requested from OS but not shipped to any backend (push server deferred to Phase 9b); local-only notifications still work using cached alerts. | — | Opt-in (requested after first saved place) |

### Target audience
- Ages 13+. App is a public-safety utility; no child-directed features, no social/chat.
- Not designed for children under 13 per COPPA. No account creation.

### Content policy checklist
- No deceptive claims: disclaimer on onboarding screen and More tab ("Not an official warning service").
- No gambling, no weapons, no tobacco/alcohol promotion.
- Emergency phone numbers are official public-service lines (999, 16163, 1090, 16263).
- User-generated content (crowd-sourced reports) is queued on-device only in v1; moderation pipeline lands with server.

### Security practices
- All public alert feeds fetched over HTTPS only (no http:// in production, whitelist enforced by `isSafeUrl` in `lib/security/sanitize.ts`).
- App blocks javascript:/data:/file: schemes in Linking calls.
- App hides content when the app enters background (app-switcher snapshot blur — `SensitiveBlur.tsx`) so alert content is not captured in task switcher.
- No secrets baked into the binary (checked by `assertNoSecretsInBundle` in __DEV__; CI scan recommended).
