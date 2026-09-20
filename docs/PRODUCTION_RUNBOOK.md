# HazardNet Production Deployment Runbook

## Overview
This runbook covers production deployment procedures, monitoring, incident response, and recovery for HazardNet v2.1.911.

**Last Updated:** 2026-09-11  
**Maintained By:** DevOps Team  
**On-Call Escalation:** See [#Incident Response](#incident-response)

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Deployment Procedures](#deployment-procedures)
3. [Environment Configuration](#environment-configuration)
4. [Monitoring & Alerts](#monitoring--alerts)
5. [Incident Response](#incident-response)
6. [Common Issues & Resolution](#common-issues--resolution)
7. [Rollback Procedures](#rollback-procedures)
8. [Data Pipeline Management](#data-pipeline-management)
9. [Security Operations](#security-operations)

---

## Architecture Overview

### Production Stack
- **Frontend:** Vercel (Primary), Firebase Hosting (Fallback)
- **Backend API:** Node.js 20 + Express 4.18.2 on Vercel Serverless Functions
- **ML Inference:** TensorFlow.js 4.12.0 (TFLite FP32 model ~0.75MB)
- **Databases:** Firebase — Firestore (forecasts, profiles, blogs, connectors, alerts) + Realtime Database (presence)
- **Data Pipeline:** Kaggle Notebooks → GitHub Actions → Firestore
- **CDN:** Vercel Edge Network
- **Monitoring:** Prometheus (metrics), Sentry (errors), UptimeRobot (availability)

### Key Components
1. **Frontend (React 18 + Vite):** `/frontend/dist` → Vercel deployment
2. **API Routes:** `/api/*` → Vercel Serverless Functions
3. **ML Model:** `/Models/hazardnet_fp32.tflite` (blocked from public access)
4. **Forecast Data:** Firestore `forecasts` collection (554 locations × 3 horizons)

---

## Deployment Procedures

### Pre-Deployment Checklist
- [ ] All CI/CD tests passing (backend, frontend, E2E)
- [ ] Security audit clean (no high/critical vulnerabilities)
- [ ] Code review approved by 2+ team members
- [ ] Database migrations tested (if applicable)
- [ ] Environment variables verified in Vercel dashboard
- [ ] Monitoring dashboards accessible
- [ ] Rollback plan documented

### Automated Deployment (Recommended)

#### Production Deployment (via GitHub Actions)
```bash
# Triggered automatically on push to main branch
git checkout main
git pull origin main
git merge develop
git push origin main

# GitHub Actions will:
# 1. Run test suites (backend, frontend, E2E)
# 2. Security audit
# 3. Build frontend bundle
# 4. Deploy to Vercel production
```

#### Preview Deployment (Pull Request)
```bash
# Triggered automatically on PR creation
gh pr create --base main --head feature-branch

# GitHub Actions deploys preview to Vercel
# Preview URL: https://hazardnet-pr-123.vercel.app
```

#### How CI deploys

**Vercel's Git integration does the deploying — CI holds no Vercel
credentials.** On a pull request Vercel builds a preview; on a push to `main`
it builds production. The signal to watch is the **`Vercel` commit status**
(linked to `vercel.com/<team>/hazardnet/<deployment>`), not a GitHub Actions
job.

CI used to run `npx vercel deploy` from `deploy-preview` / `deploy-production`
jobs, scoped by `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`. Those
jobs were removed on 2026-09-14: the ids in the secrets were stale, so every run
failed with a 403 the CLI reports as *"Could not retrieve Project Settings. To
link your Project, remove the `.vercel` directory and deploy again."* — advice
that cannot be followed in CI, which has no `.vercel` directory at all. The
failure had nothing to do with the code under test, and the credential could
not be corrected from CI. Diagnosis:
`docs/audits/2026-09-14-vercel-deploy-403-project-unresolved.md`.

Consequences worth knowing:

- A red `Deploy Preview/Production (Vercel)` job no longer exists as a failure
  mode; if you find one referenced in an older run, it predates the removal.
- **No repository secret is needed to deploy.** `VERCEL_TOKEN`,
  `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are no longer read by any workflow,
  and `scripts/tests/test_workflows.py` fails if one is reintroduced.
- If a deployment does not appear, check the Vercel project's **Git
  integration** settings (repository connected, production branch `main`) —
  that is the only deploy path now.

### Manual Deployment (Emergency Only)

#### Deploy to Vercel (CLI)
```bash
# Install Vercel CLI
npm i -g vercel

# Login (first time only)
vercel login

# Deploy to preview
vercel

# Deploy to production
vercel --prod

# Verify deployment
vercel ls
```

#### Deploy to Firebase Hosting (Fallback)
```bash
# Install Firebase CLI
npm i -g firebase-tools

# Login
firebase login

# Build frontend
npm run build

# Deploy
firebase deploy --only hosting

# Verify
firebase hosting:sites:list
```

---

## Environment Configuration

### Required Environment Variables

#### Vercel Production Environment
```bash
# Backend API
BACKEND_API_KEY=<secure-random-256-bit-key>
NODE_ENV=production

# Firebase Auth (email/password + Google + GitHub providers)
VITE_FIREBASE_API_KEY=<public-firebase-web-api-key>
VITE_FIREBASE_PROJECT_ID=hazardnet-aas48424
VITE_FIREBASE_FIRESTORE_DATABASE_ID=default

# Firebase (Firestore Forecasts)
FIREBASE_PROJECT_ID=hazardnet-production
FIREBASE_PRIVATE_KEY=<firebase-service-account-private-key>
FIREBASE_CLIENT_EMAIL=<firebase-service-account-email>

# Gemini AI (Advisory Generation)
GEMINI_API_KEY=<google-ai-studio-api-key>

# Web Push Notifications
VAPID_PUBLIC_KEY=<vapid-public-key>
VAPID_PRIVATE_KEY=<vapid-private-key>

# Security
FRONTEND_ORIGIN=https://hazardnet.vercel.app
CSP_ENFORCE=true

# Monitoring
SENTRY_DSN=<sentry-project-dsn>
```

#### GitHub Actions Secrets
```bash
# Vercel
VERCEL_TOKEN=<vercel-api-token>
VERCEL_ORG_ID=<vercel-org-id>
VERCEL_PROJECT_ID=<vercel-project-id>

# Kaggle (Forecast Pipeline)
KAGGLE_USERNAME=<kaggle-username>
KAGGLE_KEY=<kaggle-api-key>

# Firebase (Data Ingestion)
FIREBASE_SERVICE_ACCOUNT=<base64-encoded-service-account-json>

# Codecov (Test Coverage)
CODECOV_TOKEN=<codecov-project-token>
```

### Setting Environment Variables

#### Vercel Dashboard
1. Navigate to https://vercel.com/dashboard
2. Select `hazardnet` project
3. Go to Settings → Environment Variables
4. Add/update variables for Production, Preview, Development environments

#### CLI Method
```bash
# Add production environment variable
vercel env add BACKEND_API_KEY production

# Pull environment variables locally
vercel env pull .env.local
```

---

## Monitoring & Alerts

### Metrics Dashboard

#### Prometheus Metrics (Exposed at `/api/metrics`)
- **Inference Latency:** `hazardnet_inference_latency_ms` (p50, p95, p99)
- **Cache Hit Rate:** `hazardnet_prediction_cache_hits_total` / `hazardnet_predictions_total`
- **Model Load Time:** `hazardnet_model_load_time_ms`
- **API Requests:** `hazardnet_api_requests_total` (by endpoint, status)
- **Error Rate:** `hazardnet_errors_total` (by type)

#### Key Performance Indicators (KPIs)
| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| API Availability | >99.5% | <99% |
| p95 Latency (Forecast API) | <200ms | >500ms |
| p95 Latency (Prediction) | <1000ms | >2000ms |
| Cache Hit Rate | >60% | <40% |
| Error Rate | <0.5% | >2% |
| Forecast Freshness | <24hrs | >48hrs |

### Grafana Dashboard Setup
```bash
# Import HazardNet dashboard JSON
curl -X POST https://grafana.yourdomain.com/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @docs/monitoring/grafana-dashboard.json

# Configure Prometheus data source
# URL: https://hazardnet.vercel.app/api/metrics
# Scrape interval: 15s
```

### Sentry Error Tracking
```javascript
// Already configured in frontend/src/main.tsx
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
});
```

### UptimeRobot Alerts
1. **Homepage Availability:** https://hazardnet.vercel.app (check every 5 min)
2. **API Health:** https://hazardnet.vercel.app/health (check every 5 min)
3. **Forecast Freshness:** Custom monitor checking `/api/v1/forecasts` timestamp

---

## Incident Response

### Severity Levels

#### P0 - Critical (Respond within 15 minutes)
- Production site completely down (>95% error rate)
- Data breach or security incident
- Database unavailable
- ML model serving failures (>50% error rate)

#### P1 - High (Respond within 1 hour)
- Partial outage (50-95% traffic affected)
- Performance degradation (p95 >5s)
- Forecast data stale (>72 hours)
- Authentication failures

#### P2 - Medium (Respond within 4 hours)
- Minor feature degradation (<10% traffic affected)
- Non-critical API endpoints failing
- Slow advisory generation (>30s)

#### P3 - Low (Respond within 24 hours)
- UI bugs with workarounds
- Documentation issues
- Non-urgent performance optimization

### Incident Response Workflow

#### 1. Detection & Alerting
```bash
# Automated alerts via:
- UptimeRobot → Email/SMS to on-call engineer
- Sentry → Slack #incidents channel
- Grafana → PagerDuty integration
```

#### 2. Initial Response (First 5 Minutes)
- Acknowledge incident in PagerDuty/Slack
- Check status dashboard: https://status.hazardnet.vercel.app
- Verify scope (how many users affected?)
- Create incident channel: `#incident-YYYY-MM-DD-brief-description`

#### 3. Investigation & Diagnosis
```bash
# Check Vercel deployment logs
vercel logs hazardnet --prod --since 1h

# Check Sentry for error spikes
https://sentry.io/organizations/hazardnet/issues/?query=is:unresolved

# Check Prometheus metrics
curl https://hazardnet.vercel.app/api/metrics | grep hazardnet_errors_total

# Check forecast freshness
curl https://hazardnet.vercel.app/api/v1/forecasts?district_id=1 | jq '.[0].prediction_date'
```

#### 4. Mitigation & Resolution
- Apply fix (code patch, config change, rollback)
- Verify fix in preview environment first
- Deploy to production
- Monitor metrics for 15 minutes post-deployment

#### 5. Post-Incident Review
- Document timeline in `/docs/incidents/YYYY-MM-DD-incident-name.md`
- Identify root cause
- Create action items to prevent recurrence
- Update runbook with lessons learned

---

## Common Issues & Resolution

### Issue: Frontend Not Loading (White Screen)

**Symptoms:** Users see blank page, browser console shows JS errors

**Diagnosis:**
```bash
# Check Vercel deployment status
vercel ls --prod

# Check browser console for errors
# Common causes: Bundle corruption, CSP blocking scripts
```

**Resolution:**
```bash
# Rollback to previous deployment
vercel rollback

# Or rebuild and redeploy
npm run build
vercel --prod
```

### Issue: ML Prediction Endpoint Timing Out

**Symptoms:** POST `/api/predict` returns 504 or 524 after 10s

**Diagnosis:**
```bash
# Check if model is loaded
curl https://hazardnet.vercel.app/api/metrics | grep hazardnet_model_loaded

# Check memory usage (Vercel function limit: 1GB)
# Check inference latency metrics
```

**Resolution:**
```bash
# Option 1: Optimize model (reduce quantization)
# Option 2: Increase Vercel function timeout
# Edit vercel.json:
{
  "functions": {
    "api/predict.js": {
      "maxDuration": 30
    }
  }
}

# Redeploy
vercel --prod
```

### Issue: Forecast Data Stale (>48 Hours Old)

**Symptoms:** Dashboard shows old predictions, users complain about outdated data

**Diagnosis:**
```bash
# Check GitHub Actions forecast pipeline status
gh run list --workflow=forecast-pipeline.yml

# Check last successful run
gh run view <run-id>

# Check Kaggle notebook status
python scripts/kaggle_trigger.py
```

**Resolution:**
```bash
# Manual trigger forecast pipeline
gh workflow run forecast-pipeline.yml

# Or run Kaggle notebook manually
cd kaggle_notebooks/hazardnet-auto-forecast-pipeline
kaggle kernels push

# Verify data updated in Firestore
# Check /api/v1/forecasts?district_id=1
```

### Issue: Rate Limiting Too Aggressive

**Symptoms:** Legitimate users hitting 429 errors, complaints about "too many requests"

**Diagnosis:**
```bash
# Check rate limiter config in backend/server.js
# Current limits:
# - /api/predict: 10 req/15min per IP
# - /api/advisory: 30 req/hour per user tier
```

**Resolution:**
```bash
# Option 1: Adjust rate limits in code
# Edit backend/middleware/rateLimiter.js
const predictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // Increase from 10 to 20
});

# Option 2: Implement user-tier based limits (already exists)
# Premium users get higher limits

# Redeploy
git commit -am "Adjust rate limits"
git push origin main
```

---

## Rollback Procedures

### Rollback Vercel Deployment

#### Via Vercel Dashboard
1. Go to https://vercel.com/hazardnet/deployments
2. Find last known good deployment
3. Click "..." menu → "Promote to Production"
4. Confirm rollback

#### Via CLI
```bash
# List recent deployments
vercel ls --prod

# Rollback to previous deployment
vercel rollback

# Or rollback to specific deployment
vercel promote <deployment-url> --scope=hazardnet
```

### Rollback Database Changes

#### Firebase Rollback (Firestore)
```bash
# Firestore has automatic backups (7-day retention)
# Restore from backup:
gcloud firestore import gs://hazardnet-backups/2026-09-10

# Or manually revert forecast data
# Trigger forecast pipeline to regenerate
gh workflow run forecast-pipeline.yml
```

#### Realtime Database Rollback
```bash
# Firebase Realtime Database has no PITR on the free tier; presence is
# ephemeral telemetry only, so no rollback is needed.
```

---

## Data Pipeline Management

### Kaggle Forecast Pipeline

#### Pipeline Schedule
- **Frequency:** Daily at 00:00 UTC (GitHub Actions cron)
- **Duration:** ~45-90 minutes (GEE extraction + inference + upload)
- **Output:** CSV + JSON (554 locations × 3 horizons = 1662 records)

#### Manual Trigger
```bash
# Via GitHub Actions
gh workflow run forecast-pipeline.yml

# Via Python script
cd scripts
python kaggle_trigger.py

# Validate output
python validate_forecasts.py
```

#### Monitoring Pipeline Health
```bash
# Check last run status
gh run list --workflow=forecast-pipeline.yml --limit 5

# View logs
gh run view <run-id> --log

# Check forecast age
curl https://hazardnet.vercel.app/api/v1/forecasts?district_id=1 | \
  jq '.[0].prediction_date'
```

#### Pipeline Failure Recovery
```bash
# If pipeline fails:
# 1. Check GitHub Actions logs
gh run view <run-id> --log-failed

# 2. Check Kaggle notebook status
kaggle kernels status <username>/hazardnet-auto-forecast

# 3. Retry pipeline
gh workflow run forecast-pipeline.yml

# 4. If retry fails, run notebook manually via Kaggle UI
# https://www.kaggle.com/code/<username>/hazardnet-auto-forecast
```

---

## Security Operations

### Security Monitoring

#### Daily Tasks
- [ ] Review Sentry error reports for suspicious patterns
- [ ] Check Vercel access logs for unauthorized API calls
- [ ] Monitor rate limiter metrics for abuse

#### Weekly Tasks
- [ ] Review Dependabot security alerts
- [ ] Run `npm audit` and address high/critical vulnerabilities
- [ ] Check Firebase Authentication console for anomalies

#### Monthly Tasks
- [ ] Rotate API keys (BACKEND_API_KEY, GEMINI_API_KEY)
- [ ] Review CSP reports and adjust policy
- [ ] Audit user permissions and access logs

### Incident Response (Security)

#### Data Breach Response
1. **Immediately:** Rotate all API keys and secrets
2. **Within 1 hour:** Notify affected users
3. **Within 24 hours:** File breach report with authorities (if required)
4. **Within 72 hours:** Post-mortem and remediation plan

#### API Key Rotation
```bash
# Generate new API key
openssl rand -base64 32

# Update in Vercel
vercel env rm BACKEND_API_KEY production
vercel env add BACKEND_API_KEY production

# Update in GitHub Actions
gh secret set BACKEND_API_KEY

# Update Kaggle notebook ingestion script
# (Manual update required)
```

---

## Support Contacts

| Role | Contact | Escalation |
|------|---------|-----------|
| On-Call Engineer | on-call@hazardnet.io | PagerDuty |
| DevOps Lead | devops-lead@hazardnet.io | Slack DM |
| Security Team | security@hazardnet.io | Emergency: +880-XXX-XXXX |
| Vercel Support | https://vercel.com/support | Via Dashboard |
| Firebase Support | https://firebase.google.com/support | Via Console |

---

## Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-09-11 | 1.0.0 | Initial production runbook | DevOps Team |

