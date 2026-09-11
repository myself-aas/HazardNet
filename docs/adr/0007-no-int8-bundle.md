# ADR 0007 — No INT8 model bundle; quantization path closed (CONV_3D constraint)

- **Status:** Accepted (2026-09-12) — resolves audit backlog #9 ("commit `hazardnet_int8.tflite` if the INT8 edge path is still planned; otherwise remove the int8 references")
- **Context:** Deployment guide §1.2 ("<2MB INT8 quantized"); `HazardNet.md` Edge Deployment Converter; audit backlog #9

## Context

The deployment guide's model story ends with an INT8-quantized sub-2MB edge
bundle, and `HazardNet.md`'s converter nominally produces one. The repo ships
`Models/hazardnet_fp32.tflite` (790,504 B, sha256-manifested in
`Models/VERSION.json`) with no INT8 variant. Backlog #9 asked which way to
resolve this.

## Evidence (all verifiable in-repo)

1. **INT8 quantization is technically blocked for this architecture.** TFLite's
   converter crashes on `CONV_3D` under INT8 (`conv3d.cc`) — recorded in the
   converter inside `HazardNet.md` ("Applying Optimize.DEFAULT (INT8) causes a
   runtime crash in conv3d.cc … INT8 quantization is safely bypassed"), in
   `assets/docs/MODEL_CARD.md` ("INT8 quantization bypassed due to TFLite
   CONV_3D kernel constraints … Model operates in native FP32"), and on the
   SPA's Documentation page ("Bypassed INT8 quantization due to CONV_3D
   operator constraints").
2. **The external bundle's `hazardnet_int8.tflite` is a misnomer.** The
   converter writes *optimized FP32* bytes to that filename
   (`HazardNet.md` bundle manifest: "hazardnet_int8.tflite — Optimized FP32
   model (TFLite CONV_3D requires FP32)"). No true INT8 artifact exists
   anywhere — repo or Kaggle bundles.
3. **No consumer of an INT8 artifact exists.** The Node server runs TFJS
   (`backend/inference.js` — never loads `.tflite`); the weekly Kaggle kernel
   loads `hazardnet_fp32.tflite` only (`MODEL_PATH`); the SPA does no
   in-browser model inference (on-demand inference goes through
   `POST /api/predict`).

## Decision

1. **No INT8 bundle will be committed** — none exists, and none can be
   produced for this architecture under TFLite today. The committed FP32
   bundle is the sole and complete model artifact set.
2. **The server guard keeps blocking `/hazardnet_int8.tflite`** (deviation
   from backlog #9's literal "remove the int8 references from server guards",
   deliberately): the external Kaggle bundle still produces a file *under that
   misnamed filename*, and model artifacts must never be publicly served
   regardless of their precision. A comment now documents the misnomer
   (`backend/server.js`).
3. **Accurate docs stay as-is:** `MODEL_CARD.md` and the SPA Documentation
   page already state the bypass and FP32-only reality — unchanged.
4. **`HazardNet.md` is left verbatim** (master research record; its converter
   script is the provenance of the external bundles). The misnomer is
   documented here instead. *Optional future ops:* rename the bundle artifact
   (e.g. `hazardnet_optimized_fp32.tflite`) in a future converter run — this
   would change external Kaggle bundle filenames; nothing in this repo
   consumes that file, so it is safe whenever convenient.
5. **Quantization is revisited only if** the architecture moves away from
   `CONV_3D`, a TFLite release gains INT8 `CONV_3D` support, or a real edge
   constraint (bundle size budget) materializes. Until then the edge story is:
   server-side TFJS inference + precomputed weekly forecasts (ADRs 0003/0005).

## Consequences

- `Models/` stays 790 KB FP32; the guide's "<2MB (INT8 quantized)" is
  design-era fiction — annotated in the guide (§1.2) alongside the existing
  reconciliation banner.
- No code changes beyond the guard comment; no test changes (nothing
  referenced INT8 behavior).
- Closes backlog #9; with it, every audit-backlog code item (1–9) is resolved
  — the only open halves are ops: backlog #4's Supabase flip (credentials)
  and backlog #8's first live ADM3 run (next Sunday pipeline).

## Verification checklist

- [x] Evidence traced: `HazardNet.md` (converter crash + misnamed bundle
      manifest), `assets/docs/MODEL_CARD.md` line 22, `frontend/src/pages/
      Documentation.tsx` (Format & Precision card), `Models/VERSION.json`
      (FP32-only manifest), notebook `MODEL_PATH` (FP32 only)
- [x] Server guard comment added; entry retained (defensive)
- [x] Guide §1.2 annotated; audit backlog #9 closed
- [ ] Optional: rename the misnamed artifact in a future converter run (ops)
