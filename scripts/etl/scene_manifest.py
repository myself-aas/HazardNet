#!/usr/bin/env python3
"""Per-prediction scene lineage and `dataset_version` (PRODUCT_SPEC §5.8).

WHY THIS EXISTS
--------------
Every published forecast row was required by `docs/architecture/TARGET_ARCHITECTURE.md` §3.1 to
carry a `dataset_version` and the contributing scene list, and by `docs/PRODUCT_SPEC.md` §5.8 to be
reproducible from its own record. Neither existed: a row said `data_source:
"Hybrid_Cognitive_Forecast"` and nothing else, so a forecast could not be traced to the inputs that
produced it.

This module defines the manifest that closes that gap, and the rule that turns it into a
`dataset_version`. It is deliberately a *pure* module: the pipeline that knows how to talk to
Earth Engine is `scripts/auto_forecast.py`, and this file only describes, validates and hashes what
that pipeline saw. That separation is what makes the lineage testable without a network.

THE VERSION RULE (why it is a hash, and of what)
-----------------------------------------------
`dataset_version` is a content hash over the ordered scene records of one **prediction unit**
(district x horizon): the collections queried, the exact date windows, how many images the composite
used, the acquisition dates of those images (when the producer enumerated them), and a digest of the
tensor that was actually built — plus the Open-Meteo driver snapshot's fingerprint.

Two properties matter:

  * **Same inputs → same version.** Rerunning a day produces the same `dataset_version`, so a
    consumer can tell "the data did not change" from "the data changed".
  * **Different inputs → different version.** A new satellite scene over a district, a revised
    forecast window or an upstream Open-Meteo revision all move the hash. That is what makes the
    version *useful* rather than decorative.

It is explicitly **not** a model version (that is `model_version` + `tensor_build_id`) and not a
timestamp. `manifest_id` is the run-level identifier that points at the manifest file itself.

WHAT IT DOES NOT CLAIM
----------------------
If a producer cannot enumerate image ids (Earth Engine `aggregate_array` costs a round trip per
collection per district), the manifest records `scenes_enumerated: false` and still carries the
tensor digest — which is enough to detect *that* the inputs changed, though not *which* scene did.
The run report says which mode was used; nothing pretends to lineage it does not have.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

SCHEMA = 'hazardnet-scene-manifest/v1'

#: Sources this manifest can describe, and what a scene record means for each.
SOURCES = {
    'sentinel-1': 'COPERNICUS/S1_GRD (VV/VH backscatter median per step)',
    'sentinel-2': 'COPERNICUS/S2_SR_HARMONIZED (surface reflectance, cloud-filtered composite)',
    'landsat-8': 'LANDSAT/LC08/C02/T1_L2 (fallback optical when S2 is cloud-covered)',
    'modis': 'MODIS NDVI/LST (MOD13Q1/MOD11A1 — archive and COG path, not yet a model input)',
    'era5-land': 'ECMWF/ERA5_LAND/DAILY_AGGR (temperature, precipitation, soil, radiation)',
    'open-meteo': 'api.open-meteo.com forecast (the live t0 driver block)',
}

REQUIRED_STEP_FIELDS = ('step', 'window_start', 'window_end', 'collections', 'tensor_sha256', 'shape')


class ManifestError(ValueError):
    """Raised for a manifest that cannot be published as lineage."""


def _sha256_hex(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def digest_array(values, *, shape=None, dtype: str = 'float32') -> str:
    """Content digest of a tensor/array *without* importing numpy.

    The pipeline already has the array in memory; the digest is what makes
    "the inputs changed" observable. Accepts anything iterable of numbers, or a
    bytes-like object (numpy arrays expose `.tobytes()`; callers pass that).
    """
    if isinstance(values, (bytes, bytearray, memoryview)):
        payload = bytes(values)
    else:
        payload = json.dumps(list(values), separators=(',', ':')).encode('utf-8')
    if shape is not None:
        payload += f'|{tuple(shape)}|{dtype}'.encode('utf-8')
    return _sha256_hex(payload)


def scene_record(source: str, item_id: str, *, acquired: str = None, cloud_cover=None,
                 collection: str = None, extra: dict = None) -> dict:
    """One satellite/atmospheric scene that contributed to a prediction step."""
    if source not in SOURCES:
        raise ManifestError(f'unknown scene source {source!r}; known: {", ".join(sorted(SOURCES))}')
    if not item_id:
        raise ManifestError(f'scene_record({source}) needs an item id')
    record = {
        'source': source,
        'collection': collection or SOURCES[source].split(' ')[0],
        'item_id': str(item_id),
    }
    if acquired:
        record['acquired'] = str(acquired)
    if cloud_cover not in (None, ''):
        try:
            record['cloud_cover'] = round(float(cloud_cover), 2)
        except (TypeError, ValueError):
            raise ManifestError(f'cloud_cover {cloud_cover!r} is not a number')
    if extra:
        record['extra'] = extra
    return record


def step_record(*, step: int, window_start: str, window_end: str, collections, tensor_digest: str,
                shape, dtype: str = 'float32', scenes=None, scale_m: float = None) -> dict:
    """One 10-day composite inside a district's 9-step history."""
    record = {
        'step': int(step),
        'window_start': str(window_start),
        'window_end': str(window_end),
        'collections': sorted(collections),
        'tensor_sha256': tensor_digest,
        'shape': list(shape),
        'dtype': dtype,
    }
    if scale_m is not None:
        record['scale_m'] = float(scale_m)
    if scenes is not None:
        record['scenes'] = sorted(scenes, key=lambda s: (s['source'], s['item_id']))
    return record


def driver_record(*, source: str, url: str, params: dict, payload_sha256: str,
                  hourly_fields=None, retrieved_at: str = None) -> dict:
    """The live t0 driver block (Open-Meteo), fingerprinted so revisions show up.

    `params` must be the *request* parameters (latitude, longitude, fields,
    forecast_days, timezone…); they are hashed canonically, so a change in the
    requested window changes `dataset_version` even when the response happens to
    be byte-identical.
    """
    if source not in SOURCES:
        raise ManifestError(f'unknown driver source {source!r}')
    if not payload_sha256:
        raise ManifestError('driver_record needs the payload digest')
    return {
        'source': source,
        'url': url,
        'params': {str(k): params[k] for k in sorted(params)},
        'payload_sha256': payload_sha256,
        'hourly_fields': sorted(hourly_fields) if hourly_fields else None,
        'retrieved_at': retrieved_at or datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    }


def unit_record(*, district_id, district_name: str, horizon: str, steps, driver=None,
                enumerated: bool = False, extra: dict = None) -> dict:
    """All lineage for one (district, horizon) prediction unit."""
    if not steps:
        raise ManifestError(f'{district_name}/{horizon}: a unit needs at least one step record')
    ordered = sorted(steps, key=lambda s: s['step'])
    unit = {
        'district_id': district_id,
        'district_name': district_name,
        'horizon': horizon,
        'steps': ordered,
        'scenes_enumerated': bool(enumerated),
    }
    if driver:
        unit['driver'] = driver
    if extra:
        unit['extra'] = extra
    return unit


def dataset_version(unit: dict) -> str:
    """Deterministic `dataset_version` for one prediction unit.

    Format: ``ds1.<16 hex>``. Everything that legitimately changes the inputs is
    inside the hash; timestamps and run ids deliberately are not.
    """
    if not isinstance(unit, dict) or not unit.get('steps'):
        raise ManifestError('dataset_version needs a unit record with steps')
    canonical = {
        'schema': SCHEMA,
        'horizon': unit.get('horizon'),
        'district': unit.get('district_name'),
        'steps': [
            {
                'step': step['step'],
                'window_start': step['window_start'],
                'window_end': step['window_end'],
                'collections': sorted(step['collections']),
                'tensor_sha256': step['tensor_sha256'],
                'shape': list(step['shape']),
                'scenes': [
                    {k: scene.get(k) for k in ('source', 'collection', 'item_id', 'acquired')}
                    for scene in step.get('scenes', [])
                ],
                'scale_m': step.get('scale_m'),
            }
            for step in sorted(unit['steps'], key=lambda record: record['step'])
        ],
        'driver': (
            {
                'source': unit['driver']['source'],
                'params': unit['driver']['params'],
                'payload_sha256': unit['driver']['payload_sha256'],
            }
            if unit.get('driver')
            else None
        ),
    }
    payload = json.dumps(canonical, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return f'ds1.{_sha256_hex(payload)[:16]}'


def build_manifest(*, prediction_date: str, pipeline_version: str, model_version: str = None,
                   units, driver=None, run_id: str = None, produced_at: str = None,
                   extra: dict = None) -> dict:
    """Assemble a manifest from unit records, stamping each unit's `dataset_version`."""
    if not units:
        raise ManifestError('a manifest needs at least one prediction unit')
    stamped = []
    for unit in units:
        versioned = dict(unit)
        versioned['dataset_version'] = dataset_version(unit)
        stamped.append(versioned)
    manifest = {
        'schema': SCHEMA,
        'prediction_date': prediction_date,
        'pipeline_version': pipeline_version,
        'model_version': model_version,
        'run_id': run_id,
        'produced_at': produced_at or datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'dataset_version': run_dataset_version(stamped),
        'sources': SOURCES,
        'scenes_enumerated': all(unit.get('scenes_enumerated') for unit in stamped),
        'driver': driver,
        'units': stamped,
    }
    if extra:
        manifest['extra'] = extra
    return manifest


def run_dataset_version(units) -> str:
    """Run-level `dataset_version`: the hash of every unit's version, ordered.

    A run-level version lets a consumer compare two days cheaply ("did any input
    change?"); the per-unit versions say *which* district changed.
    """
    ordered = sorted(
        ((unit.get('district_id'), unit.get('horizon'), unit['dataset_version']) for unit in units),
        key=lambda row: (str(row[0]), str(row[1])),
    )
    payload = json.dumps(ordered, separators=(',', ':')).encode('utf-8')
    return f'ds-run.{_sha256_hex(payload)[:16]}'


def unit_lookup(manifest: dict) -> dict:
    """`{(district_id, horizon): dataset_version}` for stamping published rows."""
    lookup = {}
    for unit in manifest.get('units', []):
        lookup[(str(unit.get('district_id')), unit.get('horizon'))] = unit.get('dataset_version')
    return lookup


def validate_manifest(manifest: dict, *, expected_units=None) -> list:
    """Return a list of problems (empty = valid). Never repairs silently."""
    problems = []
    if not isinstance(manifest, dict):
        return ['manifest is not an object']
    if manifest.get('schema') != SCHEMA:
        problems.append(f"schema is {manifest.get('schema')!r}, expected {SCHEMA!r}")
    for field in ('prediction_date', 'pipeline_version', 'units'):
        if not manifest.get(field):
            problems.append(f'missing required field {field!r}')
    units = manifest.get('units') or []
    if not units:
        problems.append('manifest has no units')
    seen = set()
    for unit in units:
        key = (unit.get('district_id'), unit.get('horizon'))
        if key in seen:
            problems.append(f'duplicate unit {key}')
        seen.add(key)
        for step in unit.get('steps', []):
            for field in REQUIRED_STEP_FIELDS:
                if step.get(field) in (None, '', [], {}):
                    problems.append(f"unit {key}: step {step.get('step')} missing {field}")
        recorded = unit.get('dataset_version')
        recomputable = bool(unit.get('steps')) and all(
            all(step.get(field) not in (None, '', [], {}) for field in ('step', 'tensor_sha256', 'shape'))
            for step in unit.get('steps', [])
        )
        if recorded and recomputable:
            recomputed = dataset_version(unit)
            if recomputed != recorded:
                problems.append(
                    f'unit {key}: dataset_version {recorded} does not match the content hash '
                    f'{recomputed} — the manifest was edited after it was built'
                )
        elif not recorded:
            problems.append(f'unit {key}: no dataset_version')
    if manifest.get('dataset_version'):
        recomputed_run = run_dataset_version(units)
        if recomputed_run != manifest['dataset_version']:
            problems.append(
                f"run dataset_version {manifest['dataset_version']} does not match {recomputed_run}"
            )
    if expected_units is not None and len(units) != expected_units:
        problems.append(f'manifest covers {len(units)} units, expected {expected_units}')
    return problems


def write_manifest(manifest: dict, path) -> str:
    """Write the manifest and return its sha256 (recorded in the run manifest)."""
    from pathlib import Path

    problems = validate_manifest(manifest)
    if problems:
        raise ManifestError('refusing to write an invalid manifest:\n  - ' + '\n  - '.join(problems))
    payload = json.dumps(manifest, indent=2, sort_keys=False) + '\n'
    Path(path).write_text(payload, encoding='utf-8')
    return _sha256_hex(payload.encode('utf-8'))


def read_manifest(path) -> dict:
    """Read a manifest, rejecting one that fails validation."""
    from pathlib import Path

    manifest = json.loads(Path(path).read_text(encoding='utf-8'))
    problems = validate_manifest(manifest)
    if problems:
        raise ManifestError(f'{path} is not a valid scene manifest:\n  - ' + '\n  - '.join(problems))
    return manifest
