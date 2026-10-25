# GitHub Ingestion Pipeline & Credential Resolution Plan

A comprehensive technical plan to resolve the GitHub Actions `daily_advisory_ingest.yml` workflow failure and synchronize local workspace pipeline scripts and tests.

## User Review & Critical Decisions

> [!IMPORTANT]
> The user confirmed the following choices during Phase 1 clarification:
> - **Credential Variable Mapping**: Update `.github/workflows/daily_advisory_ingest.yml` in Step 8 to explicitly map `FIREBASE_SERVICE_ACCOUNT_JSON: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}` so the privileged forecast persistence layer in `backend/forecastPersistence.js` receives valid service account credentials.
> - **Workspace Synchronization**: Synchronize missing pipeline runner scripts (`scripts/process_advisory_ingest.mjs`, `scripts/validate_advisory_csv.mjs`, `scripts/fetch_kaggle_advisory.mjs`, `scripts/notify_ops.mjs`, and `scripts/lib/*`) into the workspace and ensure all local Jest/Node pipeline tests pass.

---

## 1. Overview & Core Concept

- **Problem**: The daily advisory ingestion workflow on GitHub Actions failed at Step 8 (`Validate Advisory CSV & Execute Ingestion`). The step downloaded a fresh 128-row Kaggle advisory CSV successfully, but failed when calling `node scripts/process_advisory_ingest.mjs` with `--ingest-firestore`. The backend persistence writer (`backend/forecastPersistence.js`) attempted to read `process.env.FIREBASE_SERVICE_ACCOUNT_JSON` which was unset, falling back to Google Application Default Credentials (`applicationDefault()`) which is absent on GitHub runners.
- **Solution**:
  1. Fix `.github/workflows/daily_advisory_ingest.yml` so Step 8 exports `FIREBASE_SERVICE_ACCOUNT_JSON` mapped to `${{ secrets.FIREBASE_SERVICE_ACCOUNT }}`.
  2. Verify and commit all required pipeline scripts in `scripts/` and `scripts/lib/` locally so both CI and local test environments match HEAD.
  3. Run `npm test` and `node --test __tests__/advisoryPipeline.test.js` to guarantee 100% test pass rate.

---

## 2. User Experience & Visual Design

- **CI/CD Pipeline Observability**: The `daily_advisory_ingest.yml` workflow will transition from red to green, allowing automated daily runs at 05:30 UTC.
- **Freshness Indicator**: The live site's `frontend/public/data/freshness.json` and `/status` page will accurately display `forecast_ingest: "fresh"` with the latest Kaggle publication timestamp instead of reporting stale data.
- **Operational Notifications**: Successful runs will log clean completion metrics and post green status updates to Slack `#hazardnet-ops`.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Direct Workflow Secret Mapping vs. Code Fallback**
  - *Chosen Approach*: Update `.github/workflows/daily_advisory_ingest.yml` to export `FIREBASE_SERVICE_ACCOUNT_JSON: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}` while maintaining `backend/forecastPersistence.js`'s strict requirement for `FIREBASE_SERVICE_ACCOUNT_JSON`.
  - *Why*: Keeps backend security strict and aligned with Node `firebase-admin` naming standards without altering production persistence code.
- **Decision 2: Local Script Synchronization**
  - *Chosen Approach*: Ensure `scripts/process_advisory_ingest.mjs`, `scripts/validate_advisory_csv.mjs`, `scripts/fetch_kaggle_advisory.mjs`, `scripts/notify_ops.mjs`, `scripts/ingest_forecast_csv.mjs`, and `scripts/lib/*.mjs` are completely in sync with repository HEAD.
  - *Why*: Prevents `ERR_MODULE_NOT_FOUND` when developers or local tests run `node --test __tests__/advisoryPipeline.test.js`.

---

## 4. Technical Architecture & Data Strategy

### Pipeline Execution & Credential Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       GitHub Actions Workflow Run                           │
│                 (.github/workflows/daily_advisory_ingest.yml)               │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Step 7: Fetch Advisory CSV from Kaggle API                                 │
│  (scripts/fetch_kaggle_advisory.mjs)                                        │
│  Outputs: fetched=true, fresh=true, CSV in /tmp/advisory-ingest/             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Step 8: Validate & Execute Ingestion                                       │
│  Env: FIREBASE_SERVICE_ACCOUNT_JSON=${{ secrets.FIREBASE_SERVICE_ACCOUNT }} │
│       FIREBASE_PROJECT_ID=${{ secrets.FIREBASE_PROJECT_ID }}               │
│  Executes: node scripts/process_advisory_ingest.mjs --ingest-firestore     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────┴──────────────────────────────────────┐
│                  Ingestion Runner Steps (in process_advisory_ingest.mjs)   │
│                                                                             │
│  1. validateAdvisoryCsv() [64 districts × 2 horizons = 128 rows check]       │
│  2. mapAdvisoryRows() -> backend/data/forecasts/hazardnet_forecasts_latest.csv│
│  3. build_forecast_snapshot.mjs -> frontend/public/data/forecasts-latest.json │
│  4. ingest_forecast_csv.mjs -> Firestore Collection ('forecasts')          │
│     Reads FIREBASE_SERVICE_ACCOUNT_JSON -> Authenticates via cert()         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Step-by-Step Implementation Action Plan

#### Step 1: Fix GitHub Actions Workflow Secret Binding
Modify `.github/workflows/daily_advisory_ingest.yml` at Step 8:
- Replace `FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}` with `FIREBASE_SERVICE_ACCOUNT_JSON: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}`.
- Ensure `INGEST_FIRESTORE_FLAG` is correctly bound to `--ingest-firestore`.

#### Step 2: Validate Local Script Tree
Verify that all required scripts exist in the repository tree:
- `scripts/process_advisory_ingest.mjs`
- `scripts/validate_advisory_csv.mjs`
- `scripts/fetch_kaggle_advisory.mjs`
- `scripts/ingest_forecast_csv.mjs`
- `scripts/notify_ops.mjs`
- `scripts/lib/advisory-tier.mjs`
- `scripts/lib/class-resolver.mjs`
- `scripts/lib/token-resolver.mjs`

#### Step 3: Local Pipeline & Test Verification
1. Run local advisory ingestion dry-run against the Kaggle dataset:
   `node scripts/process_advisory_ingest.mjs /tmp/kaggle_latest_advisories.csv --allow-stale`
2. Execute node test suite:
   `node --test __tests__/advisoryPipeline.test.js`
3. Verify `compile_applet` and `lint_applet` pass cleanly.
