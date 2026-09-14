#!/usr/bin/env python3
"""
Seed a synthetic, notebook-shaped forecast CSV so the website and the hourly
pipeline have data *before* the Kaggle notebook publishes its first output.

    python scripts/seed_mock_forecasts.py            # write CSV + JSON + snapshot
    python scripts/seed_mock_forecasts.py --dry-run  # validate without writing

This produces the exact file the Kaggle notebook writes to
`/kaggle/working/hazardnet_forecasts_latest.csv` and the hourly workflow
(.github/workflows/hourly_forecast.yml) downloads and commits:

    backend/data/forecasts/hazardnet_forecasts_latest.csv
    backend/data/forecasts/hazardnet_forecasts_latest.json
    frontend/public/data/forecasts-latest.json        (website fallback snapshot)

Output shape is taken from the notebook itself
(kaggle_notebooks/hazardnet-auto-forecast-pipeline): one row per district per
horizon carrying that district's single top-1 hazard, so 64 districts x 2
horizons = 128 rows over 20 columns.

⚠️ THE VALUES ARE SYNTHETIC. They are NOT a forecast and must not be read as
one. Hazard choice is biased by each district's real agro-ecological profile
(references/05_spatial_context/district_division_mapping.json) purely so the
placeholder map looks geographically sensible rather than random — the
severities are invented. Provenance is labelled in the data itself:

  * the `data_source` column reads SYNTHETIC, where the notebook writes
    'Hybrid_Cognitive_Forecast';
  * the website snapshot's top-level `source` is labelled the same way, because
    the UI renders it (DistrictDetailPage shows it as "last satellite update")
    and build_forecast_snapshot.mjs would otherwise claim Kaggle provenance for
    data Kaggle never produced.

Replaced automatically: the next hourly run fetches the real notebook output,
finds no matching manifest sha, and commits the real CSV over this one. Until
then this file is what the site serves, so the labelling matters.

District names, ids and divisions are REAL (id = 1-based alphabetical rank,
matching the notebook's FAO GAUL sort by ADM2_NAME). `pcode` values are
placeholders — the notebook emits real FAO GAUL ADM2_PCODEs, which are not
mirrored anywhere in this repository and are deliberately not fabricated to
look authoritative.
"""

import argparse
import csv
import hashlib
import json
import random
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / 'references' / '05_spatial_context' / 'district_division_mapping.json'
CSV_OUT = ROOT / 'backend' / 'data' / 'forecasts' / 'hazardnet_forecasts_latest.csv'
JSON_OUT = ROOT / 'backend' / 'data' / 'forecasts' / 'hazardnet_forecasts_latest.json'
SNAPSHOT_OUT = ROOT / 'frontend' / 'public' / 'data' / 'forecasts-latest.json'
SNAPSHOT_BUILDER = ROOT / 'scripts' / 'build_forecast_snapshot.mjs'

HORIZONS = [('7_days', 7), ('15_days', 15)]

# Exact column order the notebook's `results.append({...})` produces.
COLUMNS = [
    'district_id', 'district_name', 'division', 'pcode', 'horizon',
    'hazard_type', 'model_severity', 'physics_severity', 'confidence',
    'target_date', 'prediction_date', 'data_source',
    'om_temp_2m_k', 'om_precip_m', 'om_max_temp_k', 'om_min_temp_k',
    'om_dewpoint_k', 'om_solar_rad_j', 'om_wind_max_ms', 'om_et_sum_m',
]

# What the notebook writes instead of DATA_SOURCE.
NOTEBOOK_DATA_SOURCE = 'Hybrid_Cognitive_Forecast'
DATA_SOURCE = 'SYNTHETIC'
SNAPSHOT_SOURCE = ('SYNTHETIC seed — not a real forecast. '
                   'Kaggle notebook output pending.')

# Plausible late-monsoon (September) hazard mix per agro-ecological profile.
# Weights, not switches: every profile can still produce any hazard.
PROFILE_HAZARDS = {
    'Active Floodplains & River Basins': [
        ('Flood', 6), ('Flash Flood', 5), ('Severe Local Storm', 2), ('Drought', 1),
    ],
    'Coastal & Tidal Zones': [
        ('Tropical Cyclone', 5), ('Flood', 4), ('Severe Local Storm', 3), ('Flash Flood', 2),
    ],
    'Haor Basin & Wetlands': [
        ('Flash Flood', 7), ('Flood', 4), ('Severe Local Storm', 2),
    ],
    'Barind Tract & Northern Drought Zones': [
        ('Drought', 6), ('Heat Wave', 3), ('Flood', 2), ('Severe Local Storm', 2),
    ],
    'Hill & Elevated Regions': [
        ('Severe Local Storm', 4), ('Flash Flood', 4), ('Tropical Cyclone', 2), ('Drought', 1),
    ],
}

# Severity band per hazard (invented, but kept inside a range that will not read
# as an emergency if someone glances at the placeholder map).
SEVERITY_BANDS = {
    'Tropical Cyclone':     (0.35, 0.72),
    'Flood':                (0.30, 0.70),
    'Flash Flood':          (0.30, 0.68),
    'Severe Local Storm':   (0.25, 0.60),
    'Drought':              (0.28, 0.64),
    'Heat Wave':            (0.22, 0.55),
    'Cold Wave':            (0.12, 0.30),
    'Fire':                 (0.10, 0.35),
}


def seeded_rng(*parts: object) -> random.Random:
    """Deterministic RNG so regeneration reproduces the file byte-for-byte."""
    digest = hashlib.sha256('|'.join(str(p) for p in parts).encode()).hexdigest()
    return random.Random(int(digest[:16], 16))


def pick_hazard(rng: random.Random, profile: str) -> str:
    options = PROFILE_HAZARDS.get(profile) or [
        (h, 1) for h in SEVERITY_BANDS
    ]
    hazards, weights = zip(*options)
    return rng.choices(hazards, weights=weights, k=1)[0]


def meteorology_for(rng: random.Random, hazard: str, horizon_days: int) -> dict:
    """Open-Meteo-native values consistent with the hazard (September, BD)."""
    if hazard in ('Flood', 'Flash Flood'):
        precip_m, temp_k, wind = rng.uniform(0.020, 0.075), rng.uniform(298.0, 301.5), rng.uniform(6.0, 11.0)
    elif hazard == 'Tropical Cyclone':
        precip_m, temp_k, wind = rng.uniform(0.030, 0.090), rng.uniform(298.0, 300.5), rng.uniform(13.0, 22.0)
    elif hazard == 'Severe Local Storm':
        precip_m, temp_k, wind = rng.uniform(0.010, 0.040), rng.uniform(299.0, 302.0), rng.uniform(9.0, 15.0)
    elif hazard == 'Drought':
        precip_m, temp_k, wind = rng.uniform(0.000, 0.004), rng.uniform(302.0, 305.0), rng.uniform(3.0, 7.0)
    elif hazard == 'Heat Wave':
        precip_m, temp_k, wind = rng.uniform(0.000, 0.005), rng.uniform(303.0, 306.0), rng.uniform(2.0, 6.0)
    elif hazard == 'Cold Wave':
        precip_m, temp_k, wind = rng.uniform(0.000, 0.006), rng.uniform(288.0, 292.0), rng.uniform(3.0, 8.0)
    else:  # Fire
        precip_m, temp_k, wind = rng.uniform(0.000, 0.003), rng.uniform(301.0, 304.0), rng.uniform(6.0, 12.0)

    return {
        'om_temp_2m_k': round(temp_k - rng.uniform(0.5, 2.0), 4),
        'om_precip_m': round(precip_m, 4),
        'om_max_temp_k': round(temp_k + rng.uniform(2.0, 5.0), 4),
        'om_min_temp_k': round(temp_k - rng.uniform(3.0, 6.0), 4),
        'om_dewpoint_k': round(temp_k - rng.uniform(1.0, 4.0), 4),
        'om_solar_rad_j': round(rng.uniform(1.2e7, 2.4e7), 4),
        'om_wind_max_ms': round(wind, 4),
        'om_et_sum_m': round(rng.uniform(0.002, 0.008), 4),
    }


def build_rows(prediction_date: str) -> list:
    reference = json.loads(REFERENCE.read_text(encoding='utf-8'))
    # The notebook sorts FAO GAUL ADM2 features by name, then assigns id = i + 1.
    districts = sorted(reference.items())
    assert len(districts) == 64, f'expected 64 districts in the reference, got {len(districts)}'

    rows = []
    for district_id, (name, meta) in enumerate(districts, start=1):
        for horizon, days in HORIZONS:
            rng = seeded_rng(name, horizon)
            hazard = pick_hazard(rng, meta.get('profile', ''))
            low, high = SEVERITY_BANDS[hazard]
            # Keep the strategic horizon slightly less confident, as the
            # notebook's longer projection generally is.
            severity = round(rng.uniform(low, high), 4)
            lag = 0.0 if horizon == '7_days' else round(rng.uniform(0.02, 0.08), 4)
            physics = round(min(1.0, max(0.0, severity - lag)), 4)
            confidence = round(
                rng.uniform(0.62, 0.86) if horizon == '7_days' else rng.uniform(0.55, 0.78), 4
            )
            target = (datetime.strptime(prediction_date, '%Y-%m-%d')
                      + timedelta(days=days)).strftime('%Y-%m-%d')

            row = {
                'district_id': district_id,
                'district_name': name,
                'division': meta['division'],
                'pcode': f'SYNTH-{district_id:02d}',
                'horizon': horizon,
                'hazard_type': hazard,
                'model_severity': severity,
                'physics_severity': physics,
                'confidence': confidence,
                'target_date': target,
                'prediction_date': prediction_date,
                'data_source': DATA_SOURCE,
            }
            row.update(meteorology_for(rng, hazard, days))
            rows.append(row)
    return rows


def write_csv(rows: list) -> None:
    CSV_OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(CSV_OUT, 'w', newline='', encoding='utf-8') as fh:
        writer = csv.DictWriter(fh, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def write_json(rows: list) -> None:
    """Same shape scripts/fetch_kaggle_forecast.py's csv_to_json() produces."""
    JSON_OUT.write_text(json.dumps(rows, indent=2), encoding='utf-8')


def build_snapshot() -> None:
    """Run the canonical snapshot builder, then relabel its provenance.

    build_forecast_snapshot.mjs hardcodes `source: "kaggle kernels output ..."`
    because it is normally fed real notebook output; for a synthetic seed that
    claim would surface in the UI as a false provenance, so the field is
    rewritten after the build rather than the builder being changed.
    """
    proc = subprocess.run(
        ['node', str(SNAPSHOT_BUILDER), str(CSV_OUT), str(SNAPSHOT_OUT)],
        capture_output=True, text=True, cwd=str(ROOT),
    )
    if proc.returncode != 0:
        sys.exit(f'❌ snapshot build failed:\n{proc.stdout}{proc.stderr}')
    print(proc.stdout.strip())

    snapshot = json.loads(SNAPSHOT_OUT.read_text(encoding='utf-8'))
    snapshot['source'] = SNAPSHOT_SOURCE
    SNAPSHOT_OUT.write_text(json.dumps(snapshot) + '\n', encoding='utf-8')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--prediction-date', default=None,
                        help='YYYY-MM-DD (default: today, UTC)')
    parser.add_argument('--dry-run', action='store_true',
                        help='report what would be written, without writing')
    parser.add_argument('--no-snapshot', action='store_true',
                        help='write the CSV/JSON only; skip the website snapshot. '
                             'Use this if the site should show NOTHING rather than '
                             'synthetic hazard values while the notebook output is '
                             'pending (the frontend falls back to the snapshot, so '
                             'publishing one makes the placeholder public).')
    args = parser.parse_args()

    prediction_date = args.prediction_date or datetime.now(timezone.utc).strftime('%Y-%m-%d')
    rows = build_rows(prediction_date)

    hazards = sorted({r['hazard_type'] for r in rows})
    print(f'rows: {len(rows)} ({len({r["district_name"] for r in rows})} districts '
          f'x {len(HORIZONS)} horizons), prediction_date={prediction_date}')
    print(f'hazards covered: {len(hazards)} — {", ".join(hazards)}')
    print(f'severity range: {min(r["model_severity"] for r in rows):.2f}'
          f'–{max(r["model_severity"] for r in rows):.2f}, '
          f'confidence {min(r["confidence"] for r in rows):.2f}'
          f'–{max(r["confidence"] for r in rows):.2f}')

    if args.dry_run:
        print('\n--dry-run: nothing written.')
        return

    write_csv(rows)
    print(f'✅ {CSV_OUT.relative_to(ROOT)}')
    write_json(rows)
    print(f'✅ {JSON_OUT.relative_to(ROOT)}')

    if args.no_snapshot:
        print(f'⚠️  Skipped {SNAPSHOT_OUT.relative_to(ROOT)} (--no-snapshot): the '
              'website keeps whatever snapshot is committed, so the synthetic '
              'values are not published.')
        return

    build_snapshot()
    print(f'✅ {SNAPSHOT_OUT.relative_to(ROOT)} (source relabelled as synthetic)')
    print('⚠️  This snapshot is what the public site serves until the first real '
          'notebook run replaces it.')


if __name__ == '__main__':
    main()


# Kept for reference so the synthetic marker cannot silently drift away from
# what the notebook writes.
assert NOTEBOOK_DATA_SOURCE != DATA_SOURCE
