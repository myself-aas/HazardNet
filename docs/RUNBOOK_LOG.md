# Runbook Execution Log — HazardNet v3.0

Agent executing: Arena.ai Agent Mode on branch `arena/01a0adae-hazardnet`.
Runbook: "HazardNet v3.0 — Coding Agent Execution Runbook" (Part 0 doc-read →
Part 0.4 verification → bootstrap → gates). Per the runbook's own protocol:
where a command or assumption differs from repo reality, it is recorded here
rather than silently adapted; no acceptance gate is skipped.

---

## Part 0 — Document ingestion & reality check (2026-09-17)

Read in full: `docs/PRD.md` (411 lines), `docs/TRD.md` (211 lines),
`docs/HazardNet_Deployment_Plan_v3.md` (248 lines incl. Integration Status,
commit map, 5 unverified assumptions, v3.1 errata ×10, risk register),
`docs/TASKS.md` (TASK-001..015), plus structural inspection of both Python
modules.

### 0.4 discrepancies found (runbook rule: record, don't guess)

1. **Dataset artifacts are NOT in the repo — HARD BLOCKER for Phases 2–3.**
   `find` across the tree finds no `master_tensors.h5`, `dataset_config.json`,
   or master events CSV. The plan's unverified assumption #1 (`EXPERIMENTAL_DIR`
   = `/kaggle/input/datasets/ashifahmedshuvo/hazardnet-datasets/...`) is
   therefore unverifiable locally. Consequence: TASK-001 (split generation),
   TASK-002/002b (honest evaluation), TASK-004 (calibration refit) cannot run
   in this workspace. Pure-module proofs (TASK-003) run fine — done, see below.
   **Escalated to owner: the dataset must be uploaded to the repo (Git LFS or
   equivalent) or a runner-accessible store before Phase 2 can start.**

2. **Kaggle conflict.** The user's standing constraint (nothing runs on
   Kaggle; daily pipeline runs entirely on the GitHub runner) conflicts with
   runbook Part B (Kaggle evaluation sessions) and the plan's Kaggle dataset
   mount assumption. Resolution applied: all v3 work runs on GitHub-hosted
   runners only (see `.github/workflows/v3-ml-contracts.yml`); the Kaggle
   mount path stays ONLY as a documented default inside
   `TrainConfig.EXPERIMENTAL_DIR`, unused by any CI job. Part B evaluation
   sessions will need a non-Kaggle execution plan once the dataset blocker
   (item 1) is resolved.

3. **File placement.** The delivered v3 modules sat at the repo ROOT, not the
   `training/` + `inference/` layout the plan's commit map expects. `grep`
   found no external references to the old paths → moved safely:
   `hazardnet_scientific_pipeline.py` → `training/`,
   `hazardnet_bd_thresholds.py` → `training/`, the four v3 docs →
   `docs/{PRD,TRD,TASKS,HazardNet_Deployment_Plan_v3}.md`.

4. **"Missing" files are packaging differences, not missing functionality.**
   The plan's commit map lists `hazardnet_splits.py`, `inference/fusion.py`,
   `docs/INTEGRATION_NOTES.md`; none exist, but `hazardnet_scientific_pipeline.py`
   already embeds the split generators (EventGroupKFold L471,
   RollingOriginSplitter L524), Calibrator (isotonic, L572), OODGuard
   (max-softmax + Mahalanobis, L619), ConformalPredictor (APS α=0.10, L670)
   and BD physics tracks. Recorded; no refactor attempted until Phase 2/3
   needs it.

5. **Environment.** Sandbox pip needs `--break-system-packages`; the PyTorch
   CPU index is unreachable (plain PyPI works). The module additionally
   imports `seaborn` and `matplotlib` at module level — both added to
   `training/requirements.txt` (the plan's dependency list missed them).

---

## Part 0.4 → Bootstrap — STOP-CONDITION EVENT (2026-09-17)

**Runbook stop-condition fired: "any of the 57 validate_bd_thresholds()
proofs fails".** First run: **55/57**. Diagnosis (recorded before any fix):

- Failing proofs: `Cold Wave: normalizer builds (severity must be
  non-decreasing)` and `Drought: normalizer builds (severity must be
  non-decreasing)` — exactly the two deficit-direction hazards (Tmin, SPEI).
- Root cause: `SeverityNormalizer.__init__` computed flip detection
  (`xs[0] > xs[-1]`) **after** `sorted(cfg["anchors"])`. Sorted `xs` is always
  ascending, so `_flip` could never become true; for deficit hazards the
  sorted severity sequence is then descending and the assertion fires. The
  code comment even claims this "fixes the latent Drought-anchor bug of v2.0" —
  the fix was dead code. `SeverityNormalizer("Drought")` crashed at
  construction in the delivered module, on the GLOBAL config as well as the
  BD one — so the plan's Integration Status claim "57/57 smoke-tested" cannot
  have run against this exact file.
- Decision: repaired the flip detection to run on the config's natural
  (severity-ascending) order — minimal, behavior-preserving for all six
  increasing-index hazards, and pinned by `training/tests/test_severity_normalizer.py`
  (UNIT-SEV-01/02/03 + crash regression). If the owner prefers the original
  author's corrected module, this change is a clean revert target.

**Result after repair: 57/57 proofs pass** — evidence committed at
`results/bd_thresholds_validation.log`; CI gate
`.github/workflows/v3-ml-contracts.yml` re-runs the proofs on every PR
touching `training/**` (TASK-003 complete except the training-blocked
portion, which TASK-001 unblocks).

---

## Phase 1 — Claims freeze (TASK-008, 2026-09-17)

Built `scripts/check-claims.mjs` + `docs/CLAIMS.md` (registry with strategy
labels) + CI step in `ci.yml` (Code Quality & Build job) + INT-CLAIM-01
tests (`__tests__/claimsGate.test.js`, 6 tests).

First scan of the live site: **58 unregistered metric-shaped numbers**.
Triage and resolution:

- **Fabricated metrics removed (30 copy fixes across 9 files)**: 98.4%
  softmax readout + 18ms/0.74-RMS/246-256 telemetry strip
  (DataProcessingSkeleton), 42.8 ms / 0.034 MAE / 1.82% ECE cards
  (AnalyticsPage — replaced with the four verified cross-strategy numbers
  from the plan's Integration Status: 98.87 leaky event-kfold, 95.66 spatial
  LODO, 10.9 temporal, 18.85 spatio-temporal, per v3.1 errata #8), 94.2%
  confidence stamps (NationalOverview, RiskAnalytics,
  StructuredAdvisoryRenderer), 38.4 ms / 98.55% / 94.8% / ±0.03 / 0.91-Index
  telemetry (DistrictDetailPage), 82%/12%/42ms demo subtitles
  (CommandPalette), "TensorFlow Spatial Attention Model v4.8" sync-log line
  (AnalyticsPage — no such model exists; the real artifact is
  hazardnet_fp32.tflite), "HazardNet v2.4" watermark (useMapSnapshot — no
  such version), "Cache Hit (0ms)" (AdvisoryPanel), "+4.2%/day" trend
  (DistrictDetailPage — now computed from the actual trend data),
  "Latency: 38ms" static line (Dashboard — now renders the measured
  `processingTimeMs`), "100% Coverage" (NationalOverview → "Full national
  coverage"), 97%/+18%/94%/142,500 ha KPI chips (RiskAnalytics → qualitative
  labels).
- **Legitimate values registered** (20 entries): the four cross-strategy
  evaluation numbers, dataset facts (2931 events, 64 districts, 8 classes),
  57-proof count, UI severity/vulnerability/risk band cutoffs, severity-scale
  legend bounds, three agronomic/chemical technical constants
  (80% grain-maturity rule, 33% available chlorine, Mancozeb 75% WP).
- Scanner hygiene: excludes `__tests__`/`*.test.*` from the corpus; JSX-text
  extraction drops code caught between `=>` and `<` (useState defaults,
  arrays) and decodes HTML entities so `&lt;0.50` legends are scanned;
  helplines/dates/counts produce no false positives (test-pinned).
- **Gate status: GREEN** — `node scripts/check-claims.mjs` passes; jest
  46 suites / 431 tests; tsc clean; production build clean.

**Non-gate observations for the owner (positioning, not numbers):**
PrintPreviewModal renders print handouts styled as "GOVERNMENT OF THE
PEOPLE'S REPUBLIC OF BANGLADESH / SOD 2019 OPERATIONAL DISPATCH" with an
NDMA masthead. The claims gate does not cover official-impersonation
wording; whether that styling is appropriate before any authority agreement
(PRD TASK-009 authority-boundary banner work) is an owner decision.

**Deployment gate: NOT YET DECIDED.** Pre-registered gate (rolling-origin
macro-F1 ≥ 0.5 AND severe-tier POD ≥ 0.7 → ALERTING_ELIGIBLE, else
ADVISORY_BETA_ONLY) requires TASK-002b, which is blocked by the dataset
artifact gap (discrepancy #1). Public wording remains advisory/experimental.

---

## Version stamps

`ARTIFACTS.yaml` created (model_ver hazardnet-cnn-2.0.0 / fusion_ver
fusion-1.0.0 / thresholds_ver bd-1.0.0 / dataset_ver events-1.0 / git_sha
868e943 = v3.0 baseline import). The normalizer repair does NOT bump
model_ver: no trained weights exist for the affected path (the Drought/Cold
Wave normalizers crashed before any training could have consumed them), and
severity anchors are unchanged. Thresholds stay bd-1.0.0 as delivered.

## Open blockers (owner decisions needed)

1. Dataset artifacts for Phases 2–3 (upload path — Git LFS vs external store).
2. Non-Kaggle execution plan for Part B evaluation sessions (6 GPU-h × 2)
   given the standing no-Kaggle constraint.
3. PrintPreviewModal official-government styling (keep vs tone down pending
   TASK-009 authority work).
