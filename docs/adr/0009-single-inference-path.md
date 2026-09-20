# ADR 0009 — One inference path: the batch pipeline is the model; `/api/predict` becomes a read of stored forecasts

- **Status:** Accepted by the owner (2026-09-20); originally proposed 2026-09-17.
  Implemented in the working tree on 2026-09-20; deployment verification remains an operator task. Approval and acceptance criteria are recorded in
  [ADR 0014](0014-codebase-owner-decisions.md).
- **Context:** `docs/PRODUCT_SPEC.md` §5.7, `docs/MODEL_CARD.md` §7 (Phase 0 ground-truth audit);
  deployment plan Phase 1 Step 4 ("inference is decoupled from the web app"); ADR 0003 (deploy topology)
- **Supersedes:** the inference half of ADR 0003's server description; resolves audit backlog item
  "two models, two answers"

## Context

Historical observations below describe the proposal baseline. The handwritten scorer and tensor request path have now been removed; both HTTP runtimes use `backend/utils/storedPrediction.js`. See `docs/ops/2026-09-20-stored-forecasts.md` for the implemented contract.
The current daily workflow publishes Kaggle-produced results (ADR 0013); the legacy
`auto_forecast.py` path is not the current daily producer.

HazardNet has two code paths that both call themselves "the model", and only one of them is.

| | Path A — batch pipeline | Path B — interactive API |
| - | ---------------------- | ------------------------ |
| Code | `scripts/auto_forecast.py` | `backend/inference.js` |
| Weights | `Models/hazardnet_fp32.tflite` (790,504 B, sha256 in `Models/VERSION.json`), run via `tflite_runtime` | **none loaded** — `loadModel()` only awaits `tf.ready()` |
| Computation | the trained 3D CNN | eight hand-written linear scores, e.g. `Flash Flood: 2.8*maxPrecip + 2.0*ndwi − 1.8*sarVV`, labelled in-code "Hazard Logit Activations (3D Depthwise-Separable Squeeze-and-Excitation representations)" |
| Runs where | GitHub Actions, daily | self-hosted Express runtime (`backend/routes/predict.js`) |
| Output | `data/hazardnet_forecasts_latest.csv` → `frontend/public/data/forecasts-latest.json` → the site | `POST /api/predict` JSON envelope |

The audit then established three facts that decide this ADR:

1. **Path B is not deployed.** Per ADR 0003 the deployed serverless surface is `api/`. That directory
   contains `forecasts.js`, `ingest.js`, `metrics.js`, `v1/forecasts/{bulk,history,metadata}.js`,
   `v1/weather.js`, `v1/weather/batch.js` — **there is no predict handler**. In production
   `POST /api/predict` does not resolve to the Express route at all.
2. **No client can use it anyway.** `validateTensor` requires `req.body.tensor` with exactly
   614,400 floats. Every frontend caller sends a district, not a tensor: `Dashboard.tsx:317`
   (`{districtId, risk}`), `UploadPage.tsx:108` (`{rasterName, districtId}`), `usePrediction.ts:7`
   (whatever payload it is handed), `serviceWorker.ts:131` (replayed queue items). Each call receives
   `422 Tensor payload required`, so each falls into its client-side baseline branch — which is why
   the "Softmax classification" panel on the live site has never displayed a model output.
3. **Path B cannot be made to work as designed without rebuilding Path A inside the request path.**
   Producing the tensor requires Earth Engine (Sentinel-1/2 + Landsat + ERA5-Land, ~100 days of
   imagery per district), the Open-Meteo forecast, and the exact band/unit/normalisation contract.
   That work already exists once, in the pipeline, and a second implementation of it is precisely how
   the unit conventions in Phase 0 §6.3 drifted into "`om_*_temp_k` holds °C".

## Decision

**The batch pipeline is the only inference path.** Concretely:

1. **`/api/predict` is redefined as a read**, not a computation: it returns the newest stored
   forecast for a district + horizon, shaped into the envelope the frontend already consumes, with
   unknown fields explicitly `null` and a machine-readable list of what the stored row cannot fill.
   The adapter is `backend/utils/predictFromStore.js` (now shared by Express and Vercel through `storedPrediction.js`).
2. **The heuristic scorer is deleted**, not flag-gated. `backend/inference.js`, the tensor branch of
   `backend/middleware/validation.js`, `backend/utils/normalization.js`,
   `backend/utils/predictionCache.js`, `backend/tfjs.js` and `backend/routes/predict.js` go with it
   (Phase 4, after the read endpoint replaces the callers).
3. **On-demand refresh, if it is ever needed, is a queued job dispatch** — the API asks the pipeline
   to run for a district/horizon and returns a job handle, exactly as the deployment plan's Step 12
   specifies (`POST /v1/predict/run` → `GET /v1/predict/{job_id}`). It is **not** inline inference.
4. **If server-side per-request inference is ever reintroduced, it must load the real artifact** —
   TFLite/ONNX in a worker with the pipeline's preprocessing contract, never a second hand-written
   scorer. Reintroduction requires a superseding ADR with a measured latency budget.

The pipeline job is therefore a first-class service in the target architecture, with a contract
(`docs/architecture/TARGET_ARCHITECTURE.md` §3.3): districts and horizons in; rows **plus a coverage
stamp and provenance** out. The provenance stamp stops being cosmetic at that point, because the API
can no longer claim a model version the pipeline did not record.

## Consequences (proposal-era rationale; implementation status above)

**Good**

- One number, one origin. Every hazard number the public sees traces to an artifact with a committed
  hash, and `model_version` in any response describes the computation that actually produced it.
- The API becomes a read path: no 6.7 s CPU inference, no prediction cache, no tensor payloads
  (the current contract implies a 1.5–6 MB JSON body per request), no Earth Engine credentials in the
  request path, and no second copy of the band/unit contract.
- The dead-code surface disappears: the endpoint, its validator, its cache, its rate-limit lane
  (60 req/min) and its tests are all retired together, instead of continuing to imply a capability.

**Costly / needs managing**

- **The interactive "run a prediction now" product surface goes away.** Nothing of value is lost
  (it never worked in production), but the honest replacement is a stored-forecast read plus, later,
  a refresh request — and the UI must say "as of <prediction_date>" rather than implying real-time
  inference. `Dashboard.tsx`'s "Live model output" branch already reads `prediction_date`-style
  provenance from the envelope; Phase 4 rewires it.
- **Envelope fidelity is incomplete until Phase 2.** The snapshot carries `hazard_type`,
  `severity_score`, `model_severity`, `physics_severity`, `confidence`, dates and meteorological
  fields — but **not** `class_probabilities`, `top_3`, or the SAR/optical driver values
  (`ndvi`, `ndwi`, `sar_vv`, `soil_moisture`). The adapter returns `null` for those and lists them in
  `metadata.fields_unavailable`; the pipeline must emit per-class scores and the driver set for the
  envelope to become complete. Until then the UI shows "not recorded for this row", which is true.
- **`severity_bin` has two definitions until the deletion lands.** The adapter keeps the
  `≤0.33 / ≤0.66` thresholds from `inference.js`; a test pins the two implementations together so
  they cannot drift while `inference.js` still exists (that test is deleted with the file).
- Existing tests and load tests for the tensor path (`__tests__/api/predict.test.js`, parts of
  `__tests__/api/security.test.js`, `load-tests/predict.js`, `scripts/bench-predict.mjs`) must be
  retired or repurposed in the same change; `scripts/bench-predict.mjs` becomes a pipeline-inference
  benchmark, since that is now the only place latency is meaningful.

**Not decided here**

- Whether a future product need justifies a real inference worker (GPU/CPU) at all. The trigger is a
  measured user need for sub-daily, per-unit refresh — see `TARGET_ARCHITECTURE.md` §4.

## Verification

- `__tests__/predictFromStore.test.js` — asserts, against a real snapshot row, that the envelope
  (a) is schema-complete, (b) invents nothing: every value is either copied, derived by a documented
  rule, or listed as unavailable, and (c) declares exactly the fields it returns as `null`.
- Re-run in Phase 4 after the callers are rewired: the same test plus one that `POST /api/predict`
  with a district payload returns the stored forecast (not 422, not a fabricated number).
- The decision is falsified if any of these become true: a client gains a legitimate 614,400-float
  tensor to send; a user need appears for sub-daily per-unit refresh; or the pipeline's coverage
  stamp shows persistent district gaps that only on-request inference could fill.
