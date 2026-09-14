"""Authenticated FP32 TFLite inference. No user-supplied executable models.
Input: normalized float32 little-endian NCDHW [1,15,10,64,64].
The Node API owns raw input validation and normalization with Models stats.
"""
import hashlib
import hmac
import os
from pathlib import Path
from threading import Lock

import numpy as np
from ai_edge_litert.interpreter import Interpreter
from fastapi import FastAPI, HTTPException, Request
from starlette.concurrency import run_in_threadpool

MODEL = Path(__file__).resolve().parents[1] / 'Models/hazardnet_fp32.tflite'
MODEL_SHA256 = hashlib.sha256(MODEL.read_bytes()).hexdigest()
INPUT_BYTES = 1 * 15 * 10 * 64 * 64 * 4
interpreter = Interpreter(model_path=str(MODEL), num_threads=2)
interpreter.allocate_tensors()
input_detail = interpreter.get_input_details()[0]
outputs = {entry['name']: entry for entry in interpreter.get_output_details()}
assert list(input_detail['shape']) == [1, 10, 64, 64, 15]
assert 'hazard_logits' in outputs and 'severity_pred' in outputs
lock = Lock()
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


def invoke(data: bytes):
    values = np.frombuffer(data, dtype='<f4')
    if not np.isfinite(values).all():
        raise HTTPException(422, 'Tensor must be finite')
    tensor = values.reshape(1, 15, 10, 64, 64).transpose(0, 2, 3, 4, 1).copy()
    with lock:
        interpreter.set_tensor(input_detail['index'], tensor)
        interpreter.invoke()
        logits = interpreter.get_tensor(outputs['hazard_logits']['index']).reshape(-1)
        severity = float(interpreter.get_tensor(outputs['severity_pred']['index']).reshape(-1)[0])
    if not np.isfinite(logits).all() or not np.isfinite(severity) or not 0 <= severity <= 1:
        raise HTTPException(502, 'Invalid model output')
    # Model exports logits, not class probabilities. Severity already has sigmoid.
    probs = np.exp(logits - logits.max())
    probs /= probs.sum()
    return {'probabilities': probs.tolist(), 'severity': severity, 'model_sha256': MODEL_SHA256}


@app.post('/predict')
async def predict(request: Request):
    key = os.environ.get('MODEL_SERVICE_API_KEY', '')
    if not key:
        raise HTTPException(503, 'Model service authentication is not configured')
    if not hmac.compare_digest(request.headers.get('authorization', ''), f'Bearer {key}'):
        raise HTTPException(401, 'Unauthorized')
    if request.headers.get('content-type', '').split(';')[0] != 'application/octet-stream':
        raise HTTPException(415, 'Expected float32 binary')
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > INPUT_BYTES:
            raise HTTPException(413, 'Tensor too large')
    if len(data) != INPUT_BYTES:
        raise HTTPException(422, 'Tensor size mismatch')
    return await run_in_threadpool(invoke, bytes(data))
