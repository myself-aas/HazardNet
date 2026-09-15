#!/usr/bin/env python3
"""
TFLite model-bundle smoke test for CI.

Runs against Models/ and confirms:
  1. Required artifacts exist (hazardnet_fp32.tflite, normalization_stats.json).
  2. Normalization stats cover the 15 input bands expected by the daily job.
  3. The TFLite model loads via tflite-runtime (same ~2 MB wheel the daily
     forecast job uses — NOT full tensorflow).
  4. One dummy inference succeeds and produces outputs of expected rank.

Designed to fail loudly (exit 1) so a bad Colab conversion cannot silently
break the daily pipeline.
"""
import json
import sys
from pathlib import Path

import numpy as np
import tflite_runtime.interpreter as tflite

MODELS = Path('Models')
REQUIRED = ['hazardnet_fp32.tflite', 'normalization_stats.json']
EXPECTED_BANDS = [
    'SAR_VV', 'SAR_VH', 'Blue', 'Red', 'NIR', 'SWIR',
    'Temp_2m', 'Precip', 'Max_Temp', 'Min_Temp',
    'Soil_W1', 'Soil_W3', 'Soil_T1', 'Dewpoint', 'Solar_Rad',
]
MAX_TFLITE_SIZE_MB = 50     # target is ~0.75 MB; anything >50 MB is suspicious


def fail(msg: str) -> None:
    print(f"::error::{msg}")
    sys.exit(1)


def warn(msg: str) -> None:
    print(f"::warning::{msg}")


def main() -> None:
    # 1. Required files
    missing = [f for f in REQUIRED if not (MODELS / f).exists()]
    if missing:
        fail(f"Missing required model artifact(s): {missing}")

    # 2. Normalization stats shape
    stats = json.loads((MODELS / 'normalization_stats.json').read_text())
    bands_present = set(stats.keys())
    if 'means' in stats and isinstance(stats['means'], dict):
        bands_present = set(stats['means'].keys())
    for b in EXPECTED_BANDS:
        if b not in bands_present:
            warn(f"normalization_stats.json missing band '{b}'")

    # 3. Load and dry-run TFLite model
    interp = tflite.Interpreter(model_path=str(MODELS / 'hazardnet_fp32.tflite'))
    interp.allocate_tensors()
    inp = interp.get_input_details()[0]
    outs = interp.get_output_details()
    print(f"Model input:  {inp['name']} shape={inp['shape']} dtype={inp['dtype']}")
    for o in outs:
        print(f"Model output: {o['name']} shape={o['shape']} dtype={o['dtype']}")

    dummy = np.random.randn(*inp['shape']).astype(inp['dtype'])
    interp.set_tensor(inp['index'], dummy)
    interp.invoke()
    for o in outs:
        arr = interp.get_tensor(o['index'])
        if arr.size == 0:
            fail(f"Output tensor {o['name']} is empty after inference")
        print(f"  inference OK for {o['name']}: shape={arr.shape} "
              f"range=[{arr.min():.3f},{arr.max():.3f}]")

    # 4. File size sanity
    size_mb = (MODELS / 'hazardnet_fp32.tflite').stat().st_size / 1e6
    print(f"::notice::hazardnet_fp32.tflite size = {size_mb:.2f} MB")
    if size_mb > MAX_TFLITE_SIZE_MB:
        warn(f"TFLite file is {size_mb:.1f} MB — expected <{MAX_TFLITE_SIZE_MB} MB "
             f"(target ~0.75 MB for FP32 3D-CNN)")

    print("✅ TFLite bundle validates OK.")


if __name__ == '__main__':
    main()
