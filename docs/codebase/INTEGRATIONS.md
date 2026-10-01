# External Integrations

> **Mapping pass:** 2026-09-30 (second pass, commit `deff0d9`). Claims in this document
> were verified against the working tree; the commands used are listed in the Evidence
> section, and the full run list is summarised in `CONCERNS.md`.

## Core Sections (Required)

### 1) Integration Inventory

| System | Type | Purpose | Auth model | Criticality | Evidence |
|--------|------|---------|------------|-------------|----------|
| Firebase Firestore | Database | Forecast store, alerts, alert subscriptions, profiles, assessments, connectors, blog articles | `FIREBASE_SERVICE_ACCOUNT_JSON` (server) + Firebase web SDK public config (client) | **high** | `backend/db.js`, `backend/forecastStore.js`, `firebase.json`, `firestore.rules` |
| Firebase Authentication | Auth | Email/password + Google + OAuth providers; token verification server-side | Firebase ID token (JWT) verified with `firebase-admin` (`admin.auth().verifyIdToken`); the `jsonwebtoken` dependency is unused | **high** | `backend/middleware/firebaseAuth.js`, `backend/routes/alerts.js`, `frontend/src/context/AuthContext.tsx`, `frontend/src/lib/oauthProviders.ts` |
| Firebase Cloud Messaging (web push) | Push | Browser push notifications | VAPID key pair (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, `WEB_PUSH_CONTACT`) | medium | `backend/routes/push.js`, `backend/utils/vapid.js`, `package.json` (`web-push`) |
| Google Gemini (`@google/genai`) | AI API | Advisory generation, chat assistant, live-voice WebSocket session | `GEMINI_API_KEY` (+ `GEMINI_API_KEY_BACKUP`); optional Firebase-attached dynamic limiter | high | `backend/services/advisoryAgent.js`, `backend/routes/chat.js`, `backend/routes/liveVoice.js`, `backend/utils/ai_fallback_engine.js` |
| Groq / OpenRouter / HuggingFace | AI API (fallback) | Advisory fallback providers when Gemini is rate-limited/unset | `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `HUGGINGFACE_API_KEY` | low | `docs/ENVIRONMENT_SECRETS.md` §2.1, `backend/utils/ai_fallback_engine.js` |
| Kaggle | Batch data source | Daily notebook `8-hazardnet-advisory` produces the advisory CSV ingested by CI | `KAGGLE_USERNAME` / `KAGGLE_KEY` (GitHub Actions secrets) | **high** | `.github/workflows/daily_advisory_ingest.yml` |
| Open-Meteo | Weather API | Forecast meteorological conditions for the weather widget / advisory context | Public API (no key) | medium | `backend/utils/openMeteo.js`, `backend/routes/weather.js`, `api/v1/weather/batch.js` |
| GitHub API / Releases | Content + distribution | Release assets, repository metadata, download links | Public API; `GITHUB_REPOSITORY` / `GITHUB_SERVER_URL` env in CI | low | `frontend/src/lib/downloadChannels.ts`, `frontend/src/lib/blogArticles.ts`, `.github/workflows/app-releases.yml` |
| Vercel | Hosting + serverless + analytics | Static hosting, 12-function serverless API, CDN, Web Analytics | `VERCEL_TOKEN` (CI), `VITE_VERCEL_ANALYTICS` gate | **high** | `vercel.json`, `frontend/vercel.json`, `frontend/src/lib/vercelAnalytics.ts` |
| Firebase Hosting (alternate) | Hosting | Alternate static host for `frontend/dist` | `FIREBASE_PROJECT_ID` / service account | low | `firebase.json`, `.firebaserc` |
| Prometheus / Grafana | Observability | Scrape `/metrics`; dashboards and alert rules | None (internal network) | medium | `backend/metrics.js`, `monitoring/prometheus.yml`, `monitoring/alerts.yml`, `monitoring/grafana-dashboard.json` |
| Slack (incoming webhook) | Alerting | Ops notification for pipeline/publish failures | `SLACK_WEBHOOK_URL` | low | `scripts/notify_ops.mjs`, `docs/ENVIRONMENT_SECRETS.md` |
| SMS gateway / Telegram Bot | Alert fan-out | Subscriber notifications for published alerts | Configured per channel in `backend/alerts/channels/` | medium | `backend/alerts/channels/sms.js`, `backend/alerts/channels/telegram.js` |
| Esri ArcGIS / CARTO / OpenStreetMap / OpenTopoMap basemap tiles | Map tiles | Basemap layers for the district map (satellite, dark GIS, street, terrain, topo) served from `MAP_LAYERS` and cached in IndexedDB by `tileCacheService` | Public tile endpoints, no key (attribution rendered in each layer definition) | low | `frontend/src/hooks/useLeafletMap.ts` (`MAP_LAYERS`), `frontend/src/services/tileCacheService.ts`, `frontend/src/serviceWorker.ts` (tile-host allowlist), `frontend/src/components/ui/expand-map.tsx` |
| ReliefWeb / FAO GIEWS / WHO / ADRC GLIDE / IFRC GO | Reference links | Outbound multilateral provenance links generated from GLIDE identifiers | None (public URLs) | low | `backend/utils/glideResolver.js`, `frontend/src/lib/glide.ts`, `frontend/src/components/GlideResourcePopover.tsx` |
| Google (gstatic / accounts / tag manager) | Frontend services | Firebase SDK host, Google OAuth popup, Tag Manager | None | low | `vercel.json` CSP, `backend/security/csp.js` |

### 2) Data Stores

| Store | Role | Access layer | Key risk | Evidence |
|-------|------|--------------|----------|----------|
| Firestore (named applet DB `ai-studio-hazardnet-55b49dbf-…`) | Primary store: forecasts, alerts, subscriptions, profiles, assessments, connectors, blog articles | `backend/db.js` → `backend/forecastStore.js` (singleton), `backend/alerts/store.js` | Free-tier quota exhaustion; store falls back to snapshots so an outage is invisible to users | `backend/db.js`, `backend/forecastStore.js` |
| Committed static snapshots (`backend/data/forecasts/*.json`, `frontend/public/data/forecasts-latest.json`, `data/site-health/latest.json`) | Degraded-mode serving + provenance record | Filesystem reads in `backend/forecastStore.js`, `frontend/src/lib/forecasts.ts` | Stale data served as if live — mitigated by the freshness badge and 36-hour staleness guard | `backend/data/forecasts/manifest.json`, `frontend/src/hooks/useForecasts.ts` |
| Firestore Security Rules | Server-side authorisation for client writes | `firestore.rules` | Rules were written against camelCase while the client writes snake_case — fixed by `ownerOf()` accepting both spellings; verification requires the Firestore emulator (owner action) | `firestore.rules`, `__tests__/firestoreRules.test.js` |
| `scripts/db/*.sql` (Postgres/PostGIS) | Reference schemas for self-host spatial/analytics modules — **not** wired into the running app (no Postgres driver in any manifest) | None at runtime | Dead schema artefacts can be mistaken for the production store | `scripts/db/README.md`, `scripts/db/008_hazard_events_postgis.sql` |
| `Models/` artifacts (`*.tflite`, `labels.json`, `normalization_stats.json`) | Retained trained artifacts + version handshake | Never served — explicit 404 routes | Publication-policy exposure if a route/host config regresses | `Models/REGISTRY.json`, `Models/VERSION.json`, `backend/server.js` |

### 3) Secrets and Credentials Handling

- **Credential sources:** Vercel project environment variables (serverless + build), GitHub Actions secrets/variables (workflows), and a local `.env` loaded by `dotenv` in `backend/server.js`. The three-surface model is documented in `docs/ENVIRONMENT_SECRETS.md` §0.
- **Hardcoding checks:** `scripts/check-secrets.sh` scans the working tree for high-confidence secret patterns (GitHub PATs, `sk-`, `AIza`, Slack tokens, AWS keys, private keys, connection strings with passwords) and runs in CI (`security-audit` job); it was re-run for this mapping and passed (903 tracked files, 17 patterns). History is explicitly out of scope for that gate. `scripts/tests/test_secret_scan.py::test_the_shipped_env_example_is_clean` also runs the scanner over the real tree, but its `.env.example` content assertions are conditional — **and the file is currently absent** (see `CONCERNS.md` §1), so that half of the test is a no-op today.
  - **Exception to note:** `frontend/src/lib/config.ts` commits Firebase **public-by-design** web identifiers as fallback defaults (API key, project id, app id, measurement id, database URL) so the app boots without a local `.env`. These are public identifiers per Firebase convention, but they are credential-shaped strings in source and should be confirmed as intended (see `[ASK USER]`).
  - `backend/db.js` similarly hardcodes the Firestore applet database id as a fallback default.
  - **The CSP no longer allowlists any ad-network script origin** (removed 2026-09-30). `script-src` is `'self'` plus the four Google origins Firebase Auth needs; `backend/security/csp.js` is the single source and both Vercel configs carry the identical string, asserted by `__tests__/securityHeadersParity.test.js`.
- **Rotation / lifecycle notes:** `docs/ENVIRONMENT_SECRETS.md` §7 instructs rotating anything ever pasted into a chat, screenshot, or old commit. `scripts/verify-actions-secrets.sh` (dispatchable `verify-secrets.yml`) maps every `secrets.*` reference in every workflow to an explicitly verified name. `scripts/npm-audit-ci.mjs` fails closed on any high/critical advisory not listed in `audit-exceptions.json`, and exceptions carry expiries so a stale accepted-risk entry fails the gate.

### 4) Reliability and Failure Behavior

- **Retry/backoff:** implemented for the Kaggle fetch only — two attempts with a 10-second sleep between them, then a hard error (`.github/workflows/daily_advisory_ingest.yml`, per PRD §4.1 / TRD §4.7). No retry/backoff wrapper exists for Gemini, Open-Meteo, or Firestore calls.
- **Timeout policy:** request-level timeouts are configured for a few paths — `FIREBASE_VERIFY_TIMEOUT_MS` (auth token verification), `CONVERSION_PERSIST_TIMEOUT_MS` (persistence step). The serverless guard and site-health probes use their own request timeouts (`curl --max-time` in `.github/workflows/site-health.yml`). No global outbound HTTP timeout policy is defined.
- **Circuit-breaker / fallback behaviour:** no circuit breaker. Compensation is by fallback chain instead: Gemini → deterministic heuristic engine (`backend/utils/ai_fallback_engine.js`) → optional Groq/OpenRouter/HuggingFace; forecast API → committed snapshot → static 64-district baseline; SMS/Telegram fan-out catches each send individually and counts `over_budget` rather than aborting the run (`backend/alerts/notify.js`).
- **Ingestion guards:** schema validation fails fast, a staleness guard halts ingestion when the CSV is older than 36 hours (preserving the previous day's data), and the alert-snapshot builder refuses to replace a non-empty snapshot with an empty run (`.github/workflows/ci.yml`, `scripts/build_alert_snapshot.mjs`).

### 5) Observability for Integrations

- **Logging around external calls:** yes — `[scope]`-tagged server-side logging for errors (`backend/utils/clientError.js`), a request-id middleware for correlation (`backend/middleware/requestId.js`), masked destinations in alert fan-out (`backend/alerts/notify.js`), and the minimal `[info]/[warn]/[error]/[debug]` logger in `utils/logger.js` for serverless handlers.
- **Metrics / tracing coverage:** Prometheus metrics via `prom-client` exposed at `GET /metrics` on the Express backend and `GET /api/metrics` through the serverless tier (`backend/metrics.js`, `serverless/metrics.js`); the forecast-age gauge is refreshed on scrape with a 60-second-cached store probe (`backend/utils/forecastFreshness.js`). Scrape config, alert rules and a Grafana dashboard ship in `monitoring/`. **No distributed tracing** is present.
- **Missing visibility gaps:**
  - No APM/tracing across the Vercel serverless tier (only the Express backend exposes `/metrics`).
  - The external black-box probe is a GitHub Actions workflow (`site-health.yml`, every 30 min) publishing `data/site-health/latest.json`; it is not a real uptime monitor with paging.
  - Ops alerting for pipeline failure is described in the PRD as Slack + email; only a webhook helper (`scripts/notify_ops.mjs`) exists in-tree, and no email transport is implemented.

### 6) Evidence

- `backend/db.js`, `backend/forecastStore.js`, `backend/alerts/store.js` (data access)
- `backend/middleware/firebaseAuth.js`, `backend/utils/apiKeyAuth.js`, `backend/utils/vapid.js` (auth/push)
- `backend/services/advisoryAgent.js`, `backend/utils/ai_fallback_engine.js`, `backend/routes/chat.js`, `backend/routes/liveVoice.js` (AI)
- `backend/utils/openMeteo.js`, `backend/routes/weather.js` (weather)
- `backend/utils/glideResolver.js`, `frontend/src/lib/glide.ts` (multilateral links)
- `.github/workflows/daily_advisory_ingest.yml`, `.github/workflows/site-health.yml`, `.github/workflows/verify-secrets.yml` (pipeline + probe + secrets)
- `scripts/check-secrets.sh`, `scripts/verify-actions-secrets.sh`, `scripts/npm-audit-ci.mjs`, `audit-exceptions.json` (secret/audit gates)
- `scripts/tests/test_secret_scan.py` (secret-scan regression suite; the `.env.example` half of `test_the_shipped_env_example_is_clean` is conditional because the file is absent), `scripts/check-secrets.sh` (run: "✅ Secret scan passed (903 tracked files, 17 patterns)")
- `docs/ENVIRONMENT_SECRETS.md` (credential surfaces and full variable reference)
- `monitoring/prometheus.yml`, `monitoring/alerts.yml`, `monitoring/grafana-dashboard.json`, `backend/metrics.js`
- `backend/security/csp.js`, `__tests__/securityHeadersParity.test.js` (CSP single source + parity)
- `firebase.json`, `firestore.rules`, `.firebaserc`, `vercel.json`
