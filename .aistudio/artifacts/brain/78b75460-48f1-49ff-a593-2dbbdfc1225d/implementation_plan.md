# HazardNet Daily Advisory Ingestion Pipeline Remediation Plan

## Aesthetic Direction
- **Domain**: Meteorological Hazard Intelligence & Automated Telemetry Operations
- **Persona**: High-Reliability Operational Meteorology Control Plane (Bangladesh Meteorological Department / Emergency Operations Center standard)
- **Brand Inspirations**: ECMWF Copernicus Emergency Management Service, NOAA Storm Prediction Center, Apple Weather Severe Advisory System

## Color Palette
| Role | Hex | Usage |
|---|---|---|
| Background Primary | `#0A0F1A` | Deep slate-navy operational canvas |
| Background Elevated | `#111827` | Telemetry status cards and pipeline inspection panels |
| Text Primary | `#F8FAFC` | High-contrast primary metrics and station designations |
| Text Secondary | `#94A3B8` | Timestamp metadata, provenance hashes, and tier descriptions |
| Accent Primary | `#38BDF8` | Active atmospheric stream indicators and primary controls |
| Accent Secondary | `#818CF8` | Ensemble model calibration and AI synthesis badges |
| Semantic Success | `#10B981` | Verified advisory ingestion (`ADVISORY_FRESH`) |
| Semantic Warning | `#F59E0B` | Degraded persistence fallback or stale telemetry (`ADVISORY_STALE`) |
| Semantic Error | `#EF4444` | Severe cyclone/kalbaishakhi alert tiers and schema validation halts |

## Typography
| Role | Font Family | Weight | Size / Line-Height | Usage |
|---|---|---|---|---|
| Display | Inter / Plus Jakarta Sans | 700 | 2.25rem / 1.15 | Command center headers and regional hazard indices |
| Heading | Inter | 600 | 1.25rem / 1.3 | Station groups, pipeline stage headers, and alert summaries |
| Body | Inter | 400–500 | 0.9375rem / 1.5 | Advisory narratives, operational runbooks, and alert details |
| Monospace | JetBrains Mono | 500 | 0.8125rem / 1.4 | SHA-256 dataset digests, station coordinates, and UTC timestamps |

## Layout & Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                 DAILY ADVISORY INGESTION PIPELINE FLOW                    │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────┐      ┌───────────────────────────────────────┐  │
│  │  1. Kaggle Advisory  │      │  2. Schema & Cryptographic Validation │  │
│  │     Pull Stage       │─────▶│     - Required Columns & Row Bounds   │  │
│  │  - Freshness Check   │      │     - Finite Numeric Range Guards     │  │
│  └──────────────────────┘      └───────────────────┬───────────────────┘  │
│                                                    │                      │
│                                                    ▼                      │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  3. Deterministic Snapshot & Freshness Artifact Materialization     │  │
│  │     - Compute Advisory Tier Stamp & SHA-256 Provenance Digest       │  │
│  │     - Write Static JSON Snapshots (Frontend & Backend Stores)       │  │
│  │     - Emit Operational Rehearsal Summary                            │  │
│  └─────────────────────────────────┬───────────────────────────────────┘  │
│                                    │                                      │
│                                    ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  4. Pre-Flight Credential Gate & Dual-Variable Resolution           │  │
│  │     - Resolve FIREBASE_SERVICE_ACCOUNT_JSON or                      │  │
│  │       FIREBASE_SERVICE_ACCOUNT                                      │  │
│  │     - Verify JSON Structure (type, project_id, private_key, email)  │  │
│  └───────────────┬─────────────────────────────────┬───────────────────┘  │
│                  │ Valid Service Account           │ Missing / Malformed  │
│                  ▼                                 ▼                      │
│  ┌───────────────────────────────┐ ┌───────────────────────────────────┐  │
│  │  5A. Firestore Batch Ingest   │ │  5B. Graceful Degradation Path    │  │
│  │      - Upsert Station Rows    │ │      - Emit Structured Warning    │  │
│  │      - Record Sync Metadata   │ │      - Preserve Exit Code 0       │  │
│  │      - Catch Transient Errors │ │      - Proceed to Static Commit   │  │
│  └───────────────┬───────────────┘ └───────────────┬───────────────────┘  │
│                  └────────────────┬────────────────┘                      │
│                                   ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  6. Pipeline Verification, Static Snapshot Commit & Deployment      │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
```

## Core Functional Flows

### Step 1: Dual Environment Variable Credential Resolution
1. **Unified Backend Credential Lookup**:
   - Update the Firebase Admin initialization routine in the persistence layer to resolve service account JSON from `FIREBASE_SERVICE_ACCOUNT_JSON` first, falling back seamlessly to `FIREBASE_SERVICE_ACCOUNT`.
   - Support both raw JSON strings and Base64-encoded JSON payloads so CI secrets work regardless of encoding format.
   - Extract `project_id` directly from the parsed service account credential when `FIREBASE_PROJECT_ID` is not explicitly provided, eliminating project ID drift.
2. **Workflow Environment Mapping**:
   - Export both `FIREBASE_SERVICE_ACCOUNT` and `FIREBASE_SERVICE_ACCOUNT_JSON` in the GitHub Actions ingestion step so legacy and current CLI scripts receive the exact variable they expect.

### Step 2: Pre-Flight JSON Service Account Validation Gate
1. **Structural Secret Verification**:
   - Replace the naive non-empty shell string check (`-n "$FIREBASE_PROJECT_ID"`) in the workflow with a deterministic Node.js one-line pre-flight validator.
   - Verify that the resolved credential parses as a valid JSON object containing `type === "service_account"`, a non-empty `project_id`, `client_email`, and `private_key` before enabling the `--ingest-firestore` flag.
2. **Prevent Unintended Application Default Credential (ADC) Crashes**:
   - Only enable `--ingest-firestore` when a verified service account JSON payload or an explicit `GOOGLE_APPLICATION_CREDENTIALS` file path is present on the runner.
   - Log a clear, non-sensitive diagnostic notice indicating whether Firestore synchronization is enabled or skipped due to unconfigured credentials.

### Step 3: Non-Blocking Graceful Degradation for Firestore Persistence
1. **Decouple Local Snapshot Generation from Remote Database Writes**:
   - Execute CSV schema validation, SHA-256 hash calculation, advisory tier stamping, and local JSON snapshot generation (`latest_forecasts.json` and `forecast_freshness.json`) prior to attempting any network calls to Firestore.
2. **Fault-Tolerant Firestore Ingestion Wrapper**:
   - Wrap the Firestore batch persistence stage in a structured try/catch boundary with configurable strictness (`FIRESTORE_INGEST_STRICT=true` optional override, defaulting to graceful degradation in CI).
   - If Firestore authentication or network persistence fails, emit a structured operational warning (`::warning::Firestore ingestion skipped/degraded`) while returning exit code `0` once local snapshots and freshness artifacts are verified on disk.
   - Ensure downstream workflow steps (Pipeline Validation Tests, Git snapshot commit, and Vercel Production Deployment) proceed uninterrupted.

### Step 4: Pipeline Script Parity & Automated Regression Suite
1. **Synchronize CLI Ingestion Modules**:
   - Ensure the standalone CSV ingestion script and the orchestrator script share a single, deterministic CSV parser and unified `--ingest-firestore` handling.
2. **Automated End-to-End Ingestion Tests**:
   - Add unit and integration tests covering:
     - Credential resolution with `FIREBASE_SERVICE_ACCOUNT_JSON` only, `FIREBASE_SERVICE_ACCOUNT` only, Base64-encoded JSON, and malformed JSON.
     - Pre-flight flag evaluation when only `FIREBASE_PROJECT_ID` is set without a service account key.
     - Graceful degradation when `--ingest-firestore` encounters unreachable or invalid credentials, verifying that local forecast and freshness JSON snapshots are still written accurately and exit code `0` is preserved.

## Key Technical Decisions
- **Dual-Key & Base64 Credential Parsing**: Accepting both `FIREBASE_SERVICE_ACCOUNT_JSON` and `FIREBASE_SERVICE_ACCOUNT` (raw or Base64) eliminates the exact failure mode encountered in job `121156995113` without requiring manual GitHub repository secret renaming.
- **Snapshot-First Execution Order**: Materializing static forecast snapshots before remote Firestore writes guarantees that git-tracked fallback artifacts and Vercel static deployments remain fresh even during external database outages or secret rotation windows.
- **Strict Schema Validation vs. Soft Remote Sync**: CSV schema corruption or missing meteorological columns will still fail fast (exit code `1`) to prevent bad data from entering the repository, whereas remote Firestore credential/network errors degrade gracefully with an operational warning.

## Verification Criteria
- Running the advisory ingestion pipeline with a valid CSV and `FIREBASE_PROJECT_ID` set—but without `FIREBASE_SERVICE_ACCOUNT_JSON`—completes with exit code `0`, logs a clear pre-flight skip notice, and updates both forecast snapshot artifacts.
- Running the persistence initializer with either `FIREBASE_SERVICE_ACCOUNT` or `FIREBASE_SERVICE_ACCOUNT_JSON` accurately authenticates the service account credential without falling back to nonexistent runner ADC credentials.
- Running the ingestion pipeline with `--ingest-firestore` against a simulated Firestore failure logs a structured warning, preserves the updated local JSON snapshots, and exits with code `0`.
- All phase and pipeline test suites pass with zero regressions.
