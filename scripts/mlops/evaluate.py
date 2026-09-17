#!/usr/bin/env python3
"""Nightly evaluation: join predictions to observed outcomes and score them.

WHAT THIS DOES, AND WHY IT IS SHAPED THIS WAY
---------------------------------------------
Phase 3 asks for nightly POD/FAR/CSI and drift. The hard part is not the
arithmetic (`scripts/mlops/metrics.py`) — it is that **the repository has no
observed-outcome table**. The 2,931-event archive is external (Phase 2 built the
store and the loader for it), and BMD/FFWC bulletins are ingested by the `w3`
ETL but not fused.

So this module is built around a single honesty rule: *an evaluation that cannot
join to truth reports `insufficient_truth` and the counts that made it so*. It
never falls back to scoring the model against its own physics track, and it never
reports a rate from an empty denominator. Every run prints:

  * how many predictions were checked,
  * how many were matched to an observed outcome,
  * how many were **unverifiable** and why (no outcome on record for that
    district/window, outcome outside the prediction's validity window, or an
    outcome whose hazard class the model does not predict),
  * and, only when truth exists, the contingency table and its scores.

LEAD TIME IS PART OF THE RECORD
-------------------------------
A forecast is only "early warning" if it was issued before the event. The join
therefore computes `lead_days = outcome_date − prediction_date` per matched pair
and reports the distribution, so a POD computed from same-day matches cannot be
mistaken for skill. Matches with negative lead time (the outcome predates the
forecast) are reported as `outcome_before_forecast` and excluded from scoring —
that is exactly the temporal-leakage failure mode (`MODEL_CARD.md` §4.1).

The expected input shapes are the ones this repository already produces:

* predictions — the published CSV/snapshot rows (`district_name`, `hazard_type`,
  `prediction_date`, `target_date`, `confidence`, optional `model_version`,
  optional `physics_*` columns);
* outcomes — `python -m etl.cli events --report` output, or the `hazard_events`
  rows exported from the store: `{adm2_name, hazard_type, start_date, end_date}`.
"""

from __future__ import annotations

import csv
import json
from datetime import date, timedelta
from pathlib import Path

from . import MLOPS_VERSION
from .metrics import (
    brier_score,
    brier_skill_score,
    confusion_matrix,
    contingency,
    expected_calibration_error,
    log_loss,
    maximum_calibration_error,
    reliability_bins,
    score_from_pairs,
)

#: How far after `prediction_date` a forecast is considered live. The pipeline
#: issues 7- and 15-day horizons; a match outside that window would be scoring a
#: forecast for a period it never claimed.
DEFAULT_MAX_LEAD_DAYS = 15

#: How close to the window an outcome has to be before it is reported as an
#: unusable near-miss, and the reason only the *closest* one on each side is
#: reported: a district's archive holds decades of events, so listing all of them
#: buried the signal under ~1,300 noise entries per run on the synthetic fixture.
#: One line per prediction per side answers the question the bucket exists for —
#: "did truth sit just outside this forecast's window?".
DEFAULT_NEAR_DAYS = 14

#: The severity at which the pipeline is treated as having issued an alert. This is
#: a stand-in for the Phase 4 alert engine's thresholds (PRODUCT_SPEC §1.3), and it
#: is recorded in every report so a reader knows what "alarm" meant.
DEFAULT_ALARM_THRESHOLD = 0.5

REPORT_SCHEMA = 'hazardnet-mlops-evaluation/v1'


class EvaluationError(ValueError):
    """Raised for input that cannot be evaluated at all (a broken file, not a gap)."""


# ── loading ─────────────────────────────────────────────────────────────────

def load_predictions(path) -> list:
    """Read published forecast rows from a CSV or a JSON array."""
    path = Path(path)
    if not path.exists():
        raise EvaluationError(f'{path} does not exist')
    text = path.read_text(encoding='utf-8')
    if path.suffix.lower() == '.csv':
        rows = list(csv.DictReader(text.splitlines()))
    elif path.suffix.lower() in ('.jsonl', '.ndjson'):
        rows = [json.loads(line) for line in text.splitlines() if line.strip()]
    else:
        payload = json.loads(text)
        if isinstance(payload, dict):
            # A website snapshot: flatten its horizons.
            rows = []
            for horizon_rows in (payload.get('horizons') or {}).values():
                rows.extend(horizon_rows)
            if not rows:
                raise EvaluationError(f'{path}: object has no horizons with rows')
        else:
            rows = payload
    if not rows:
        raise EvaluationError(f'{path}: no prediction rows')
    return rows


def load_outcomes(path) -> list:
    """Read observed outcomes; accepts event-store rows or an ETL run report."""
    path = Path(path)
    if not path.exists():
        raise EvaluationError(f'{path} does not exist')
    text = path.read_text(encoding='utf-8')
    if path.suffix.lower() == '.csv':
        rows = list(csv.DictReader(text.splitlines()))
    else:
        payload = json.loads(text)
        if isinstance(payload, dict):
            rows = payload.get('events') or payload.get('outcomes') or payload.get('rows')
            if rows is None:
                raise EvaluationError(
                    f'{path}: object has no events/outcomes/rows array '
                    '(an ETL run report carries them under `events` only in --lenient mode)'
                )
        else:
            rows = payload
    normalized = []
    for index, row in enumerate(rows):
        district = _first(row, 'adm2_name', 'district', 'district_name')
        start = _first(row, 'start_date', 'date', 'event_date', 'target_date')
        if not district or not start:
            raise EvaluationError(f'outcome[{index}] needs a district and a date (got {row!r})')
        normalized.append({
            'district': str(district).strip(),
            'hazard_type': _first(row, 'hazard_type', 'hazard', 'type') or None,
            'start_date': str(start)[:10],
            'end_date': str(_first(row, 'end_date', 'end') or start)[:10],
            'severity': _float(_first(row, 'severity')),
            'source': _first(row, 'source') or 'unspecified',
        })
    return normalized


def _first(row, *keys):
    for key in keys:
        value = row.get(key) if isinstance(row, dict) else None
        if value not in (None, ''):
            return value
    return None


def _float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def normalize_key(name) -> str:
    """District keys are compared the way the rest of the system compares them.

    Slug/whitespace/case differences must not silently split a district into two
    (the same class of bug as the frontend's missing GAUL aliases). `comilla`/
    `cumilla` and `chittagong`/`chattogram` are folded here as well, because both
    spellings are present in this repository's inputs.
    """
    if name is None:
        return ''
    text = str(name).strip().lower().replace('_', ' ').replace('-', ' ')
    # Apostrophes are dropped, not kept: the site writes `coxsbazar`, the ETL
    # vocabulary writes "Cox's Bazar" and the fixtures write "Coxs Bazar", and
    # without this the same district becomes three keys and every one of its events
    # lands in the unverifiable bucket.
    text = text.replace("'", '').replace('\u2019', '')
    text = ' '.join(text.split())
    return _ALIASES.get(text, text)


_ALIASES = {
    'comilla': 'cumilla',
    'chittagong': 'chattogram',
    'jessore': 'jashore',
    'nawabganj': 'chapainawabganj',
    'netrakona ': 'netrokona',
    'maulvibazar': 'moulvibazar',
    'brahamanbaria': 'brahmanbaria',
}


# ── the join ────────────────────────────────────────────────────────────────

def match_pairs(predictions, outcomes, *, max_lead_days: int = DEFAULT_MAX_LEAD_DAYS,
                absence_means_no_event: bool = False, near_days: int = DEFAULT_NEAR_DAYS) -> dict:
    """Pair each prediction with the outcomes that fall in its scoring window.

    Returns `pairs` plus the buckets of predictions that could not be scored, and —
    importantly — records *how many* unverifiable cases were counted so nothing is
    dropped silently. Every prediction ends in exactly one bucket.

    Two rules that exist to stop the report from flattering itself:

    * **Only near-miss outcomes are counted as unverifiable.** A district's archive
      holds decades of events; counting every earlier event as "outcome predates
      forecast" produced ~2,000 noise entries per run on the synthetic fixture and
      told the reader nothing. An outcome is recorded in a bucket only when it falls
      within `near_days` of the window; the rest are counted as `not_relevant`.

    * **Absence of an event is `unknown` unless the caller says otherwise.** With
      `absence_means_no_event=False` (the default) a prediction with no recorded
      outcome is *not scored* — it becomes neither a correct negative nor a false
      alarm — because this repository's event archive is not loaded or known to be
      complete, and assuming absence means "no event" would manufacture a perfect
      false-alarm ratio. Pass `absence_means_no_event=True` only when the archive is
      known to be complete for the districts and window being scored (the fixture
      tests do this deliberately; see `scripts/tests/fixtures/mlops/README.md`).
    """
    by_district = {}
    for outcome in outcomes:
        by_district.setdefault(normalize_key(outcome['district']), []).append(outcome)

    pairs = []
    unmatched_no_outcome = []
    outcome_before_forecast = []
    outside_window = []
    missing_fields = []
    conflicting_observations = []
    not_relevant = 0

    for index, prediction in enumerate(predictions):
        district = _first(prediction, 'district_name', 'adm2_name', 'location_name')
        hazard = _first(prediction, 'hazard_type')
        prediction_day = _parse_date(_first(prediction, 'prediction_date'))
        target_day = _parse_date(_first(prediction, 'target_date'))
        if not district or not hazard or not prediction_day:
            missing_fields.append(f'prediction[{index}]: needs district_name, hazard_type, prediction_date')
            continue

        candidates = by_district.get(normalize_key(district), [])
        horizon_end = target_day or (prediction_day + timedelta(days=max_lead_days))
        near_start = prediction_day - timedelta(days=near_days)
        near_end = horizon_end + timedelta(days=near_days)

        matched = []
        closest_before = closest_after = None
        for outcome in candidates:
            start = _parse_date(outcome['start_date'])
            end = _parse_date(outcome['end_date']) or start
            if start is None:
                continue
            if start < near_start or start > near_end:
                not_relevant += 1           # history / far future: not this forecast's problem
                continue
            if start < prediction_day:
                distance = (prediction_day - start).days
                if closest_before is None or distance < closest_before[0]:
                    closest_before = (distance, f'{district}: outcome {start} predates forecast '
                                                f'{prediction_day} by {distance} day(s)')
                continue
            if start > horizon_end:
                distance = (start - horizon_end).days
                if closest_after is None or distance < closest_after[0]:
                    closest_after = (distance, f'{district}: outcome {start} starts {distance} day(s) '
                                                f'after horizon end {horizon_end}')
                continue
            matched.append((outcome, (start - prediction_day).days))

        # At most one near-miss per prediction per side (see DEFAULT_NEAR_DAYS).
        if closest_before:
            outcome_before_forecast.append(closest_before[1])
        if closest_after:
            outside_window.append(closest_after[1])

        if not matched and not absence_means_no_event:
            unmatched_no_outcome.append(f'{district}/{prediction_day}')
            continue

        observed_same_class = any(
            normalize_hazard(outcome['hazard_type']) == normalize_hazard(hazard)
            for outcome, _ in matched
        )
        classes = sorted({
            normalize_hazard(outcome['hazard_type']) or 'unlabelled' for outcome, _ in matched
        })
        if matched and not observed_same_class:
            # Truth exists but names a different hazard: a correct negative for the
            # model's class, and the raw material of the confusion matrix.
            conflicting_observations.extend(
                f'{district}: observed {cls} vs predicted {hazard}' for cls in classes
            )
        pairs.append({
            'district': district,
            'district_key': normalize_key(district),
            'prediction_date': prediction_day.isoformat(),
            'target_date': horizon_end.isoformat(),
            'hazard_type': hazard,
            'severity': _float(_first(prediction, 'severity_score', 'model_severity')),
            'confidence': _float(_first(prediction, 'confidence')),
            'model_version': _first(prediction, 'model_version'),
            'observed': observed_same_class,
            'observed_any_event': bool(matched),
            'observed_classes': classes,
            'truth_source': 'event_archive' if matched else 'absence',
            'lead_days': min([lead for _, lead in matched], default=None),
            'outcomes': [
                {'hazard_type': outcome['hazard_type'], 'start_date': outcome['start_date'],
                 'source': outcome.get('source'), 'lead_days': lead}
                for outcome, lead in matched
            ],
        })

    return {
        'pairs': pairs,
        'unmatched_no_outcome': unmatched_no_outcome,
        'outcome_before_forecast': outcome_before_forecast,
        'outside_window': outside_window,
        'missing_fields': missing_fields,
        'conflicting_observations': conflicting_observations,
        'not_relevant': not_relevant,
        'absence_means_no_event': absence_means_no_event,
    }


#: The eight classes, in the model's pinned order (Models/labels.json).
HAZARD_CLASSES = ('Cold Wave', 'Drought', 'Fire', 'Flash Flood',
                  'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone')

_CLASS_ALIASES = {
    'monsoon flood': 'Flood',
    'river flood': 'Flood',
    'flash flood': 'Flash Flood',
    'tropical storm': 'Tropical Cyclone',
    'cyclone': 'Tropical Cyclone',
    'storm': 'Tropical Cyclone',
    'heatwave': 'Heat Wave',
    'coldwave': 'Cold Wave',
    'norwester': 'Severe Local Storm',
    "nor'wester": 'Severe Local Storm',
    'thunderstorm': 'Severe Local Storm',
    'wildfire': 'Fire',
    'forest fire': 'Fire',
}


def normalize_hazard(label) -> str:
    """Map source vocabulary onto the eight classes, or return `None`.

    `None` is meaningful: an observed landslide is not a class the model predicts,
    and folding it into `Flood` (which the event ETL deliberately refuses to do)
    would quietly inflate the scores.
    """
    if label is None:
        return None
    text = str(label).strip()
    for hazard in HAZARD_CLASSES:
        if text.lower() == hazard.lower():
            return hazard
    return _CLASS_ALIASES.get(text.lower())


# ── scoring ─────────────────────────────────────────────────────────────────

def score_evaluation(joined: dict, *, bins: int = 10,
                     alarm_threshold: float = DEFAULT_ALARM_THRESHOLD) -> dict:
    """Contingency table, per-class scores, reliability and lead time.

    Three views of the same pairs:

      * **event/no-event** — did the model *alarm* on a district whose window had an
        event of the predicted class? `alarm` is `severity >= alarm_threshold`,
        which is how the pipeline's alert levels will be derived (PRODUCT_SPEC
        §1.3); the threshold is reported so the number cannot be misread.
      * **per class** — one-vs-rest for each of the eight classes, so a collapse
        onto the majority class shows up as `pod: None` for the other seven.
      * **reliability** — `confidence` against the observed outcome, which is the
        only question a calibration map answers.

    When the sample contains **no negatives** the classifier scores that need them
    (FAR, CSI, accuracy, frequency bias) are reported as `None` with the reason,
    not as 0.0 — a false-alarm ratio of 0 from a sample with no possible false alarm
    reads as perfection and is the single most misleading number this file could
    print. Load the event archive (or pass `absence_means_no_event=True` when it is
    known complete) to make those scores measurable.
    """
    pairs = joined['pairs']
    verifiable = [pair for pair in pairs if pair['hazard_type'] in HAZARD_CLASSES]

    def alarm(pair):
        if pair['severity'] is not None:
            return pair['severity'] >= alarm_threshold
        if pair['confidence'] is not None:
            return pair['confidence'] >= alarm_threshold
        return None

    scored_pairs = [(pair, alarm(pair)) for pair in verifiable]
    scored_pairs = [(pair, fired) for pair, fired in scored_pairs if fired is not None]
    event_pairs = [(fired, bool(pair['observed'])) for pair, fired in scored_pairs]
    negatives = [pair for pair, _ in scored_pairs if not pair['observed']]
    contingency_table = score_from_pairs(event_pairs)

    result_events = {
        **contingency_table,
        'pod': _round(contingency_table['pod']),
        'far': _round(contingency_table['far']),
        'csi': _round(contingency_table['csi']),
        'frequency_bias': _round(contingency_table['frequency_bias']),
        'alarm_threshold': alarm_threshold,
        'negatives_available': len(negatives),
    }
    if not negatives:
        result_events.update({
            'far': None,
            'csi': None,
            'accuracy': None,
            'frequency_bias': None,
            'unmeasurable': {
                'fields': ['far', 'csi', 'accuracy', 'frequency_bias'],
                'reason': 'the scored sample contains no district-window without an event, so no '
                          'false alarm is possible — load the event archive, or pass '
                          'absence_means_no_event=True if it is known to be complete',
            },
        })

    per_class = {}
    for hazard in HAZARD_CLASSES:
        # One-vs-rest: the forecast side is "the model named this class", not "the
        # model alarmed" — using the alarm flag here made every class the model never
        # predicted look like a 100 % false-alarm rate (an earlier version did).
        class_pairs = [
            (pair['hazard_type'] == hazard, hazard in (pair['observed_classes'] or []))
            for pair, _ in scored_pairs
        ]
        table = score_from_pairs(class_pairs)
        if table['observed_events'] == 0 and table['forecast_events'] == 0:
            # The model never alarmed on it and it never happened: not a score of
            # zero, an untested class. Keep the counts and say so.
            per_class[hazard] = {
                'pod': None, 'far': None, 'csi': None,
                'observed_events': 0, 'forecast_events': 0, 'status': 'untested',
            }
            continue
        no_negatives = all(observed for _, observed in class_pairs)
        per_class[hazard] = {
            'pod': _round(table['pod']),
            'far': None if no_negatives else _round(table['far']),
            'csi': None if no_negatives else _round(table['csi']),
            'precision': None if no_negatives else _round(table['precision']),
            'recall': _round(table['recall']),
            'observed_events': table['observed_events'],
            'forecast_events': table['forecast_events'],
            'hits': table['hits'],
            'misses': table['misses'],
            'false_alarms': None if no_negatives else table['false_alarms'],
            'status': 'measured',
        }

    confidences = [pair['confidence'] for pair, _ in scored_pairs if pair['confidence'] is not None]
    outcomes = [bool(pair['observed']) for pair, _ in scored_pairs if pair['confidence'] is not None]
    reliability = reliability_bins(confidences, outcomes, bins=bins) if confidences else []
    single_class = bool(outcomes) and (all(outcomes) or not any(outcomes))

    severities = [(pair['severity'], pair['observed']) for pair, _ in scored_pairs
                  if pair['severity'] is not None]
    severity_mae = None
    if severities:
        severity_mae = sum(
            abs(severity - (1.0 if observed else 0.0)) for severity, observed in severities
        ) / len(severities)

    leads = [pair['lead_days'] for pair, _ in scored_pairs if pair['lead_days'] is not None]
    lead_days = sorted(leads)
    return {
        'events': result_events,
        'per_class': per_class,
        'class_confusion': confusion_matrix(
            [(pair['hazard_type'], _truth_class(pair)) for pair, _ in scored_pairs if _truth_class(pair)],
            labels=HAZARD_CLASSES,
        ),
        'reliability': {
            'bins': reliability,
            'ece': _round(expected_calibration_error(reliability, total=len(confidences))),
            'mce': _round(maximum_calibration_error(reliability)),
            'brier': _round(brier_score(confidences, outcomes)),
            'brier_skill': _round(brier_skill_score(confidences, outcomes)),
            'log_loss': _round(log_loss(confidences, outcomes)),
            'samples': len(confidences),
            'single_class_sample': single_class,
            'note': (
                'every scored sample is the same class, so ECE/Brier describe how confident '
                'the model is about outcomes that all occurred (or all did not) — they are not '
                'a calibration assessment'
                if single_class else None
            ),
        },
        'severity_mae_vs_occurrence': _round(severity_mae),
        'lead_time_days': {
            'min': lead_days[0] if lead_days else None,
            'max': lead_days[-1] if lead_days else None,
            'mean': _round(sum(lead_days) / len(lead_days)) if lead_days else None,
            'samples': len(lead_days),
            'samples_with_lead_over_0': sum(1 for lead in lead_days if lead > 0),
        },
        'scored_samples': len(scored_pairs),
    }


def _truth_class(pair):
    classes = [cls for cls in (pair.get('observed_classes') or []) if cls in HAZARD_CLASSES]
    if not classes:
        return None
    # More than one class observed in the window: keep the first by class order so
    # the confusion matrix is deterministic rather than dependent on input order.
    return sorted(classes, key=HAZARD_CLASSES.index)[0]


def _round(value):
    return None if value is None else round(float(value), 6)


def evaluate(predictions_path, outcomes_path, *, max_lead_days: int = DEFAULT_MAX_LEAD_DAYS,
             bins: int = 10, min_matched: int = 30, absence_means_no_event: bool = False,
             alarm_threshold: float = DEFAULT_ALARM_THRESHOLD,
             near_days: int = DEFAULT_NEAR_DAYS) -> dict:
    """Run the whole evaluation and return the report `mlops.cli evaluate` writes."""
    predictions = load_predictions(predictions_path)
    outcomes = load_outcomes(outcomes_path)
    joined = match_pairs(predictions, outcomes, max_lead_days=max_lead_days,
                         absence_means_no_event=absence_means_no_event, near_days=near_days)
    scored = score_evaluation(joined, bins=bins, alarm_threshold=alarm_threshold)
    matched = len(joined['pairs'])

    status = 'ok'
    reason = None
    if matched == 0:
        status = 'insufficient_truth'
        reason = (
            'no prediction could be joined to an observed outcome for its district and window — '
            'the event archive is not loaded (see scripts/etl/README.md) or the dates do not overlap'
        )
    elif matched < min_matched:
        status = 'insufficient_truth'
        reason = f'only {matched} predictions have truth; at least {min_matched} are needed for a score'

    report = {
        'schema': REPORT_SCHEMA,
        'mlops_version': MLOPS_VERSION,
        'status': status,
        'reason': reason,
        'inputs': {
            'predictions': str(predictions_path),
            'outcomes': str(outcomes_path),
        },
        'counts': {
            'predictions': len(predictions),
            'outcomes': len(outcomes),
            'matched': matched,
            'unmatched_no_outcome': len(joined['unmatched_no_outcome']),
            'outcome_before_forecast': len(joined['outcome_before_forecast']),
            'outside_window': len(joined['outside_window']),
            'missing_fields': len(joined['missing_fields']),
            'not_relevant_outcomes': joined['not_relevant'],
            'min_matched': min_matched,
            'absence_means_no_event': absence_means_no_event,
            'alarm_threshold': alarm_threshold,
            'near_days': near_days,
        },
        'unverifiable': {
            'examples': {
                'no_outcome_on_record': joined['unmatched_no_outcome'][:5],
                'outcome_before_forecast': joined['outcome_before_forecast'][:5],
                'outside_window': joined['outside_window'][:5],
                'missing_fields': joined['missing_fields'][:5],
                'conflicting_observations': joined['conflicting_observations'][:5],
            },
            'not_relevant_outcomes': joined['not_relevant'],
        },
        'scores': scored if status == 'ok' else None,
    }
    if status == 'ok':
        report['scored_samples'] = scored['scored_samples']
        report['negative_samples'] = scored['events']['negatives_available']
        report['evaluated_events'] = scored['events']['observed_events']
        report['ece'] = scored['reliability']['ece']
        report['csi'] = scored['events']['csi']
        report['far'] = scored['events']['far']
        report['pod'] = scored['events']['pod']
        report['model_versions'] = sorted({
            pair['model_version'] for pair in joined['pairs'] if pair.get('model_version')
        })
    return report


def render_summary(report: dict) -> str:
    """The one-screen summary a workflow log (or a human) reads."""
    counts = report['counts']
    lines = [
        f"evaluation: {report['status']}"
        + (f" — {report['reason']}" if report.get('reason') else ''),
        f"  predictions: {counts['predictions']} | outcomes: {counts['outcomes']} | "
        f"matched: {counts['matched']}",
        f"  unverifiable: no outcome {counts['unmatched_no_outcome']}, "
        f"outcome predates forecast {counts['outcome_before_forecast']}, "
        f"outside horizon {counts['outside_window']}, malformed {counts['missing_fields']}",
    ]
    if report['status'] != 'ok':
        return '\n'.join(lines)
    events = report['scores']['events']
    reliability = report['scores']['reliability']
    lead = report['scores']['lead_time_days']
    lines += [
        f"  event/no-event: POD {events['pod']} FAR {events['far']} CSI {events['csi']} "
        f"(hits {events['hits']}, misses {events['misses']}, false alarms {events['false_alarms']})",
        f"  reliability: ECE {reliability['ece']} MCE {reliability['mce']} "
        f"Brier {reliability['brier']} (skill {reliability['brier_skill']})",
        f"  lead time: {lead['min']}–{lead['max']} days "
        f"({lead['samples_with_lead_over_0']}/{lead['samples']} issued before the event)",
    ]
    collapses = [
        hazard for hazard, row in report['scores']['per_class'].items()
        if row['status'] == 'measured' and row['observed_events'] > 0 and row['pod'] == 0
    ]
    if collapses:
        lines.append(f"  ⚠ missed entirely: {', '.join(collapses)}")
    return '\n'.join(lines)
