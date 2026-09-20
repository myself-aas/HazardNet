#!/usr/bin/env python3
"""Episode files: the curated half of a hindcast.

An *episode* is a historical event with a sourced truth set. It is hand-written and
reviewed (it is knowledge, not data), which is exactly why it is validated here rather
than trusted: a typo in a district name or a source id would silently change the score
this harness reports.

Validation is strict on purpose:

* the event's hazard class must be one of the model's eight (`physics_severity.HAZARD_CLASSES`),
  because a class outside that vocabulary cannot be scored by the pipeline at all;
* every named district must resolve through `etl.districts.resolve`, so "Jessore",
  "Jessore/Jashore", "Jhalakati", "Pirozpur" and "Gopalgonj" (the 2020/2021 spellings)
  all land on a real district — and an unresolvable name fails the load instead of being
  dropped;
* every `source_id` referenced by the truth set must exist in the episode's `sources[]`,
  with a URL and an access date. A score with an unattributable truth set is not evidence.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

from . import EPISODE_SCHEMA

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:  # `python -m hindcast.cli` already puts it there
    sys.path.insert(0, str(SCRIPTS_DIR))

import physics_severity  # noqa: E402
from etl import districts as district_table  # noqa: E402


class EpisodeError(ValueError):
    """The episode file cannot be scored as written."""


def canonical_hash(path) -> str:
    """SHA-256 of the episode file, so a report can name the exact input it scored."""
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_episode(path) -> dict:
    path = Path(path)
    if not path.exists():
        raise EpisodeError(f'{path} does not exist')
    try:
        episode = json.loads(path.read_text(encoding='utf-8'))
    except json.JSONDecodeError as exc:
        raise EpisodeError(f'{path}: not valid JSON ({exc})') from exc
    validate_episode(episode, source=str(path))
    episode['_path'] = str(path)
    episode['_sha256'] = canonical_hash(path)
    return episode


def validate_episode(episode: dict, *, source: str = '<episode>') -> None:
    def fail(message: str) -> None:
        raise EpisodeError(f'{source}: {message}')

    if episode.get('schema') != EPISODE_SCHEMA:
        fail(f"schema must be {EPISODE_SCHEMA!r} (got {episode.get('schema')!r})")
    for field in ('id', 'title', 'hazard_class', 'event', 'truth', 'sources'):
        if not episode.get(field):
            fail(f'`{field}` is required')

    hazard = episode['hazard_class']
    if hazard not in physics_severity.HAZARD_CLASSES:
        fail(
            f'hazard_class {hazard!r} is not one of the eight classes the pipeline can emit '
            f'({", ".join(physics_severity.HAZARD_CLASSES)})'
        )

    event = episode['event']
    onset = event.get('onset_date')
    if not onset or len(str(onset)) != 10:
        fail('event.onset_date must be an ISO date (YYYY-MM-DD)')

    sources = {source_row.get('id') for source_row in episode['sources']}
    if None in sources:
        fail('every entry of `sources` needs an `id`')
    if len(sources) != len(episode['sources']):
        fail('duplicate `id` in `sources`')
    for source_row in episode['sources']:
        for field in ('citation', 'url', 'accessed', 'what_it_evidences'):
            if not source_row.get(field):
                fail(f"source {source_row.get('id')!r} needs `{field}`")

    affected = episode['truth'].get('affected')
    if not affected:
        fail('truth.affected must name at least one district')
    seen = {}
    for entry in affected:
        name = entry.get('district')
        if not name:
            fail('every truth.affected entry needs a `district`')
        resolved = district_table.resolve(name)
        if resolved is None:
            fail(
                f'truth.affected names {name!r}, which is not one of the 64 districts '
                '(the app vocabulary is the 64 names in scripts/etl/districts.py)'
            )
        if resolved in seen:
            fail(f'{resolved!r} appears twice in truth.affected')
        seen[resolved] = entry
        source_id = entry.get('source_id')
        if source_id not in sources:
            fail(f'truth.affected[{name}] references source_id {source_id!r}, which is not in `sources`')
        if not entry.get('tier'):
            fail(f'truth.affected[{name}] needs a `tier` (how strongly the source names it)')
    episode.setdefault('scoring', {})


def affected_districts(episode: dict) -> list[dict]:
    """The truth set, resolved to canonical district names, order preserved."""
    resolved = []
    for entry in episode['truth']['affected']:
        resolved.append({**entry, 'district': district_table.resolve(entry['district'])})
    return resolved


def audit_summary(episode: dict) -> dict:
    """The provenance block the report carries, so a reader never has to open the file."""
    return {
        'id': episode['id'],
        'title': episode['title'],
        'hazard_class': episode['hazard_class'],
        'onset_date': episode['event']['onset_date'],
        'episode_path': episode.get('_path'),
        'episode_sha256': episode.get('_sha256'),
        'truth_completeness': episode['truth'].get('completeness'),
        'affected_districts': [entry['district'] for entry in affected_districts(episode)],
        'affected_count': len(episode['truth']['affected']),
        'sources': [
            {
                'id': row['id'],
                'citation': row['citation'],
                'url': row['url'],
                'accessed': row['accessed'],
                'what_it_evidences': row['what_it_evidences'],
            }
            for row in episode['sources']
        ],
        'truth_notes': episode['truth'].get('notes', []),
        'known_limitations': episode.get('known_limitations', []),
    }
