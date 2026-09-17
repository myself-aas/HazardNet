"""Ground-truth guards for public model claims (Phase 0).

The failure this file exists to prevent, in one sentence: the site advertised
figures the repository could not produce. "98.8 % accuracy", "95.6 % spatial
accuracy", "~1.2 M parameters" and 10/20/30-day horizons were all published
while no artefact, metric file or implementation backed them.

These tests pin the *reality* the copy is allowed to describe:

  * horizons advertised in copy == horizons the code actually accepts
  * the retired accuracy/parameter numbers stay retired
  * `confidence` is not described as physics/model agreement, because the
    pipeline computes it as the model's own softmax
  * the shipped snapshot's coverage is stated, not implied to be 64 districts

They are cheap, they run without network access, and they fail loudly with
instructions rather than just an assertion error.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE_ROUTES = ROOT / 'frontend' / 'src' / 'content' / 'site-routes.json'
FORECAST_ROW = ROOT / 'backend' / 'utils' / 'forecastRow.js'
AUTO_FORECAST = ROOT / 'scripts' / 'auto_forecast.py'
PUBLISHED_MODEL_CARD = ROOT / 'assets' / 'docs' / 'MODEL_CARD.md'
CANONICAL_MODEL_CARD = ROOT / 'docs' / 'MODEL_CARD.md'
PRODUCT_SPEC = ROOT / 'docs' / 'PRODUCT_SPEC.md'
SNAPSHOT = ROOT / 'frontend' / 'public' / 'data' / 'forecasts-latest.json'

# Numbers that no artefact in this repository can produce. If one of these ever
# becomes measurable, delete it from here *and* cite the artefact in
# docs/MODEL_CARD.md — do not simply re-add the number to the copy.
RETIRED_CLAIMS = [
    '98.8',
    '95.6',
    '1.2M',
    '1.2 M',
]


# Every file that authors user-facing text. `prerender.mjs` is included because
# it emits the JSON-LD `featureList` — a public claim surface that is not derived
# from site-routes.json, and the one that kept advertising 10/20/30-day horizons
# after the route copy had been corrected.
COPY_SOURCES = [
    SITE_ROUTES,
    ROOT / 'frontend' / 'scripts' / 'prerender.mjs',
]
COPY_COMPONENT_GLOBS = [
    'frontend/src/pages/*.tsx',
    'frontend/src/components/**/*.tsx',
]


# Block comments are not user-facing text. A JSX comment such as
# `{/* ── 16-day forecast table ── */}` describes the weather panel's data
# window, not a published hazard horizon, and must not be read as copy.
BLOCK_COMMENT = re.compile(r'\{?/\*.*?\*/', re.S)


def _copy_text() -> str:
    """All user-facing copy as one string, from every authoring surface."""
    parts = []
    for path in COPY_SOURCES:
        text = path.read_text(encoding='utf-8')
        parts.append(BLOCK_COMMENT.sub(' ', text) if path.suffix != '.json' else text)
    for pattern in COPY_COMPONENT_GLOBS:
        for path in sorted(ROOT.glob(pattern)):
            if 'node_modules' in path.parts or '__tests__' in path.parts:
                continue
            parts.append(BLOCK_COMMENT.sub(' ', path.read_text(encoding='utf-8')))
    return '\n'.join(parts)


def _code_horizons() -> set[str]:
    """The horizon set the ingest/publish code actually accepts."""
    text = FORECAST_ROW.read_text(encoding='utf-8')
    match = re.search(r'VALID_HORIZONS\s*=\s*\[([^\]]*)\]', text)
    assert match, 'VALID_HORIZONS not found in backend/utils/forecastRow.js'
    return set(re.findall(r"'([^']+)'", match.group(1)))


def test_expected_files_exist():
    for path in (SITE_ROUTES, FORECAST_ROW, AUTO_FORECAST, CANONICAL_MODEL_CARD, PRODUCT_SPEC):
        assert path.exists(), f'missing {path.relative_to(ROOT)}'


def test_published_model_card_is_a_pointer():
    """Two cards that must agree will drift. One of them must be a pointer."""
    text = PUBLISHED_MODEL_CARD.read_text(encoding='utf-8')
    assert 'docs/MODEL_CARD.md' in text or 'MODEL_CARD.md' in text, (
        'assets/docs/MODEL_CARD.md should point at the canonical card'
    )
    assert len(text) < 6000, (
        'assets/docs/MODEL_CARD.md has grown into a second copy of the model card. '
        'Keep the canonical card in docs/MODEL_CARD.md and leave a pointer here.'
    )


def test_retired_claims_stay_retired():
    """No user-facing copy may quote an unverifiable performance figure."""
    copy = _copy_text()
    skin = re.sub(r'\\u[0-9a-fA-F]{4}', ' ', copy)  # decoded later; raw scan is fine
    offenders = [claim for claim in RETIRED_CLAIMS if claim in skin]
    assert not offenders, (
        f'user-facing copy quotes retired model figures: {offenders}. '
        'See docs/MODEL_CARD.md §9 — either cite a committed artefact and un-retire it, '
        'or remove the number from the copy.'
    )


HORIZON_CONTEXT = re.compile(r'outlook|horizon|lead time|forecast', re.I)
# A phrase that offers a horizon set *as unavailable* is honest disclosure, not
# a claim — e.g. "a 10/20/30-day horizon set is specified in ADR 0005 but has not
# been implemented". Those are exempt; anything else must match the code.
HORIZON_DISCLAIMER = re.compile(
    r'not\s+(?:been\s+)?implemented'
    r'|never\s+implemented'
    r'|not\s+published'
    r'|not\s+advertised'
    r'|does\s+not\s+advertise'
    r'|retired'
    r'|only\s+accepts',
    re.I,
)


def _advertised_horizons(copy: str) -> set[str]:
    """Day-counts presented as forecast horizons, excluding explicit disclaimers.

    Three shapes count as a horizon *claim*:

      A. "<n>-day outlook/horizon/forecast"      — a day-count modifying a horizon noun
      B. "horizon — <n> or <m> days"             — the horizon noun introducing the set
      C. "10/20/30-day"                          — an explicit multi-horizon set

    Deliberately *not* counted: rolling analysis windows ("30-day trend"), data
    windows ("Open-Meteo serves at most about 16 days") and tensor geometry
    ("a 10-day composite per step"). Those are statements about other things, and
    treating them as horizon claims would make the guard unusable.
    """
    advertised: set[str] = set()
    horizon_noun = r'(?:outlooks?|horizons?|forecasts?|lead[ -]time)'

    # A day-count introduced by one of these is describing a data window or a
    # rolling analysis period, not an advertised forecast horizon.
    not_a_horizon = r'(?:about|at most|up to|within|previous|last|next|past)\s+(?:about\s+)?$'
    # ...and a day-count attached to a weather *feed* ("current conditions + 48h +
    # 16-day forecast") is describing that feed's window, not HazardNet's
    # published hazard horizon. Right now that is exactly Open-Meteo's 16-day
    # deterministic limit, which the copy elsewhere cites as the reason the
    # horizons stop where they do.
    weather_feed = re.compile(r'(?:weather|Open-Meteo|conditions)[^.]{0,30}$', re.I)

    for pattern in (
        re.compile(rf'\d+(?:\s*[-/]\s*\d+)*(?:\s*(?:and|or|,)\s*\d+)*[- ]days?\s+{horizon_noun}', re.I),
        # No hyphen ranges here: "Survives 14-21 days waterlogged" is agronomy
        # guidance, not a horizon set. A hyphenated range only counts as a claim
        # when a horizon noun directly modifies it (pattern A).
        re.compile(rf'{horizon_noun}[^.]{{0,60}}?\d+(?:\s*(?:/|,|and|or)\s*\d+)*\s*days?\b', re.I),
        re.compile(r'\d+(?:\s*/\s*\d+)+[- ]days?\b'),
    ):
        for match in pattern.finditer(copy):
            for num in re.finditer(r'\d+', match.group(0)):
                at = match.start() + num.start()
                # "about 16 days", "up to 16 days" — a data window, not a horizon.
                if re.search(not_a_horizon, copy[max(0, at - 24): at], re.I):
                    continue
                # "… + 48h + 16-day forecast" — that feed's window, not our horizon.
                if weather_feed.search(copy[max(0, at - 160): at]):
                    continue
                # Mentions of an unsupported set are honest only when disclaimed.
                if HORIZON_DISCLAIMER.search(copy[at: at + 120]):
                    continue
                advertised.add(num.group(0))
    return advertised


def test_advertised_horizons_match_the_code():
    """Copy may only advertise horizons the pipeline actually produces."""
    copy = _copy_text()
    code_horizons = _code_horizons()
    advertised = _advertised_horizons(copy)

    assert advertised, 'could not parse any horizon phrase out of the site copy'

    expected = {h.split('_')[0] for h in code_horizons}
    unsupported = advertised - expected
    assert not unsupported, (
        f'copy advertises {sorted(unsupported)}-day horizons but the code only accepts '
        f'{sorted(code_horizons)}. ADR 0005 describes a 10/20/30-day set that was never '
        'implemented — either implement it or keep it out of the copy.'
    )


def test_disclaimed_horizons_are_explicitly_disclaimed():
    """If the copy mentions a horizon the code does not support, it must say so.

    This is the honest-documentation half of the guard above: the ADR's
    10/20/30-day set may be *mentioned*, but never without being marked as
    not implemented.
    """
    copy = _copy_text()
    code_days = {h.split('_')[0] for h in _code_horizons()}
    # Slash form only ("10/20/30-day"): the unambiguous notation for an ADR
    # horizon set. Hyphen ranges describe other things in this codebase.
    for match in re.finditer(r'\d+(?:\s*/\s*\d+)+[- ]days?\b', copy):
        phrase_days = set(re.findall(r'\d+', match.group(0)))
        if phrase_days <= code_days:
            continue
        tail = copy[match.end(): match.end() + 200]
        assert HORIZON_DISCLAIMER.search(tail), (
            f'copy mentions the unsupported horizon set "{match.group(0)}" without saying it '
            'is not implemented. Tail: ' + tail[:120]
        )


def test_confidence_is_not_described_as_model_physics_agreement():
    """`confidence` is the model's softmax, not a track-agreement measure."""
    copy = _copy_text()
    banned = [
        re.compile(r'confidence[^.]{0,120}agrees with the physics', re.I),
        re.compile(r'describes how (much|well) the (model|two)[^.]{0,60}agree', re.I),
        re.compile(r'tracks agree, the record is labelled with a high confidence', re.I),
    ]
    offenders = [p.pattern for p in banned if p.search(copy)]
    assert not offenders, (
        'copy claims confidence measures model/physics agreement. The pipeline writes the '
        'softmax score there (scripts/auto_forecast.py → run_inference → confidence), and the '
        f'physics track is computed from the model\'s own class choice. Offenders: {offenders}'
    )


def test_physics_track_is_independent_in_the_pipeline():
    """The physics track must not be conditioned on the model's own class.

    Phase 0 recorded the defect: ``scripts/auto_forecast.py`` scored only the
    class the model had already chosen (``if hazard == 'Tropical Cyclone': …
    elif …``, default ``0.50``), so "physics cross-check" could only ever
    confirm the model's magnitude — never contradict its choice. Phase 2 fixed
    it. This guard keeps the fix: reintroducing a branch on the predicted class
    fails here.
    """
    source = AUTO_FORECAST.read_text(encoding='utf-8')
    assert 'compute_physics_scores(' in source, (
        'the pipeline no longer calls the independent physics module — the eight '
        'formulas live in scripts/physics_severity.py and are unit-tested in '
        'scripts/tests/test_physics_severity.py'
    )
    # The drivers are weather, not the model's answer.
    drivers = source.split('physics_drivers = {', 1)[1].split('}', 1)[0]
    assert 'hazard' not in drivers, (
        'the physics inputs are conditioned on the model\'s predicted class again: '
        f'{drivers.strip()[:200]}'
    )
    # And the old shape must not come back.
    for banned in (
        r"if hazard == 'Tropical Cyclone'",
        r"physics_severity\s*=\s*0\.50",
        r"om_calc_flood\([^)]*precip_total_mm[^)]*precip_total_mm[^)]*\)",
    ):
        assert not re.search(banned, source), (
            f'auto_forecast.py matches the Phase 0 defect pattern /{banned}/ — the physics '
            'track is dependent on the model again (docs/PRODUCT_SPEC.md §5.4)'
        )


def _route_copy(path: str) -> str:
    """All strings under one route of site-routes.json, as one text block."""
    data = json.loads(SITE_ROUTES.read_text(encoding='utf-8'))
    for route in data.get('routes', []):
        if route.get('path') == path:
            return json.dumps(route)
    raise AssertionError(f'route {path} not found in site-routes.json')


def test_physics_track_change_is_disclosed_for_already_published_records():
    """Copy must not quietly claim a fix for records the old pipeline produced.

    The snapshot on the site today was generated by the model-conditioned
    version, so the limitation is still true *of those rows* — and the pipeline
    will only produce independent rows on its next run. The honest disclosure is
    therefore two-sided: say what changed and when, and say that each record
    carries the pipeline version that produced it.
    """
    methodology = _route_copy('/methodology')
    assert re.search(r'(all eight|8) hazard classes', methodology, re.I), (
        'the methodology page must state that all eight hazard classes are now '
        'scored independently (docs/PRODUCT_SPEC.md §5.4)'
    )
    assert re.search(r'(physics_top_hazard|physics_scores|pipeline version|provenance)',
                     methodology, re.I), (
        'the methodology page must point at the per-record evidence for the change '
        '(the physics track\'s own pick and/or the pipeline version stamped on each row)'
    )


def test_no_copy_claims_the_physics_track_is_still_model_conditioned():
    """Present-tense claims of the Phase 0 limitation are now false.

    "Physics severity is computed for the hazard class the model selected" was
    accurate before Phase 2 and is misleading after it. Such a phrase may only
    appear with a time qualifier (before / earlier / previous / older / until)
    in front of it.
    """
    copy = _copy_text()
    qualifier = re.compile(
        r'(befor|earlier|previous|older|until|histor|202[0-5]|pre-2026)', re.I
    )
    offenders = []
    for match in re.finditer(r'hazard class the model (?:had )?selected', copy, re.I):
        window = copy[max(0, match.start() - 220): match.start()]
        if not qualifier.search(window):
            offenders.append(copy[max(0, match.start() - 90): match.end() + 40].replace('\n', ' '))
    assert not offenders, (
        'copy states the model-conditioned physics track as current behaviour; qualify it '
        'with when it applied (docs/PRODUCT_SPEC.md §5.4). Offenders:\n  - '
        + '\n  - '.join(offenders)
    )

def test_snapshot_coverage_is_measured_not_assumed():
    """The shipped snapshot covers a subset of districts; record what it is.

    Not an assertion that coverage is complete — an assertion that whoever
    changes the pipeline cannot silently ship fewer districts without this
    test noticing and the number being written down.
    """
    if not SNAPSHOT.exists():
        return  # snapshot is optional in a bare checkout
    snap = json.loads(SNAPSHOT.read_text(encoding='utf-8'))
    horizons = snap.get('horizons', {})
    assert horizons, 'snapshot contains no horizons'
    coverage = {h: len({r.get('district_name') for r in rows}) for h, rows in horizons.items()}
    assert all(n > 0 for n in coverage.values()), f'snapshot horizon with zero districts: {coverage}'
    # 64 is the full map; anything less means the site is showing baseline data
    # for the rest, which the UI must label (see the dashboard baseline branch).
    incomplete = {h: n for h, n in coverage.items() if n < 64}
    if incomplete:
        spec = PRODUCT_SPEC.read_text(encoding='utf-8')
        assert 'coverage' in spec.lower(), (
            f'snapshot coverage is partial {incomplete} but docs/PRODUCT_SPEC.md does not '
            'state a coverage requirement'
        )
