# TRD: HazardNet v3.0 — Technical Requirements & Testing Blueprint
Generated: 2026-09-17 · Version 1.0 · Companion: `prd_hazardnet_v3_20260917.md`

This TRD applies a **testing-first methodology**: validation strategies, BDD scenarios, and infrastructure requirements are defined *before* implementation, per the TRD-architect-testing-blueprint (three-tier hierarchy: Unit → Integration → E2E; BDD scenario generation; root-cause & solution verification; infrastructure gap analysis; strict scope boundaries).

---

## 1. Scope Boundaries

**In scope (v3.0):** leakage-safe evaluation pipeline; BD-anchored severity; calibration + OOD + conformal + physics fusion; alert engine with HITL; public web surface (landing, map, archive, /validation, status); claims registry; security P0; soft launch (advisory).
**Out of scope:** new hazard classes; new dataset downloads; auto-publishing; SAR ingestion; mobile apps; auto-scaling production Kubernetes.
**Timeless rule:** any requirement added later must arrive with its test scenarios, or it is not a requirement.

---

## 2. Root-Cause & Solution Verification

Every architectural choice in v3.0 is a response to a *measured or observed* failure — each must pass its verification test before build:

| Root cause (evidence) | Solution | Verification (test ID) |
|---|---|---|
| Random-fold leakage: event-KFold 0.9887 vs temporal 0.109 (uploaded CSVs) | Place-season grouped K-fold + embargo; rolling-origin chaining | INT-SPLIT-01/02, UNIT-SPLIT-01 |
| Unit-less severity | Anchored normalization (BD thresholds) | UNIT-SEV-01/02/03 |
| Uncalibrated confidence ("98.4% softmax") | Isotonic calibration on recent era | UNIT-CAL-01, INT-CAL-01 |
| Silent extrapolation failure | OOD guard (Mahalanobis + max-softmax) | INT-OOD-01/02 |
| Overconfident single labels | Conformal prediction sets (α=0.10, APS) | UNIT-CONF-01, INT-CONF-01 |
| Seasonal optical blindness | Physics tracks lead under low trust | INT-FUS-01/02 |
| Governance risk of auto-publish | HITL state machine | E2E-ALERT-01/02 |
| Credibility risk of unverifiable claims | Claims registry CI gate | INT-CLAIM-01 |
| Hindcast circularity (Amphan 2021 in training archive) | Out-of-fold-only validation rule | INT-HIND-01 |

---

## 3. Three-Tier Test Strategy

### Tier 1 — Unit (deterministic, <1s each, runs on every commit)

**UNIT-SPLIT-01** Split guards: `assert_disjoint_groups` and `assert_temporal_order` raise on constructed violating inputs; pass on valid splits.
**UNIT-SPLIT-02** Split manifest completeness: every generated fold has train/val/test CSVs with required columns (`event_id`, `hazard_idx`).
**UNIT-SEV-01** Monotonicity: for all 8 hazards, `to_severity` is non-decreasing over the full physical domain (deficit-space check for Tmin/SPEI).
**UNIT-SEV-02** Round-trip identity: `to_index(to_severity(x)) == x` at every anchor, all 8 hazards.
**UNIT-SEV-03** Tier ladder: watch < warning < severe; each tier severity present exactly in anchors; `tier()` boundaries correct at tier±ε.
**UNIT-CAL-01** Calibrator: on synthetic logits with known overconfidence, post-calibration ECE < raw ECE; per-class isotonic is monotone non-decreasing.
**UNIT-CONF-01** APS: perfect-confidence calibration set → singleton sets; α=0.10 quantile computed per finite-sample formula (ceil((n+1)(1−α))/n).
**UNIT-MET-01** VerificationMetrics: POD/FAR/CSI/FBias against hand-computed 2×2 tables (symmetric and degenerate cases: H=0, M=0); Brier and ECE against analytic values.
**UNIT-LOSS-01** HomoscedasticMTLLoss: log_vars update; equal-loss components → precisions converge toward 1.

### Tier 2 — Integration (Kaggle GPU + staging VPS)

**INT-SPLIT-01** Regenerate `grouped_kfold` + `rolling_origin` from master CSV; assert guards pass; manifest row counts == CSV row counts.
**INT-SPLIT-02** Leakage probe: train a tiny probe (2 epochs) on grouped folds vs legacy event folds; grouped test accuracy must be ≤ legacy (sanity: no inverted leakage signal).
**INT-SEV-BD-01** `apply_bd_thresholds` + `validate_bd_thresholds`: 57/57 pass in CI; failure of any proof blocks the training workflow run.
**INT-CAL-01** Fit `Calibrator` on the most recent rolling-origin validation year; report ECE before/after; acceptance: ECE_after < ECE_before, and calibration data contains zero training-fold event IDs (lineage check).
**INT-OOD-01** Fit `OODGuard` on training embeddings; acceptance: ≥95% of training embeddings are in-distribution (mahalanobis_ratio ≤ 1).
**INT-OOD-02** OOD behavior: feed (a) off-season tensors, (b) noise tensors, (c) brightness/climate-shifted tensors → `uncertain=True` and `cnn_trust ≤ 0.2` for the large majority; no SEVERE alert may be emitted for noise inputs.
**INT-CONF-01** Coverage check on rolling-origin test years: empirical coverage of conformal sets ≥ 85% (target 90% at α=0.10; tolerance for finite samples).
**INT-FUS-01** Physics fallback: with all physics inputs missing, fused == calibrated CNN gated by trust; with physics inputs extreme (e.g., Tmin=5°C), physics score dominates when trust is low.
**INT-FUS-02** Version coupling: API boot with mismatched model ckpt ↔ fusion_bundle ↔ thresholds → startup failure with diff report; matched set → clean boot.
**INT-CLAIM-01** Claims CI: a fixture site build containing an unregistered metric fails; registered metric passes.
**INT-HIND-01** Hindcast restriction: test asserts evaluation windows exclude training fold event IDs (out-of-fold rule; blocks Amphan-type circularity).
**INT-API-01** Contract tests for all endpoints in PRD §4.3 (happy + 403/409 paths).
**INT-STATE-01** Alert state machine: valid transitions pass; invalid (e.g., PUBLISHED→DRAFT) rejected; rejection reasons persisted.

### Tier 3 — E2E (staging, then production soft launch)

**E2E-ALERT-01 — Publish flow (BDD)**
```
Given a DRAFT alert for Sunamganj (Flood, tier=warning, cnn_trust=0.8)
When a reviewer with role=reviewer approves it
Then the alert is PUBLISHED with model_ver and fusion_ver stamped
And the public alert page shows tier meaning, rationale, official sources
And a subscription holder for Sunamganj receives an SMS/email within 5 minutes
```
**E2E-ALERT-02 — HITL enforcement (BDD)**
```
Given an analyst WITHOUT the reviewer role attempts POST /v1/alerts/{id}/review
When the request is executed
Then the API returns 403 REVIEW_ROLE_REQUIRED
And an audit event is written
And no public page changes
```
**E2E-UNC-01 — Uncertain rendering (BDD)**
```
Given an inference whose conformal prediction set has size > 1 or is_ood=true
When the alert page renders
Then it displays "conditions unusual — model confidence low" in the page language
And it does NOT display a single hazard name as fact
```
**E2E-WEB-01 — Landing under load (BDD)**
```
Given 2 active alerts and 1 watch
When a visitor on a simulated Bangladesh 3G profile opens /
Then LCP < 2.5s, total transfer < 500KB (excluding tiles)
And the status strip shows "2 active alerts · 1 watch · 61 normal"
```
**E2E-I18N-01** Every public route renders in bn and en with no untranslated tier strings; terminology matches reviewed glossary.
**E2E-SEO-01** sitemap.xml returns valid XML incl. alert permalinks; robots.txt consistent; structured-data validator passes on Organization/Dataset/FAQ blocks.
**E2E-DEGRADE-01** With the API down, the static cached bulletin page serves with a staleness banner.

---

## 4. BDD Scenario Catalog (generated from PRD requirements)

| Req | Scenario (Given/When/Then summary) | Tier |
|---|---|---|
| REQ-001 | Given legacy random folds, when grouped folds are generated, then no place-season group straddles train/test and embargo purge counts are logged | INT-SPLIT-01 |
| REQ-002 | Given BD anchors, when `validate_bd_thresholds` runs, then 57/57 proofs pass and failures block CI | INT-SEV-BD-01 |
| REQ-003 | Given all physics inputs missing, when fusion scores, then output equals trust-gated calibrated CNN | INT-FUS-01 |
| REQ-003 | Given OOD input, when fusion scores, then uncertain=true and no severe tier | INT-OOD-02 |
| REQ-004 | Given two reviewers open the same draft, when both approve, then the second receives a conflict warning and only one publish occurs | INT-STATE-01 + E2E |
| REQ-005 | Given no active alerts, when landing renders, then hero shows latest analysis with date+credit | E2E-WEB-01 variant |
| REQ-005 | Given data staler than 6h, when map renders, then freshness badge shows age and shifts color | E2E (manual checklist) |
| REQ-006 | Given an unregistered metric in site content, when CI runs, then build fails with the offending string | INT-CLAIM-01 |
| REQ-009 | Given a month boundary, when the verification job runs, then /validation shows updated POD/FAR per division | E2E (cron dry-run) |
| REQ-010 | Given a visitor submits feedback, when labeling job runs, then the record appears with district+timestamp and status=queued | INT |

---

## 5. Test Data & Fixtures

- **Synthetic tensors**: seeded RNG 15×10×64×64 fixtures (10 per hazard class) for unit tests — committed as `.npz`.
- **OOD fixtures**: off-season temporal shift, Gaussian noise, ±30% brightness/contrast shift of real chips (de-identified event IDs).
- **Contingency fixtures**: hand-computed 2×2 tables with known POD/FAR/CSI/FBias including degenerate rows.
- **Calibration fixture**: synthetic logits with controlled overconfidence (temperature 0.5) and labels — expected ECE bounds computed analytically.
- **Split fixtures**: mini master CSV (200 rows, 4 divisions × 5 years) with engineered leakage cases for guard tests.
- **Never in tests**: production alert data with real PII; reviewer credentials beyond staging fixtures.

---

## 6. Infrastructure Gap Analysis

| Need | Have | Gap | Action |
|---|---|---|---|
| Training compute | Kaggle T4 quota | None for grouped+rolling (chained fine-tune) | — |
| Split generation | master CSV + `hazardnet_splits.py` | `date`/`place` columns maybe absent | Derive (year from event_id; division dict) — TASK-001 |
| Calibration era | rolling-origin val years | Only after TASK-002 runs | Sequential dependency |
| Staging VPS | None | Provision 1 VPS (or reuse existing) | Phase 8 of deployment plan |
| Secrets management | None defined | env-injected secrets + `.env.example` | TASK-013 |
| CI test runner | GitHub Actions | Add ML-eval job (GPU via Kaggle API trigger) | TASK-008 pipeline |
| SMS delivery | None | BD aggregator account (SSL Wireless/Infobip) | Optional until USR-008 enabled |
| Monitoring | None | Uptime + Grafana + Sentry | Phase 8 |
| W&B | Optional | Falls back to file logging (already implemented) | None required |

**Blocking gaps (must close before Tier-2 INT tests):** split metadata derivation (TASK-001) and one completed rolling-origin run (TASK-002). All other gaps are Phase-8 operational, not test-blocking.

---

## 7. Performance & Security Test Requirements

- **Load**: 500 concurrent public readers → API p95 < 300ms, no 5xx; tile endpoints behind CDN cache.
- **Publish path stress**: 50 drafts → review → publish; no lost updates; audit log complete.
- **Security**: OWASP top-10 scan on staging (ZAP baseline); CSP eval; rate-limit probe (expect 429 beyond threshold); auth token rotation test.
- **Model DoS**: 1,000 rapid `/predict/run` requests from one token → throttled; queue depth alarms fire.

---

## 8. CI/CD Test Gates

```
PR  -> Tier-1 unit (all) + lint + artifact version lint
merge -> Tier-2 integration (Kaggle job for INT-SPLIT/SEV/CAL/OOD/CONF/FUS)
deploy to staging -> Tier-3 E2E suite (Playwright) + performance smoke
promote to prod -> manual gate: claims registry diff + gate decision recorded
nightly -> Tier-2 model verification harness (POD/FAR on recent bulletins)
```

---

## 9. Operational Verification Harness (runs nightly, independent of releases)

- Re-scores trailing 30 days; computes per-division POD/FAR/CSI at BD tiers; compares to published `/validation` numbers (drift > 10% → incident).
- Tracks conformal set-size mean, OOD trigger rate, trust PSI.
- Emits ground-truth comparison vs BMD/FFWC bulletins when the bulletin mirror is enabled.

---

## 10. Traceability Matrix

> **Status (2026-09-17, agent execution):** UNIT-SEV-01/02/03 implemented in
> `training/tests/test_severity_normalizer.py` (8 tests, green, with a
> regression pinning the deficit-space normalizer repair — see
> docs/RUNBOOK_LOG.md). INT-SEV-BD-01 implemented twice: as a pytest case in
> the same file and as `training/run_bd_proofs.py`, gated in CI via
> `.github/workflows/v3-ml-contracts.yml` (evidence:
> `results/bd_thresholds_validation.log`, 57/57). INT-CLAIM-01 implemented as
> `__tests__/claimsGate.test.js` (6 tests, green) + the CI step in `ci.yml`.
> Remaining tests in this blueprint are pending their tasks.

| PRD Req | Unit | Integration | E2E |
|---|---|---|---|
| REQ-001 | UNIT-SPLIT-01/02 | INT-SPLIT-01/02, INT-HIND-01 | — |
| REQ-002 | UNIT-SEV-01/02/03 | INT-SEV-BD-01 | — |
| REQ-003 | UNIT-CAL-01, UNIT-CONF-01 | INT-CAL-01, INT-OOD-01/02, INT-CONF-01, INT-FUS-01/02 | E2E-UNC-01 |
| REQ-004 | — | INT-STATE-01, INT-API-01 | E2E-ALERT-01/02 |
| REQ-005 | — | — | E2E-WEB-01, E2E-DEGRADE-01, E2E-I18N-01 |
| REQ-006 | — | INT-CLAIM-01 | — |
| REQ-007 | — | — | E2E-SEO-01 (in part) |
| REQ-008 | — | — | E2E-ALERT-01 (dispatch leg) |
| REQ-009 | — | — | E2E (cron dry-run) |
| REQ-010 | — | INT (feedback pipeline) | — |

---

## 11. Proofs & Formulas (test oracles)

- POD = H/(H+M); FAR = FA/(H+FA); CSI = H/(H+M+FA); FBias = (H+FA)/(H+M).
- Brier = mean((p−o)²); proper score.
- ECE = Σ_b (n_b/N)·|acc_b − conf_b| over equal-mass bins.
- APS guarantee: with q̂ = Quantile_{⌈(n+1)(1−α)⌉/n} of calibration nonconformity scores, P(Y ∈ C(x)) ≥ 1−α (finite-sample, distribution-free).
- Deficit-space monotonicity: for negative-direction indices (Tmin, SPEI), internal storage uses negated x; composition of monotone maps is monotone ⇒ severity non-decreasing by construction — asserted, not assumed, in UNIT-SEV-01.

---

## 12. Risks Specific to Testing

| Risk | Mitigation |
|---|---|
| Kaggle quota exhausts mid-evaluation | Chain fine-tuning (implemented); cache HDF5 reads; split INT-CAL/OOD to one GPU session |
| Synthetic fixtures diverge from real tensor stats | Fixture generation uses training-set normalization stats; re-generated on dataset version bump |
| E2E SMS leg flaky in staging | Mock provider in CI; real-provider smoke only pre-launch |
| Reviewer availability blocks E2E-ALERT-01 | Staging fixture reviewer account; scripted approval fallback for tests only |
