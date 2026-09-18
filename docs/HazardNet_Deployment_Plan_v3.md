# HazardNet Deployment Plan v3.0
## Integrated Roadmap: Leakage-Safe Model, Bangladesh-Calibrated Thresholds, Fusion Inference, Institutional-Grade Web Presence

**Target repo (destination, NOT verified source):** `github.com/myself-aas/HazardNet`, branch `arena/01a0adae-hazardnet`. This plan was NOT built from repo contents — see "Integration Status" below.
**Dataset:** 2,931 documented hazard events, Bangladesh, 2000–2026 (no new downloads required)
**Companion code modules (new files to commit, delivered this engagement):**
- `hazardnet_scientific_pipeline.py` — anchored-severity training pipeline v2.0 (direction-aware normalizer, 6 strategies, tier verification, deployment gate)
- `hazardnet_bd_thresholds.py` — Bangladesh-calibrated severity thresholds + proof suite
- `hazardnet_splits.py` — leakage-safe split generators (grouped K-fold, rolling-origin)
- `hazardnet_fusion.py` — CNN+physics fusion scorer with OOD guard, isotonic calibration, conformal sets
- `INTEGRATION_NOTES.md` — interpretation contract & wiring guide

---

## 0. Executive Summary — where we actually are

| Layer | Status | Blocking issue |
|---|---|---|
| Model (spatial skill) | ✅ 0.9566 LODO | — |
| Model (temporal skill) | 🔴 **0.109 = chance** | Memorizes place-season fingerprints; the only fix that matters is honest evaluation + recency training |
| Severity scale | ✅ Re-anchored | Now physically interpretable (BMD/FFWC/EFFIS/WMO classes), BD-calibrated |
| Website | 🔴 Demo, not product | No provenance, leaky metric on display, console-as-landing-page |
| Deployment eligibility | 🔴 **NO-GO for public alerting; GO for advisory beta** | Gate: rolling-origin macro-F1 ≥ 0.5 AND POD ≥ 0.7 (severe tier) |

---

## Integration Status — what is verified vs. assumed (read before Phase 1)

| Item | Provenance | Status |
|---|---|---|
| Training pipeline code (model, dataset, loss, 4 strategies) | Uploaded notebook (`hazardnet-experimental-training-pipeline`) | ✅ Verified line-by-line; refactored into `hazardnet_scientific_pipeline.py` |
| Evaluation results (0.9887 / 0.9566 / 0.109 / 0.1885) | Uploaded CSVs | ✅ Verified |
| README-level facts (Kaggle-vs-Actions, horizon mismatch, placeholder URL) | One-time public fetch of the repo's default view | ⚠️ Single snapshot; re-verify before citing in the paper |
| Repo directory structure, branch contents, inference code, requirements, CI | — | ❌ Never inspected. The assistant has no reliable repo access; do NOT assume any plan step has been validated against repo files |
| All new modules (splits, BD thresholds, fusion, this plan) | Generated this session | ✅ Delivered as standalone files; syntax-validated; scientific core smoke-tested (57/57 BD proofs; sandbox lacks torch/tqdm so import-level tests must run in Kaggle) |

**Commit map — where each new file goes:**
```
repo-root/
  training/hazardnet_scientific_pipeline.py   # v2.0 pipeline (replaces notebook cell body)
  training/hazardnet_splits.py                # split generators (CLI)
  training/hazardnet_bd_thresholds.py         # BD thresholds + proofs
  inference/hazardnet_fusion.py               # fusion scorer + OOD + conformal
  docs/INTEGRATION_NOTES.md                   # wiring guide
  docs/HazardNet_Deployment_Plan_v3.md        # this plan
```
**Notebook diff (only hand-edit required):** paste the `STRATEGY_MAP` patch from `hazardnet_splits.py`, set `STRATEGY`, and (Phase 4) the two `hbd.apply_bd_thresholds(hsp)` lines before any dataset/normalizer use.

**Unverified assumptions you must check in the repo (5 minutes each):**
1. `TrainConfig.EXPERIMENTAL_DIR` path matches your Kaggle dataset mount — check `dataset_config.json` fields (`n_classes`, `hazard_types`) still exist.
2. Master CSV column names (`event_id`, `hazard_idx`, `severity_index`, `confidence`) — the split CLI requires at least the first two.
3. `severity_index` semantics — is it already a physical index? If yes, copy to `severity_source_index`; if unknown, tier verification still runs.
4. No existing inference/web code conflicts with the Phase-6 alert payload contract (unknown until you share `tree -L 3` output).
5. `requirements.txt` gains: `scikit-learn>=1.1` (StratifiedGroupKFold), `joblib`. Torch/h5py/tqdm already present per your notebook.

---

**The plan's spine:** (1) make the evaluation honest → (2) recalibrate the model against what it shows → (3) wrap inference in calibration + OOD + physics fallback → (4) rebuild the site around provenance → (5) operate with published POD/FAR. No dataset downloads are required anywhere in this plan.

---

## Phase 1 — Evidence & Claims Freeze (Day 1, no compute)

**Goal:** stop the website from making claims the repo contradicts.

1. **Immediate website edits** (pure copy changes, deploy same day):
   - Remove "98.4% Softmax" and all undated diagnostic readouts from the landing page.
   - Replace hero with the benchmark pattern (NASA/UNDRR audit): one sentence of identity, one current-alert strip, one CTA.
   - Add permanent disclaimer: *"HazardNet is a decision-support tool. Official warnings: BMD, FFWC, DDM."*
   - Add ` methodology · data sources · model card · contact` links (pages may be stubs for 48h).
2. **README alignment:** fix the internal contradictions flagged in the audit (Kaggle-vs-Actions, 7/15-day vs 10/20/30-day horizons, "Replace with actual URL", "softmax" vs dual-track). The README's *agricultural decision-support* positioning becomes the canonical product framing until Phase 5 clears the alerting gate.
3. **Freeze the claims registry:** a `CLAIMS.md` in repo listing every public metric and its evaluation strategy label. Rule: *a number may appear on the site only if its label appears in CLAIMS.md.*

**Acceptance:** hazardnet.live contains zero unverifiable numbers; every metric labeled with its strategy.

---

## Phase 2 — Data Engineering, Zero Downloads (Days 1–2)

**Goal:** make the existing 2,931 events support leakage-safe evaluation.

1. **Derive split metadata from existing fields** (no downloads):
   - `date`: take from existing event metadata if present; else parse year from `event_id` (splitter does this automatically with a warning). If only year is recoverable, that is sufficient for rolling-origin.
   - `place`: use `division`/`district`/`upazila` columns if present; else 1° lat/lon grid; else a hardcoded `event_id`-prefix → division dict (8 divisions, stable knowledge).
2. **Generate new splits:**
   ```bash
   python hazardnet_splits.py --master-csv <master.csv> --out <dataset_root> \
       --strategies grouped_kfold,rolling_origin --embargo-days 45
   ```
   Produces `grouped_kfold/fold_0..4/` and `rolling_origin/ro_<year>_Kharif_II/` in the exact layout `train_single_fold` already globs, plus `split_manifest.csv`.
3. **Wire the strategy runners:** paste the `STRATEGY_MAP` patch from `hazardnet_splits.py` into the Kaggle notebook.
4. **Add `severity_source_index` if derivable:** if the legacy `severity_index` column is already a physical quantity (SPEI, wind, FWI…), copy it under the new name; the dataset class then trains against anchored severity. If unknown, proceed — tier verification will simply report on tiers defined per-class.

**Acceptance:** `split_manifest.csv` shows every fold with train/val/test counts, no group straddles a fold (`assert_disjoint_groups` passes), and every rolling-origin fold has train strictly before test (`assert_temporal_order` passes).

---

## Phase 3 — Honest Evaluation (Days 2–4, 3–4 Kaggle T4 sessions)

**Goal:** produce the two numbers the entire deployment decision rests on.

1. **`STRATEGY='grouped_kfold'`** — honest in-distribution baseline. Expect a drop from 0.9887 toward ~0.90–0.95; that drop *is* the leaked-signal estimate.
2. **`STRATEGY='rolling_origin'`** — with checkpoint chaining (`init_from=prev ckpt`, already implemented in v2.0 `train_single_fold`). Each fold fine-tunes from the previous origin; total compute ≈ 2× a single strategy, not 8×.
3. **Outputs to archive:** per-fold `*_tier_verification.csv` (POD/FAR/CSI at each BD tier), `*_per_class.csv`, comparison table including **macro-F1** (added to v2.0 summary — rare classes are the operational ones).
4. **If temporal skill is still < gate:** retrain with recency weighting (most recent 8–10 years upweighted 2–3×) and phase features (season sin/cos); re-run rolling-origin. This is the standard remedy for era memorization and is one Kaggle session.
5. **Report to CLAIMS.md:** grouped-KFold accuracy (labeled), rolling-origin macro-F1 (labeled "forward-time skill"), per-tier POD/FAR.

**Acceptance (deployment gate):** rolling-origin macro-F1 ≥ 0.5 AND POD ≥ 0.7 at severe tier → advisory-beta eligible. Otherwise site stays "experimental" and alerting remains prohibited — the gate is printed by `main()` automatically.

---

## Phase 4 — Bangladesh Calibration (Day 4, CPU-only, 1 hour)

**Goal:** all severity outputs speak BMD/FFWC/EFFIS/WMO language.

1. In the training notebook, **before any `SeverityNormalizer` instantiation:**
   ```python
   import hazardnet_bd_thresholds as hbd
   hbd.apply_bd_thresholds(hsp)               # replaces SEVERITY_THRESHOLDS in place
   checks = hbd.validate_bd_thresholds(hsp)   # 57/57 proof obligations
   ```
2. The validator proves: strict monotonicity (in deficit space for Tmin/SPEI), tier ordering, tier severities present in anchors, normalizer builds for all 8 hazards, every reference registered.
3. **Cold-wave nuance (documented):** 16°C is anchored as the health-watch "cold night"/mild-spell onset (Alam 2023); the BMD warning class is Tmin ≤ 10°C. Both live in the anchor ladder; interpretation strings make the distinction visible to users.
4. If BD thresholds change severity targets materially, re-run Phase 3 step 2 (rolling-origin) once — severity head now learns the anchored scale.

**Acceptance:** 57/57 checks pass; `SEVERITY_THRESHOLDS` in the running kernel reports BD indices (Tmin, FFWC danger-level offset, gusts, NIO winds).

---

## Phase 5 — Trustworthy Inference Layer (Days 5–7)

**Goal:** the deployed scorer knows when it doesn't know.

1. **Isotonic calibration** (`Calibrator`): fit on the most recent rolling-origin validation year — never on training folds. *Scientific basis: operationally proven for hazard-warning services (Loveday & Carroll 2025, Wea. Forecasting, doi:10.1175/WAF-D-24-0129.1).*
2. **OOD guard** (`OODGuard`): max-softmax + class-conditional Mahalanobis on `shared_fc` embeddings; trust floor 0.05. When triggered → `uncertain`, physics leads.
3. **Conformal sets** (`ConformalPredictor`, α=0.10, APS): set size > 1 → UI shows "conditions unusual," never a single label. Coverage guarantee proven in module docstring.
4. **Fusion scorer assembly:**
   ```python
   fusion = FusionScorer(w_cnn=0.5, w_phys=0.5)
   fusion.fit_calibration(model, recent_era_loader, device)
   fusion.save('deployment/fusion_bundle.joblib')
   ```
   Physics tracks activated per-hazard as inputs become available (Tmin/Tmax from any forecast feed, FFWC levels when available, gusts). **Missing inputs degrade gracefully** — track skipped, CNN weight renormalized; no data feed is a launch blocker.
5. **Version the bundle:** `fusion_bundle.joblib` + model ckpt + thresholds dict + git SHA recorded together; the alert API must refuse to start if versions mismatch.

**Acceptance:** every inference returns `{probabilities, top_hazard, alert_level, uncertain, cnn_trust, prediction_set, rationale, severity}`; `uncertain` correctly forced on out-of-distribution test samples (verify with a deliberately shifted input, e.g. off-season tensor).

---

## Phase 6 — Backend & Alert Engine (Days 7–10)

1. **Alert state machine:** `DRAFT → PENDING_REVIEW → PUBLISHED → UPDATED → EXPIRED/ALL_CLEAR` with `REJECTED` feeding back as labeled ground truth. Publishing requires a reviewer role (server-enforced, not robots.txt).
2. **Alert payload contract** (aligns with benchmark provenance pattern): district/upazila, hazard, tier, fused probability, calibrated probability, CNN trust, physics rationale string, model+fusion versions, issued/valid times, official-sources block (BMD/FFWC/DDM links).
3. **District risk archive:** permalinks per alert (ReliefWeb pattern); this is the SEO engine and the public audit trail.
4. **Exports:** async PDF/GeoTIFF with version stamp + disclaimer.

---

## Phase 7 — Frontend Rebuild (Days 8–14, parallel with Phase 6)

Per the benchmark audit (GFDRR/UNDRR/NASA) and NASA.gov layout mapping:

1. **Landing (NASA skeleton, BD content):** full-bleed hero of the most severe active alert (satellite scene + credit line + timestamp) → live status strip → dated alert card grid → hazard-topic rows (Flood/Cyclone/Landslide/Drought) → knowledge products → authority-boundary banner → subscribe (district SMS/email) → footer with বাংলা/EN toggle.
2. **Map:** MapLibre, 64 districts, BD tier colors (colorblind-safe, icons not hue-only), legend, freshness badges per layer.
3. **Alert detail page:** shows the full Phase-6 payload including `rationale` and `cnn_trust` — provenance is visible, not buried.
4. **Accessibility/perf:** WCAG 2.2 AA, keyboard path, ARIA live regions; LCP < 2.5s on Bangladesh 3G; lite mode < 50KB.
5. **Content:** district risk profiles mined from the 2,931-event archive (GFDRR publication-shelf pattern); seasonal outlooks post-monsoon; `/validation` page publishing monthly POD/FAR.

---

## Phase 8 — Infrastructure, Security, Observability (Days 10–14)

From the security/SEO/UI/UX audit checklists (P0s first): authN/Z on all dashboard routes, security headers/CSP/HSTS, CORS allowlist, rate limiting, secrets hygiene, working sitemap+robots (fix the "blog is SEO surface but 404s" defect), SSR content, structured data (`Organization`, `Dataset` for the archive, `FAQPage`), Search Console + Bing, status page replacing "HTTP/2 optimized" theater, `/.well-known/security.txt`, backups + PITR.

---

## Phase 9 — Validation & Soft Launch (Week 3)

1. **Hindcast validation:** run the full stack over the last 2 monsoon seasons + one major cyclone year; score vs BMD/FFWC bulletins.
2. **Tabletop exercise:** 3–5 DDM/FFWC-adjacent reviewers use the review console; hesitation points logged as UX defects.
3. **Soft launch:** public advisory beta ("experimental, decision-support"), feedback button feeding labeled ground truth; **no SMS blasts** until the gate passes.
4. **Public metrics:** POD/FAR by division published monthly on `/validation` — publishing the false-alarm rate is the strongest trust signal available.

---

## Phase 10 — Governance & Research Track (ongoing)

- **Institutional path:** approach DDM/FFWC as *decision-support augmentation*, never as an alternative warning authority (the Red Cross/UN boundary pattern); GFDRR funds hydromet through governments — legitimacy travels with partnerships.
- **Paper strategy (IEEE TGRS):** the honest narrative — high spatial skill, limited temporal skill, diagnosed place-season memorization, remedied via grouped splits + recency training + physics-fusion with OOD gating + BD-anchored severity — is a contribution, not an admission. All 14 validated DOIs are embedded in code comments; fix BanglaJol DOI registration before submission.
- **Quarterly retraining** on rolling-origin schedule; drift watch on input distributions; champion/challenger promotion.

---

---

## Errata & Integration Patches v3.1 (supersedes conflicting sections of the earlier Phase 0-9 plan)

The earlier Phase 0-9 infrastructure plan remains the engineering backbone for Phases 6-8 of this document, with these corrections:

1. **Product contract scope (CRITICAL):** the deployable hazard set is exactly the model's 8 classes - Cold Wave, Drought, Fire, Flash Flood, Flood, Heat Wave, Severe Local Storm, Tropical Cyclone. Landslide, riverbank erosion, urban waterlogging, and storm surge are FUTURE data-only layers and must not appear in product/website promises until a model version covers them.
2. **Hindcast leakage fix (CRITICAL):** Phase 9 hindcast validation may only use rolling-origin OUT-OF-FOLD years or post-cutoff events. Amphan 2020 / Yaas 2021 are inside the training archive - evaluating on them is circular and prohibited as evidence.
3. **Ingestion re-scoping:** Phase 2's ERA5/GSMaP/CHIRPS/Sentinel download table is DEFERRED (no-download constraint). Minimum viable data path: existing master_tensors.h5 + archive lineage. Optional later: Open-Meteo forecast API (no download), BMD/FFWC bulletin mirror. W4 milestone becomes "archive lineage populated + >=1 live source".
4. **Calibration & thresholds:** isotonic calibration is implemented (hazardnet_fusion.py Calibrator); fit on the most recent rolling-origin validation year only. Alert tiers are the pre-registered BD anchors (SEVERITY_THRESHOLDS_BD) - tune only presentation on validation years, then freeze and version. "Recall-first threshold tuning" applies to the historical era only, not to published BD classes.
5. **Fusion architecture:** the fixed-weight w1..w4 formula is superseded by trust-weighted geometric fusion with OOD gating (hazardnet_fusion.py). Stream mapping: hydrology -> FFWC danger-level physics track; meteorology -> BMD Tmin/Tmax tracks; historical prior -> district risk archive (display layer, not a model input).
6. **Deployment gate added to Phase 9 exit criteria:** rolling-origin macro-F1 >= 0.5 AND POD >= 0.7 (severe tier) before public alerting; advisory beta below the gate.
7. **API contract typo:** /v1/regations/{id}/history -> /v1/regions/{id}/history.
8. **Model card is now operational, not aspirational:** it must cite the measured cross-strategy table (0.9887 event-KFold / 0.9566 LODO / 0.109 temporal / 0.1885 spatio-temporal) and mandate grouped_kfold + rolling_origin (hazardnet_splits.py) as the only evaluation splits going forward.
9. **Alert payload contract (per alert):** {district, hazard, tier (BD anchor), fused_probability, calibrated_probability, cnn_trust, prediction_set, uncertain, physics_rationale, severity + physical index back-map, model_version, fusion_bundle_version, issued_at, valid_until, data_freshness, official_sources{BMD, FFWC, DDM}}.
10. **Claims freeze is Phase 1 of THIS plan** and takes precedence over any launch activity in the older plan's Phase 9.


## Risk Register (top 5)

| Risk | Likelihood | Mitigation |
|---|---|---|
| Rolling-origin stays below gate | Medium | Advisory positioning already honest; recency-weighted retrain (Phase 3 step 4); physics-primary display |
| Monsoon cloud cover blinds optical CNN | High (seasonal) | Physics track leads under OOD; Sentinel-1 noted as future (not required) |
| Era fingerprint persists | Medium | Rolling evaluation catches it; expanding-window retraining |
| One wrong public alert | Low if gated | HITL publishing; conformal `uncertain`; claim registry |
| Brand collision with other "HazardNet" papers | Known | District-profile content + Bangladesh specificity differentiates; brand page |

---

## Milestone Summary

| Phase | Days | Exit criterion |
|---|---|---|
| 1 Claims freeze | 1 | Site has zero unverifiable numbers |
| 2 Data engineering | 1–2 | Splits generated, guards pass |
| 3 Honest evaluation | 2–4 | Rolling-origin macro-F1 + tier POD/FAR in CLAIMS.md |
| 4 BD calibration | 4 | 57/57 threshold proofs pass |
| 5 Fusion layer | 5–7 | OOD/conformal behavior verified on shifted inputs |
| 6–7 Backend + frontend | 7–14 | Alert payload contract; NASA-layout landing live |
| 8 Infra/security | 10–14 | All P0 checklist items green |
| 9 Soft launch | ~day 15–17 | Hindcast + tabletop complete; advisory beta public |
| 10 Governance | ongoing | DDM/FFWC dialogue; paper submission |

---

## References (all validated 2026-09-17 via doi.org / publisher records)

Tropical cyclone: doi:10.1016/j.tcrr.2023.06.002 · doi:10.1016/j.jweia.2022.105026 · doi:10.1007/s44274-025-00450-0 · doi:10.3389/feart.2025.1615811 · doi:10.1007/s43762-023-00113-x · doi:10.1029/2024JH000206
Flood/flash flood: doi:10.1111/jfr3.12959 · FFWC definitions (ffwc.gov.bd) · BMD heavy-rain classes · HaorFloodAlert arXiv:2605.20167
Drought: doi:10.1038/s41598-022-24146-0 · PMC10767098
Heat/cold: doi:10.1175/WAF-D-24-0129.1 · doi:10.3390/app13127030 · BMD classes (PMC11111018) · FOREWARN triggers (2022)
Fire: doi:10.1088/1748-9326/ad97cf
Storms: doi:10.1029/2024GL110960 · doi:10.1175/BAMS-D-21-0260.1 · Hoque et al. 2022 (BanglaJol 29(1))
**Rejected:** doi:10.1038/s43247 (incomplete; see doi:10.1038/s43247-023-01112-w for the complete form).
