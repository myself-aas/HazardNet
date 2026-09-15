# HazardNet Edge Deployment Bundle

## Contents
- `hazardnet_int8.tflite` - Optimized FP32 model (TFLite CONV_3D requires FP32)
- `hazardnet_fp32.tflite` - FP32 baseline model
- `labels.json` - 8 hazard class labels
- `preprocessing_config.json` - Pre-computed normalization stats + band order
- `inference_example.py` - Standalone inference with normalization & NDHWC transpose
- `VERSION.json` - **Artifact handshake (tracked — do not gitignore).** Generated
  by `node scripts/gen-model-version.mjs`: per-artifact `bytes` + `sha256` and a
  `version` of `<package.json version>+model.<12-hex content hash>`. The backend
  reads it at boot (`backend/modelInfo.js`) and reports it as `model_version` in
  `/health` and the `POST /api/predict` envelope. **Regenerate and commit it in
  the same change as any artifact** — `npm test` (`__tests__/modelInfo.test.js`)
  and the CI `Model VERSION.json is current` gate both fail otherwise, and a
  missing file used to degrade `/api/predict` to the legacy literal
  `1.0-FP32 (legacy literal — VERSION.json missing)`.

## Input Spec
- Shape: (1, 15, 10, 64, 64) - [batch, channels, timesteps, height, width]
- Normalization: z-score with pre-computed per-band mean/std
- Transpose: NCDHW -> NDHWC handled automatically by inference script
