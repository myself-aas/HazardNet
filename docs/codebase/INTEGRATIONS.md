# External Integrations

> Updated 2026-09-14 after owner decisions and remediation. [ADR 0009](../adr/0009-firebase-model-and-deployment-contract.md) is canonical. [Audit results and limits](../audits/2026-09-14-firebase-remediation.md); [rollout checklist](../ops/firebase-model-rollout.md). Source review is not production certification.

## 1) Integration Inventory
| System | Purpose/auth | Feature dependency | Evidence |
|---|---|---|---|
| Firebase Auth/Firestore | User tokens and rules for browser; trusted Admin ADC/JSON for server | Identity/domain data/forecasts/push | `backend/admin.js`, `frontend/src/services/firebase.ts`, `firestore.rules` |
| Firebase RTDB/Analytics | Connectivity/browser analytics with client config | Optional telemetry | `frontend/src/services/firebase.ts` |
| LiteRT service | Bearer key, HTTPS outside local dev, matching model hash | Required for trained prediction | `backend/inference.js`, `model_service/app.py` |
| Kaggle/Actions/Releases | Secret-based production/fetch/ingest/archive | Forecast freshness | `.github/workflows/forecast-pipeline.yml`, `hourly_forecast.yml` under same directory |
| Gemini/OpenRouter/Groq/Hugging Face | Env API keys, advisory fallback/circuits | Degradable advisory text | `backend/utils/ai_fallback_engine.js` |
| Raster providers | Leaflet tiles, browser cache | Map background | `frontend/src/hooks/useLeafletMap.ts`, `frontend/public/serviceWorker.js` |
| Web Push | VAPID, private durable subscriptions, provider HTTPS allowlist | Optional notifications | `backend/routes/push.js`, `backend/pushStore.js` |
| Vercel/Prometheus/Grafana/Codecov | Hosting/analytics/observability/CI coverage | Deployment/operations | `vercel.json`, `monitoring/`, `.github/workflows/ci.yml` |
Open-Meteo/GEE are upstream notebook inputs per historical project docs; no external notebook audit was performed. Connector catalog entries are not verified external dispatch implementations.

## 2) Data Stores
Firestore collections: private profiles, public demographic projections, owner connectors, author/admin blogs, assessments/alerts, public forecasts, server-only push subscriptions (`firestore.rules`). Browser snapshot/Cache Storage and server-local prediction/advisory caches are fallbacks, not additional canonical databases. RAG uses local JSON/Markdown. SQL assets are historical/optional spatial tooling, not runtime Supabase persistence.

## 3) Secrets and Credentials Handling
Sources: server env/ADC, Actions secrets, browser-public VITE config. No secret values copied into docs. **Slack/Discord/Zapier webhook URLs are credentials**; generic connector `config` and legacy `auth_data` may also contain secrets (`frontend/src/lib/connectors.ts`). Owner-only rules prevent cross-user reads after rollout. [TODO] Live records/logs, historical exposure and rotation remain unverified. Public Firebase API keys are identifiers; rules—not their secrecy—authorize data access.

## 4) Reliability and Failure Behavior
Model request timeout 45s; browser upload 55s; wrong artifact/output or missing service fails explicitly. Forecast query polls/stales at five minutes, retries once, retains data up to 24h before GC, falls back live → snapshot → baseline (`useForecasts.ts`). AI engine has 45s provider cooldown; not a uniform request deadline. Store writes <=400 operations, idempotent row IDs, stale deletion after publication; not globally atomic across chunks. Push delivery concurrency ten; large jobs need an external durable worker.

## 5) Observability for Integrations
Node metrics/freshness and Vercel `/api/metrics`; request IDs for shared Express routes; AI warnings and provider stats (`backend/metrics.js`, `forecastFreshness.js`, `ai_fallback_engine.js`). Historical freshness alert is 192 hours; [TODO] owner-approved freshness SLA and actual collector/alert routing. No distributed trace system configured in inspected entrypoints.

## 6) Evidence
- `.env.example`, `backend/admin.js`, `firestore.rules`, `backend/inference.js`
- `frontend/src/lib/connectors.ts`, `backend/routes/push.js`, `backend/pushStore.js`
- `monitoring/README.md`, `.github/workflows/`, `docs/ops/firebase-model-rollout.md`
