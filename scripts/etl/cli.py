#!/usr/bin/env python3
"""`python -m etl.cli <command>` — the ingestion entry points.

Every command is dry-run-able, offline-capable and prints a JSON summary, so a
workflow step can run it with `--dry-run`, assert on the summary, and only then
write. Commands write nothing to the database unless `--apply` is passed with a
DSN, and the SQL they would apply is written out for review either way.

    python -m etl.cli districts
    python -m etl.cli events --input events.csv --claimed-total 2931 --emit-sql out/events.sql
    python -m etl.cli events --input events.csv --export-json data/events/hazardnet-events.json
    python -m etl.cli hydrology --input ffwc.json --rows backend/data/forecasts/…csv --report hydrology.json
    python -m etl.cli bulletins --input bmd.txt --advisories advisories.json
    python -m etl.cli cog --plan fixture_jobs.json --manifest cog-manifest.json
    python -m etl.cli scene-manifest --units units.json --out scene-manifest.json

Exit codes: 0 success, 1 validation problem (the summary says what), 2 usage.
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))
_SCRIPTS_DIR = _HERE.parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

import adapters as adapters_module  # noqa: E402
import bulletins as bulletins_module  # noqa: E402
import cog as cog_module  # noqa: E402
import db as db_module  # noqa: E402
import districts as districts_module  # noqa: E402
import events as events_module  # noqa: E402
import hydrology as hydrology_module  # noqa: E402
import scene_manifest  # noqa: E402
try:  # importable both as `python -m etl.cli` and as a plain script
    from . import ETL_VERSION  # noqa: E402
except ImportError:  # pragma: no cover - script mode
    from __init__ import ETL_VERSION  # noqa: E402


def _now() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def _emit(payload: dict, *, code: int = 0) -> int:
    print(json.dumps(payload, indent=2, sort_keys=False, default=str))
    return code


# ── districts ────────────────────────────────────────────────────────────────

def cmd_districts(args) -> int:
    names = districts_module.NAMES
    return _emit({
        'command': 'districts',
        'etl_version': ETL_VERSION,
        'count': len(names),
        'divisions': list(districts_module.DIVISIONS),
        'aliases': districts_module.ALIASES,
        'districts': list(names) if args.verbose else None,
    })


# ── events ───────────────────────────────────────────────────────────────────

def cmd_events(args) -> int:
    started_at = _now()
    adapter_key = getattr(args, 'adapter', None)
    if adapter_key:
        # A raw third-party archive: translate its column vocabulary into the event
        # contract first, then validate through the SAME strict path below. The
        # adapter renames columns only — it does not classify, resolve or clamp.
        try:
            adapter = adapters_module.get(adapter_key)
        except KeyError:
            known = ', '.join(sorted(adapters_module.ADAPTERS))
            return _emit({
                'command': 'events',
                'status': 'failed',
                'reason': 'adapter',
                'detail': f'unknown adapter {adapter_key!r}; known: {known}',
                'input': args.input,
            }, code=1)
        records = adapters_module.read_records(args.input)
        raw = adapter.adapt(records)
        if not args.source or args.source == 'archive':
            # The adapter names its own source; --source stays available as an
            # explicit override but must not silently rename the archive and re-key it.
            args.source = getattr(adapter, 'SOURCE', args.source)
    else:
        raw = events_module.load_events(args.input)
    strict = not args.lenient
    try:
        outcome = events_module.normalize_events(raw, strict=strict)
    except events_module.EventValidationError as exc:
        return _emit({
            'command': 'events',
            'status': 'failed',
            'reason': 'validation',
            'detail': str(exc),
            'input': args.input,
        }, code=1)

    summary = events_module.summarize(outcome['events'])
    claim = events_module.verify_claimed_count(summary, claimed=args.claimed_total)
    matrix = events_module.district_year_matrix(outcome['events'])

    run_id = args.run_id or f"evt-ingest-{uuid.uuid4().hex[:12]}"
    status = 'ok' if (claim['within_tolerance'] and not outcome['errors']) else 'review'
    report = {
        'command': 'events',
        'etl_version': ETL_VERSION,
        'status': status,
        'input': str(args.input),
        'run_id': run_id,
        'rows_seen': len(raw),
        'rows_ingested': summary['total'],
        'rows_rejected': len(outcome['errors']),
        'rows_unmapped': len(outcome['unmapped']),
        'rows_duplicate': outcome['duplicates_dropped'],
        'errors': outcome['errors'][:50],
        'unmapped': outcome['unmapped'][:50],
        'counts': summary,
        'claimed_total': claim,
        'districts_covered': len(summary['by_district']),
        'matrix_preview': dict(list(matrix.items())[:3]),
        'started_at': started_at,
        'finished_at': _now(),
    }

    notes = None
    if not claim['within_tolerance']:
        notes = claim['message']
    script = db_module.build_script(
        events=outcome['events'], run_id=run_id, source=str(args.source), summary=report,
        started_at=report['started_at'], finished_at=report['finished_at'], status=status,
        notes=notes,
    )
    # The report always says how much SQL this run implies — a workflow can assert
    # on it without writing anything — and writes it only when asked.
    report['sql'] = {
        'bytes': len(script),
        'statements': script.count('insert into public.hazard_events'),
        'path': (db_module.write_script(script, args.emit_sql)
                 if args.emit_sql and not args.dry_run else None),
    }
    # The content engine (`scripts/build_content_engine.mjs --events`) publishes the district
    # history sections and the retrospectives from this file, so it carries the same drift
    # statement the report does: the measured count, the claimed 2,931 and the difference. The
    # export is the *normalised* rows — identical to what the SQL above loads — not the raw source
    # rows, so a page cannot show something the loader would have rejected.
    if args.export_json and not args.dry_run:
        export_payload = {
            'schema': 'hazardnet-events-export/v1',
            'etl_version': ETL_VERSION,
            'run_id': run_id,
            'source': str(args.source),
            'generated_at': report['finished_at'],
            'claimed_total': claim['claimed'],
            'ingested': summary['total'],
            'drift': claim['drift'],
            'counts': summary,
            'events': outcome['events'],
        }
        export_text = json.dumps(export_payload, indent=2) + '\n'
        Path(args.export_json).write_text(export_text, encoding='utf-8')
        report['export_json'] = {
            'path': str(args.export_json),
            'events': summary['total'],
            'bytes': len(export_text),
        }
    if args.report and not args.dry_run:
        Path(args.report).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')

    if args.apply:
        try:
            connection = db_module.connect(args.dsn)
        except db_module.DatabaseUnavailable as exc:
            report['apply'] = {'ok': False, 'reason': str(exc)}
            return _emit(report, code=1)
        # The same statements that were written for review are the ones applied.
        statements = db_module.apply_script(connection, script)
        report['apply'] = {'ok': True, 'statements': statements, 'counts': db_module.fetch_counts(connection)}

    return _emit(report)


# ── hydrology ────────────────────────────────────────────────────────────────

def cmd_hydrology(args) -> int:
    raw = hydrology_module.load_records(args.input)
    records = [hydrology_module.normalize_record(record, index=index) for index, record in enumerate(raw)]
    scores = hydrology_module.district_scores(records)
    state = hydrology_module.stream_state(records)
    report = {
        'command': 'hydrology',
        'etl_version': ETL_VERSION,
        'status': 'ok' if state['available'] else 'no_data',
        'input': str(args.input),
        'stream': state,
        'districts': scores,
    }
    if args.rows:
        import csv as csv_module

        with open(args.rows, newline='', encoding='utf-8') as handle:
            reader = csv_module.DictReader(handle)
            fieldnames = list(reader.fieldnames or [])
            rows = list(reader)
        merge = hydrology_module.merge_into_rows(rows, records)
        report['merge'] = merge
        added = [name for name in ('hydrology_severity', 'hydrology_available') if name not in fieldnames]
        if args.write_rows and not args.dry_run:
            for column in ('hydrology_available', 'hydrology_severity', 'hydrology_hazard', 'hydrology_station',
                           'hydrology_exceedance_ratio', 'hydrology_trend', 'hydrology_stale'):
                if column not in fieldnames:
                    fieldnames.append(column)
            with open(args.rows, 'w', newline='', encoding='utf-8') as handle:
                writer = csv_module.DictWriter(handle, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(rows)
            report['merge']['rows_written'] = str(args.rows)
            report['merge']['columns_added'] = added
        else:
            report['merge']['rows_written'] = None
        report['merge']['sample'] = [
            {
                'district_name': row.get('district_name'),
                'hydrology_severity': row.get('hydrology_severity'),
                'hydrology_available': row.get('hydrology_available'),
            }
            for row in rows[:3]
        ]
    if args.report and not args.dry_run:
        Path(args.report).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    return _emit(report)


# ── bulletins ────────────────────────────────────────────────────────────────

def cmd_bulletins(args) -> int:
    texts = bulletins_module.load_bulletins(args.input)
    parsed = [bulletins_module.parse_bulletin(text, source_url=args.source_url) for text in texts if text.strip()]
    summary = bulletins_module.summarize(parsed)
    advisories = [advisory for bulletin in parsed for advisory in bulletins_module.to_advisories(bulletin)]
    report = {
        'command': 'bulletins',
        'etl_version': ETL_VERSION,
        'status': 'ok' if parsed else 'no_data',
        'input': str(args.input),
        'summary': summary,
        'bulletins': parsed,
        'advisories': advisories,
    }
    if args.advisories and not args.dry_run:
        Path(args.advisories).write_text(json.dumps(advisories, indent=2) + '\n', encoding='utf-8')
        report['advisories_path'] = str(args.advisories)
    if args.report and not args.dry_run:
        Path(args.report).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    return _emit(report)


# ── COG planning ─────────────────────────────────────────────────────────────

def cmd_cog(args) -> int:
    plan = json.loads(Path(args.plan).read_text(encoding='utf-8'))
    items = plan.get('items') if isinstance(plan, dict) else plan
    if not items:
        return _emit({'command': 'cog', 'status': 'failed', 'reason': 'plan has no items'}, code=1)
    problems = []
    jobs = []
    for item in items:
        source = item.get('source')
        metadata = item.get('metadata')
        if metadata:
            problems += [f"{source}/{item.get('band')}: {problem}" for problem in
                         cog_module.validate_cog_metadata(metadata, source=source)]
        try:
            jobs.append(cog_module.plan_job(
                source=source, item_id=item['item_id'], band=item['band'], href=item['href'],
                acquired=item.get('acquired'), metadata=metadata, root=args.root,
            ))
        except cog_module.CogError as exc:
            problems.append(str(exc))
    if problems:
        return _emit({'command': 'cog', 'status': 'failed', 'problems': problems}, code=1)

    manifest = cog_module.build_cog_manifest(jobs, produced_at=_now())
    if args.manifest and not args.dry_run:
        cog_module.write_json(manifest, args.manifest)
    if args.commands and not args.dry_run:
        Path(args.commands).write_text(
            '\n'.join(' '.join(job['translate_command']) for job in jobs) + '\n', encoding='utf-8'
        )
    return _emit({
        'command': 'cog',
        'etl_version': ETL_VERSION,
        'status': 'ok',
        'counts': manifest['counts'],
        'manifest_path': None if (args.dry_run or not args.manifest) else str(args.manifest),
        'first_job': jobs[0] if jobs else None,
    })


# ── scene manifest ───────────────────────────────────────────────────────────

def cmd_scene_manifest(args) -> int:
    payload = json.loads(Path(args.units).read_text(encoding='utf-8'))
    units = payload.get('units') if isinstance(payload, dict) else payload
    if not units:
        return _emit({'command': 'scene-manifest', 'status': 'failed', 'reason': 'no units in input'}, code=1)
    try:
        manifest = scene_manifest.build_manifest(
            prediction_date=payload.get('prediction_date') or args.prediction_date,
            pipeline_version=payload.get('pipeline_version') or args.pipeline_version,
            model_version=payload.get('model_version') or args.model_version,
            units=units,
            driver=payload.get('driver'),
            run_id=payload.get('run_id') or args.run_id,
        )
    except scene_manifest.ManifestError as exc:
        return _emit({'command': 'scene-manifest', 'status': 'failed', 'reason': str(exc)}, code=1)
    problems = scene_manifest.validate_manifest(manifest)
    digest = None
    if args.out and not args.dry_run:
        digest = scene_manifest.write_manifest(manifest, args.out)
    return _emit({
        'command': 'scene-manifest',
        'etl_version': ETL_VERSION,
        'status': 'ok' if not problems else 'failed',
        'problems': problems,
        'dataset_version': manifest['dataset_version'],
        'units': len(manifest['units']),
        'scenes_enumerated': manifest['scenes_enumerated'],
        'manifest_sha256': digest,
        'out': None if (args.dry_run or not args.out) else str(args.out),
        # JSON keys must be strings; the in-memory lookup stays keyed on the tuple.
        'unit_versions': {
            f'{district_id}/{horizon}': version
            for (district_id, horizon), version in list(scene_manifest.unit_lookup(manifest).items())[:3]
        },
    }, code=0 if not problems else 1)


# ── parser ───────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog='etl', description='HazardNet ingestion ETL')
    parser.add_argument('--version', action='version', version=ETL_VERSION)
    subparsers = parser.add_subparsers(dest='command', required=True)

    p = subparsers.add_parser('districts', help='print the 64-district validation snapshot')
    p.add_argument('--verbose', action='store_true', help='include the full name list')
    p.set_defaults(func=cmd_districts)

    p = subparsers.add_parser('events', help='normalise + validate historical events and emit load SQL')
    p.add_argument('--input', required=True, help='CSV, JSON array or JSON-lines of events')
    p.add_argument('--adapter', metavar='KEY',
                   help='translate a raw third-party archive into the event contract before '
                        'validation (see scripts/etl/adapters/README.md; '
                        '"--adapter list" prints the registered keys)')
    p.add_argument('--source', default='archive', help='source name recorded on the ingest run')
    p.add_argument('--claimed-total', type=int, default=2931,
                   help='the count docs/MODEL_CARD.md quotes; the run reports the drift, never asserts it')
    p.add_argument('--emit-sql', metavar='PATH', help='write the load script here')
    p.add_argument('--report', metavar='PATH', help='write the JSON run report here')
    p.add_argument('--export-json', metavar='PATH',
                   help='write the normalised events (exactly the rows the SQL loads) as JSON for '
                        'the content engine (`scripts/build_content_engine.mjs --events`)')
    p.add_argument('--run-id', help='override the generated run id')
    p.add_argument('--apply', action='store_true', help='apply the script to a live database')
    p.add_argument('--dsn', default=None, help='Postgres DSN (or HAZARDNET_DATABASE_URL)')
    p.add_argument('--lenient', action='store_true',
                   help='collect bad rows instead of refusing the ingest (recon only)')
    p.add_argument('--dry-run', action='store_true', help='compute everything, write nothing')
    p.set_defaults(func=cmd_events)

    p = subparsers.add_parser('hydrology', help='score FFWC station levels, optionally merge into forecast rows')
    p.add_argument('--input', required=True, help='CSV or JSON station records')
    p.add_argument('--rows', help='forecast CSV to merge the hydrology stream into')
    p.add_argument('--write-rows', action='store_true', help='rewrite --rows with the new columns')
    p.add_argument('--report', metavar='PATH', help='write the JSON report here')
    p.add_argument('--dry-run', action='store_true', help='do not modify --rows')
    p.set_defaults(func=cmd_hydrology)

    p = subparsers.add_parser('bulletins', help='parse BMD bulletins into structured advisories')
    p.add_argument('--input', required=True, help='.txt (one bulletin) or .json (list)')
    p.add_argument('--source-url', help='where the bulletin came from')
    p.add_argument('--advisories', metavar='PATH', help='write advisories JSON here')
    p.add_argument('--report', metavar='PATH', help='write the full parse report here')
    p.add_argument('--dry-run', action='store_true', help='do not write any file')
    p.set_defaults(func=cmd_bulletins)

    p = subparsers.add_parser('cog', help='validate + plan COG archive jobs and emit the manifests')
    p.add_argument('--plan', required=True, help='JSON item list ({source,item_id,band,href,…})')
    p.add_argument('--root', default='cog', help='archive root for generated paths')
    p.add_argument('--manifest', metavar='PATH', help='write the COG manifest here')
    p.add_argument('--commands', metavar='PATH', help='write the gdal_translate command list here')
    p.add_argument('--dry-run', action='store_true', help='do not write any file')
    p.set_defaults(func=cmd_cog)

    p = subparsers.add_parser('scene-manifest', help='build the per-prediction scene manifest (dataset_version)')
    p.add_argument('--units', required=True, help='JSON with unit records (steps/driver)')
    p.add_argument('--out', metavar='PATH', help='write the manifest here')
    p.add_argument('--prediction-date', help='override prediction_date from the input')
    p.add_argument('--pipeline-version', default=ETL_VERSION, help='pipeline version stamped on the manifest')
    p.add_argument('--model-version', default=None, help='model version stamped on the manifest')
    p.add_argument('--run-id', default=None, help='run id stamped on the manifest')
    p.add_argument('--dry-run', action='store_true', help='do not write the manifest')
    p.set_defaults(func=cmd_scene_manifest)
    return parser


def main(argv=None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if getattr(args, 'dsn', None) is None:
        import os

        args.dsn = os.environ.get('HAZARDNET_DATABASE_URL')
    try:
        return args.func(args)
    except FileNotFoundError as exc:
        return _emit({'command': args.command, 'status': 'failed', 'reason': str(exc)}, code=1)
    except events_module.EventValidationError as exc:
        return _emit({'command': args.command, 'status': 'failed', 'reason': str(exc)}, code=1)
    except (hydrology_module.HydrologyError, bulletins_module.BulletinError,
            cog_module.CogError, scene_manifest.ManifestError, db_module.DatabaseUnavailable) as exc:
        return _emit({'command': args.command, 'status': 'failed', 'reason': str(exc)}, code=1)


if __name__ == '__main__':
    raise SystemExit(main())
