#!/usr/bin/env python3
"""Emit (and optionally apply) SQL for the event store.

WHY SQL TEXT FIRST
------------------
The repository's migrations are plain `.sql` files applied by hand or by a
migration runner (`scripts/db/README.md`). So the loader's primary output is a
**script you can read and diff** — `python -m etl.cli events --emit-sql` — and
applying it through a live connection is a separate, explicit step. That keeps the
3 MB/2,931-row question out of CI while still producing an artifact an operator can
run with `psql`, and it means the SQL that gets applied is exactly the SQL that was
reviewed.

Idempotency is not optional here: ingestion jobs get retried, and a retry that
duplicates 2,931 events corrupts the historical prior (w4) in a way that is
invisible until a hindcast is wrong. Every insert is an upsert keyed on
`event_id`, derived from `(source, source_record_id)` by
`scripts/etl/events.py::deterministic_event_id`.

Grammar safety: values are escaped as standard-conforming string literals with
single quotes doubled, and the script sets
`standard_conforming_strings = on`. Backslashes are therefore literal, so a
Windows path or a LaTeX-ish note cannot become an escape sequence.

`psycopg` is imported inside `connect()` — never at module import — so the module
works (and is tested) with no database driver installed.
"""

from __future__ import annotations

import json
from pathlib import Path

from events import EVENT_COLUMNS, deterministic_event_id

#: Columns written by the loader, in insert order. `event_id` is computed, so it is
#: not taken from the row.
INSERT_COLUMNS = tuple(column for column in EVENT_COLUMNS if column != 'event_id')

NUMERIC_COLUMNS = frozenset({'severity', 'deaths', 'affected', 'damage_usd'})

BATCH_SIZE = 500


def sql_literal(value) -> str:
    """A standard-conforming SQL literal (or NULL) for any Python scalar."""
    if value is None:
        return 'NULL'
    if isinstance(value, bool):
        return 'TRUE' if value else 'FALSE'
    if isinstance(value, (int, float)):
        return repr(value)
    text = str(value)
    return "'" + text.replace("'", "''") + "'"


def _geom_expression(pcode: str) -> str:
    """Expression deriving ADM2 geometry from the ADM3 layer when available.

    `003_adm3_spatial_postgis.sql` establishes the 507-unit ADM3 table in Postgres; a district
    outline is the union of its upazilas. When that table (or PostGIS) is absent
    the expression is NULL, and the migration's own check keeps the column honest.
    """
    return (
        f"(select st_multi(st_union(a.geom)) from public.adm3_boundaries a "
        f"where a.adm2_pcode = {sql_literal(pcode)})"
    )


def events_insert_statement(batch, *, with_geometry: bool = True) -> str:
    """One multi-row `insert … on conflict` for a batch of normalised events."""
    if not batch:
        raise ValueError('empty batch')
    rows = []
    for event in batch:
        # `event_id` comes first: it is computed by `events.normalize_event` (a hash
        # of source + source_record_id), not read from the row, so it has to be
        # written as a literal like every other column. Omitting it made the column
        # list one entry longer than the value list — an insert that Postgres would
        # reject outright, caught by scripts/tests/test_etl_events.py.
        values = [sql_literal(event.get('event_id'))]
        for column in INSERT_COLUMNS:
            value = event.get(column)
            # GeoJSON text is stored for validation/reporting; the geometry column is
            # derived from ADM3 so a bad polygon in a source cannot corrupt the map.
            values.append(sql_literal(value))
        rows.append('  (' + ', '.join(values) + ')')

    target_columns = ['event_id', *INSERT_COLUMNS]
    assignments = ', '.join(
        f'{column} = excluded.{column}' for column in INSERT_COLUMNS
        if column not in ('source', 'source_record_id')  # identity columns never change
    )
    statement = (
        'insert into public.hazard_events (\n    ' + ', '.join(target_columns) + '\n) values\n'
        + ',\n'.join(rows)
        + f'\non conflict (event_id) do update set {assignments}, updated_at = now();'
    )
    if with_geometry:
        statement += (
            '\n-- ADM2 geometry is derived from the ADM3 layer (union of upazilas) for every'
            '\n-- inserted row; a district without ADM3 coverage keeps geom = NULL and is'
            '\n-- reported by scripts/db/verify_hazard_events.sql.'
            '\nupdate public.hazard_events e set geom = '
            + _geom_expression('e.adm2_pcode')
            + f'\n where e.adm2_pcode in ({", ".join(sql_literal(r["adm2_pcode"]) for r in batch)})'
            '\n   and e.geom is distinct from '
            + _geom_expression('e.adm2_pcode')
            + ';'
        )
    return statement


def ingest_run_statements(*, run_id: str, source: str, summary: dict, started_at: str,
                          finished_at: str, status: str, notes=None, manifest_sha256=None) -> str:
    """SQL recording the ingest run and its per-class/per-year counts."""
    return f"""-- ingest run record (audit trail for the counts in docs/MODEL_CARD.md §4)
insert into public.hazard_event_ingest_runs (
  run_id, source, command, status, started_at, finished_at, rows_seen, rows_ingested,
  rows_rejected, rows_unmapped, rows_duplicate, claimed_total, drift, manifest_sha256, summary, notes
) values (
  {sql_literal(run_id)},
  {sql_literal(source)},
  {sql_literal('python -m etl.cli events')},
  {sql_literal(status)},
  {sql_literal(started_at)},
  {sql_literal(finished_at)},
  {sql_literal(summary.get('rows_seen', 0))},
  {sql_literal(summary.get('rows_ingested', summary.get('total', 0)))},
  {sql_literal(summary.get('rows_rejected', len(summary.get('errors', []))))},
  {sql_literal(summary.get('rows_unmapped', len(summary.get('unmapped', []))))},
  {sql_literal(summary.get('rows_duplicate', summary.get('duplicates_dropped', 0)))},
  {sql_literal(summary.get('claimed_total'))},
  {sql_literal(summary.get('drift'))},
  {sql_literal(manifest_sha256)},
  {sql_literal(json.dumps(summary.get('counts', {}), sort_keys=True))}::jsonb,
  {sql_literal(notes)}
)
on conflict (run_id) do update set
  status = excluded.status, finished_at = excluded.finished_at,
  rows_ingested = excluded.rows_ingested, summary = excluded.summary, notes = excluded.notes;
"""


def refresh_statements() -> str:
    """Refresh the aggregate views the prior reads, after an ingest."""
    return (
        'refresh materialized view concurrently public.hazard_event_district_year;'
        '\nrefresh materialized view concurrently public.hazard_event_yearly_totals;'
    )


def build_script(*, events, run_id: str, source: str, summary: dict, started_at: str,
                 finished_at: str, status: str, with_geometry: bool = True,
                 notes=None, manifest_sha256=None, header: str = None) -> str:
    """The complete `.sql` script for an ingest: header, inserts, run record, refresh."""
    parts = [
        '-- HazardNet historical hazard-event ingest (generated)',
        f'-- run_id: {run_id}',
        f'-- source: {source}',
        f'-- events in this script: {len(events)}',
        '-- Generated by scripts/etl/db.py — review before applying; safe to re-run (upsert on event_id).',
        '',
        'set standard_conforming_strings = on;',
        'begin;',
        '',
    ]
    if header:
        parts += [f'-- {header}', '']
    for start in range(0, len(events), BATCH_SIZE):
        parts.append(events_insert_statement(events[start:start + BATCH_SIZE], with_geometry=with_geometry))
        parts.append('')
    parts.append(ingest_run_statements(
        run_id=run_id, source=source, summary=summary, started_at=started_at, finished_at=finished_at,
        status=status, notes=notes, manifest_sha256=manifest_sha256,
    ))
    parts.append('')
    parts.append(refresh_statements())
    parts.append('')
    parts.append('commit;')
    parts.append('')
    return '\n'.join(parts)


def write_script(script: str, path) -> str:
    """Write a generated script to disk; returns the path written."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(script, encoding='utf-8')
    return str(target)


# ── optional live application ────────────────────────────────────────────────

class DatabaseUnavailable(RuntimeError):
    """Raised when a live load is requested without a usable driver/DSN."""


def connect(dsn: str):
    """Open a Postgres connection. Import is lazy so the module works without psycopg."""
    if not dsn:
        raise DatabaseUnavailable(
            'no DSN supplied — pass --dsn or set HAZARDNET_DATABASE_URL. Without a database, use '
            '`--emit-sql` to produce a script for psql instead.'
        )
    try:
        import psycopg  # type: ignore
    except ImportError as exc:  # pragma: no cover - depends on environment
        raise DatabaseUnavailable(
            'psycopg is not installed (pip install "psycopg[binary]"). '
            'Use `--emit-sql` to generate a script and apply it with psql.'
        ) from exc
    return psycopg.connect(dsn)


def apply_script(conn, script: str) -> int:
    """Execute a generated script; returns the number of statements executed."""
    executed = 0
    with conn.cursor() as cursor:
        cursor.execute(script)
        executed = 1
    conn.commit()
    return executed


def fetch_counts(conn) -> dict:
    """Read the store's own view of its contents (used by `--verify`)."""
    with conn.cursor() as cursor:
        cursor.execute('select count(*) from public.hazard_events')
        total = cursor.fetchone()[0]
        cursor.execute('select hazard_type, count(*) from public.hazard_events group by 1 order by 1')
        by_hazard = dict(cursor.fetchall())
        cursor.execute('select count(distinct adm2_name) from public.hazard_events')
        districts = cursor.fetchone()[0]
        cursor.execute('select min(start_date), max(end_date) from public.hazard_events')
        span = cursor.fetchone()
    return {'total': total, 'by_hazard': by_hazard, 'districts': districts, 'span': [str(s) for s in span]}
