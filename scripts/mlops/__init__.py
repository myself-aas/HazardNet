#!/usr/bin/env python3
"""`scripts.mlops` — MLOps for the forecast model (Phase 3).

WHAT THIS PACKAGE IS FOR
------------------------
Phase 3 asks for four things the repository has never had: a versioned model
registry, a calibration step so `confidence` means something, nightly evaluation
(POD/FAR/CSI + drift), and a champion/challenger promotion policy. The plan's
project-killer #1 is exactly the gap these close: *"uncalibrated confidence +
auto-publish"*.

The package is deliberately dependency-free and offline: every calculation is
plain Python over plain data, so the whole MLOps surface can be tested in CI
without TensorFlow, without a database, and without network access. The parts
that genuinely need a model runtime (fitting a calibration map on real labelled
outcomes, quantizing an artifact) take their inputs from files and **say so**
when those files are absent, rather than producing a plausible-looking number.

Modules
-------
`metrics`      verification scores (POD/FAR/CSI), reliability (ECE/Brier),
               drift (PSI) — with the "undefined is not zero" rule.
`calibration`  isotonic (PAVA) and Platt fitting, application, and the refusal
               rules that stop an unfit map from ever being stamped on a row.
`registry`     what artifacts exist, what exactly they are, and what stage they
               are allowed to be in — including the handshake audit against
               `Models/VERSION.json`.
`evaluate`     joining predictions to observed outcomes and reporting what could
               and could not be verified.
`cli`          `python -m mlops.cli {audit,registry,evaluate,calibrate,drift,promote}`.

The rule that shapes all of it: **no metric without evidence, no promotion
without a human.** A run with no observed outcomes reports `insufficient_truth`
and the counts that made it so; it never reports a score computed from an empty
denominator, and nothing reaches `champion` without a named approver.
"""

from __future__ import annotations

import sys
from pathlib import Path

#: Version of the MLOps tooling itself, stamped into every report it writes so a
#: reader can tell which rules produced the numbers.
MLOPS_VERSION = 'mlops/1.0.0'

#: Repository root, derived from this file (never the cwd): the CLI is run from
#: several directories, and a cwd-relative path silently reads the wrong tree.
REPO_ROOT = Path(__file__).resolve().parents[2]

__all__ = ['MLOPS_VERSION', 'REPO_ROOT']
