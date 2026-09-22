#!/usr/bin/env python3
"""`python -m mlops.cli` — the Phase 3 MLOps surface.

Subcommands (all offline, all dependency-free, all `--json`-able):

    audit        handshake/artifact inventory — exit 1 on a mismatch
    registry     build or refresh `Models/REGISTRY.json`
    evaluate     score predictions against observed outcomes (POD/FAR/CSI + reliability)
    drift        PSI between a reference run and the current run
    calibrate    fit an isotonic/Platt map on labelled outcomes
    apply-calibration  stamp a fitted map onto a forecast CSV (flips `confidence_kind`)
    promote      evaluate + record a champion/challenger promotion

Exit codes: 0 = success, 1 = the operation ran but the result is bad (a mismatch,
insufficient truth when `--fail-on` was asked for), 2 = the input or arguments were
unusable. The distinction matters in CI: "we could not measure" and "we measured a
problem" are different failures and both need to be visible.

Nothing here writes to the repository unless the invocation says so (`--write`),
and the two commands that can change what the pipeline publishes refuse unless
their preconditions hold (see `scripts/mlops/calibration.py` for the map rules and
`scripts/mlops/registry.py` for the promotion gates).
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from mlops import MLOPS_VERSION, REPO_ROOT  # noqa: E402
from mlops import drift as drift_module  # noqa: E402
from mlops import evaluate as evaluate_module  # noqa: E402
from mlops import registry as registry_module  # noqa: E402
from mlops.calibration import CalibrationError, CalibrationMap  # noqa: E402

DEFAULT_REGISTRY = REPO_ROOT / 'Models' / 'REGISTRY.json'


def _emit(payload, path):
    """Print the summary and optionally write the full JSON report.

    The JSON is written with a trailing newline and sorted keys so a committed
    report and a regenerated one diff cleanly.
    """
    if path:
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(payload, indent=2, sort_keys=True) + '\n', encoding='utf-8')
        print(f'  wrote {target}')


# ── audit ───────────────────────────────────────────────────────────────────

def cmd_audit(args) -> int:
    result = registry_module.audit()
    print(f"artifact audit: {'ok' if result['ok'] else 'problems found'}")
    print(f"  handshake {result['handshake']['version']} "
          f"({len(result['handshake']['claimed_artifacts'])} claimed artifacts)")
    for entry in result['entries']:
        role = entry.get('role') or 'unclassified'
        stage = f" [{entry['stage']}]" if entry.get('stage') else ''
        duplicate = f" (duplicate of {entry['duplicate_of']})" if entry.get('duplicate_of') else ''
        print(f"  {entry['status']:12s} {entry['id']:28s} {role}{stage}{duplicate}")
    for key, values in result['problems'].items():
        for value in values:
            print(f"  ⚠ {key}: {value}")
    print(f"  champions: {', '.join(result['champions']) or 'none'}")
    _emit({'schema': registry_module.SCHEMA, 'mlops_version': MLOPS_VERSION, **result}, args.json)
    return 0 if result['ok'] else 1


# ── registry ────────────────────────────────────────────────────────────────

def cmd_registry(args) -> int:
    out = Path(args.out) if args.out else DEFAULT_REGISTRY
    stages, approvals = {}, {}
    if out.exists():
        # Rebuilding must not lose a promotion: the stages and approvals already on
        # disk are carried over, everything else is re-derived from the bytes.
        try:
            existing = json.loads(out.read_text(encoding='utf-8'))
            for entry in existing.get('entries') or []:
                if entry.get('stage'):
                    stages[entry['id']] = entry['stage']
                if entry.get('approval'):
                    approvals[entry['id']] = entry['approval']
        except json.JSONDecodeError:
            print(f'  ⚠ {out} is not valid JSON; rebuilding from scratch')

    registry = registry_module.build_registry(stages=stages, approvals=approvals)
    problems = registry_module.validate_registry(registry)
    print(f"registry: {len(registry['entries'])} artifacts, "
          f"champion{'s' if len(registry['champions']) != 1 else ''} {', '.join(registry['champions']) or 'none'}")
    for problem in problems:
        print(f'  ❌ {problem}')
    if args.write:
        if problems:
            print('  refusing to write an invalid registry')
            return 1
        # `build_registry` already carried the stages and approvals over (that is
        # what keeps a promotion from being erased by a rebuild).
        status = registry_module.write_registry(registry, out)
        print(f"  {status}: {out}")
    else:
        print('  (dry run — pass --write to update the registry file)')
    _emit(registry, args.json)
    return 0 if not problems else 1


# ── evaluate ────────────────────────────────────────────────────────────────

def cmd_evaluate(args) -> int:
    report = evaluate_module.evaluate(
        args.predictions, args.outcomes,
        max_lead_days=args.max_lead_days, bins=args.bins, min_matched=args.min_matched,
        absence_means_no_event=args.absence_means_no_event,
        alarm_threshold=args.alarm_threshold, near_days=args.near_days,
    )
    print(evaluate_module.render_summary(report))
    _emit(report, args.json)
    return _exit_for(report, args)


def _exit_for(report, args) -> int:
    """Apply `--fail-on` so a workflow can choose what counts as a failure."""
    fail_on = set(getattr(args, 'fail_on', None) or [])
    if not fail_on:
        return 0
    if 'insufficient_truth' in fail_on and report.get('status') == 'insufficient_truth':
        return 1
    if 'any' in fail_on and report.get('status') != 'ok':
        return 1
    if 'significant_drift' in fail_on and report.get('status') == 'significant_drift':
        return 1
    return 0


# ── drift ───────────────────────────────────────────────────────────────────

def cmd_drift(args) -> int:
    report = drift_module.run(args.reference, args.current,
                              min_samples=args.min_samples, severity_column=args.severity_column)
    print(drift_module.render_summary(report))
    _emit(report, args.json)
    return _exit_for(report, args)


# ── calibrate ───────────────────────────────────────────────────────────────

def cmd_calibrate(args) -> int:
    """Fit a map on labelled predictions. Refuses without enough truth."""
    try:
        predictions = evaluate_module.load_predictions(args.fit_from)
        outcomes = evaluate_module.load_outcomes(args.outcomes)
    except evaluate_module.EvaluationError as exc:
        print(f'❌ {exc}')
        return 2

    joined = evaluate_module.match_pairs(
        predictions, outcomes, absence_means_no_event=args.absence_means_no_event,
        near_days=args.near_days,
    )
    pairs = [pair for pair in joined['pairs'] if pair['confidence'] is not None]
    scores = [pair['confidence'] for pair in pairs]
    labels = [1 if pair['observed'] else 0 for pair in pairs]
    if not pairs:
        print('❌ no prediction could be joined to an observed outcome, so there is nothing to fit on.')
        print('   A calibration map must be fitted on labelled outcomes; fitting it on the model\'s')
        print('   own scores would reproduce them and label the result "calibrated".')
        return 2
    if len(pairs) < args.min_samples:
        print(f'❌ only {len(pairs)} labelled predictions (need {args.min_samples}). Refusing to fit.')
        print('   A map fitted on a handful of rows reproduces the sample, not the phenomenon.')
        return 2

    try:
        calibration = CalibrationMap.fit(
            scores, labels, method=args.method, bins=args.bins,
            fit_period=args.fit_period, fitted_on=args.fitted_on,
            fit_source={'predictions': str(args.fit_from), 'outcomes': str(args.outcomes)},
            label_definition=args.label_definition,
        )
    except CalibrationError as exc:
        print(f'❌ {exc}')
        return 2

    print(f"fitted {args.method} on {len(pairs)} labelled predictions "
          f"(base rate {calibration.payload['base_rate']})")
    print(f"  Brier {calibration.payload['brier_raw']} -> {calibration.payload['brier']} "
          f"| ECE {calibration.payload['ece_raw']} -> {calibration.payload['ece']}")
    for score in (0.5, 0.75, 0.9, 0.95, 0.99, 1.0):
        print(f"  raw {score:.2f} -> calibrated {calibration.apply(score)}")

    problems = calibration.validate()
    for problem in problems:
        print(f'  ⚠ {problem}')
    if problems and not args.allow_invalid:
        print('  refusing to write an invalid map (pass --allow-invalid to inspect it anyway)')
        return 1
    if args.out:
        print(f"  wrote {calibration.save(args.out)}")
    _emit(calibration.payload, args.json)
    return 0


# ── apply-calibration ───────────────────────────────────────────────────────

def cmd_apply_calibration(args) -> int:
    """Stamp a fitted map onto a forecast CSV.

    This is the step that changes what `confidence` *means*: the raw softmax is
    preserved in `confidence_raw`, `confidence_calibrated` carries the map's output
    and `confidence_kind` becomes `calibrated_probability`, which the API copies
    through to consumers (`backend/utils/forecastRow.js`). It refuses to run when
    the map is unfit, unvalidated or was fitted on this very file — see the rules
    in `scripts/mlops/calibration.py`.
    """
    try:
        calibration = CalibrationMap.load(args.map)
    except (OSError, CalibrationError) as exc:
        print(f'❌ cannot load calibration map: {exc}')
        return 2

    problems = calibration.validate()
    if problems:
        print('❌ refusing to stamp a calibrated probability from this map:')
        for problem in problems:
            print(f'   - {problem}')
        return 2

    source = Path(args.csv)
    if not source.exists():
        print(f'❌ {source} does not exist')
        return 2
    rows = list(csv.DictReader(source.read_text(encoding='utf-8').splitlines()))
    if not rows:
        print(f'❌ {source} has no rows')
        return 2
    if 'confidence' not in rows[0]:
        print(f'❌ {source} has no `confidence` column to calibrate')
        return 2

    changed = 0
    for index, row in enumerate(rows):
        raw = row.get('confidence')
        if raw in (None, ''):
            row['confidence_raw'] = ''
            row['confidence_calibrated'] = ''
            row['confidence_kind'] = ''
            continue
        try:
            value = float(raw)
        except ValueError:
            print(f'❌ row {index + 2}: confidence {raw!r} is not a number')
            return 2
        row['confidence_raw'] = raw
        row['confidence_calibrated'] = str(calibration.apply(value))
        row['confidence_kind'] = 'calibrated_probability'
        changed += 1

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0].keys())
    with out.open('w', encoding='utf-8', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f'rewrote {out} with `confidence_calibrated` on {changed}/{len(rows)} rows '
          f'(map: {calibration.payload["method"]}, fitted on {calibration.payload["samples"]} samples)')
    print('  consumers read the calibrated value and see confidence_kind=calibrated_probability;')
    print('  the raw softmax stays available as confidence_raw.')
    return 0


# ── promote ─────────────────────────────────────────────────────────────────

def cmd_promote(args) -> int:
    registry_path = Path(args.registry) if args.registry else DEFAULT_REGISTRY
    try:
        registry = registry_module.load_registry(registry_path)
    except registry_module.RegistryError as exc:
        print(f'❌ {exc}')
        return 2

    try:
        challenger_report = json.loads(Path(args.report).read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as exc:
        print(f'❌ cannot read the challenger report: {exc}')
        return 2
    champion_report = None
    if args.champion:
        try:
            champion_report = json.loads(Path(args.champion).read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError) as exc:
            print(f'❌ cannot read the champion report: {exc}')
            return 2

    decision = registry_module.evaluate_promotion(
        challenger_report, champion_report, approver=args.by,
    )
    print(f"promotion decision: {decision['decision']}")
    for comparison in decision['comparisons']:
        print(f"  {comparison['metric']}: challenger {comparison['challenger']} "
              f"vs champion {comparison['champion']} — {comparison['verdict']}")
    for reason in decision['reasons']:
        print(f'  ❌ {reason}')

    if decision['decision'] != 'approved':
        _emit({'decision': decision, 'mlops_version': MLOPS_VERSION}, args.json)
        return 1

    try:
        updated = registry_module.apply_promotion(
            registry, artifact=args.artifact, approver=args.by, decision=decision, stage=args.stage,
        )
    except registry_module.RegistryError as exc:
        print(f'❌ {exc}')
        return 1

    print(f"  promoting {args.artifact} to {args.stage} (approved by {args.by})")
    print(f"  champions now: {', '.join(updated['champions'])}")
    if args.write:
        status = registry_module.write_registry(updated, registry_path)
        print(f"  {status}: {registry_path}")
    else:
        print('  (dry run — pass --write to record the promotion)')
    _emit(updated, args.json)
    return 0


# ── wiring ──────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog='mlops.cli', description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)

    audit = sub.add_parser('audit', help='audit the artifact handshake against the bytes on disk')
    audit.add_argument('--json', help='write the full audit report here')
    audit.set_defaults(func=cmd_audit)

    registry = sub.add_parser('registry', help='build the model registry document')
    registry.add_argument('--out', help=f'registry path (default {DEFAULT_REGISTRY})')
    registry.add_argument('--write', action='store_true', help='write the registry file')
    registry.add_argument('--json', help='write the full registry here')
    registry.set_defaults(func=cmd_registry)

    evaluation = sub.add_parser('evaluate', help='score predictions against observed outcomes')
    evaluation.add_argument('--predictions', required=True)
    evaluation.add_argument('--outcomes', required=True)
    evaluation.add_argument('--max-lead-days', type=int, default=evaluate_module.DEFAULT_MAX_LEAD_DAYS)
    evaluation.add_argument('--min-matched', type=int, default=30,
                            help='below this many matched predictions the status is insufficient_truth')
    evaluation.add_argument('--bins', type=int, default=10)
    evaluation.add_argument('--absence-means-no-event', action='store_true',
                            help='treat a district-window with no recorded event as a negative sample '
                                 '(only legitimate when the archive is known complete for that scope)')
    evaluation.add_argument('--alarm-threshold', type=float, default=evaluate_module.DEFAULT_ALARM_THRESHOLD,
                            help='severity at which a row counts as an alert (PRODUCT_SPEC §1.3 thresholds '
                                 'arrive with the Phase 4 alert engine)')
    evaluation.add_argument('--near-days', type=int, default=evaluate_module.DEFAULT_NEAR_DAYS,
                            help='how close an outcome must be to the window to be reported as a near-miss')
    evaluation.add_argument('--json', help='write the full evaluation report here')
    evaluation.add_argument('--fail-on', action='append', choices=['insufficient_truth', 'significant_drift', 'any'],
                            help='exit non-zero on this condition (repeatable)')
    evaluation.set_defaults(func=cmd_evaluate)

    drift = sub.add_parser('drift', help='PSI between a reference run and the current run')
    drift.add_argument('--reference', required=True)
    drift.add_argument('--current', required=True)
    drift.add_argument('--min-samples', type=int, default=drift_module.MIN_SAMPLES)
    drift.add_argument('--severity-column', default='model_severity')
    drift.add_argument('--json', help='write the full drift report here')
    drift.add_argument('--fail-on', action='append', choices=['significant_drift', 'any'])
    drift.set_defaults(func=cmd_drift)

    calibrate = sub.add_parser('calibrate', help='fit a confidence calibration map')
    calibrate.add_argument('--fit-from', required=True, help='labelled predictions (CSV/JSON)')
    calibrate.add_argument('--outcomes', required=True, help='observed outcomes (JSON/CSV)')
    calibrate.add_argument('--method', choices=['isotonic', 'platt'], default='isotonic')
    calibrate.add_argument('--out', help='where to write the calibration map JSON')
    calibrate.add_argument('--fit-period', default='unspecified',
                           help='the window the fit sample came from (recorded in the map)')
    calibrate.add_argument('--fitted-on', default='unspecified', help='the date the map was fitted')
    calibrate.add_argument('--label-definition', default='observed_event_in_window',
                           help='what counted as a positive label')
    calibrate.add_argument('--min-samples', type=int, default=200)
    calibrate.add_argument('--absence-means-no-event', action='store_true',
                           help='count district-windows with no recorded event as negative labels '
                                '(required for a map that is not fitted on positives only)')
    calibrate.add_argument('--near-days', type=int, default=evaluate_module.DEFAULT_NEAR_DAYS)
    calibrate.add_argument('--bins', type=int, default=10)
    calibrate.add_argument('--allow-invalid', action='store_true',
                           help='write the map even when it fails validation (for inspection only)')
    calibrate.add_argument('--json', help='write the full fit report here')
    calibrate.set_defaults(func=cmd_calibrate)

    apply_map = sub.add_parser('apply-calibration', help='stamp a fitted map onto a forecast CSV')
    apply_map.add_argument('--csv', required=True)
    apply_map.add_argument('--map', required=True)
    apply_map.add_argument('--out', required=True)
    apply_map.set_defaults(func=cmd_apply_calibration)

    promote = sub.add_parser('promote', help='evaluate and record a champion/challenger promotion')
    promote.add_argument('--registry', help=f'registry path (default {DEFAULT_REGISTRY})')
    promote.add_argument('--artifact', required=True, help='artifact id to promote (e.g. hazardnet_fp32.tflite)')
    promote.add_argument('--report', required=True, help='challenger evaluation report JSON')
    promote.add_argument('--champion', help='champion evaluation report JSON (enables the regression gates)')
    promote.add_argument('--by', required=True, help='the human who signs off')
    promote.add_argument('--stage', default='champion', choices=registry_module.STAGES)
    promote.add_argument('--write', action='store_true', help='record the promotion in the registry')
    promote.add_argument('--json', help='write the decision and registry here')
    promote.set_defaults(func=cmd_promote)

    return parser


def main(argv=None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == '__main__':
    sys.exit(main())
