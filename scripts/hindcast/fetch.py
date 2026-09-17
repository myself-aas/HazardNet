#!/usr/bin/env python3
"""Weather drivers for a hindcast window, from the Open-Meteo historical archive.

This is the only part of the package that touches the network, and it is deliberately
small: one endpoint, six daily variables, batched at 32 stations per request, cached on
disk so a re-run (and every test) works offline.

**Why Open-Meteo and not the CDS API**: the product behind this endpoint is ERA5 /
ERA5-Land-era reanalysis, which is the same family the pipeline's Phase 2 blueprint names
for historical features (see `docs/architecture/TARGET_ARCHITECTURE.md` §2, ingestion
layer), and it needs no credential — the CDS client would need an owner key before a single
row could be scored. When the owner wires CDS, this module is the one file to switch.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'
DAILY_VARIABLES = (
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_sum',
    'wind_speed_10m_max',
    # Both wind drivers the archive offers are fetched on purpose. The shipped pipeline feeds
    # the physics track (and the CNN's ERA5-Land wind band) the *sustained* 10 m maximum, which
    # at a district centroid under a landfalling cyclone is a fraction of what the district
    # experienced; the gust field is the closer proxy. Fetching both lets the hindcast measure
    # the difference instead of recommending it blind (scripts/hindcast/score.py
    # `wind_driver_scenarios`).
    'wind_gusts_10m_max',
    'et0_fao_evapotranspiration',
)
MAX_STATIONS_PER_REQUEST = 32
PRODUCT = 'Open-Meteo historical archive (ERA5 / ERA5-Land era reanalysis)'


class FetchError(RuntimeError):
    """The archive could not be read, and no cache covers the gap."""


def _cache_path(cache_dir: Path, key: str) -> Path:
    return cache_dir / f'{key}.json'


def _request(url: str, *, attempts: int = 3, timeout: int = 60) -> dict:
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as response:
                return json.loads(response.read().decode('utf-8'))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt < attempts:
                time.sleep(2 * attempt)
    raise FetchError(f'{url} failed after {attempts} attempts: {last_error}')


def fetch_daily(locations, start_date, end_date, *, cache_dir, offline=False) -> dict:
    """Daily series per location.

    `locations` is a list of `{'id', 'name', 'lat', 'lng'}`. Returns
    `{location_id: {'latitude', 'longitude', 'elevation', 'daily': {var: [values]},
    'time': [...]}}` — the archive returns the location's grid cell, which is recorded
    rather than replaced by the request coordinates.

    The cache key covers the dates and the exact station list, so a re-run for a different
    episode cannot read another episode's weather.
    """
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    series: dict = {}
    for index in range(0, len(locations), MAX_STATIONS_PER_REQUEST):
        batch = locations[index:index + MAX_STATIONS_PER_REQUEST]
        key = ':'.join([start_date, end_date, ','.join(str(loc['id']) for loc in batch)])
        digest = __import__('hashlib').sha256(key.encode('utf-8')).hexdigest()[:24]
        cached = _cache_path(cache_dir, f'om-{start_date}-{end_date}-{digest}')
        if cached.exists():
            payload = json.loads(cached.read_text(encoding='utf-8'))
        elif offline:
            raise FetchError(
                f'offline mode: no cached drivers for stations {index}..{index + len(batch) - 1} '
                f'({start_date}..{end_date}). Run once with network access to populate '
                f'{cache_dir}.'
            )
        else:
            query = urllib.parse.urlencode({
                'latitude': ','.join(f"{loc['lat']:.4f}" for loc in batch),
                'longitude': ','.join(f"{loc['lng']:.4f}" for loc in batch),
                'start_date': start_date,
                'end_date': end_date,
                'daily': ','.join(DAILY_VARIABLES),
                'timezone': 'UTC',
            })
            payload = _request(f'{ARCHIVE_URL}?{query}')
            cached.write_text(json.dumps(payload), encoding='utf-8')

        entries = payload if isinstance(payload, list) else [payload]
        if len(entries) != len(batch):
            raise FetchError(
                f'the archive returned {len(entries)} locations for a {len(batch)}-station '
                'request; refusing to guess which station is which'
            )
        for loc, entry in zip(batch, entries):
            daily = entry.get('daily') or {}
            for variable in DAILY_VARIABLES:
                if variable not in daily:
                    raise FetchError(f"station {loc['name']}: the archive response has no {variable}")
            series[loc['id']] = {
                'name': loc['name'],
                'requested': {'lat': loc['lat'], 'lng': loc['lng']},
                'grid_cell': {'lat': entry.get('latitude'), 'lng': entry.get('longitude'),
                              'elevation_m': entry.get('elevation')},
                'time': daily['time'],
                'daily': {variable: daily[variable] for variable in DAILY_VARIABLES},
            }
    return series


DRIVERS_SCHEMA = 'hazardnet-hindcast-drivers/v1'


def load_series(path) -> dict:
    """Read a committed driver series (`data/hindcast/drivers/<episode>.json`).

    The series is committed so a report can be recomputed and audited offline — `check`
    rebuilds every per-district number from this file and fails when the report and the
    drivers disagree. A driver file that is merely *cached* could not do that.
    """
    payload = json.loads(Path(path).read_text(encoding='utf-8'))
    if payload.get('schema') != DRIVERS_SCHEMA:
        raise FetchError(f"{path}: schema {payload.get('schema')!r} != {DRIVERS_SCHEMA!r}")
    series = payload.get('series')
    if not isinstance(series, dict) or not series:
        raise FetchError(f'{path}: no `series`')
    for district_id, station in series.items():
        missing = [variable for variable in DAILY_VARIABLES if variable not in (station.get('daily') or {})]
        if missing:
            raise FetchError(f'{path}: station {district_id} is missing {missing}')
    return series


def save_series(series: dict, path, *, episode_id: str, start_date: str, end_date: str) -> str:
    """Write the driver series next to the episodes, for commit."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        'schema': DRIVERS_SCHEMA,
        'episode_id': episode_id,
        'product': PRODUCT,
        'endpoint': ARCHIVE_URL,
        'variables': list(DAILY_VARIABLES),
        'requested_window': {'start_date': start_date, 'end_date': end_date},
        'fetched_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'note': (
            'Daily reanalysis values per district centroid, exactly as fetched. Committed so the '
            'report computed from them can be re-derived offline (see scripts/hindcast/README.md).'
        ),
        'series': series,
    }
    path.write_text(json.dumps(payload, indent=1, sort_keys=True) + '\n', encoding='utf-8')
    return str(path)


def window_bounds(onset_date: str, lead_days: int) -> tuple:
    """The dates a `lead_days`-ahead forecast for `onset_date` would have covered.

    The live pipeline issues `prediction_date` and reads forecast values over the following
    `horizon_days` (see `scripts/auto_forecast.py::get_openmeteo_forecast`). Reconstructed
    here as `prediction_date = onset − lead_days`, window `(prediction_date, onset]`.
    """
    onset = date.fromisoformat(onset_date)
    prediction = date.fromordinal(onset.toordinal() - lead_days)
    return prediction.isoformat(), onset.isoformat()
