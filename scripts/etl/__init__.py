"""HazardNet ingestion ETL (Phase 2, second increment).

Standard library only, on purpose: every transform here runs and is tested
without Earth Engine, GDAL, a database or a network, which is what lets CI verify
the ingestion contracts on every pull request. The parts that genuinely need
those dependencies (``psycopg``, ``rasterio``/GDAL, ``ee``) are imported lazily
inside the functions that use them and report their absence instead of failing at
import time.

Modules
-------
``districts``       the 64-district validation snapshot + spelling resolution
``events``          the historical hazard-event store (2000-2025 archive)
``scene_manifest``  per-prediction scene lineage + ``dataset_version``
``cog``             Cloud-Optimized GeoTIFF preprocessing (spec, validate, emit)
``hydrology``       FFWC river-level ingestion → the w3 hydrology stream
``bulletins``       BMD warning bulletins → structured advisories
``sources``         source adapters (Sentinel-2, MODIS, ERA5-Land, …)
``db``              SQL emission + optional Postgres/PostGIS loading
``cli``             ``python -m etl.cli <command>`` (everything has --dry-run)

The contracts are documented in ``scripts/etl/README.md`` and
``docs/architecture/TARGET_ARCHITECTURE.md`` §2.1/§3.
"""

__all__ = [
    'bulletins',
    'cog',
    'db',
    'districts',
    'events',
    'hydrology',
    'scene_manifest',
    'sources',
]

#: Bumped when an emitted artifact changes shape (run reports record it).
ETL_VERSION = 'etl/1.0.0'
