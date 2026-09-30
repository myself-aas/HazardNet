# External Integrations

## Core Sections (Required)

### 1) Integration Inventory

| System | Type (API/DB/Queue/etc) | Purpose | Auth model | Criticality | Evidence |
|--------|---------------------------|---------|------------|-------------|----------|
| Google Cloud Firestore | NoSQL Database | Primary persistence store for forecast records, alert review records, user profiles, and operational freshness | Service Account JWT / Firebase Admin SDK credentials | High | `backend/forecastStore.js:1-25`, `backend/db.js:1` |
| Google Gemini AI | LLM / Generative AI API | Agrometeorological advisory synthesis and chat query assistance | API Key (`GEMINI_API_KEY`) | Medium (Graceful fallback to deterministic rule engine) | `backend/routes/chat.js`, `backend/server.js:41-43` |
| Kaggle API | Scheduled Notebook Runner | Daily forecast generation (`8-hazardnet-advisory`) and historical hazard data extraction | Kaggle Credentials (`KAGGLE_USERNAME`, `KAGGLE_KEY`) | High | `docs/PRD.md §4.1`, `docs/TRD.md §2.1`, `scripts/validate_forecasts.py` |
| Open-Meteo API | Weather Forecast API | Current meteorological conditions and 7/15-day weather parameters (temperature, precipitation, wind speed) | Public / Unauthenticated HTTP API | Medium | `backend/routes/weather.js:1-50`, `api/v1/weather.js` |
| Web Push / VAPID | Notification Protocol | Push alerts to subscribed browser clients for critical hazard warnings | VAPID key pair (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) | Medium | `backend/routes/push.js:1-40`, `package.json:238` |
| Multilateral Disaster Registries (ReliefWeb, FAO, WHO, ADRC, IFRC) | External Outbound Links | Outbound provenance linking for 2000–2026 historical disasters with validated GLIDE numbers | Public sanitized URLs | Low | `docs/TRD.md §2.5`, `docs/SECURITY.md §4.3` |
| Prometheus | Monitoring / Metrics | Scraping runtime server metrics, request distributions, and forecast age gauges | Unauthenticated `/metrics` endpoint (internal network/proxy) | Medium | `backend/metrics.js:1-80`, `backend/server.js:137-145` |

### 2) Data Stores

| Store | Role | Access layer | Key risk | Evidence |
|-------|------|--------------|----------|----------|
| Google Cloud Firestore | Primary forecast store & user identity | `@google-cloud/firestore` in backend, Firebase JS SDK in frontend | Quota limits, concurrent write contention on bulk ingest, credential misconfiguration | `backend/forecastStore.js`, `firestore.rules` |
| Local In-Memory Cache | Request rate limiting & forecast age probe cache | `express-rate-limit` memory store, 60s freshness probe cache | Cache loss on server restart or container scale-out | `backend/middleware/rateLimit.js`, `backend/utils/forecastFreshness.js` |
| Static JSON Snapshots | Offline & degraded runtime fallback store | Static files in `frontend/public/data/` (`forecasts-latest.json`, `freshness.json`) | Snapshot desynchronization with live database if daily build fails | `frontend/public/data/forecasts-latest.json`, `frontend/src/services/forecastApi.ts` |

### 3) Secrets and Credentials Handling

- Credential sources:
  - Injected via environment variables at runtime (`process.env`).
  - Production secrets (`FIREBASE_SERVICE_ACCOUNT`, `BACKEND_API_KEY`, `VAPID_*`, `GEMINI_API_KEY`, `KAGGLE_*`) are managed in GitHub Actions repository secrets and Vercel environment settings.
- Hardcoding checks:
  - Enforced in CI via `bash scripts/check-secrets.sh` (`.github/workflows/ci.yml:567`), which scans all staged and committed files for API keys, private certificates, and bearer tokens.
- Rotation or lifecycle notes:
  - Documented in `docs/ENVIRONMENT_SECRETS.md`. Startup assertions in `backend/server.js:34-58` validate secret presence and issue warnings or fail-closed errors on boot.

### 4) Reliability and Failure Behavior

- Retry/backoff behavior:
  - Client-side queries managed by TanStack Query (`@tanstack/react-query`) with automatic 3x exponential backoff retry.
  - Dedicated typed API client in `packages/api/src/retry.ts` implements jittered retry policies for transient network errors.
- Timeout policy:
  - Inbound HTTP server requests guarded by Express timeout and edge gateway limits (10s on Vercel serverless functions).
  - External weather calls to Open-Meteo timeout after 5 seconds before falling back to cached readings.
- Circuit-breaker or fallback behavior:
  - Dual-Source Architecture (ADR 0008): When live API or Firestore fails, frontend immediately renders the bundled static snapshot `forecasts-latest.json`.
  - Gemini AI failure fallback: When `GEMINI_API_KEY` is missing or the external API returns an error, the advisory generator transparently falls back to the deterministic agrometeorological rule engine (`backend/server.js:42-43`).

### 5) Observability for Integrations

- Logging around external calls:
  - Correlated request ID logging via `backend/middleware/requestId.js`. External call failures log status codes and error messages to standard error.
- Metrics/tracing coverage:
  - Prometheus metrics (`backend/metrics.js`) track HTTP request rates, response durations, and forecast age gauges (`hazardnet_forecast_age_seconds`).
  - Automated external probe workflow (`.github/workflows/site-health.yml`) checks site rendering, deep links, security headers, and forecast data freshness every 30 minutes.
- Missing visibility gaps:
  - The site health probe currently reports failure on the production `security_headers` check (`data/site-health/latest.json:19-22`).
  - No distributed tracing (e.g. OpenTelemetry) currently instrumented between client, Vercel edge, and self-hosted backend.

### 6) Evidence

- `backend/forecastStore.js` (Firestore integration)
- `backend/routes/chat.js` (Google Gemini AI integration)
- `backend/routes/weather.js` (Open-Meteo API integration)
- `backend/routes/push.js` (Web Push integration)
- `packages/api/src/retry.ts` (API retry and fault tolerance)
- `data/site-health/latest.json` (Production probe status)
- `docs/ENVIRONMENT_SECRETS.md` (Credential inventory)
