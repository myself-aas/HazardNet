#!/usr/bin/env python3
"""Source adapters: Sentinel-2, MODIS, ERA5-Land, Open-Meteo, FFWC, BMD.

DESIGN RULE — FIXTURE FIRST, NETWORK LAZY
----------------------------------------
Every adapter takes its payload from a *loader* function that reads either a
recorded fixture or the network. Nothing at import time touches a network, and the
`network` code path is the only one that needs `requests`/`ee`, imported inside the
call. That is what lets CI test the whole ingest path — including the failure
paths — without Earth Engine credentials.

The second rule: an adapter that cannot fetch **says so**. `fetch(...)` returns a
result object carrying `ok`, `reason`, `payload` and `source`; a run that got
nothing reports a gap instead of writing an empty composite that later reads as
"no cloud", "no rain" or "no flooding".
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

#: Sensor/collection registry. Kept here (not only in the scene manifest) because
#: the *ingest* has to know which product a name refers to before anything is
#: fetched; the manifest then records what was actually used.
COLLECTIONS = {
    'sentinel-2': {
        'asset': 'COPERNICUS/S2_SR_HARMONIZED',
        'bands': ('B2', 'B3', 'B4', 'B8', 'B8A', 'B11', 'B12'),
        'cloud_field': 'CLOUDY_PIXEL_PERCENTAGE',
        'max_cloud_pct': 30,
        'resolution_m': 10,
        'revisit_days': 5,
    },
    'sentinel-1': {
        'asset': 'COPERNICUS/S1_GRD',
        'bands': ('VV', 'VH'),
        'instrument_mode': 'IW',
        'resolution_m': 10,
        'revisit_days': 12,
        'note': 'the cloud-penetrating channel — monsoon months depend on it',
    },
    'landsat-8': {
        'asset': 'LANDSAT/LC08/C02/T1_L2',
        'bands': ('SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7', 'ST_B10'),
        'cloud_field': 'CLOUD_COVER',
        'max_cloud_pct': 30,
        'resolution_m': 30,
        'revisit_days': 16,
        'note': 'optical fallback when the S2 tile is fully cloud-covered',
    },
    'modis': {
        'asset': 'MODIS/061/MOD13Q1',
        'bands': ('NDVI', 'EVI'),
        'resolution_m': 250,
        'composite_days': 16,
        'lst_asset': 'MODIS/061/MOD11A1',
        'lst_bands': ('LST_Day_1km', 'LST_Night_1km'),
        'note': 'coarse but cloud-tolerant NDVI/LST record back to 2000 — the archive path',
    },
    'era5-land': {
        'asset': 'ECMWF/ERA5_LAND/DAILY_AGGR',
        'bands': (
            'temperature_2m', 'total_precipitation_sum',
            'volumetric_soil_water_layer_1', 'volumetric_soil_water_layer_3',
            'soil_temperature_level_1', 'surface_solar_radiation_downwards_sum',
        ),
        'resolution_deg': 0.1,
        'note': 'the only source here with real soil moisture — used for the soil drivers',
    },
    'open-meteo': {
        'endpoint': 'https://api.open-meteo.com/v1/forecast',
        'archive_endpoint': 'https://archive-api.open-meteo.com/v1/archive',
        'hourly_fields': (
            'temperature_2m', 'relative_humidity_2m', 'precipitation',
            'wind_speed_10m', 'surface_pressure', 'soil_moisture_0_to_1cm',
        ),
        'daily_fields': ('temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'wind_speed_10m_max'),
    },
    'ffwc': {
        'endpoint': 'https://www.ffwc.gov.bd/',
        'note': 'station water levels vs published danger levels; see hydrology.py',
    },
    'bmd': {
        'endpoint': 'https://live4.bmd.gov.bd/',
        'note': 'prose warning bulletins; see bulletins.py',
    },
}

#: Sentinel-2 imagery is unusable in the monsoon — this is the project's
#: "optical-only inputs" killer. Adapters expose the dry-season caveat so callers
#: can label a coverage gap instead of assuming cloud-free pixels exist.
MONSOON_MONTHS = (6, 7, 8, 9)


def is_monsoon(day) -> bool:
    """True during the south-west monsoon, when optical coverage collapses."""
    if isinstance(day, str):
        day = date.fromisoformat(day[:10])
    elif isinstance(day, datetime):
        day = day.date()
    return day.month in MONSOON_MONTHS


def ten_day_windows(end, *, count: int = 9) -> list:
    """The 9 consecutive decadal steps the model consumes, oldest first.

    Arithmetic copies `scripts/auto_forecast.py::fetch_historical_steps`
    EXACTLY — `end_date = today - (t-1)*10`, `start_date = end_date - 10 days` —
    because the manifest's windows are a claim about which imagery produced a
    prediction. A window that differs by a day from the live pipeline's window
    would make the lineage wrong in a way nobody could see.
    (`scripts/tests/test_etl_sources_cog.py` fails if the two drift apart.)

    The live call site passes the pair straight to an Earth Engine `filterDate`,
    whose end boundary is exclusive, so each step covers ten days of imagery; here
    both ends are recorded as dates for the manifest and the STAC queries.
    """
    if isinstance(end, str):
        end = date.fromisoformat(end[:10])
    windows = []
    for offset in range(count - 1, -1, -1):
        window_end = end - timedelta(days=10 * offset)
        window_start = window_end - timedelta(days=10)
        windows.append((window_start.isoformat(), window_end.isoformat()))
    return windows


class FetchResult(dict):
    """A fetch outcome. Dict subclass so it serialises straight into the run report."""

    @property
    def ok(self) -> bool:
        return bool(self.get('ok'))


def _result(source: str, *, ok: bool, payload=None, reason: str = None, fixture: bool = False,
            metadata: dict = None) -> FetchResult:
    return FetchResult({
        'source': source,
        'ok': ok,
        'payload': payload,
        'reason': reason,
        'fixture': fixture,
        'metadata': metadata or {},
        'retrieved_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    })


#: Fixtures live in the repository, and this module is imported from several working
#: directories (`python -m etl.cli` runs from `scripts/`, the tests run from the repo
#: root, a workflow may run from anywhere). Resolving the default against this file
#: rather than the cwd is what keeps `--input` free of assumptions about where the
#: caller stands — a relative default silently looked in `scripts/scripts/...`.
FIXTURE_DIR = Path(__file__).resolve().parents[1] / 'tests' / 'fixtures' / 'etl'


def load_fixture(name: str, *, fixtures_dir=None) -> dict:
    """Read a recorded payload. Missing fixtures are an error, not an empty payload.

    A fixture is how the ingest path is exercised without Earth Engine credentials:
    the payload is the *recorded* response of a real source, replayed offline. There
    is deliberately no `record` command here — the live fetches belong to
    `scripts/auto_forecast.py` (which has the credentials), and a half-implemented
    recorder would look like a working one.
    """
    path = (Path(fixtures_dir) if fixtures_dir else FIXTURE_DIR) / name
    if not path.exists():
        raise FileNotFoundError(
            f'fixture {path} not found — recorded payloads live in {FIXTURE_DIR} '
            '(see scripts/etl/README.md, "What is fixture-only")'
        )
    return json.loads(path.read_text(encoding='utf-8'))


# ── Sentinel-2 ───────────────────────────────────────────────────────────────

def sentinel2_window(start, end, *, max_cloud_pct: int = None, fixture=None, fixtures_dir=None) -> FetchResult:
    """Sentinel-2 SR scenes for a window, cloud-filtered.

    Reports `optical_gap: true` when nothing passed the cloud filter. That flag is
    the whole point: the previous pipeline silently substituted constant zeros, and
    a constant-zero optical band is indistinguishable from "clear sky, no signal".
    """
    spec = COLLECTIONS['sentinel-2']
    threshold = spec['max_cloud_pct'] if max_cloud_pct is None else max_cloud_pct
    if fixture:
        payload = load_fixture(fixture, fixtures_dir=fixtures_dir)
        scenes = payload.get('scenes', [])
        kept = [s for s in scenes if (s.get('cloud_cover') or 0) <= threshold]
        return _result(
            'sentinel-2', ok=bool(kept), payload={'scenes': kept, 'window': [start, end]},
            reason=None if kept else f'no scene under {threshold}% cloud in {start}..{end}',
            fixture=True,
            metadata={'asset': spec['asset'], 'max_cloud_pct': threshold, 'optical_gap': not kept,
                      'monsoon': is_monsoon(start), 'discarded': len(scenes) - len(kept)},
        )
    return _result(
        'sentinel-2', ok=False, reason='live Earth Engine fetch requires the `ee` extra (see scripts/etl/README.md)',
        metadata={'asset': spec['asset'], 'max_cloud_pct': threshold, 'optical_gap': True},
    )


# ── MODIS ────────────────────────────────────────────────────────────────────

def modis_window(start, end, *, fixture=None, fixtures_dir=None) -> FetchResult:
    """MODIS NDVI/EVI (MOD13Q1) plus LST (MOD11A1) for a window.

    MODIS is the *archive* path: 16-day composites back to 2000 are what make the
    2,931-event record checkable for the years before Sentinel-2 (2015+).
    """
    spec = COLLECTIONS['modis']
    if fixture:
        payload = load_fixture(fixture, fixtures_dir=fixtures_dir)
        composites = payload.get('composites', [])
        return _result(
            'modis', ok=bool(composites), payload={'composites': composites, 'window': [start, end]},
            reason=None if composites else f'no MOD13Q1 composite covers {start}..{end}',
            fixture=True,
            metadata={'asset': spec['asset'], 'lst_asset': spec['lst_asset'],
                      'composite_days': spec['composite_days']},
        )
    return _result('modis', ok=False, reason='live Earth Engine fetch requires the `ee` extra', metadata={'asset': spec['asset']})


# ── ERA5-Land ────────────────────────────────────────────────────────────────

def era5_land_daily(start, end, *, fixture=None, fixtures_dir=None) -> FetchResult:
    """ERA5-Land daily aggregates, including the two real soil layers.

    `volumetric_soil_water_layer_1/3` and `soil_temperature_level_1` are why this
    adapter exists: they replace the fabricated constant soil channels the live
    pipeline shipped (PRODUCT_SPEC §5 fix log `1.0-draft`).
    """
    spec = COLLECTIONS['era5-land']
    if fixture:
        payload = load_fixture(fixture, fixtures_dir=fixtures_dir)
        days = payload.get('days', [])
        return _result(
            'era5-land', ok=bool(days), payload={'days': days, 'window': [start, end]},
            reason=None if days else f'no ERA5-Land day in {start}..{end}',
            fixture=True,
            metadata={'asset': spec['asset'], 'bands': list(spec['bands']), 'resolution_deg': spec['resolution_deg']},
        )
    return _result('era5-land', ok=False, reason='live Earth Engine fetch requires the `ee` extra', metadata={'asset': spec['asset']})


# ── Open-Meteo ───────────────────────────────────────────────────────────────

def open_meteo_drivers(lat: float, lon: float, *, fixture=None, fixtures_dir=None,
                       url: str = None, params: dict = None, payload_bytes: bytes = None) -> FetchResult:
    """The live t0 driver block used by `scripts/auto_forecast.py`."""
    spec = COLLECTIONS['open-meteo']
    resolved_url = url or spec['endpoint']
    resolved_params = params or {
        'latitude': lat, 'longitude': lon,
        'hourly': ','.join(spec['hourly_fields']),
        'daily': ','.join(spec['daily_fields']),
        'forecast_days': 7, 'timezone': 'UTC',
    }
    if fixture:
        payload = load_fixture(fixture, fixtures_dir=fixtures_dir)
        blocks = payload.get('payloads') or payload.get('responses') or [payload]
        ok = all(block.get('hourly') for block in blocks)
        return _result(
            'open-meteo', ok=ok, payload={'responses': blocks},
            reason=None if ok else 'response had no hourly block (Open-Meteo returns an error body in that case)',
            fixture=True,
            metadata={'url': resolved_url, 'params': resolved_params,
                      'points': len(blocks), 'endpoint_kind': 'forecast'},
        )
    return _result('open-meteo', ok=False, reason='live fetch requires `requests` (see README)',
                   metadata={'url': resolved_url, 'params': resolved_params})


# ── Ingest summary ───────────────────────────────────────────────────────────

def summarize_fetches(results) -> dict:
    """Which streams a run actually has, in the form the run report stores."""
    summary = {}
    for result in results:
        source = result.get('source')
        entry = summary.setdefault(source, {'attempted': 0, 'ok': 0, 'failed': 0, 'reasons': []})
        entry['attempted'] += 1
        if result.get('ok'):
            entry['ok'] += 1
        else:
            entry['failed'] += 1
            if result.get('reason'):
                entry['reasons'].append(result['reason'])
    for entry in summary.values():
        entry['available'] = entry['ok'] > 0 and entry['failed'] == 0
        entry['partial'] = entry['ok'] > 0 and entry['failed'] > 0
    return summary


def coverage_gaps(results) -> list:
    """Human-readable list of the streams that came back empty.

    The publisher refuses to ship a run whose gaps are not recorded; this is the
    list that lands in `hazardnet_run_report.json`.
    """
    gaps = []
    for result in results:
        if result.get('ok'):
            continue
        metadata = result.get('metadata') or {}
        gaps.append({
            'source': result.get('source'),
            'reason': result.get('reason'),
            'monsoon': metadata.get('monsoon'),
            'optical_gap': metadata.get('optical_gap'),
        })
    return gaps
