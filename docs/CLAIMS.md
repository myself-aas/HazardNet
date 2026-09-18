# HazardNet Claims Registry (PRD REQ-006 / TASK-008)

**Rule (PRD §3.3):** a number may appear on the public site only if its value
is registered below with an evaluation-strategy label. `scripts/check-claims.mjs`
enforces this in CI: an unregistered metric in public copy fails the build
(TRD INT-CLAIM-01). Numbers must never be invented, rounded favorably, or
borrowed from a different evaluation strategy than the label states.

Gate status (**not yet decided** — TASK-002 evaluation runs pending):

> Deployment gate (pre-registered): rolling-origin macro-F1 ≥ 0.5 AND POD ≥ 0.7
> (severe tier) → `ALERTING_ELIGIBLE`; below → `ADVISORY_BETA_ONLY`
> ("experimental / decision-support" wording; alerting disabled).
> Until the gate decision is recorded here, all public wording is advisory.

## Registered claims

<!-- check-claims.mjs parses this table. `value` = the numeric token exactly as
     it renders in site copy (percent values without the % sign).
     scope: model-eval | dataset | ui | ops -->

| value | scope | label | strategy | date | source |
|---|---|---|---|---|---|
| 98.87 | model-eval | Event-based 5-fold CV accuracy — LEAKY BASELINE, shown only labeled as leakage-inflated | event_kfold (random splits; retained as labeled legacy per PRD REQ-001) | 2026-09-17 | docs/HazardNet_Deployment_Plan_v3.md §Integration Status (verified CSVs) |
| 95.66 | model-eval | Spatial leave-one-district-out accuracy | spatial_lodo | 2026-09-17 | docs/HazardNet_Deployment_Plan_v3.md §Integration Status (verified CSVs) |
| 10.9 | model-eval | Temporal (forward-time) skill — near chance; the reason the v3 retraining program exists | rolling/temporal evaluation | 2026-09-17 | docs/HazardNet_Deployment_Plan_v3.md §Integration Status (verified CSVs) |
| 18.85 | model-eval | Spatio-temporal skill | spatio-temporal evaluation | 2026-09-17 | docs/HazardNet_Deployment_Plan_v3.md §Integration Status (verified CSVs) |
| 2931 | dataset | Documented historical hazard events in the training archive | dataset events-1.0 (2000–2026) | 2026-09-17 | assets/docs/MODEL_CARD.md |
| 64 | dataset | Districts covered (BBS boundaries) | dataset events-1.0 | 2026-09-17 | assets/docs/MODEL_CARD.md |
| 8 | dataset | Hazard classes modeled | model hazardnet-cnn-2.0.0 | 2026-09-17 | assets/docs/MODEL_CARD.md |
| 57 | ops | BD threshold proof obligations passing in CI | thresholds bd-1.0.0 (INT-SEV-BD-01) | 2026-09-17 | results/bd_thresholds_validation.log |
| 34 | ui | Severity-band cutoff (low/moderate boundary) — product definition, not an evaluation claim | UI severity bands | 2026-09-17 | frontend/src/components/ForecastDashboard.tsx |
| 66 | ui | Severity-band cutoff (moderate band upper edge) — product definition | UI severity bands | 2026-09-17 | frontend/src/components/ForecastDashboard.tsx |
| 67 | ui | Severity-band cutoff (moderate/high boundary) — product definition | UI severity bands | 2026-09-17 | frontend/src/components/ForecastDashboard.tsx |
| 33 | ui | Vulnerability-band cutoff (low/moderate boundary) — product definition | UI vulnerability bands | 2026-09-17 | frontend/src/pages/DistrictDetailPage.tsx |
| 100 | ui | Band upper bound ("67-100%") and zoom-control label ("100%") — product definition | UI bands & zoom control | 2026-09-17 | frontend/src/pages/DistrictDetailPage.tsx, PrintPreviewModal.tsx |
| 50 | ui | Map-snapshot risk band cutoff (moderate band lower edge) — product definition | UI risk bands (map snapshot) | 2026-09-17 | frontend/src/hooks/useMapSnapshot.ts |
| 79 | ui | Map-snapshot risk band cutoff (moderate band upper edge) — product definition | UI risk bands (map snapshot) | 2026-09-17 | frontend/src/hooks/useMapSnapshot.ts |
| 80 | ui | Map-snapshot risk band cutoff (high band lower edge) — product definition | UI risk bands (map snapshot) | 2026-09-17 | frontend/src/hooks/useMapSnapshot.ts |
| 0.00 | ui | Severity-scale lower bound (legend "0.00 (Low)") — product definition | UI severity scale | 2026-09-17 | frontend/src/components/PredictionPanel.tsx |
| 0.50 | ui | Severity-scale midpoint (legends "0.50 (Mod)", "<0.50") — product definition | UI severity scale | 2026-09-17 | frontend/src/components/PredictionPanel.tsx, BangladeshSvgMap.tsx |
| 0.75 | ui | Drought/Fire legend cutoff (">0.75") — product definition | UI severity scale | 2026-09-17 | frontend/src/components/BangladeshSvgMap.tsx |
| 80 | technical | Grain maturity rule for flood-time harvest decisions (agronomic standard) | agronomy | 2026-09-17 | frontend/src/data/sectorAdvisoriesData.ts |
| 33 | technical | Available chlorine in bleaching powder (chemical specification) | disinfection spec | 2026-09-17 | frontend/src/data/sectorAdvisoriesData.ts |
| 75 | technical | Mancozeb 75% WP fungicide formulation (product specification) | agrochemical spec | 2026-09-17 | frontend/src/data/sectorAdvisoriesData.ts |

## Changelog

- 2026-09-17 — Registry created (TASK-008). Seeded with the four verified
  cross-strategy evaluation numbers, dataset facts, the 57-proof count, and
  the UI severity-band cutoffs. Unregistered fabricated metrics were removed
  from public copy in the same change (98.4% softmax readout, 42.8 ms
  latency, 0.034 MAE, 1.82% ECE, demo subtitles) — see RUNBOOK_LOG.md.
