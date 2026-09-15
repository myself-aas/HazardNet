"""Real-artifact smoke tests, not claims of predictive/scientific accuracy."""
import numpy as np
import pytest
from fastapi import HTTPException
from model_service.app import invoke, INPUT_BYTES, MODEL_SHA256


def test_actual_tflite_outputs_are_finite_deterministic_and_provenanced():
    data = np.zeros(INPUT_BYTES // 4, dtype='<f4').tobytes()
    first = invoke(data)
    assert first == invoke(data)
    assert len(first['probabilities']) == 8
    assert sum(first['probabilities']) == pytest.approx(1, abs=1e-5)
    assert 0 <= first['severity'] <= 1
    assert first['model_sha256'] == MODEL_SHA256


def test_rejects_nonfinite_input():
    with pytest.raises(HTTPException):
        invoke(np.full(INPUT_BYTES // 4, np.nan, dtype='<f4').tobytes())


def test_http_auth_and_exact_size(monkeypatch):
    from fastapi.testclient import TestClient
    from model_service.app import app
    client = TestClient(app)
    monkeypatch.setenv('MODEL_SERVICE_API_KEY', 'test-key')
    assert client.post('/predict', content=b'').status_code == 401
    headers = {'Authorization': 'Bearer test-key', 'Content-Type': 'application/octet-stream'}
    assert client.post('/predict', headers=headers, content=b'').status_code == 422
    result = client.post('/predict', headers=headers, content=bytes(INPUT_BYTES))
    assert result.status_code == 200
    assert result.json()['model_sha256'] == MODEL_SHA256
