#!/usr/bin/env python3
"""`python -m hindcast.cli` — run a hindcast episode, then check what was committed.

    run    --episode PATH [--out PATH] [--drivers PATH] [--refresh-drivers]
    check  [--reports-dir DIR] [--drivers-dir DIR]
    list   [--episodes-dir DIR]

The flow the workflow uses (`.github/workflows/hindcast.yml`):

    python -m hindcast.cli run --episode ../data/hindcast/episodes/amphan-2020.json \
        --refresh-drivers            # fetch drivers -> data/hindcast/drivers/amphan-2020.json
    python -m hindcast.cli check     # recompute every number from the committed drivers

`--refresh-drivers` is the only network path in the package. Everything else — including
`check` — runs offline, which is the point: the committed report can be re-derived from the
committed episode and the committed driver series by anyone, at any time, without a
credential. `check` rebuilds the whole report and compares a clock-free projection, so a
hand-edited number fails CI rather than shipping.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from . import HINDCAST_VERSION, REPORT_SCHEMA
from . import episodes as episode_module
from . import fetch as fetch_module
from . import score as score_module

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from mlops import evaluate as evaluate_module  # noqa: E402

REPO_ROOT = SCRIPTS_DIR.parent
DISTRICT_TABLE_TS = REPO_ROOT / 'frontend' / 'src' / 'data' / 'bangladeshDistricts.ts'
DEFAULT_EPISODES_DIR = REPO_ROOT / 'data' / 'hindcast' / 'episodes'
DEFAULT_REPORTS_DIR = REPO_ROOT / 'data' / 'hindcast' / 'reports'
DEFAULT_DRIVERS_DIR = REPO_ROOT / 'data' / 'hindcast' / 'drivers'
DEFAULT_CACHE_DIR = REPO_ROOT / 'data' / 'hindcast' / 'cache'
SENSITIVITY_THRESHOLDS = (0.40, 0.50, 0.65)

#: One row per district in the app's table: id, name, division, lat, lng. Parsed rather than
#: duplicated because the live pipeline draws its own coordinates from Earth Engine over the
#: network, and this table is the only committed point-per-district source. The authoritative
#: boundaries remain GEE/HDX (ADR 0005); a single point per district is what the pipeline
#: itself samples (`get_openmeteo_forecast(dist['lat'], dist['lon'])`).
_DISTRICT_ROW = re.compile(
    r"\{\s*id:\s*'([^']+)',\s*name:\s*(?:'((?:[^'\\]|\\.)*)'|\"([^\"]*)\"),\s*"
    r"division:\s*'([^']+)',\s*lat:\s*(-?[\d.]+),\s*lng:\s*(-?[\d.]+)"
)

#: Fields that differ between two runs of the same episode for reasons that are not the
#: hindcast's science (the clock, and where the drivers happened to be read from).
CLOCK_FIELDS = ('generated_at',)


def district_locations() -> list:
    text = DISTRICT_TABLE_TS.read_text(encoding='utf-8')
    rows = []
    for match in _DISTRICT_ROW.finditer(text):
        identifier, single, double, division, lat, lng = match.groups()
        name = (single if single is not None else double).replace("\\'", "'")
        rows.append({'id': identifier, 'name': name, 'division': division,
                     'lat': float(lat), 'lng': float(lng)})
    if len(rows) != 64:
        raise SystemExit(
            f'{DISTRICT_TABLE_TS}: parsed {len(rows)} districts, expected 64 — the table format '
            'changed; fix the parser before trusting a hindcast'
        )
    return rows


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def _write_temp(rows: list, stem: str) -> Path:
    """`mlops.evaluate` reads files; keep the scratch copy outside the repository tree."""
    directory = Path(tempfile.gettempdir()) / 'hazardnet-hindcast'
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f'{stem}.json'
    path.write_text(json.dumps(rows), encoding='utf-8')
    return path


def build_report(episode: dict, *, series: dict, drivers_path: str, now: str | None = None,
                 alarm_threshold: float | None = None, min_matched: int | None = None) -> dict:
    """Assemble the report from drivers already in hand (no network, no clock, in here)."""
    scoring = episode.get('scoring', {})
    threshold = float(
        alarm_threshold if alarm_threshold is not None
        else scoring.get('alarm_threshold', evaluate_module.DEFAULT_ALARM_THRESHOLD)
    )
    min_matched_value = int(min_matched if min_matched is not None else scoring.get('min_matched', 30))
    absence_means_no_event = bool(scoring.get('absence_means_no_event', False))

    predictions = score_module.prediction_rows(episode, district_locations(), series)
    outcomes = score_module.outcome_rows(episode)
    if not predictions:
        raise SystemExit('no prediction rows could be built — the driver series is empty')

    evaluation = evaluate_module.evaluate(
        _write_temp(predictions, 'predictions'),
        _write_temp(outcomes, 'outcomes'),
        min_matched=min_matched_value,
        alarm_threshold=threshold,
        absence_means_no_event=absence_means_no_event,
    )
    evaluation.pop('inputs', None)  # temp paths are not evidence; see `drivers` below

    joined = evaluate_module.match_pairs(
        predictions, outcomes, absence_means_no_event=absence_means_no_event,
    )
    sensitivity = []
    for candidate in SENSITIVITY_THRESHOLDS:
        scored = evaluate_module.score_evaluation(joined, alarm_threshold=candidate)
        sensitivity.append({
            'alarm_threshold': candidate,
            'scored_samples': scored['scored_samples'],
            'hits': scored['events']['hits'],
            'misses': scored['events']['misses'],
            'false_alarms': scored['events']['false_alarms'],
            'pod': scored['events']['pod'],
            'far': scored['events']['far'],
            'note': (
                'PRODUCT_SPEC §1.3 WATCH band' if abs(candidate - 0.40) < 1e-9
                else 'PRODUCT_SPEC §1.3 WARNING band' if abs(candidate - 0.65) < 1e-9
                else 'harness default'
            ),
        })

    # Districts the physics track alarmed on that the truth set does not name. No record is
    # not absence, so these are reported as unknown — never as false alarms, never dropped.
    alarmed_no_record = []
    for pair in joined['pairs']:
        severity = pair['severity']
        if severity is None or severity < threshold:
            continue
        if not pair['observed'] and pair['truth_source'] == 'absence':
            alarmed_no_record.append(
                f"{pair['district']} ({pair['hazard_type']} {severity:.3f}, {pair['prediction_date']})"
            )

    report = {
        'schema': REPORT_SCHEMA,
        'hindcast_version': HINDCAST_VERSION,
        'generated_at': now or _utc_now(),
        'episode': episode_module.audit_summary(episode),
        'detection': detection_summary(episode, predictions, threshold),
        'what_was_hindcast': {
            'physics_track': True,
            'cnn_evaluated': False,
            'cnn_note': score_module.SCORE_SOURCE_NOTE,
            'drivers': {
                'product': fetch_module.PRODUCT,
                'endpoint': fetch_module.ARCHIVE_URL,
                'variables': list(fetch_module.DAILY_VARIABLES),
                'driver_series_loaded_from': drivers_path,
                'is_forecast': False,
                'is_forecast_note': (
                    'Reanalysis knows the weather that occurred inside the window. This measures '
                    'whether the physics track, given that weather, flags the districts that were '
                    'hit — a ceiling on detection, not forecast skill. A lead-time hindcast needs '
                    'archived forecast fields (ECMWF MARS/CDS), which this harness has no '
                    'credential for.'
                ),
                'aggregation': {
                    'precip_total_mm': 'sum of daily precipitation over the window',
                    'precip_peak_mm': 'wettest day in the window (the live pipeline uses the peak '
                                      '6-hourly accumulation, so a forward-flood term is understated)',
                    'temp_max_c': 'maximum daily maximum', 'temp_min_c': 'minimum daily minimum',
                    'wind_max_kmh': 'maximum daily maximum', 'et_total_mm': 'sum of daily ET0',
                },
            },
            'how_to_read': [
                '`evaluation.scores.events` is class-strict: an alarm is a hit only when the '
                'predict track *named* the class that occurred. A district correctly flagged under '
                'a different class therefore appears there as a false alarm, which is why the '
                'class-agnostic `detection.flagged_any_class` exists — read them together.',
                '`evaluation.scores.per_class` is one-vs-rest per class. `pod: 0.0` with '
                '`misses: N` for the episode class means the track never named that class, not '
                'that it scored the district low; `detection.episode_class_over_threshold` '
                'separates the two.',
                '`detection` counts over the districts the sources name, per horizon.',
                'Nothing in this report covers a district nobody named. Unknown is not clear, and '
                'the far column is unmeasurable rather than zero when no negative sample exists.',
            ],
            'alarm_threshold': threshold,
            'min_matched': min_matched_value,
            'absence_means_no_event': absence_means_no_event,
            'absence_means_no_event_reason': scoring.get('absence_means_no_event_reason'),
            'horizons': [
                {
                    'name': name,
                    'lead_days': lead_days,
                    'prediction_date': fetch_module.window_bounds(
                        episode['event']['onset_date'], lead_days)[0],
                    'target_date': episode['event']['onset_date'],
                }
                for name, lead_days in score_module.HORIZONS
            ],
        },
        'counts': {
            'predictions': len(predictions),
            'districts': len({row['district_name'] for row in predictions}),
            'outcomes_named': len(outcomes),
            'matched_pairs': len(joined['pairs']),
            'prediction_windows_without_an_outcome': len(joined['unmatched_no_outcome']),
            'outcomes_not_relevant_to_a_window': joined['not_relevant'],
        },
        'evaluation': evaluation,
        'threshold_sensitivity': sensitivity,
        'per_district': score_module.per_district(episode, predictions),
        'alarmed_without_a_recorded_impact': {
            'count': len(alarmed_no_record),
            'examples': sorted(alarmed_no_record)[:10],
            'interpretation': (
                'These district-windows crossed the alarm threshold with no outcome on record. They '
                'are UNKNOWN, not false alarms: the truth set names the districts the cited '
                'assessments report, and nobody claims to have surveyed all 64. Measuring the '
                'false-alarm ratio needs the historical event archive loaded (owner Action 12).'
            ),
        },
        'caveats': list(episode.get('known_limitations', [])),
        'citations': [
            {'id': row['id'], 'citation': row['citation'], 'url': row['url'], 'accessed': row['accessed']}
            for row in episode['sources']
        ],
    }
    # The evaluation's own status/reason stay inside `evaluation`; nothing here rewrites them.
    return report


def detection_summary(episode: dict, predictions: list, threshold: float) -> dict:
    """Did the track put the named districts on the list — and under which class?

    Three numbers, because "detected" hides a real distinction that the evaluation alone
    does not separate:

    * `flagged_any_class` — the district's strongest score crossed the threshold. This is the
      operational question ("would a duty officer have seen this district?"), and it is
      class-agnostic: a cyclone-affected district flagged as `Severe Local Storm` is still a
      district that reached a human.
    * `flagged_episode_class` — the track's *top* class for that district was the class that
      actually occurred. This is the class-fidelity question, and it is where a formula
      family that cannot separate two wind-driven classes shows up.
    * `episode_class_over_threshold` — the score *for the episode's class* crossed the
      threshold even where another class topped it.

    Reported over the named districts only, with the per-horizon view, because a hit at one
    horizon and a miss at the other is a lead-time fact worth seeing.
    """
    by_district: dict = {}
    for row in predictions:
        by_district.setdefault(row['district_name'], []).append(row)

    rows = []
    for entry in episode_module.affected_districts(episode):
        district_rows = by_district.get(entry['district'], [])
        strongest = max((row['severity_score'] or 0.0) for row in district_rows) if district_rows else None
        flagged = [row for row in district_rows if (row['severity_score'] or 0.0) >= threshold]
        named_class = [row for row in district_rows if row.get('physics_agreement_with_episode_class')
                       and (row['severity_score'] or 0.0) >= threshold]
        class_over = [row for row in district_rows
                      if (row.get('physics_score_of_episode_class') or 0.0) >= threshold]
        top = max(district_rows, key=lambda row: row['severity_score'] or 0.0, default=None)
        rows.append({
            'district': entry['district'],
            'tier': entry.get('tier'),
            'horizons_scored': len(district_rows),
            'flagged_any_class': bool(flagged),
            'flagged_episode_class': bool(named_class),
            'episode_class_over_threshold': bool(class_over),
            'strongest_score': None if strongest is None else round(strongest, 4),
            'strongest_class': None if top is None else top['hazard_type'],
            'flag_horizons': sorted(row['horizon'] for row in flagged),
        })

    named = len(rows)
    def count(key):
        return sum(1 for row in rows if row[key])

    return {
        'named_districts': named,
        'districts_with_a_scored_row': sum(1 for row in rows if row['horizons_scored']),
        'flagged_any_class': count('flagged_any_class'),
        'flagged_episode_class': count('flagged_episode_class'),
        'episode_class_over_threshold': count('episode_class_over_threshold'),
        'alarm_threshold': threshold,
        'interpretation': (
            'Detection counts over the districts the sources name. There is no "not detected, '
            'therefore clear" claim anywhere in this report: unnamed districts are unknown, and '
            'the false-alarm ratio is measurable only when the historical archive is loaded.'
        ),
        'per_horizon': {
            name: {
                'named_districts_with_a_row': sum(
                    1 for row in rows
                    if any(items['horizon'] == name for items in by_district.get(row['district'], []))
                ),
                'flagged_any_class': sum(
                    1 for row in rows
                    if any((items['severity_score'] or 0.0) >= threshold and items['horizon'] == name
                           for items in by_district.get(row['district'], []))
                ),
            }
            for name, _ in score_module.HORIZONS
        },
        'per_district': rows,
    }


def stable_view(report: dict) -> dict:
    """The projection `check` compares: everything except the clock."""
    view = json.loads(json.dumps(report))
    for field in CLOCK_FIELDS:
        view.pop(field, None)
    view['what_was_hindcast']['drivers'].pop('driver_series_loaded_from', None)
    return view


def drivers_path_for(episode_id: str, drivers_dir=DEFAULT_DRIVERS_DIR) -> Path:
    return Path(drivers_dir) / f'{episode_id}.json'


def cmd_run(args) -> int:
    episode = episode_module.load_episode(args.episode)
    drivers_path = Path(args.drivers) if args.drivers else drivers_path_for(episode['id'], args.drivers_dir)

    if args.refresh_drivers:
        locations = district_locations()
        start = min(
            fetch_module.window_bounds(episode['event']['onset_date'], lead_days)[0]
            for _, lead_days in score_module.HORIZONS
        )
        series = fetch_module.fetch_daily(
            locations, start, episode['event']['onset_date'], cache_dir=args.cache_dir,
        )
        fetch_module.save_series(series, drivers_path, episode_id=episode['id'],
                                 start_date=start, end_date=episode['event']['onset_date'])
        print(f'drivers        : fetched {len(series)} stations '
              f'{start}..{episode["event"]["onset_date"]} → {drivers_path}')
    elif not drivers_path.exists():
        raise SystemExit(
            f'no driver series at {drivers_path}. Fetch it once with --refresh-drivers '
            '(needs network), or point --drivers at a committed series.'
        )

    series = fetch_module.load_series(drivers_path)
    report = build_report(episode, series=series, drivers_path=str(drivers_path),
                          alarm_threshold=args.alarm_threshold, min_matched=args.min_matched)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')

    status = report['evaluation']['status']
    print(f"episode        : {report['episode']['id']} — {report['episode']['title']}")
    print('hazard class   : '
          f"{report['episode']['hazard_class']} (physics track only; CNN not re-run)")
    print(f"truth          : {report['counts']['outcomes_named']} named districts "
          f"({report['episode']['truth_completeness']})")
    print(f"predictions    : {report['counts']['predictions']} rows over "
          f"{report['counts']['districts']} districts")
    if report['evaluation'].get('scores'):
        events = report['evaluation']['scores']['events']
        print(f"detection      : hits {events['hits']} · misses {events['misses']} · "
              f"POD {events['pod']} · FAR {events['far']}")
    print(f"evaluation     : {status}"
          + (f" — {report['evaluation'].get('reason')}" if report['evaluation'].get('reason') else ''))
    print(f"warning        : {report['alarmed_without_a_recorded_impact']['count']} alarmed "
          'district-windows have no recorded outcome — unknown, not false alarms')
    print(f"wrote          : {out}")
    if status != 'ok':
        print(f'NOTE: {status} is a reported outcome, not a failure of the run — the report names '
              'the district-window pairs it could not score and why.')
    return 0


def cmd_check(args) -> int:
    reports = sorted(Path(args.reports_dir).glob('*.json'))
    failures = []
    checked = 0
    for path in reports:
        stored = json.loads(path.read_text(encoding='utf-8'))
        name = path.name

        def fail(message: str, name=name):
            failures.append(f'{name}: {message}')

        if stored.get('schema') != REPORT_SCHEMA:
            fail(f"schema {stored.get('schema')!r} != {REPORT_SCHEMA!r}")
            continue
        episode_path = stored.get('episode', {}).get('episode_path')
        if not episode_path:
            fail('no episode_path recorded')
            continue
        candidate = Path(episode_path)
        if not candidate.exists():
            candidate = REPO_ROOT / episode_path
        if not candidate.exists():
            fail(f'episode file {episode_path} is missing')
            continue
        episode = episode_module.load_episode(candidate)
        if episode['_sha256'] != stored['episode'].get('episode_sha256'):
            fail('the episode file changed since this report was written — re-run the hindcast')
            continue

        drivers = Path(args.drivers_dir) / f"{episode['id']}.json"
        if not drivers.exists():
            fail(f'no committed driver series at {drivers} — run with --refresh-drivers')
            continue
        series = fetch_module.load_series(drivers)
        rebuilt = build_report(episode, series=series, drivers_path=str(drivers),
                               now=stored.get('generated_at'))
        if stable_view(rebuilt) != stable_view(stored):
            fail('recomputation from the committed drivers disagrees with the report '
                 '(run the hindcast again and inspect the diff)')
            continue
        named = {entry['district'] for entry in episode_module.affected_districts(episode)}
        tabled = {row['district'] for row in stored.get('per_district', [])}
        if named - tabled:
            fail(f'per_district omits {sorted(named - tabled)}')
            continue
        if stored['what_was_hindcast']['cnn_evaluated']:
            fail('claims the CNN was evaluated, which this harness cannot do')
            continue
        if not stored.get('citations'):
            fail('no citations attached to the truth set')
            continue
        checked += 1

    if failures:
        for line in failures:
            print(f'::error::hindcast check — {line}')
        return 1
    if not reports:
        if getattr(args, 'require_reports', False):
            print(f'::error::hindcast check — no reports in {args.reports_dir}, and '
                  '--require-reports was passed')
            return 1
        print(f'no hindcast reports in {args.reports_dir} — nothing to check')
        return 0
    print(f'✅ {checked} hindcast report(s) recomputed from their committed episodes and driver '
          'series — every number matches')
    return 0


def cmd_list(args) -> int:
    for path in sorted(Path(args.episodes_dir).glob('*.json')):
        episode = episode_module.load_episode(path)
        drivers = drivers_path_for(episode['id'])
        print(f"{episode['id']:<14} {episode['event']['onset_date']}  "
              f"{episode['hazard_class']:<16} {len(episode['truth']['affected']):>2} named districts  "
              f"drivers {'✓' if drivers.exists() else '—'}  {episode['title']}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog='python -m hindcast.cli', description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)

    run = sub.add_parser('run', help='score one episode')
    run.add_argument('--episode', required=True)
    run.add_argument('--out', required=True, help='where the report is written (the deliverable)')
    run.add_argument('--drivers', help='driver series path (default: data/hindcast/drivers/<id>.json)')
    run.add_argument('--drivers-dir', default=str(DEFAULT_DRIVERS_DIR))
    run.add_argument('--refresh-drivers', action='store_true',
                     help='fetch the driver series from the archive (network) and overwrite it')
    run.add_argument('--cache-dir', default=str(DEFAULT_CACHE_DIR))
    run.add_argument('--alarm-threshold', type=float, default=None)
    run.add_argument('--min-matched', type=int, default=None)
    run.set_defaults(func=cmd_run)

    check = sub.add_parser('check', help='recompute committed reports from committed inputs')
    check.add_argument('--reports-dir', default=str(DEFAULT_REPORTS_DIR))
    check.add_argument('--drivers-dir', default=str(DEFAULT_DRIVERS_DIR))
    check.add_argument('--require-reports', action='store_true',
                       help='fail when no report is committed (CI uses this so a deleted '
                            'report cannot pass as "nothing to check")')
    check.set_defaults(func=cmd_check)

    listing = sub.add_parser('list', help='list the committed episodes')
    listing.add_argument('--episodes-dir', default=str(DEFAULT_EPISODES_DIR))
    listing.set_defaults(func=cmd_list)
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == '__main__':
    raise SystemExit(main())
