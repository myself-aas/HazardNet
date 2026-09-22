#!/usr/bin/env python3
"""The 64 districts the pipeline labels, as a *validation snapshot*.

WHY THIS FILE EXISTS
--------------------
The event store (``scripts/db/008_hazard_events_postgis.sql``) must reject an
event that names a district which does not exist, and the ETL must resolve the
two spellings in circulation — FAO GAUL 2015 (what the pipeline emits:
``Nawabganj``) and the current local spelling (what the site shows:
``Chapainawabganj``). The runtime district list comes from Earth Engine over the
network, so a committed snapshot is needed at build/validation time.

DERIVATION (do not hand-edit; regenerate from committed data)
-------------------------------------------------------------
  * names + order: ``scripts/tests/make_fixture_csv.py`` ``DISTRICTS`` (the
    64-name vocabulary the pipeline fixture uses);
  * ``pcode`` (BBS/GAUL district code) and ``division``: read off committed
    forecast rows — ``backend/data/forecasts/hazardnet_forecasts_latest.csv``,
    ``data/hazardnet_forecasts_latest.csv`` and ``data/manual_forecast.csv`` —
    looking each name up under its GAUL spelling when the modern spelling is not
    present. All 64 resolve.

The authoritative boundary geometry remains GEE/HDX (ADR 0005); this is a
name/code lookup, not a spatial source. ``scripts/tests/test_etl_events.py``
fails if the count, a duplicate, or the alias coverage drifts.
"""

# (district_name, division, pcode)
DISTRICTS = (
    ('Kurigram', 'Rangpur', '5809'),
    ('Rangpur', 'Rangpur', '5818'),
    ('Gaibandha', 'Rangpur', '5807'),
    ('Nilphamari', 'Rangpur', '5814'),
    ('Dinajpur', 'Rangpur', '5806'),
    ('Panchagarh', 'Rangpur', '5816'),
    ('Thakurgaon', 'Rangpur', '5820'),
    ('Lalmonirhat', 'Rangpur', '5810'),
    ('Rajshahi', 'Rajshahi', '5817'),
    ('Bogra', 'Rajshahi', '5805'),
    ('Sirajganj', 'Rajshahi', '5819'),
    ('Pabna', 'Rajshahi', '5815'),
    ('Naogaon', 'Rajshahi', '5811'),
    ('Natore', 'Rajshahi', '5812'),
    ('Chapainawabganj', 'Rajshahi', '5813'),
    ('Joypurhat', 'Rajshahi', '5808'),
    ('Mymensingh', 'Dhaka', '5787'),
    ('Netrokona', 'Dhaka', '5790'),
    ('Jamalpur', 'Dhaka', '5782'),
    ('Sherpur', 'Dhaka', '5793'),
    ('Sylhet', 'Sylhet', '5824'),
    ('Sunamganj', 'Sylhet', '5823'),
    ('Habiganj', 'Sylhet', '5821'),
    ('Moulvibazar', 'Sylhet', '5822'),
    ('Dhaka', 'Dhaka', '5778'),
    ('Gazipur', 'Dhaka', '5780'),
    ('Narayanganj', 'Dhaka', '5788'),
    ('Tangail', 'Dhaka', '5794'),
    ('Kishoreganj', 'Dhaka', '5783'),
    ('Manikganj', 'Dhaka', '5785'),
    ('Munshiganj', 'Dhaka', '5786'),
    ('Narsingdi', 'Dhaka', '5789'),
    ('Faridpur', 'Dhaka', '5779'),
    ('Gopalganj', 'Dhaka', '5781'),
    ('Madaripur', 'Dhaka', '5784'),
    ('Rajbari', 'Dhaka', '5791'),
    ('Shariatpur', 'Dhaka', '5792'),
    ('Khulna', 'Khulna', '5799'),
    ('Satkhira', 'Khulna', '5804'),
    ('Bagerhat', 'Khulna', '5795'),
    ('Jashore', 'Khulna', '5797'),
    ('Jhenaidah', 'Khulna', '5798'),
    ('Magura', 'Khulna', '5801'),
    ('Narail', 'Khulna', '5803'),
    ('Chuadanga', 'Khulna', '5796'),
    ('Kushtia', 'Khulna', '5800'),
    ('Meherpur', 'Khulna', '5802'),
    ('Barisal', 'Barisal', '5762'),
    ('Bhola', 'Barisal', '5763'),
    ('Jhalokati', 'Barisal', '5764'),
    ('Patuakhali', 'Barisal', '5765'),
    ('Pirojpur', 'Barisal', '5766'),
    ('Barguna', 'Barisal', '5761'),
    ('Chattogram', 'Chittagong', '5770'),
    ("Cox's Bazar", 'Chittagong', '5772'),
    ('Cumilla', 'Chittagong', '5771'),
    ('Feni', 'Chittagong', '5773'),
    ('Noakhali', 'Chittagong', '5776'),
    ('Lakshmipur', 'Chittagong', '5775'),
    ('Chandpur', 'Chittagong', '5769'),
    ('Brahmanbaria', 'Chittagong', '5768'),
    ('Khagrachhari', 'Chittagong', '5774'),
    ('Rangamati', 'Chittagong', '5777'),
    ('Bandarban', 'Chittagong', '5767'),
)


def _normalize(name: str) -> str:
    """Lowercase, letters and digits only (mirrors normalizeDistrictKey in the frontend)."""
    return ''.join(ch for ch in str(name).lower() if ch.isalnum())


#: FAO GAUL 2015 / historical spellings → canonical name used above. Keyed by
#: normalized spelling. Must stay in step with
#: ``frontend/src/lib/forecasts.ts`` DISTRICT_NAME_ALIASES and
#: ``scripts/tests/test_district_name_parity.py``.
ALIASES = {
    'brahamanbaria': 'Brahmanbaria',
    # GAUL/BBS renders Barisal "Barishal" and Khagrachhari "Khagrachari"; the
    # committed event archive uses both, and without these two the resolver
    # returned None and the loader refused the rows ("district ... is not one of
    # the 64"). `barishal` was already aliased in frontend/src/lib/forecasts.ts and
    # missing here — a parity drift in the direction the parity test does not
    # check (it asserts pipeline → site, not site → pipeline).
    'barishal': 'Barisal',
    'khagrachari': 'Khagrachhari',
    'chittagong': 'Chattogram',
    'comilla': 'Cumilla',
    'maulvibazar': 'Moulvibazar',
    'nawabganj': 'Chapainawabganj',
    'netrakona': 'Netrokona',
    'jessore': 'Jashore',
}

_BY_NORMALIZED = {_normalize(name): name for name, _, _ in DISTRICTS}
_BY_PCODE = {pcode: name for name, _, pcode in DISTRICTS if pcode}
NAMES = tuple(name for name, _, _ in DISTRICTS)
DIVISIONS = tuple(sorted({division for _, division, _ in DISTRICTS}))


def resolve(name_or_pcode):
    """Resolve any accepted spelling (or a pcode) to the canonical district name.

    Returns ``None`` when the value matches no district. Callers must treat that
    as an error rather than skipping the row: a district that vanishes without a
    record is the defect class this phase exists to remove.
    """
    if name_or_pcode is None:
        return None
    raw = str(name_or_pcode).strip()
    if not raw:
        return None
    if raw in _BY_PCODE:
        return _BY_PCODE[raw]
    key = _normalize(raw)
    if key in _BY_NORMALIZED:
        return _BY_NORMALIZED[key]
    return ALIASES.get(key)


def division_of(name: str):
    """Division of a canonical district name, or None."""
    for candidate, division, _ in DISTRICTS:
        if candidate == name:
            return division
    return None


def pcode_of(name: str):
    """Pcode of a canonical district name, or None."""
    for candidate, _, pcode in DISTRICTS:
        if candidate == name:
            return pcode
    return None
