# HazardNet Monitoring (backlog #5 — forecast freshness SLO)

Covers the deployment guide's Phase 4 monitoring gap (see
`docs/audits/2026-09-12-deployment-verification.md` §6 item 5): the
`hazardnet_forecast_age_hours` gauge, Prometheus alert rules, and a Grafana
dashboard — plus the Vercel-native alternative to running your own stack.

## The freshness SLO

`hazardnet_forecast_age_hours` = hours since the newest `prediction_date` in
the forecast store (either `FORECAST_STORE` implementation — the metric is
identical before and after the ADR 0002 cutover).

| Gauge state | Meaning |
|---|---|
| 2–170 | Healthy weekly cadence (Sunday ~02:00 UTC pipeline) |
| > 192 | A weekly run was missed → `HazardNetForecastStale` alert |
| absent | Never ingested, forecast store unreadable, or scrape target down → `HazardNetForecastDataMissing` alert |

Notes:

- `prediction_date` is date-granular (`YYYY-MM-DD`), so the age carries up to
  ±24h of granularity — irrelevant at the 192h threshold.
- **Threshold calibration:** the canonical pipeline is **daily**
  (`daily_forecast.yml`, 00:00 UTC on the GitHub runner; the Kaggle workflows
  were removed 2026-09-17), so 48h = one missed run + ~22h grace. (The 192h
  weekly-cadence value applied only while the Kaggle weekly pipeline was the
  producer.)
- The gauge is refreshed **scrape-driven** on every `/metrics` request, via a
  60s-cached store probe (`backend/utils/forecastFreshness.js`) — a 30s scrape
  interval costs ≤ ~2 indexed reads (Firestore) / `max()` queries (Supabase)
  per minute, and the age is recomputed from the cached date on every scrape
  so it keeps advancing between probes. On lookup failure the gauge is *reset*
  (series absent) rather than left showing a flat, stale lie.

## Files

| File | Purpose |
|---|---|
| `prometheus.yml` | Scrape configs for both targets (self-host Node server; Vercel function) + rule file reference |
| `alerts.yml` | `HazardNetForecastStale` (> 192h) and `HazardNetForecastDataMissing` (absent 30m) |
| `grafana-dashboard.json` | Importable dashboard: forecast age, API request rate, inference latency p95, model load time |

## Metric sources

| Deployment | Endpoint | Exposed metrics |
|---|---|---|
| Node server (self-host) | `GET /metrics` | full set: forecast age + `api_requests_total`, `inference_latency_ms`, `model_load_time_ms`, etc. (`backend/metrics.js`) |
| Vercel (primary, ADR 0003) | `GET /api/metrics` | stateless function: forecast-age gauge computed live from the store (per-instance counters would be meaningless across lambda instances — so nothing else is faked) |

Known unwired metrics on the Node server (kept for future use, no writers
yet): `cache_hit_rate`, `severity_mae`, `prediction_accuracy_per_class`.
`api_requests_total` is incremented by the `/api/predict` and
`/api/conversions` routes only.

## Running it

### Self-host (Prometheus + Grafana)

```bash
docker run -d --name prometheus -p 9090:9090 \
  -v "$(pwd)/monitoring/prometheus.yml":/etc/prometheus/prometheus.yml:ro \
  -v "$(pwd)/monitoring/alerts.yml":/etc/prometheus/alerts.yml:ro \
  prom/prometheus

docker run -d --name grafana -p 3005:3000 grafana/grafana
# then: add a Prometheus datasource (http://<docker-host>:9090) and import
# monitoring/grafana-dashboard.json
```

(Start the Node server with `npm start` — it must be reachable at the target
configured in `prometheus.yml`.)

### Vercel-native alternative (no self-hosted Prometheus)

Vercel functions can't be scraped by a Prometheus running inside Vercel, so
use an **external** collector pointed at the deployed endpoint:

1. Grafana Cloud (free tier includes a Prometheus/agent) or any hosted
   Prometheus: add a scrape job with `scheme: https`, `metrics_path:
   /api/metrics`, target `your-project.vercel.app` (template in
   `prometheus.yml`), then load `alerts.yml` as a rule group and import the
   dashboard.
2. For pure uptime/alerting without metrics: point an uptime checker
   (Checkly, UptimeRobot, Grafana Synthetics) at `/health` (liveness) and
   `/api/metrics` (dependency health — it returns **503** when the forecast
   store is unreachable, so a store outage pages you).
3. Vercel Observability (built-in function logs/metrics) covers
   infrastructure-level signals but cannot compute the forecast-freshness SLO
   — that's what `/api/metrics` is for.

## Alert routing

`alerts.yml` only defines the rules. Routing (email/Slack/etc.) is whatever
your Prometheus Alertmanager (or Grafana Cloud alerting) is configured with —
wire the two alert names above to your channel of choice.
