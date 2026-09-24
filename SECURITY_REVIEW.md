# Security Review — HazardNet Mobile 1.0 (Phase 9)

Last updated: Phase 9 (beta scaffold). This document is the standing record of the
security posture of the mobile app and must be re-reviewed before each store
submission and after any change to auth, networking, or data handling.

## 1. Token / secret storage

| Item | Storage | Notes |
|---|---|---|
| Saved places + settings | `@react-native-async-storage/async-storage` (unencrypted key-value, backed by iOS/Android app sandbox) | Contains labels + coordinates which are user PII. Sandbox-bound on iOS (NSFileProtectionCompleteUntilFirstUserAuthentication default) and Android (MODE_PRIVATE). **No backend sync in v1.** **Deferred (9b): move to `expo-secure-store` (Keychain/Keystore).** |
| Crash/analytics auth (Sentry DSN) | N/A in Phase 9a | Sentry SDK not linked yet; no DSN. When added, DSN is a public key (Sentry treats DSNs as publishable); even so it will live in EAS Secrets / build-time env, never hard-coded. |
| Push tokens (APNs/FCM) | OS-managed; token available at runtime | In v1 the token is NOT transmitted to any backend (push server deferred to 9b). When added, token is bound to the server-issued device id; token transmission requires HTTPS only. |
| API keys (NASA FIRMS, etc.) | **NOT bundled.** Tokens for third-party feeds are proxied server-side (or loaded from the public public-data configuration endpoint in 9b). `assertNoSecretsInBundle()` dev-time guard + CI scan should flag accidental commits. |  |

**Status:** Acceptable for public beta. SecureStore migration scheduled for 9b (R9-02).

## 2. External URL / deep link validation

- All `Linking.openURL(...)` callsites have been migrated to `safeOpenUrl(...)` in `src/lib/security/openUrl.ts`.
- `isSafeUrl()` whitelist (see `src/lib/security/sanitize.ts`):
  - `http:` / `https:` (external sources, all production links must be https; http only allowed for dev loopback if added later)
  - `tel:` (emergency numbers — hard-coded list in `@hazardnet/core`)
  - `mailto:`
  - `hazardnet:` (internal deep links — validated against route map; no arbitrary params reflected into WebView/eval)
  - `app-settings:` (iOS-only settings deep link)
- Blocked schemes: `javascript:`, `data:`, `file:`, `content:`, custom schemes from other apps.
- User-tapped URLs in articles, alert-source rows, emergency chips, More > website, and banner deeplinks all route through the guard.
- WebViews: none in v1. ArticleReader renders plain text + autolinked https links; no WebView rendering of remote HTML.
- Deep links: hazardnet:// scheme handler not yet registered; when added (Phase 9b) it MUST use the same whitelist + route-allowlist.

**Status:** Acceptable.

## 3. Secrets in binary

- No API keys, no Firebase config, no private keys in the repo or bundle.
- Dev-time runtime guard: `assertNoSecretsInBundle()` called in `App.tsx` under `__DEV__` — returns [] at runtime (RN has no native bundle introspection); a CI grep for patterns (`AIza`, `BEGIN PRIVATE KEY`, `sk_live_`, `ghp_`) should be added in CI before release builds.
- Reverse engineering of the JS bundle: Expo production builds minify. Obfuscation is not employed in Phase 9 because there is no proprietary logic or keys in the bundle.

**Status:** Acceptable; CI secret scan recommended (R9-03).

## 4. TLS / certificate pinning

- All network calls go through HTTPS. TanStack Query + fetch on public endpoints.
- No custom API server of our own in v1 (we only hit public open data: BMD/FFWC/NASA FIRMS/USGS), which means there is no sensitive auth to pin.
- **Decision:** do NOT pin certificates in v1. Pinning against rotating CDN certs for third-party public feeds would create hard-fail availability risk during disasters, which is the opposite of our availability goal. Pinning will be revisited in 9b if/when a first-party push/reporting API ships.

**Status:** Decision recorded. Acceptable for v1.

## 5. Cache clearing on sign-out

- v1 has no user accounts, no sign-in, no sign-out. No persistent auth state to clear.
- A "Reset all data" action is available via More > Data Status screen (added in Phase 7) which clears AsyncStorage + QueryClient cache.
- When auth lands in a future phase, sign-out MUST: delete SecureStore entries, clear AsyncStorage, clear QueryClient cache, unregister push token, and navigate to onboarding.

**Status:** N/A for v1 (no auth). Reset-data path exists and tested in phase7 tests.

## 6. Screenshot / app-switcher snapshot protection

- `SensitiveBlur` component (see `src/components/SensitiveBlur/SensitiveBlur.tsx`) mounts around the root navigator and covers content with an opaque themed view whenever `AppState` is `inactive` or `background`, so iOS/Android task-switcher snapshots do not capture alert details, saved-place labels, or report drafts.
- Android FLAG_SECURE is not set because that blocks legitimate screenshots users might want to share alerts with family; the snapshot-replace approach still hides the data from the recent-tasks thumbnail while allowing user-initiated screenshots. This is a deliberate tradeoff (documented in R9-04).
- iOS: `SensitiveBlur` leverages the same AppState listener and is the documented pattern for covering the app snapshot.

**Status:** Implemented. Acceptable.

## 7. Permissions (requested in-context)

Per Phase 1–8 rulings (re-validated here):

- **Location (WhenInUse)**: requested only on first tap of "recenter" / "use my location". Never on cold boot.
- **Notifications**: requested immediately after first saved place is added (in-context rationale on screen before the system prompt). Never on cold boot.
- **Camera / Media library**: requested only when user taps "Take photo" / "Choose from library" on the report screen. Never on cold boot.
- **Background location, microphone, contacts, calendars, Bluetooth, health, motion, tracking (ATT)**: NOT requested.
- `NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, and notification purpose strings are plain-language and do not overclaim.

**Status:** Acceptable.

## 8. Logging / crash reporting privacy

- In release builds, `console.log` / `console.debug` are stripped (see `App.tsx`). `console.warn` / `console.error` remain to surface errors in crash logs.
- Telemetry client (`src/lib/telemetry/`) defaults to `NoopClient` unless explicitly enabled. DebugClient exists only for tests.
- Event redaction rules enforced in `track()`:
  - `error.name` / `error.message` truncated to 200 chars; alert titles, place labels, coordinates never included.
  - `place.add` only sends `{source, hasLocation}` — never label/notes/coordinates.
  - No screen-view event attaches payload beyond the route name.
- When Sentry is wired (9b), beforeSend will apply the same redaction; user-initiated opt-in is required before any event is sent.

**Status:** Interface and redaction shipped. Sentry SDK drop-in pending DSN + opt-in toggle (R9-05).

## 9. Reporting / responsible disclosure

Security issues: security@hazardnet.live (to be set up before launch) or open a private security advisory on GitHub. No bug-bounty budget for v1.

## Summary of Phase 9 deferrals / follow-ups (R9-0x)

| ID | Item | When |
|---|---|---|
| R9-01 | ≥20 internal testers, ≥99% crash-free over 7 days, store copy approved | Beta period (post-submit, not sandbox-verifiable) |
| R9-02 | Migrate saved places/settings from AsyncStorage to expo-secure-store | 9b |
| R9-03 | CI secret scan (forbidden patterns + env-only config) | 9b |
| R9-04 | Android FLAG_SECURE: re-evaluate if reports/saved places become more sensitive | Post-launch |
| R9-05 | Sentry SDK wired; opt-in crash-reports toggle; beforeSend redaction hooks | 9b |
| R9-06 | First-party API server (push/reporting) + TLS pinning decision revisit | 10 |
| R9-07 | Deep-link route allowlist for hazardnet:// scheme | 9b |
