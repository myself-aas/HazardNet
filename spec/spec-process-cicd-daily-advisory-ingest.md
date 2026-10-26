---
title: CI/CD Workflow Specification - Daily Advisory Ingestion
version: 1.0
date_created: 2026-10-25
last_updated: 2026-10-25
owner: HazardNet (Ashif Ahmed Shuvo)
tags: [process, cicd, github-actions, automation, kaggle, firebase, secrets, data-pipeline]
---

## Workflow Overview

**Purpose**: Daily ingest of the Kaggle-published advisory CSV → validation → Firestore forecast store + committed snapshot artifacts (forecast, alert, freshness) → optional production redeploy.
**Trigger Events**: cron `30 5 * * *` (05:30 UTC ≈ 11:30 BDT, after the Kaggle notebook's daily run) · `workflow_dispatch` with inputs `advisory_csv_path` (override), `allow_stale` (rehearsal bypass).
**Target Environments**: Firestore production store + committed artifacts consumed by the deployed frontend.
**Workflow file**: `.github/workflows/daily_advisory_ingest.yml`.

## Execution Flow Diagram

```mermaid
graph TD
    A[Trigger: cron or dispatch] --> B[Checkout + Node 20 + Python 3.11]
    B --> C[Fetch advisory CSV from Kaggle]
    C --> D{CSV newer + in 36h gate?}
    D -->|No (schedule)| E[FAIL: feed did not run]
    D -->|No (dispatch)| E2[Neutral stop / rehearsal]
    D -->|Yes| F[Validate CSV & ingest]
    F --> G[Firestore write -- conditional on valid SA]
    F --> H[Rebuild snapshots: forecast → alert → freshness]
    H --> I[Tier 0/1 pipeline tests]
    I --> J{Artifacts changed?}
    J -->|Yes| K[Commit + push + Vercel redeploy]
    J -->|No| L[Clean stop]
    B -.->|always| M[Ops monitoring + Slack alert]
    style A fill:#e1f5fe
    style K fill:#e8f5e8
    style E fill:#ffebee
```

## Jobs & Dependencies

| Job Name | Purpose | Dependencies | Execution Context |
|----------|---------|--------------|-------------------|
| ingest | end-to-end fetch → validate → store → snapshots → commit → deploy trigger | none (single job) | ubuntu-latest, 25 min ceiling |

## Requirements Matrix

### Functional Requirements
| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|-------------------|
| REQ-001 | Advisory CSV fetched from the Kaggle dataset (public download; CLI fallback when kernel-published) | High | fetch step exits 0 with a fresh-enough CSV |
| REQ-002 | Unchanged CSV is not laundered as a fresh ingest | High | fetch exits 2; scheduled run fails the feed visibly |
| REQ-003 | CSV row validation before any store write | High | `scripts/validate_advisory_csv.mjs` / process_advisory_ingest strict parse |
| REQ-004 | Firestore write only with valid credentials | High | Pre-flight check; else static-snapshot-only path with a warning |
| REQ-005 | Snapshots rebuilt in order — forecast → alert → freshness — before the commit step | High | freshness `--check` agreement in freshnessArtifact tests |
| REQ-006 | No-change runs commit nothing | Medium | `git diff --staged` empty ⇒ `committed=false` |
| REQ-007 | Tier 0/1 pipeline validation before commit | High | `node --test __tests__/advisoryPipeline.test.js` green |

### Security Requirements
| ID | Requirement | Implementation Constraint |
|----|-------------|---------------------------|
| SEC-001 | Secrets flow only via step-level `env:` | Never interpolated inside bash strings; audit by `check-workflows.mjs` |
| SEC-002 | `contents: write` is the only elevated permission | No `packages`/`actions`/etc. |
| SEC-003 | Kaggle credentials = dedicated API token pair | From kaggle.com account settings, not the Google login |
| SEC-004 | Service account = dedicated CI identity | `github-action-1336394594@hazardnet-aas48424.iam.gserviceaccount.com`; never the Owner-tagged personal SA |
| SEC-005 | Cancel-in-progress disabled | An aborted commit window is worse than a concurrent delay |

### Performance Requirements
| ID | Metric | Target | Measurement Method |
|----|--------|--------|-------------------|
| PERF-001 | fetch wait budget | bounded inside 25 min | `--wait-minutes` polling |
| PERF-002 | ingest duration | p95 < 3 min | timestamps in step log |

## Input/Output Contracts

### Inputs

```yaml
# Dispatch inputs
advisory_csv_path: string  # optional CSV override (path or URL)
allow_stale: boolean       # bypass the >36h staleness guard for rehearsals

# Environment Variables (from repository secrets)
KAGGLE_USERNAME: secret                        # Kaggle API identity
KAGGLE_KEY: secret                             # Kaggle API token
FIREBASE_SERVICE_ACCOUNT: secret               # firestore pre-flight (JSON string form)
FIREBASE_SERVICE_ACCOUNT_JSON: secret          # same SA, full JSON for the write path
FIREBASE_PROJECT_ID: secret                    # project bootstrap (hazardnet-aas48424)
VERCEL_TOKEN / VERCEL_ORG_ID / VERCEL_PROJECT_ID: secret   # prod redeploy trigger
SLACK_WEBHOOK_URL: secret                      # ops monitoring alert channel
GITHUB_TOKEN: builtin                          # artifact commit/push
```

### Outputs

```yaml
# Step outputs
commit-artifacts.committed: bool  # gates the Vercel redeploy step

# Committed artifacts (public data the frontend ships)
backend/data/forecasts/manifest.json        # ingest manifest (row_count, sha256, prediction_date)
frontend/public/data/forecasts-latest.json  # v2 snapshot, 64×2 horizons
frontend/public/data/alerts-latest.json     # hazardnet-alerts/v1 (published set + counts)
frontend/public/data/freshness.json         # hazardnet-freshness/v1 ledger over the inputs
```

### Secrets & Variables

| Type | Name | Purpose | Scope | Value source (owner action) |
|------|------|---------|-------|------------------------------|
| Secret | KAGGLE_USERNAME | dataset/kernel API auth | Workflow | kaggle.com → Account → API |
| Secret | KAGGLE_KEY | dataset/kernel API auth | Workflow | same page, "Create New API Token" |
| Secret | FIREBASE_SERVICE_ACCOUNT_JSON | Firestore write identity (full JSON) | Repo | JSON key of `github-action-1336394594@hazardnet-aas48424.iam.gserviceaccount.com` (Key ID `bf78ddb9…` or rotation successor) |
| Secret | FIREBASE_SERVICE_ACCOUNT | pre-flight form of the same identity | Repo | same JSON (string form expected by `validateServiceAccountEnv`) |
| Secret | FIREBASE_PROJECT_ID | project bootstrap | Repo | `hazardnet-aas48424` |
| Secret | SLACK_WEBHOOK_URL | ops failure alerting | Workflow | Slack app → Incoming Webhooks — **not yet added to this repo's secrets** |
| Secret | VERCEL_TOKEN | prod deploy trigger | Env + Repo | Vercel → Account → Tokens |
| Secret | VERCEL_ORG_ID | deploy targeting | Env + Repo | `.vercel/project.json` |
| Secret | VERCEL_PROJECT_ID | deploy targeting | Env + Repo | `.vercel/project.json` |

## Execution Constraints

### Runtime Constraints
- **Timeout**: 25 min job ceiling
- **Concurrency**: serialized per ref (`cancel-in-progress: false`)

### Environmental Constraints
- **Runner**: ubuntu-latest; Node 20; Python 3.11; Kaggle CLI from pip
- **Network**: kaggle.com API, `*.googleapis.com` (Firestore), Vercel API, Slack webhook (optional)
- **Permissions**: `contents: write` (artifact commit)

## Error Handling Strategy

| Error Type | Response | Recovery Action |
|------------|----------|-----------------|
| Kaggle schedule missed (CSV unchanged) | scheduled run FAILS loudly; dispatch stops neutrally | check notebook's last run; rerun when the feed moves |
| CSV past 36h gate | exit 2 STALE_DATA; no commit | inspect Kaggle freshness; dispatch with `allow_stale` only for rehearsal |
| Firestore credentials invalid | warning; static-snapshot-only path | rotate the SA JSON into the two FIREBASE_SERVICE_ACCOUNT* secrets |
| Snapshot/test failure post-ingest | job stops before commit | nothing published is broken-by-accident |

## Quality Gates

| Gate | Criteria | Bypass Conditions |
|------|----------|-------------------|
| Feed freshness | newer than manifest AND ≤ 36h old | `allow_stale` dispatch input (rehearsal only) |
| Pipeline tests | advisoryPipeline (Tier 0/1) green | none |
| Readiness | fetch → validate order enforced by step sequence | none |

## Monitoring & Observability

- **Success Rate**: daily green is the design goal; the 36h guard makes a stale feed a failure, not a silent publish
- **Execution Time**: < 25 min hard ceiling
- **Alerting**: ops monitoring step dispatches Slack on failure (gated on `SLACK_WEBHOOK_URL` presence)

## Integration Points

| System | Integration Type | Data Exchange | SLA Requirements |
|--------|------------------|---------------|------------------|
| Kaggle Dataset API | HTTP pull (Basic auth) | advisory CSV | dataset refreshes after the daily notebook run |
| Firestore | Admin SDK writes | forecast rows | write skipped fail-soft when credentials missing |
| Vercel | Deploy trigger | production redeploy | only when artifacts changed |
| Slack | Webhook POST | ops alert | optional (fail-soft when unset) |

### Dependent Workflows
| Workflow | Relationship | Trigger Mechanism |
|----------|--------------|-------------------|
| Firebase-Store-Verify | downstream verifier of the store this writes | manual dispatch |
| site-health | probes the artifacts this publishes | cron |

## Compliance & Governance

- **Audit**: every artifact is committed by github-actions[bot] with the prediction date; the manifest carries the CSV sha256
- **Secret Management**: SA key rotation = new key → update FIREBASE_* secrets → delete old Key ID; audited by `secret-rotation-audit.yml`

## Edge Cases & Exceptions

| Scenario | Expected Behavior | Validation Method |
|----------|-------------------|-------------------|
| `github-action-1336394594@…` SA lacks Firestore write role | pre-flight warns; static path only — no crash | grant `roles/datastore.user` on the project, re-dispatch |
| 401/403 from Kaggle | fatal, no retry burn | integration suite pins the exit-1 + message contract |
| Empty/header-only CSV | exit 1 "no data rows" | integration suite |
| Scheduling drift (Kaggle tardy) | bounded wait, then unchanged-path exit 2 | deterministic in suite via stub server |

## Validation Criteria

- **VLD-001**: green scheduled run ⇒ manifest `prediction_date` advanced and snapshots agree (`freshnessArtifact.test.js --check` parity)
- **VLD-002**: unchanged feed ⇒ no commit, scheduled failure surfacing the miss

## Change Management

1. Update this specification when the pipeline shape changes (secrets consumed, ordering, gates).
2. Any new `secrets.X` reference must be mirrored in `verify-secrets.yml`'s expected set (its static audit fails otherwise) and in `docs/codebase/INTEGRATIONS.md`.

### Version History
| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-10-25 | Initial specification | HazardNet |

## Related Specifications

- `spec-process-cicd-firebase-store-verify.md` (verifier of this workflow's store writes)
```