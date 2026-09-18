# HazardNet Model Card — moved

The canonical model card now lives at **[`docs/MODEL_CARD.md`](../../docs/MODEL_CARD.md)**.

## Why this file changed (2026-09-17)

This location previously carried a one-page card whose performance figures — **98.8 %** event-based
cross-validation accuracy, **95.6 %** spatial leave-one-district-out accuracy and **~1.2 M**
parameters — could not be traced to any artefact in this repository: they appear in no notebook
cell, result file, CI log or commit. Two of them are additionally contradicted by the shipped
forecasts, which are saturated (the 2026-09-16 snapshot predicted the same hazard class for every
district at ≈1.0 confidence and ≈1.0 severity).

Those numbers were also repeated in user-facing copy. They have been **retired** and must not be
reused; `docs/MODEL_CARD.md` §9 lists every retired claim with the reason, and
`scripts/tests/test_model_claims.py` fails CI if they reappear in a documentation or copy surface.

The honest card documents what is verifiable: architecture and input geometry from the training
notebook, the committed artifact hashes, measured output-distribution behaviour, the input-integrity
problems at inference time (three channels fixed at training means; nine substituted from a
different source), the second heuristic inference path behind `POST /api/predict`, and the
evaluation that still has to be run before any accuracy claim is made.

*If you are looking for a stable public summary of the model, link to `docs/MODEL_CARD.md` — not to
a copy of it. Two documents that must agree will drift; the repository has one source of truth.*
