# App Store Privacy Nutrition Labels (Phase 9 scaffold)

Apple's App Privacy questions, answered per our current (Phase 9) code.

## Data used to track you across other apps/websites
> **We do NOT use any data for tracking.** No advertising identifiers, no SDKs that track across apps.

## Data linked to you
> **None.** HazardNet does not require an account, does not ask for name/email/phone, and does not associate data with identity.

## Data not linked to you
The following data may be collected but is **not linked** to your identity and is **opt-in** via a "Send crash reports" toggle (default OFF in v1.0; toggle ship in Phase 9b along with Sentry SDK wiring):

| Data category | Collection | Purpose |
|---|---|---|
| **Crash Data** (stack traces, exception names, OS version, device model, app version) | Opt-in only | App stability / crash-free metric |
| **Performance Data** (app launch time, screen navigation time) | Opt-in only | Performance budget enforcement (cold <2s, TTFUC <1.5s) |

Crash/performance events are explicitly stripped of:
- location coordinates (never attached)
- saved-place labels, notes, or districts
- alert titles/district names on critical-path events
- any free-form user input

See `apps/mobile/src/lib/telemetry/index.ts` (redaction helpers in `apps/mobile/src/lib/security/sanitize.ts`).

## Data collected but NOT sent anywhere (on-device only)
- **Saved places** — label + lat/lng; stored locally in AsyncStorage. Never transmitted (sync deferred).
- **Settings** (theme, language, notifications per place) — on-device only.
- **Alert cache** — TanStack Query persisted to AsyncStorage; HTTPS GET from public sources only.
- **Crowd-sourced reports (drafts)** — queued on device; network send deferred to 9b.
- **Location** — if granted, used for "use my location" and saved places; never uploaded.
- **Photos taken from camera or picked from library** — attached only to draft reports on-device; upload deferred.

## Sensitive information disclosures
We do not collect any category Apple lists as sensitive (race/ethnicity, sexual orientation, pregnancy/childbirth info, disability, religious/political belief, biometrics, health, genetic data, financial info).

## Privacy policy URL
https://hazardnet.live/privacy  (drafts to be published before launch).
