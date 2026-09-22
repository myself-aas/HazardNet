"""Source adapters: a raw archive's column vocabulary → the event contract.

WHY THIS PACKAGE EXISTS
-----------------------
`scripts/etl/events.py` defines one event contract (`EVENT_COLUMNS`) and refuses any
row that does not satisfy it — which is the property that makes the archive
publishable: *a row the loader rejects cannot reach a page*, because
`build_content_engine.mjs` is fed the export the loader produced, not the raw file.

That strictness has a cost. Every real archive names its columns differently
(`Event_ID_Internal`, `Hazard_Type`, `District`, …), and before this package the
only way to load one was to hand-edit the raw file — which is exactly the edit
that would bypass validation and let an unvalidated row onto a page.

An adapter is therefore a *narrow, reviewable* translation layer:

  * it may only **rename** and **reshape** columns into contract names;
  * it must **not** invent values for fields the source does not carry;
  * it must **not** decide a hazard class, resolve a district, parse a date, or
    clamp a severity — `events.normalize_event()` does all of that, so those
    rules stay in exactly one place and every adapter inherits every future fix.

Anything an adapter does beyond renaming is documented in its module docstring and
asserted by its test, because a silent reinterpretation here is indistinguishable
from a data defect three phases later.

Registering a new archive: add the module to `ADAPTERS` and add its test to
`scripts/tests/`.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

#: adapter key → (module name, one-line description). The key is what
#: `python -m etl.cli events --adapter <key>` accepts.
ADAPTERS = {
    'bgd-climatic-hazards': (
        'bgd_climatic_hazards',
        "Bangladesh climatic hazards 2000-2026 (data/events/BGD_climatic_hazards_dataset_2000_2026.csv)",
    ),
}


def get(key: str):
    """Import and return the adapter module registered under ``key``."""
    from importlib import import_module

    if key not in ADAPTERS:
        raise KeyError(key)
    return import_module(f'adapters.{ADAPTERS[key][0]}')


def read_records(path) -> list:
    """Read a raw archive into a list of dicts.

    Mirrors `events.load_events` (CSV / JSON array / JSON-lines) so an adapter does
    not have to care which of the three it was handed, and so a CSV reads with the
    same `errors='replace'` tolerance the rest of the pipeline uses — the archive is
    third-party prose and is not guaranteed to be clean UTF-8.
    """
    source = Path(path)
    if not source.exists():
        raise FileNotFoundError(f'{source}: no such file')
    text = source.read_text(encoding='utf-8', errors='replace')
    suffix = source.suffix.lower()
    if suffix == '.csv':
        return list(csv.DictReader(text.splitlines()))
    if suffix in ('.jsonl', '.ndjson'):
        return [json.loads(line) for line in text.splitlines() if line.strip()]
    if suffix == '.json':
        payload = json.loads(text)
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            for key in ('events', 'records', 'rows', 'data'):
                if isinstance(payload.get(key), list):
                    return payload[key]
        raise ValueError(f'{source}: JSON object has no event array')
    raise ValueError(f'{source}: unsupported extension {suffix!r} (expected .csv, .json or .jsonl)')
