# `scripts/mlops/` — model registry, calibration, evaluation, drift

`python -m mlops.cli <command>` (run from `scripts/`, the same convention as
`python -m etl.cli`). Stdlib-only and offline: no TensorFlow, no network, no
database.

| Module | Responsibility | Tests |
| --- | --- | --- |
| `metrics.py` | POD/FAR/CSI and friends, reliability (ECE/MCE/Brier/BSS/log-loss), PSI | `tests/test_mlops_metrics.py` |
| `calibration.py` | Isotonic (PAVA) and Platt fits, the artifact, the refusal rules | `tests/test_mlops_calibration.py` |
| `registry.py` | Bundle audit vs `Models/VERSION.json`, stages, promotion gates | `tests/test_mlops_registry.py` |
| `evaluate.py` | Prediction↔outcome join, scoring, per-class and lead-time views | `tests/test_mlops_evaluate_drift.py` |
| `drift.py` | PSI over published driver columns, class shares, severity | `tests/test_mlops_evaluate_drift.py` |
| `cli.py` | `audit`, `registry`, `evaluate`, `drift`, `calibrate`, `apply-calibration`, `promote` | the suites above plus `tests/test_mlops_artifacts.py` |

## How this is verified

| Behaviour | Test |
| --- | --- |
| A rate with no denominator is `None`, never `0` | `test_mlops_metrics.py::test_pod_is_none_when_nothing_was_observed`, `…test_far_is_none_when_no_alarm_was_issued` |
| PSI refuses a point mass / near-point mass reference | `…test_psi_refuses_a_point_mass_reference`, `…test_psi_refuses_a_near_point_mass_reference` |
| PSI needs 20 observations per bin | `…test_psi_needs_twenty_observations_per_bin` |
| The isotonic fit is monotone and reduces Brier/ECE | `test_mlops_calibration.py::test_isotonic_fit_improves_brier_and_ece_on_an_overconfident_sample` |
| Platt converges with the correct sign and improves Brier | `…test_platt_fit_converges_and_improves_the_brier_score`, `…test_platt_recovers_a_monotone_direction` |
| The stored map is sorted by score and applies monotonically | `…test_map_is_a_monotone_function_of_the_score`, `…test_isotonic_pairs_are_sorted_by_score_and_deduplicated` |
| An unfitted / under-sampled / undocumented / worse-Brier map is refused | `…test_an_unfitted_map_refuses_to_apply`, `…test_validation_flags_*` |
| The shipped template cannot be stamped onto rows | `…test_the_shipped_template_is_deliberately_unfitted`, `test_mlops_artifacts.py::test_the_calibration_template_is_present_and_records_why_it_is_unfit` |
| Absence of an event is `unknown` unless declared otherwise | `test_mlops_evaluate_drift.py::test_a_prediction_with_no_recorded_outcome_is_unknown_not_a_negative` |
| FAR/CSI are `None` when the sample has no negatives | `…test_without_negatives_the_classifier_scores_that_need_them_are_none` |
| Temporal leakage is excluded from scoring | `…test_an_outcome_before_the_forecast_is_never_a_hit` |
| Legacy units are converted before comparison | `…test_legacy_values_are_converted_to_canonical_units` |
| The handshake is audited against the bytes on disk | `test_mlops_registry.py::test_the_shipped_bundle_audits_clean`, `…test_a_hash_mismatch_is_reported_and_fails_the_audit` |
| The INT8 duplicate is reported, not counted as a model | `…test_the_int8_artifact_is_reported_as_a_duplicate_not_a_second_model`, `…test_promoting_the_byte_identical_duplicate_is_refused` |
| Promotion needs a passing comparison **and** an approver | `…test_promotion_is_refused_without_an_approver`, `…test_promotion_is_refused_on_a_regression_the_tolerance_cannot_excuse` |
| The registry rebuild is idempotent | `…test_writing_the_registry_twice_is_a_no_op`, `test_mlops_artifacts.py::test_the_registry_is_committed_and_matches_the_bundle` |
| Copy may not claim a calibration that does not exist | `test_mlops_artifacts.py::test_no_copy_claims_the_model_score_is_calibrated` |
| The ingest boundary honours a calibrated row | `__tests__/calibratedConfidence.test.js` |

`python tests/make_mlops_fixtures.py --check` regenerates the synthetic fixtures
into a temporary directory and diffs them against the committed ones, so a fixture
change has to be deliberate.

## The rule that shapes the package

No metric without evidence, no promotion without a human. A score with an empty
denominator is `None` plus the counts that made it so; a `calibrated_probability`
label requires a fitted, validated map; and `champion` requires a named approver.
The docs — `docs/mlops/README.md`, `CALIBRATION.md`, `RETRAIN_AND_PROMOTION.md` —
state where the current gaps are rather than working around them.
