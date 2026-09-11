# HazardNet Monitoring Setup Guide

This guide walks you through setting up comprehensive monitoring for HazardNet production deployment using Grafana, Prometheus, UptimeRobot, and Sentry.

---

## Prerequisites

- Production deployment live at `https://hazardnet.vercel.app`
- Grafana instance (Cloud or self-hosted)
- UptimeRobot account (free tier available)
- Sentry project (already configured in frontend)

---

## 1. Prometheus Metrics Setup

### 1.1 Verify Metrics Endpoint

Prometheus metrics are already exposed at `/api/metrics`. Verify they're accessible:

```bash
curl https://hazardnet.vercel.app/api/metrics

# Should return metrics like:
# hazardnet_inference_latency_ms_bucket{le="100"} 45
# hazardnet_predictions_total 1234
# hazardnet_cache_hits_total 890
```

### 1.2 Available Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `hazardnet_inference_latency_ms` | Histogram | ML prediction latency (p50, p95, p99) |
| `hazardnet_predictions_total` | Counter | Total predictions served |
| `hazardnet_cache_hits_total` | Counter | Cache hits for predictions |
| `hazardnet_model_load_time_ms` | Gauge | Time to load TFLite model |
| `hazardnet_api_requests_total` | Counter | Total API requests by endpoint/status |
| `hazardnet_errors_total` | Counter | Total errors by type |
| `hazardnet_forecast_last_update_timestamp` | Gauge | Unix timestamp of last forecast update |
| `hazardnet_db_query_duration_ms` | Histogram | Database query latency |
| `hazardnet_firestore_writes_total` | Counter | Firestore write operations |
| `hazardnet_active_connections` | Gauge | Active WebSocket/HTTP connections |
| `hazardnet_rate_limit_hits_total` | Counter | Rate limit enforcement hits |

---

## 2. Grafana Dashboard Setup

### 2.1 Create Grafana Account

**Option A: Grafana Cloud (Recommended)**
1. Go to https://grafana.com/auth/sign-up
2. Create free account (includes 10K metrics, 50GB logs)
3. Create a new stack (e.g., `hazardnet-monitoring`)

**Option B: Self-Hosted**
```bash
docker run -d -p 3000:3000 --name=grafana grafana/grafana-oss
```

### 2.2 Add Prometheus Data Source

1. Navigate to **Configuration → Data Sources**
2. Click **Add data source**
3. Select **Prometheus**
4. Configure:
   - **Name:** HazardNet Prometheus
   - **URL:** `https://hazardnet.vercel.app/api/metrics`
   - **Access:** Server (default)
   - **Scrape interval:** 15s
5. Click **Save & Test**

### 2.3 Import Dashboard

**Automated (recommended):**
```bash
# Set environment variables
export GRAFANA_URL=https://your-instance.grafana.net
export GRAFANA_API_KEY=your-api-key

# Run setup script
bash scripts/setup_monitoring.sh
```

**Manual:**
1. Navigate to **Dashboards → Import**
2. Upload `docs/monitoring/grafana-dashboard.json`
3. Select data source: **HazardNet Prometheus**
4. Click **Import**

### 2.4 Configure Alerting

**High Error Rate Alert:**
1. Edit panel **"Error Rate"** (Panel ID 3)
2. Go to **Alert** tab
3. Configure:
   - **Condition:** WHEN `avg()` OF `query(A, 5m, now)` IS ABOVE `2`
   - **Frequency:** Evaluate every `60s` for `5m`
   - **Notifications:** Add email/Slack channel
4. Save

**High Latency Alert:**
1. Edit panel **"P95 Latency by Endpoint"** (Panel ID 4)
2. Configure alert:
   - **Condition:** WHEN `avg()` OF `query(A, 5m, now)` IS ABOVE `500`
   - **Frequency:** Every `60s` for `5m`
3. Save

**Low Cache Hit Rate Alert:**
1. Edit panel **"Cache Hit Rate"** (Panel ID 7)
2. Configure alert:
   - **Condition:** WHEN `avg()` OF `query(A, 10m, now)` IS BELOW `40`
   - **Frequency:** Every `120s` for `10m`
3. Save

### 2.5 Dashboard Customization

**Add Custom Panel:**
```json
{
  "title": "Custom Metric",
  "targets": [{
    "expr": "your_prometheus_query_here",
    "legendFormat": "{{label}}"
  }],
  "type": "graph"
}
```

---

## 3. UptimeRobot Setup

### 3.1 Create Account
1. Go to https://uptimerobot.com/
2. Sign up for free account (50 monitors, 5-min intervals)

### 3.2 Add Monitors

**Automated:**
```bash
export UPTIMEROBOT_API_KEY=your-api-key
export PRODUCTION_URL=https://hazardnet.vercel.app
export ALERT_EMAIL=alerts@yourdomain.com

bash scripts/setup_monitoring.sh
```

**Manual:**

#### Monitor 1: Homepage Availability
- **Type:** HTTP(s)
- **URL:** `https://hazardnet.vercel.app`
- **Monitoring Interval:** 5 minutes
- **Alert Contacts:** Your email/SMS
- **Keyword:** (leave empty for status code check)

#### Monitor 2: API Health Endpoint
- **Type:** HTTP(s)
- **URL:** `https://hazardnet.vercel.app/health`
- **Monitoring Interval:** 5 minutes
- **Keyword:** `"status":"ok"`

#### Monitor 3: Forecast Data Freshness
- **Type:** Keyword
- **URL:** `https://hazardnet.vercel.app/api/v1/forecasts?district_id=1`
- **Monitoring Interval:** 30 minutes
- **Keyword:** `prediction_date`
- **Alert:** If keyword not found (indicates stale data)

#### Monitor 4: ML Prediction Endpoint
- **Type:** Keyword
- **URL:** `https://hazardnet.vercel.app/api/metrics`
- **Monitoring Interval:** 10 minutes
- **Keyword:** `hazardnet_predictions_total`

### 3.3 Configure Alert Channels

1. Go to **My Settings → Alert Contacts**
2. Add contacts:
   - **Email:** your-email@domain.com
   - **SMS:** (optional, paid feature)
   - **Slack:** (webhook URL)
   - **PagerDuty:** (integration key)
3. Assign contacts to monitors

### 3.4 Set Up Status Page (Optional)
1. Go to **Status Pages → Add Status Page**
2. Select monitors to include
3. Customize branding
4. Publish: `https://status.hazardnet.com` (custom domain)

---

## 4. Sentry Error Tracking

### 4.1 Verify Sentry Configuration

Sentry is already configured in `frontend/src/main.tsx`. Verify:

```javascript
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
});
```

### 4.2 Set Environment Variable

Add to Vercel production environment:
```bash
VITE_SENTRY_DSN=https://your-dsn@sentry.io/project-id
```

### 4.3 Configure Alerts

1. Go to **Sentry Project → Alerts**
2. Create alert rule:
   - **Trigger:** Error count exceeds 10 in 5 minutes
   - **Action:** Email team + Slack notification
3. Create performance alert:
   - **Trigger:** p95 transaction duration > 2000ms
   - **Action:** Email on-call engineer

### 4.4 Release Tracking

Add to CI/CD pipeline (`.github/workflows/ci.yml`):
```yaml
- name: Create Sentry Release
  run: |
    sentry-cli releases new ${{ github.sha }}
    sentry-cli releases set-commits ${{ github.sha }} --auto
    sentry-cli releases finalize ${{ github.sha }}
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
```

---

## 5. Log Aggregation (Optional)

### 5.1 Vercel Logs
Access via:
```bash
vercel logs hazardnet --prod
vercel logs hazardnet --prod --follow  # Real-time
```

### 5.2 Papertrail/Logtail Integration
1. Add papertrail destination in Vercel integrations
2. Configure log drains:
   ```bash
   vercel env add LOG_DRAIN_URL production
   # Value: syslog+tls://logs.papertrailapp.com:12345
   ```

---

## 6. Performance Monitoring

### 6.1 Lighthouse CI

Add to GitHub Actions:
```yaml
- name: Run Lighthouse CI
  run: |
    npm install -g @lhci/cli
    lhci autorun --upload.target=temporary-public-storage
```

### 6.2 Web Vitals Monitoring

Already configured in frontend via:
```javascript
import { getCLS, getFID, getLCP } from 'web-vitals';

getCLS(metric => sendToAnalytics(metric));
getFID(metric => sendToAnalytics(metric));
getLCP(metric => sendToAnalytics(metric));
```

---

## 7. Verification Checklist

After setup, verify all monitoring is working:

### Grafana
- [ ] Dashboard loads without errors
- [ ] All panels display data
- [ ] Alerts configured and visible
- [ ] Data refreshes every 30 seconds

### UptimeRobot
- [ ] All 4 monitors showing "Up" status
- [ ] Test alert by pausing monitor
- [ ] Email/SMS notifications received
- [ ] Status page accessible

### Sentry
- [ ] Test error captured in Sentry dashboard
- [ ] Performance transactions visible
- [ ] Alerts configured
- [ ] Release tracking working

### Prometheus
- [ ] `/api/metrics` returns valid Prometheus format
- [ ] Metrics update in real-time
- [ ] No scrape errors in Grafana

---

## 8. Maintenance

### Daily Tasks
- [ ] Review Grafana dashboard for anomalies
- [ ] Check UptimeRobot alerts
- [ ] Review Sentry errors (< 5 unresolved)

### Weekly Tasks
- [ ] Review alert thresholds and adjust
- [ ] Analyze performance trends
- [ ] Update dashboard panels if needed

### Monthly Tasks
- [ ] Rotate monitoring API keys
- [ ] Review alert fatigue (too many false positives)
- [ ] Update documentation

---

## 9. Troubleshooting

### Grafana shows "No Data"
1. Check Prometheus endpoint: `curl https://hazardnet.vercel.app/api/metrics`
2. Verify data source URL in Grafana settings
3. Check time range (default: last 6 hours)
4. Verify Vercel functions are running (not cold-started)

### UptimeRobot false positives
1. Increase monitoring interval from 5 min to 10 min
2. Add retry attempts (Settings → Advanced)
3. Whitelist UptimeRobot IPs in Vercel (if using IP allowlist)

### Sentry not capturing errors
1. Verify `VITE_SENTRY_DSN` set in Vercel
2. Check browser console for Sentry init errors
3. Test with manual error: `Sentry.captureException(new Error('Test'))`

---

## 10. Cost Estimates

| Service | Plan | Cost | Notes |
|---------|------|------|-------|
| **Grafana Cloud** | Free | $0 | 10K metrics, 50GB logs, 14-day retention |
| **UptimeRobot** | Free | $0 | 50 monitors, 5-min checks |
| **Sentry** | Team | $26/mo | 100K errors, 10K perf transactions |
| **Vercel** | Pro | $20/mo | Included in deployment cost |

**Total:** $26-46/month (Sentry optional for MVP)

---

## Support

- **Grafana Docs:** https://grafana.com/docs/
- **UptimeRobot Support:** https://uptimerobot.com/help/
- **Sentry Docs:** https://docs.sentry.io/
- **Prometheus:** https://prometheus.io/docs/

---

**Setup Time:** ~1-2 hours  
**Maintenance:** ~30 min/week
