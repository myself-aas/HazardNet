"""Tier-1 unit tests for the anchored severity normalizer (TRD UNIT-SEV-01/02/03).

Regression scope (2026-09-17 repair, docs/RUNBOOK_LOG.md): the deficit-space
flip detection in SeverityNormalizer.__init__ was dead code (it ran after
sorted(), which always yields ascending xs), so SeverityNormalizer("Drought")
— global SPEI config — and the BD Cold Wave (Tmin) config crashed at
construction. These tests pin the repaired behavior for BOTH the global
thresholds and the Bangladesh calibration (applied via apply_bd_thresholds).
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

TRAINING_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TRAINING_DIR))

import hazardnet_bd_thresholds as hbd  # noqa: E402
import hazardnet_scientific_pipeline as hsp  # noqa: E402


def _normalizers(bd_applied: bool):
    """Build a normalizer per hazard, optionally under BD calibration."""
    if bd_applied:
        hbd.apply_bd_thresholds(hsp)
    return {h: hsp.SeverityNormalizer(h) for h in hsp.SEVERITY_THRESHOLDS}


ALL_CONFIGS = pytest.param(False, id="global"), pytest.param(True, id="bd")


@pytest.mark.parametrize("bd_applied", ALL_CONFIGS)
def test_unit_sev_01_monotonicity_over_full_domain(bd_applied):
    """UNIT-SEV-01: to_severity is non-decreasing over the physical domain.

    For deficit-direction indices (Tmin, SPEI) severity must be non-decreasing
    in DEFICIT space — i.e. as the index DROPS, severity never drops.
    """
    for hazard, n in _normalizers(bd_applied).items():
        cfg = hsp.SEVERITY_THRESHOLDS[hazard]
        xs_raw = np.array([a[0] for a in cfg["anchors"]], dtype=float)
        lo, hi = xs_raw.min(), xs_raw.max()
        grid = np.linspace(lo, hi, 400)
        sv = np.array([n.to_severity(float(x)) for x in grid])
        deficit = xs_raw[0] > xs_raw[-1]  # index falls as severity rises
        if deficit:
            # severity must never drop as the index falls (grid reversed)
            assert np.all(np.diff(sv[::-1]) >= -1e-12), (
                f"{hazard}: severity decreases as conditions worsen (deficit space)"
            )
        else:
            assert np.all(np.diff(sv) >= -1e-12), (
                f"{hazard}: severity decreases as conditions worsen"
            )


@pytest.mark.parametrize("bd_applied", ALL_CONFIGS)
def test_unit_sev_02_round_trip_identity_at_anchors(bd_applied):
    """UNIT-SEV-02: to_index(to_severity(x)) == x at every anchor, all hazards."""
    for hazard, n in _normalizers(bd_applied).items():
        for x, _s in hsp.SEVERITY_THRESHOLDS[hazard]["anchors"]:
            back = n.to_index(n.to_severity(x))
            assert abs(back - x) < 1e-9, f"{hazard}: round-trip broke at anchor {x}"


@pytest.mark.parametrize("bd_applied", ALL_CONFIGS)
def test_unit_sev_03_tier_ladder_and_boundaries(bd_applied):
    """UNIT-SEV-03: watch < warning < severe; tier() correct at tier ± ε."""
    for hazard, n in _normalizers(bd_applied).items():
        t = n.tiers
        assert t["watch"] < t["warning"] < t["severe"], f"{hazard}: tier ladder"
        assert n.tier(t["severe"] + 1e-9) == "severe"
        assert n.tier(t["severe"] - 1e-9) == "warning"
        assert n.tier(t["warning"] + 1e-9) == "warning"
        assert n.tier(t["warning"] - 1e-9) == "watch"
        assert n.tier(t["watch"] + 1e-9) == "watch"
        assert n.tier(0.0) == "none"
        # every tier level must exist exactly in the anchor severities
        anchor_sevs = [s for _, s in hsp.SEVERITY_THRESHOLDS[hazard]["anchors"]]
        for v in t.values():
            assert any(abs(a - v) < 1e-9 for a in anchor_sevs), (
                f"{hazard}: tier {v} not present in anchors"
            )


def test_deficit_hazards_construct_after_repair():
    """Regression for the 2026-09-17 repair: the two deficit-direction
    hazards must CONSTRUCT (they crashed before — the flip detection was
    dead code after sorted())."""
    # Global config: Drought (SPEI, descending anchors)
    n = hsp.SeverityNormalizer("Drought")
    assert abs(n.to_severity(-1.5) - 0.60) < 1e-9  # severe drought anchor
    # BD config: Cold Wave switches to Tmin (16..4 C, descending anchors)
    hbd.apply_bd_thresholds(hsp)
    n = hsp.SeverityNormalizer("Cold Wave")
    assert abs(n.to_severity(16.0) - 0.10) < 1e-9  # mild cold spell onset
    assert abs(n.to_severity(4.0) - 1.0) < 1e-9    # extreme cold wave
    # colder must never be LESS severe
    assert n.to_severity(5.0) >= n.to_severity(6.0)


def test_int_sev_bd_01_all_57_proofs_pass():
    """INT-SEV-BD-01: the full Bangladesh proof suite (57 obligations)."""
    hbd.apply_bd_thresholds(hsp)
    checks = hbd.validate_bd_thresholds(hsp)
    assert len(checks) >= 57, f"expected >= 57 proof obligations, got {len(checks)}"
    failed = [name for name, ok in checks if not ok]
    assert not failed, f"BD threshold proofs failed: {failed}"
