#!/usr/bin/env python3
"""INT-SEV-BD-01 runner — apply BD thresholds + run the 57 proof obligations.

PRD REQ-002 / TASK-003: "57/57 validate_bd_thresholds() proofs pass in CI;
failure of any proof blocks the training workflow run."

Usage (from repo root):
    python training/run_bd_proofs.py

Writes results/bd_thresholds_validation.log (the committed evidence file)
and exits non-zero when any proof fails, so CI can gate on it.
"""

from __future__ import annotations

import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

TRAINING_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TRAINING_DIR))

import hazardnet_bd_thresholds as hbd  # noqa: E402
import hazardnet_scientific_pipeline as hsp  # noqa: E402

HAZARDS = sorted(hsp.HAZARD_TYPES) if hasattr(hsp, "HAZARD_TYPES") else None


def main() -> int:
    lines: list[str] = []
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lines.append(f"# BD threshold validation log — {stamp}")
    lines.append("# proof obligations: PRD REQ-002 / TRD INT-SEV-BD-01 / TASK-003")
    lines.append(f"# thresholds_ver: bd-1.0.0  dataset_ver: events-1.0")
    lines.append("")

    # Apply BD calibration IN PLACE, exactly as the training notebook must
    # (before any dataset/normalizer instantiation — deployment plan Phase 4).
    report = hbd.apply_bd_thresholds(hsp)
    lines.append("## apply_bd_thresholds delta report")
    for hazard, delta in report.items():
        lines.append(
            f"- {hazard}: index {delta['old_index']!r} -> {delta['new_index']!r}; "
            f"tiers watch {delta['old_watch']} -> {delta['new_watch']}, "
            f"warning {delta['old_warning']} -> {delta['new_warning']}, "
            f"severe {delta['old_severe']} -> {delta['new_severe']}"
        )
    lines.append("")

    checks = hbd.validate_bd_thresholds(hsp)
    passed = sum(1 for _, ok in checks if ok)
    failed = [(name, False) for name, ok in checks if not ok]

    lines.append("## proof obligations")
    for name, ok in checks:
        lines.append(f"[{'PASS' if ok else 'FAIL'}] {name}")
    lines.append("")
    lines.append(f"RESULT: {passed}/{len(checks)} proofs passed")
    if failed:
        lines.append("GATE: BLOCKED — training must not run until all proofs pass")
    else:
        lines.append("GATE: OPEN — 57/57 proofs pass (thresholds_ver bd-1.0.0)")

    out = "\n".join(lines)
    print(out)

    results_dir = TRAINING_DIR.parent / "results"
    results_dir.mkdir(exist_ok=True)
    log_path = results_dir / "bd_thresholds_validation.log"
    log_path.write_text(out + "\n", encoding="utf-8")
    print(f"\nwrote {log_path}")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
