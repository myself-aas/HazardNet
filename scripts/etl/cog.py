#!/usr/bin/env python3
"""COG (Cloud-Optimized GeoTIFF) preprocessing: spec, validation, job planning.

WHY
---
The deployment plan asks for COG preprocessing so that satellite inputs can be
archived, re-read without the Earth Engine dependency, and (later) served as
tiles. HazardNet currently re-asks Earth Engine for every retrain, which means the
training set is not reproducible: the imagery behind a 2024 run may not be the
imagery a 2026 run sees for the same dates, because composites are computed
server-side from whatever scenes the collection held that day.

A COG archive fixes that by pinning pixels: one file per scene (or per composite
step) with a content hash, so a `dataset_version` can name actual bytes.

WHAT THIS MODULE DOES — AND WHAT IT DOES NOT
--------------------------------------------
It defines the COG contract (tiling, overviews, compression, CRS), validates the
metadata a writer is about to emit, plans the jobs, and generates the exact GDAL
commands. It does **not** contain a raster writer: this repository has no GDAL in
CI, and a hand-rolled TIFF writer that silently produces a non-COG would be worse
than no writer at all. `gdal_translate`/`gdaladdo` (or rio-cogeo) do the writing;
this module makes the output checkable, and `verify_cog` re-checks it afterwards.

Purity: standard library only. `sniff_tiff` reads 8 bytes, not the whole file.
"""

from __future__ import annotations

import hashlib
import json
import struct
from pathlib import Path

SCHEMA = 'hazardnet-cog-manifest/v1'

#: Contract every archived COG must satisfy. Values are the Cloud-Optimized
#: GeoTIFF 1.1 recommendations plus HazardNet's own choices documented inline.
COG_SPEC = {
    'image_format': 'GTiff',
    'crs': 'EPSG:4326',
    'blocksize': 512,
    'compression': ('DEFLATE', 'LZW', 'ZSTD', 'WEBP', 'JPEG'),
    'photometric': 'MINISBLACK',
    'interleave': ('BAND', 'PIXEL'),
    'overview_resampling': ('average', 'nearest', 'bilinear', 'mode', 'gauss'),
    # Overview levels are the halving series below the full resolution.
    'overview_levels': (2, 4, 8, 16, 32),
}

ALLOWED_BLOCKSIZES = (256, 512, 1024)

#: Per-source band contract: physical scale factor and nodata are what turn a
#: stored integer into a usable value, and getting them wrong is the classic
#: silent ingest bug (a reflectance of 0.62 stored as 6200 read as 6200).
BAND_SPECS = {
    'sentinel-2': {
        'scale': 0.0001, 'dtype': 'uint16', 'nodata': 0,
        'bands': {
            'B2': 'blue', 'B3': 'green', 'B4': 'red', 'B8': 'nir',
            'B8A': 'nir-narrow', 'B11': 'swir1', 'B12': 'swir2',
        },
        'wavelength_nm': {'B2': 490, 'B3': 560, 'B4': 665, 'B8': 842, 'B8A': 865, 'B11': 1610, 'B12': 2190},
    },
    'landsat-8': {
        'scale': 2.75e-5, 'dtype': 'uint16', 'nodata': 0,
        'bands': {'SR_B2': 'blue', 'SR_B3': 'green', 'SR_B4': 'red', 'SR_B5': 'nir',
                  'SR_B6': 'swir1', 'SR_B7': 'swir2', 'ST_B10': 'lst'},
        'wavelength_nm': {'SR_B2': 480, 'SR_B3': 560, 'SR_B4': 655, 'SR_B5': 865,
                          'SR_B6': 1610, 'SR_B7': 2200, 'ST_B10': 11000},
    },
    'modis': {
        # MOD13Q1 (NDVI/EVI, 16-day) and MOD11A1 (LST, daily) ship int16 with a
        # 0.0001 scale for NDVI/EVI and 0.02 K for LST.
        'scale': 0.0001, 'dtype': 'int16', 'nodata': -3000,
        'bands': {'NDVI': 'ndvi', 'EVI': 'evi', 'LST_Day_1km': 'lst_day', 'LST_Night_1km': 'lst_night'},
        'wavelength_nm': {'NDVI': (620, 876), 'EVI': (620, 876), 'LST_Day_1km': 11000, 'LST_Night_1km': 11000},
        'per_band_scale': {'LST_Day_1km': 0.02, 'LST_Night_1km': 0.02},
    },
    'sentinel-1': {
        # Backscatter is stored as float32 dB by the archive; no rescaling.
        'scale': 1.0, 'dtype': 'float32', 'nodata': -9999,
        'bands': {'VV': 'vv', 'VH': 'vh'}, 'wavelength_nm': {'VV': 56000, 'VH': 56000},
    },
    'era5-land': {
        'scale': 1.0, 'dtype': 'float32', 'nodata': -9999,
        'bands': {
            'temperature_2m': 't2m', 'total_precipitation_sum': 'tp',
            'volumetric_soil_water_layer_1': 'swvl1', 'soil_temperature_level_1': 'stl1',
        },
        'wavelength_nm': {},
    },
}


class CogError(ValueError):
    """Raised for a COG job or metadata that violates the contract."""


# ── header sniffing ──────────────────────────────────────────────────────────

def sniff_tiff(header: bytes) -> dict:
    """Identify a TIFF/COG container from its first bytes.

    Reads the byte-order mark and magic number only — the point is to catch
    "this is a PNG" or "this is a truncated download" before a downstream step
    treats it as raster data. Returns ``{is_tiff, byte_order, first_ifd_offset}``.
    """
    if len(header) < 8:
        return {'is_tiff': False, 'reason': 'file shorter than a TIFF header (8 bytes)'}
    if header[:2] == b'II':
        byte_order, endian = 'little', '<'
    elif header[:2] == b'MM':
        byte_order, endian = 'big', '>'
    else:
        return {'is_tiff': False, 'reason': f'bad byte-order mark {header[:2]!r}'}
    magic = struct.unpack(endian + 'H', header[2:4])[0]
    if magic not in (42, 43):
        return {'is_tiff': False, 'reason': f'bad magic number {magic} (expected 42 or 43)'}
    offset = struct.unpack(endian + 'I', header[4:8])[0]
    return {
        'is_tiff': True,
        'byte_order': byte_order,
        'bigtiff': magic == 43,
        'first_ifd_offset': offset,
        'phantom_cog': offset == 0,  # GDAL writes a leading IFD for COGs; 0 means not laid out for streaming
    }


def is_cog_like(path) -> dict:
    """Cheap structural check of a file on disk (no GDAL needed)."""
    p = Path(path)
    if not p.exists():
        raise CogError(f'{path} does not exist')
    with open(p, 'rb') as handle:
        result = sniff_tiff(handle.read(8))
    result['path'] = str(p)
    result['bytes'] = p.stat().st_size
    return result


# ── metadata validation ──────────────────────────────────────────────────────

def validate_cog_metadata(meta: dict, *, source: str = None) -> list:
    """Validate the write parameters of one COG. Returns problems (empty = valid)."""
    problems = []
    if not isinstance(meta, dict):
        return ['metadata is not an object']

    if meta.get('driver', 'GTiff') not in ('GTiff', 'COG'):
        problems.append(f"driver {meta.get('driver')!r} is not GTiff/COG")
    crs = str(meta.get('crs') or '').upper()
    if not crs:
        problems.append('crs is required (EPSG:4326 for this archive)')
    elif crs not in ('EPSG:4326', 'OGC:CRS84'):
        problems.append(f'crs {crs} is not EPSG:4326 — the archive is stored in WGS84 to match the event store')

    block = meta.get('blocksize') or meta.get('tiled')
    if not isinstance(block, int) or block not in ALLOWED_BLOCKSIZES:
        problems.append(f'blocksize {block!r} must be one of {ALLOWED_BLOCKSIZES} (COG 1.1)')

    compression = str(meta.get('compression') or '').upper()
    if compression not in COG_SPEC['compression']:
        problems.append(f'compression {compression!r} must be one of {COG_SPEC["compression"]}')

    interleave = str(meta.get('interleave') or 'BAND').upper()
    if interleave not in COG_SPEC['interleave']:
        problems.append(f'interleave {interleave!r} must be one of {COG_SPEC["interleave"]}')

    levels = meta.get('overview_levels')
    if levels is None:
        problems.append('overview_levels is required (the halving series, e.g. [2, 4, 8, 16])')
    else:
        levels = list(levels)
        if not levels:
            problems.append('overview_levels is empty — a single-resolution GeoTIFF is not a COG')
        if levels != sorted(levels) or len(set(levels)) != len(levels):
            problems.append(f'overview_levels {levels} must be strictly increasing')
        if levels and levels[0] != 2:
            problems.append('the first overview level must be 2 (half resolution)')
        for level in levels:
            if level < 2 or (level & (level - 1)) != 0:
                problems.append(f'overview level {level} is not a power of two ≥ 2')

    resampling = meta.get('overview_resampling')
    if resampling and str(resampling).lower() not in COG_SPEC['overview_resampling']:
        problems.append(f'overview_resampling {resampling!r} not in {COG_SPEC["overview_resampling"]}')

    if meta.get('nodata', '@absent') in ('@absent', None):
        # A null nodata is not "unknown but harmless": every source archived here
        # has a fill value, and an undeclared fill corrupts every statistic computed
        # from the raster (a 0-pixel reads as a real 0 reflectance / 0 K).
        problems.append('nodata must be declared explicitly (null/missing means the fill value is unspecified)')

    if source:
        if source not in BAND_SPECS:
            problems.append(f'unknown source {source!r}; known: {", ".join(sorted(BAND_SPECS))}')
        else:
            expected = BAND_SPECS[source]
            if meta.get('dtype') and str(meta['dtype']).lower() != expected['dtype']:
                problems.append(
                    f"dtype {meta['dtype']} does not match the {source} contract ({expected['dtype']})"
                )
            scale = meta.get('scale')
            if scale is not None and abs(float(scale) - expected['scale']) > 1e-12:
                problems.append(
                    f'scale {scale} does not match the documented {source} scale {expected["scale"]} '
                    '(changing it silently shifts every physical value)'
                )
    return problems


def default_metadata(source: str, *, blocksize: int = None) -> dict:
    """The contract defaults for a source, so callers do not invent their own."""
    if source not in BAND_SPECS:
        raise CogError(f'unknown source {source!r}')
    spec = BAND_SPECS[source]
    return {
        'driver': 'GTiff',
        'crs': 'EPSG:4326',
        'blocksize': blocksize or COG_SPEC['blocksize'],
        'compression': 'DEFLATE',
        'predictor': 2 if spec['dtype'] in ('uint16', 'int16') else 3,
        'interleave': 'BAND',
        'dtype': spec['dtype'],
        'nodata': spec['nodata'],
        'scale': spec['scale'],
        'overview_levels': list(COG_SPEC['overview_levels']),
        'overview_resampling': 'average' if source != 'modis' else 'mode',
    }


def scale_factor(source: str, band: str) -> float:
    """Physical scale for one band (per-band override wins over the source default)."""
    if source not in BAND_SPECS:
        raise CogError(f'unknown source {source!r}')
    spec = BAND_SPECS[source]
    return float(spec.get('per_band_scale', {}).get(band, spec['scale']))


def to_physical(source: str, band: str, raw_value: float, *, as_temperature_kelvin: bool = False) -> float:
    """Convert one stored pixel to its physical value.

    The MODIS LST bands are the reason this function exists: they are *not*
    NDVI-style 0.0001-scaled, they are 0.02 K steps, and reading them with the
    source default would understate land surface temperature by 50x.
    """
    value = float(raw_value) * scale_factor(source, band)
    if as_temperature_kelvin and 'LST' in band.upper():
        return value  # already Kelvin after scaling
    return value


# ── job planning + command generation ───────────────────────────────────────

def cog_path(source: str, item_id: str, band: str, *, acquired: str = None, root: str = 'cog') -> str:
    """Deterministic archive path. Date first, so listings are chronological."""
    safe_item = ''.join(ch if ch.isalnum() or ch in '-_.' else '_' for ch in str(item_id))
    day = (acquired or 'undated')[:10]
    return f'{root}/{source}/{day}/{safe_item}__{band}.tif'


def plan_job(*, source: str, item_id: str, band: str, href: str, acquired: str = None,
             metadata: dict = None, root: str = 'cog') -> dict:
    """One COG conversion job: input, output path, contract metadata, commands."""
    meta = dict(default_metadata(source))
    if metadata:
        meta.update(metadata)
    problems = validate_cog_metadata(meta, source=source)
    if problems:
        raise CogError(f'{source}/{item_id}/{band}: ' + '; '.join(problems))
    if band not in BAND_SPECS[source]['bands']:
        raise CogError(f'{source}: unknown band {band!r} (known: {", ".join(sorted(BAND_SPECS[source]["bands"]))})')
    destination = cog_path(source, item_id, band, acquired=acquired, root=root)
    return {
        'source': source,
        'item_id': str(item_id),
        'band': band,
        'href': href,
        'acquired': acquired,
        'output': destination,
        'metadata': meta,
        'translate_command': gdal_translate_command(href, destination, meta),
        'overview_command': gdaladdo_command(destination, meta),
    }


def gdal_translate_command(src: str, dst: str, meta: dict) -> list:
    """The exact `gdal_translate` argv that writes a contract-compliant COG."""
    command = [
        'gdal_translate',
        '-of', 'COG',
        '-co', f"BLOCKSIZE={meta['blocksize']}",
        '-co', f"COMPRESS={str(meta['compression']).upper()}",
    ]
    if meta.get('predictor') is not None:
        command += ['-co', f"PREDICTOR={int(meta['predictor'])}"]
    if meta.get('interleave'):
        command += ['-co', f"INTERLEAVE={str(meta['interleave']).upper()}"]
    command += [
        '-co', f"OVERVIEWS={'AUTO' if meta.get('overview_levels') else 'NONE'}",
        '-co', f"OVERVIEW_RESAMPLING={str(meta.get('overview_resampling', 'average')).upper()}",
        '-a_srs', str(meta['crs']),
    ]
    if meta.get('nodata') is not None:
        command += ['-a_nodata', str(meta['nodata'])]
    command += [str(src), str(dst)]
    return command


def gdaladdo_command(path: str, meta: dict) -> list:
    """Reference command that rebuilds the overview series (used for verification)."""
    return [
        'gdaladdo',
        '-r', str(meta.get('overview_resampling', 'average')),
        '--config', 'COMPRESS_OVERVIEW', str(meta.get('compression', 'DEFLATE')).upper(),
        str(path),
        *[str(level) for level in meta.get('overview_levels', [])],
    ]


def plan_jobs(items, *, root: str = 'cog') -> list:
    """Plan jobs for STAC-style items: `{source, item_id, band, href, acquired?}`."""
    jobs = []
    for item in items:
        jobs.append(plan_job(
            source=item['source'],
            item_id=item['item_id'],
            band=item['band'],
            href=item['href'],
            acquired=item.get('acquired'),
            metadata=item.get('metadata'),
            root=root,
        ))
    return jobs


def sha256_file(path, *, chunk: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        while True:
            block = handle.read(chunk)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def verify_cog(path, *, meta: dict = None) -> dict:
    """Post-write verification: structure, size and (when supplied) recorded hash.

    Full validation needs GDAL (`gdalinfo -json`), which CI does not have; the
    structural check plus the recorded hash still catches truncated files,
    non-TIFF outputs and post-write edits, and `verify_cog` says which checks it
    could not run instead of implying a complete validation.
    """
    header = is_cog_like(path)
    result = {'path': str(path), 'structural': header, 'checks_run': ['tiff_header', 'size'], 'problems': []}
    if not header.get('is_tiff'):
        result['problems'].append(header.get('reason') or 'not a TIFF container')
    if header.get('phantom_cog'):
        result['problems'].append('leading IFD offset is 0 — not laid out for streaming (not a valid COG)')
    if meta and meta.get('bytes') is not None and header.get('bytes') != meta['bytes']:
        result['problems'].append(f"size {header.get('bytes')} bytes ≠ recorded {meta['bytes']}")
    if meta and meta.get('sha256'):
        actual = sha256_file(path)
        result['sha256'] = actual
        result['checks_run'].append('sha256')
        if actual != meta['sha256']:
            result['problems'].append(f"sha256 {actual[:12]}… ≠ recorded {meta['sha256'][:12]}…")
    result['ok'] = not result['problems']
    return result


def build_cog_manifest(jobs, *, produced_at: str, root_note: str = None) -> dict:
    """Manifest of planned COGs (+hashes when the files exist).

    Doubles as the plan and as the record: a job whose file is missing is listed
    with `status: 'planned'`, never omitted, so an incomplete archive is visible.
    """
    entries = []
    for job in jobs:
        entry = {
            'source': job['source'],
            'item_id': job['item_id'],
            'band': job['band'],
            'path': job['output'],
            'crs': job['metadata']['crs'],
            'blocksize': job['metadata']['blocksize'],
            'compression': job['metadata']['compression'],
            'overview_levels': job['metadata']['overview_levels'],
        }
        path = Path(job['output'])
        if path.exists():
            entry.update({
                'status': 'present',
                'bytes': path.stat().st_size,
                'sha256': sha256_file(path),
            })
        else:
            entry['status'] = 'planned'
        entries.append(entry)
    return {
        'schema': SCHEMA,
        'produced_at': produced_at,
        'counts': {
            'jobs': len(entries),
            'present': sum(1 for entry in entries if entry['status'] == 'present'),
            'planned': sum(1 for entry in entries if entry['status'] == 'planned'),
        },
        'note': root_note or (
            'COG archive paths are content-addressed by sha256 in this manifest; '
            'a `planned` entry means the file has not been written yet.'
        ),
        'entries': entries,
    }


def write_json(payload, path) -> None:
    Path(path).write_text(json.dumps(payload, indent=2, sort_keys=False) + '\n', encoding='utf-8')
