#!/usr/bin/env python3
"""Generate the deterministic synthetic fixtures used by the MLOps tests.

**These files are synthetic. They are not evidence about the real model.** They
exist because calibration and verification code has to be exercised against data
with known properties, and because this repository has no observed-outcome dataset
(the event store is empty until the archive is loaded). Nothing here may be used
to fit a shipped calibration map: a map fitted on these rows would be a fabricated
artifact, which is precisely what `scripts/mlops/calibration.py::validate` and the
publisher refuse.

The generator is seeded with stdlib `random`, so re-running it reproduces the
committed files byte for byte (`python scripts/tests/make_mlops_fixtures.py`).

What the fixtures encode
------------------------
`synthetic_predictions.csv` / `synthetic_outcomes.json`
    A latent Bernoulli process per (district, window). The model under test is
    deliberately **overconfident**: its score is `0.35 + 0.6·p_latent` pushed
    toward 1, which is the qualitative defect MODEL_CARD §6.1 documents. The
    outcomes are drawn from `p_latent`, so a correct calibration map has something
    real to recover. The fixtures also carry the awkward cases the evaluation
    harness must handle: districts with no outcome on record, an observed class the
    model does not predict (landslide), an outcome that predates the forecast
    (temporal leakage), and one outside the forecast's horizon.

`reference_run.csv` / `current_run.csv`
    Two published-forecast runs for the drift tests, in **different schemas** —
    the reference uses the legacy `om_*` columns (`om_temp_2m_k` holding °C,
    `om_solar_rad_j` holding kJ/m², horizon totals) and the current run uses the
    canonical per-day columns. Comparing them exercises the alias table and the
    unit conversions in `scripts/mlops/drift.py`; the current run is generated as
    the same weather, so a correct conversion reports "stable" and a wrong one
    reports a large index.

Usage:
    python scripts/tests/make_mlops_fixtures.py [--check]
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = ROOT / 'scripts' / 'tests' / 'fixtures' / 'mlops'

SEED = 20260917

#: 20 districts with a range of latent risk, so per-class scores are not degenerate.
DISTRICTS = [
    ('Sylhet', 'Chattogram', 0.82), ('Sunamganj', 'Chattogram', 0.78),
    ('Kurigram', 'Rangpur', 0.74), ('Bogura', 'Rajshahi', 0.35),
    ('Jamalpur', 'Mymensingh', 0.52), ('Sirajganj', 'Rajshahi', 0.61),
    ('Faridpur', 'Dhaka', 0.44), ('Khulna', 'Khulna', 0.40),
    ('Satkhira', 'Khulna', 0.46), ('Bagerhat', 'Khulna', 0.42),
    ('Coxs Bazar', 'Chattogram', 0.58), ('Chattogram', 'Chattogram', 0.55),
    ('Rangpur', 'Rangpur', 0.30), ('Dinajpur', 'Rangpur', 0.22),
    ('Rajshahi', 'Rajshahi', 0.18), ('Pabna', 'Rajshahi', 0.38),
    ('Mymensingh', 'Mymensingh', 0.47), ('Comilla', 'Chattogram', 0.36),
    ('Noakhali', 'Chattogram', 0.50), ('Patuakhali', 'Barishal', 0.33),
]

HORIZONS = (('7_days', 7), ('15_days', 15))

#: Ten weekly issue dates. The fixture needs at least 200 *matched* predictions to
#: exercise a calibration map that passes `validate()`'s minimum-sample bar (400
#: forecasts over ten dates, ~58 % of which have an outcome in their window), plus a
#: slice small enough to test the refusal path.
PREDICTION_DATES = [
    (date(2026, 6, 5) + timedelta(days=7 * week)).isoformat() for week in range(10)
]


#: Which wrong class the model reaches for, by district type: riverine districts mix
#: up the two flood classes, coastal ones reach for cyclones.
CONFUSION_POOL = {
    'Flash Flood': ('Flood', 'Severe Local Storm'),
    'Flood': ('Flash Flood', 'Severe Local Storm'),
}


def _confuse(rng: random.Random, truth_class: str, district: str) -> str:
    """The class the model names: usually the truth, sometimes a neighbour."""
    if rng.random() >= 0.12:
        return truth_class
    pool = CONFUSION_POOL[truth_class]
    if district in ('Coxs Bazar', 'Chattogram', 'Patuakhali'):
        pool = ('Tropical Cyclone', *pool)
    return rng.choice(pool)


def _score(p_latent: float) -> float:
    """An overconfident score: the latent risk pushed toward the extremes.

    This mimics MODEL_CARD §6.1 (scores clustering at 1.0000) while keeping a
    monotone relationship with the truth, which is exactly the situation isotonic
    calibration exists to correct.
    """
    pushed = 0.5 + (p_latent - 0.5) * 1.6
    return round(min(0.9999, max(0.5001, pushed)), 4)


def _shift_day(iso_date: str, days: int) -> str:
    return (date.fromisoformat(iso_date) + timedelta(days=days)).isoformat()


def build_predictions(rng: random.Random) -> tuple:
    rows, latents = [], {}
    for district, division, base in DISTRICTS:
        index = DISTRICTS.index((district, division, base))
        for horizon, days in HORIZONS:
            for prediction_date in PREDICTION_DATES:
                key = (district, horizon, prediction_date)
                # The 2026 monsoon setting, shifted up so roughly 58 % of the
                # forecasts have an outcome to be scored against.
                latents[key] = min(0.97, max(0.03, base + 0.12 + rng.uniform(-0.06, 0.06)))
                score = _score(latents[key])
                severity = round(min(0.999, max(0.05, 0.25 + latents[key] * 0.7)), 4)
                truth_class = ('Flash Flood'
                               if district in ('Sylhet', 'Sunamganj', 'Kurigram') else 'Flood')
                rows.append({
                    'district_id': 1000 + index,
                    'district_name': district,
                    'division': division,
                    'pcode': str(1000 + index),
                    'horizon': horizon,
                    # ~12 % of forecasts name the wrong hazard, so the per-class view
                    # and the confusion matrix have off-diagonal mass to find. A model
                    # that never confuses anything makes a verification harness look
                    # correct while testing almost nothing.
                    'hazard_type': _confuse(rng, truth_class, district),
                    'model_severity': severity,
                    'physics_severity': round(min(0.999, max(0.05, severity + rng.uniform(-0.12, 0.12))), 4),
                    'confidence': score,
                    'target_date': _shift_day(prediction_date, days),
                    'prediction_date': prediction_date,
                    'model_version': '2.1.9+model.d7b1a5b48aa6',
                })
    return rows, latents


def build_outcomes(rng: random.Random, latents: dict) -> tuple:
    outcomes, deliberate = [], {}
    for district, _, _ in DISTRICTS:
        for horizon, days in HORIZONS:
            for prediction_date in PREDICTION_DATES:
                key = (district, horizon, prediction_date)
                p = latents[key]
                occurred = rng.random() < p
                deliberate[key] = occurred
                if not occurred:
                    continue
                # Two days after the forecast (real lead time) and inside the window.
                start = _shift_day(prediction_date, 2)
                end = _shift_day(prediction_date, 2 + rng.randint(1, max(1, days - 3)))
                outcomes.append({
                    # A stable id: `hash()` is salted per process (PYTHONHASHSEED),
                    # which would make this generator emit different files per run.
                    'event_id': 'evt-' + hashlib.sha256(
                        f'{district}|{horizon}|{prediction_date}'.encode('utf-8')).hexdigest()[:16],
                    'adm2_name': district,
                    'hazard_type': 'Flash Flood' if district in ('Sylhet', 'Sunamganj', 'Kurigram') else 'Flood',
                    'start_date': start,
                    'end_date': end,
                    'severity': round(min(0.99, max(0.2, p + rng.uniform(-0.1, 0.1))), 4),
                    'source': 'emdat',
                })

    # ── awkward cases the harness must classify rather than score ───────────
    last = PREDICTION_DATES[-1]
    # 1. an observed class the model does not predict (must not be folded to Flood)
    outcomes.append({'event_id': 'evt-' + 'a' * 16, 'adm2_name': 'Rangamati',
                     'hazard_type': 'landslide', 'start_date': _shift_day(last, 2),
                     'end_date': _shift_day(last, 3), 'source': 'news'})
    # 2. an outcome that predates its forecast (temporal leakage: excluded)
    outcomes.append({'event_id': 'evt-' + 'b' * 16, 'adm2_name': 'Bogura',
                     'hazard_type': 'Flood', 'start_date': _shift_day(last, -3),
                     'end_date': _shift_day(last, -2), 'source': 'emdat'})
    # 3. an outcome beyond a 7-day horizon (must not be scored against it)
    outcomes.append({'event_id': 'evt-' + 'c' * 16, 'adm2_name': 'Dinajpur',
                     'hazard_type': 'Flood', 'start_date': _shift_day(last, 12),
                     'end_date': _shift_day(last, 13), 'source': 'emdat'})
    return outcomes, deliberate


def build_run(rng: random.Random, *, legacy: bool, rows: int = 300) -> list:
    """A published-forecast run for the drift comparison.

    Both runs describe the same weather; only the schema and the per-day
    normalisation differ. `current_run.csv` additionally carries two districts'
    worth of a *changed* precipitation regime, so a correct implementation reports
    precipitation as drifted while temperature stays stable.
    """
    out = []
    for index in range(rows):
        district, _, base = DISTRICTS[index % len(DISTRICTS)]
        horizon, days = HORIZONS[index % 2]
        temp = round(27.5 + rng.uniform(-2.0, 2.0), 3)
        temp_max = round(temp + 3.5 + rng.uniform(-0.5, 0.5), 3)
        temp_min = round(temp - 3.5 + rng.uniform(-0.5, 0.5), 3)
        dew = round(temp - 2.0 + rng.uniform(-0.6, 0.6), 3)
        precip_day = round(max(0.0, 9.5 + rng.uniform(-4.0, 4.0)), 3)
        if not legacy and index >= rows - 30:
            precip_day = round(precip_day + 9.0, 3)       # the changed regime
        wind_ms = round(max(0.5, 3.4 + rng.uniform(-1.4, 1.4)), 3)
        solar_day = round(max(2.0, 18.4 + rng.uniform(-2.0, 2.0)), 3)
        et_day = round(max(0.2, 3.6 + rng.uniform(-1.0, 1.0)), 3)

        if legacy:
            out.append({
                'district_name': district, 'horizon': f'{days}_days', 'hazard_type': 'Flood',
                'model_severity': 1.0, 'confidence': 0.9999,
                'prediction_date': '2026-06-05', 'target_date': f'2026-06-{5 + days:02d}',
                # legacy units/semantics: °C in a `_k` name, m in `_m`, kJ totals
                'om_temp_2m_k': temp, 'om_max_temp_k': temp_max, 'om_min_temp_k': temp_min,
                'om_dewpoint_k': dew,
                'om_precip_m': round(precip_day * days / 1000.0, 6),
                'om_wind_max_ms': wind_ms,
                'om_solar_rad_j': round(solar_day * days * 1000.0, 3),
                'om_et_sum_m': round(et_day * days, 3),
            })
        else:
            out.append({
                'district_name': district, 'horizon': f'{days}_days', 'hazard_type': 'Flood',
                'model_severity': round(0.8 + rng.uniform(0.0, 0.2), 4),
                'confidence': round(0.8 + rng.uniform(0.0, 0.2), 4),
                'prediction_date': '2026-06-05', 'target_date': f'2026-06-{5 + days:02d}',
                'temperature_mean': temp, 'temperature_max': temp_max, 'temperature_min': temp_min,
                'dewpoint_mean': dew, 'precipitation_mm': precip_day,
                'wind_max_kmh': round(wind_ms * 3.6, 3),
                'solar_radiation_mj_m2': solar_day, 'evapotranspiration_mm': et_day,
            })
    return out


def write_csv(path: Path, rows: list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def generate(output_dir: Path = FIXTURE_DIR) -> dict:
    rng = random.Random(SEED)
    predictions, latents = build_predictions(rng)
    outcomes, _ = build_outcomes(rng, latents)
    reference = build_run(rng, legacy=True)
    current = build_run(rng, legacy=False)

    write_csv(output_dir / 'synthetic_predictions.csv', predictions)
    write_csv(output_dir / 'reference_run.csv', reference)
    write_csv(output_dir / 'current_run.csv', current)
    (output_dir / 'synthetic_outcomes.json').write_text(
        json.dumps(outcomes, indent=2) + '\n', encoding='utf-8')

    return {
        'predictions': len(predictions),
        'outcomes': len(outcomes),
        'reference_run': len(reference),
        'current_run': len(current),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', default=str(FIXTURE_DIR))
    parser.add_argument('--check', action='store_true',
                        help='regenerate into a temp dir and diff against the committed files')
    args = parser.parse_args()

    if args.check:
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            counts = generate(Path(tmp))
            drift = []
            for name in ('synthetic_predictions.csv', 'synthetic_outcomes.json',
                         'reference_run.csv', 'current_run.csv'):
                committed = FIXTURE_DIR / name
                regenerated = Path(tmp) / name
                if not committed.exists() or committed.read_bytes() != regenerated.read_bytes():
                    drift.append(name)
            print(json.dumps({**counts, 'drifted': drift}, indent=2))
            if drift:
                print('❌ fixtures differ from the committed files; re-run without --check')
                return 1
            print('✅ fixtures reproduce byte for byte')
            return 0

    counts = generate(Path(args.out))
    print(json.dumps(counts, indent=2))
    print(f'wrote fixtures to {args.out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
