# HazardNet Edge Deployment Bundle

## Contents
- `hazardnet_int8.tflite` - Optimized FP32 model (TFLite CONV_3D requires FP32)
- `hazardnet_fp32.tflite` - FP32 baseline model
- `labels.json` - 8 hazard class labels
- `preprocessing_config.json` - Pre-computed normalization stats + band order
- `inference_example.py` - Standalone inference with normalization & NDHWC transpose

## Input Spec
- Shape: (1, 15, 10, 64, 64) - [batch, channels, timesteps, height, width]
- Normalization: z-score with pre-computed per-band mean/std
- Transpose: NCDHW -> NDHWC handled automatically by inference script
