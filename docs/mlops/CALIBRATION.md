# Confidence calibration

How `confidence` goes from "the classifier's own softmax" to "a probability", and
why the second one is not shipped in this repository today.

## Where the shipped number comes from

`backend/inference.js` applies `temperatureScale(tf, logits, 1.0)` — a no-op at the
default temperature — and takes the top class's softmax score as `confidence`.
`backend/utils/predictFromStore.js` labels it `model_softmax_top_class`, and
`docs/MODEL_CARD.md` §6.1 shows what that score looks like in practice: 19 of 25
seven-day rows and **all 49** fifteen-day rows sit at `1.0000`. A softmax of 1.0 is
not a 100 % probability, it is the model being unable to distinguish anything from
anything else (the repository's `temperatureScale` exists precisely so a fitted
temperature *could* be applied, and no temperature has ever been fitted).

`confidence_kind` is the namespace that keeps the two apart. The API passes it
through (`backend/utils/forecastRow.js`), the store-prediction path defaults it, and
a public row carrying `calibrated_probability` is a factual claim that a fitted map
produced that number.

## What a fitted map has to satisfy

`scripts/mlops/calibration.py` implements two fitters and one set of rules:

* **isotonic** (PAVA) — non-decreasing, no shape assumption, can overfit;
* **Platt** — two parameters (`sigmoid(a·logit(s) + b)`), damped Newton with a
  backtracking line search and a convergence report, cannot overfit but can only
  rescale.

`CalibrationMap.validate()` refuses a map that:

| Refusal | Why |
| --- | --- |
| has no fitted parameters | an unfitted map that silently passes scores through would put a `calibrated_probability` label on an uncalibrated number |
| was fitted on fewer than 200 labelled rows | a step function fitted on a handful of rows reproduces the sample, not the phenomenon |
| has no `fit_period` / `fitted_on` | without provenance nobody can tell what window the map describes |
| makes the Brier score worse on its own fit sample | shipping a map that degrades the forecast is never the right answer |
| a Platt fit that did not converge, an isotonic map that is not monotone | a failed fit must not be published as a success |

The artefact is `Models/calibration/confidence_map.template.json`, and it is
**deliberately unfitted** (`samples: 0`, `status: awaiting-outcomes`), so
`mlops.cli apply-calibration` refuses it. That is the current state of the
repository, stated plainly: **there is no observed-outcome dataset**, so there is
nothing to fit a map on and nothing to calibrate against. See "Why" below.

## Fitting the real map

```bash
cd scripts
python -m mlops.cli calibrate \
  --fit-from ../backend/data/forecasts/hazardnet_forecasts_latest.csv \
  --outcomes <event archive export with observed outcomes> \
  --method isotonic --fit-period "<train window>" --fitted-on "$(date +%F)" \
  --absence-means-no-event \        # only if the archive is complete for the scope
  --out ../Models/calibration/confidence_map.json
```

Then, and only then:

```bash
python -m mlops.cli apply-calibration --csv in.csv \
  --map ../Models/calibration/confidence_map.json --out calibrated.csv
```

which writes `confidence_calibrated` next to the raw score, and the ingest boundary
publishes the calibrated value as `confidence` with `confidence_kind =
calibrated_probability` and the softmax preserved as `confidence_raw`
(`__tests__/calibratedConfidence.test.js`).

## Evaluating a map

```bash
python -m mlops.cli evaluate --predictions <labelled predictions> \
  --outcomes <outcomes> --absence-means-no-event --json report.json
```

The report carries the reliability diagram's bins (equal-width, `gap = mean score −
observed frequency`), ECE, MCE, Brier and Brier skill, and — critically —
`single_class_sample`: if every scored row shares the same outcome, ECE describes
confidence about a foregone conclusion and is labelled as such rather than reported
as a calibration result.

## Why there is no fitted map in this repository

Three facts, in order:

1. The event archive (2,931 events, Phase 2) is **not loaded** — the sandbox has no
   Postgres and no export of it is committed, and the store's table is empty by
   design.
2. The predictions that exist (`backend/data/forecasts/hazardnet_forecasts_latest.csv`,
   74 rows) have **no observed outcomes joined to them**.
3. Fitting a map on the model's own scores, on the ETL test fixtures, or on the
   synthetic MLOps fixture would produce a number that *looks* calibrated. That is
   the failure mode this phase is meant to end, not repeat.

So the deliverable is the machinery plus the refusal: the pipeline can carry a
calibrated probability, and it cannot produce one until labelled outcomes exist.
That is also why `docs/PRODUCT_SPEC.md` §3's calibration acceptance criteria remain
unmet, and why the copy now says "uncalibrated" wherever the softmax is shown.
