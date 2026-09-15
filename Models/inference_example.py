#!/usr/bin/env python3
"""HazardNet Edge Inference with Pre-computed Normalization"""
import numpy as np, tensorflow as tf, json, time, sys

def load_normalization_stats(config_path='preprocessing_config.json'):
    with open(config_path) as f: config = json.load(f)
    norm = config['normalization']
    means = np.array([norm['means'][b] for b in norm['band_order']], dtype=np.float32).reshape(1, -1, 1, 1, 1)
    stds = np.array([norm['stds'][b] for b in norm['band_order']], dtype=np.float32).reshape(1, -1, 1, 1, 1)
    return means, np.where(stds < 1e-8, 1.0, stds)

def normalize(raw_tensor, means, stds):
    return (raw_tensor.astype(np.float32) - means) / stds

def predict(tflite_path, raw_tensor, means, stds, labels_path='labels.json'):
    normalized = normalize(raw_tensor, means, stds)

    # Transpose NCDHW -> NDHWC for TFLite if necessary
    if normalized.shape[1] == 15 and normalized.shape[2] == 10:
        normalized = np.transpose(normalized, (0, 2, 3, 4, 1))

    interp = tf.lite.Interpreter(model_path=tflite_path)
    interp.allocate_tensors()
    inp = interp.get_input_details()[0]
    outs = interp.get_output_details()

    start = time.perf_counter()
    interp.set_tensor(inp['index'], normalized.astype(inp['dtype']))
    interp.invoke()
    latency = (time.perf_counter() - start) * 1000

    # Robust output extraction by shape
    hazard, severity = None, None
    for out in outs:
        if len(out['shape']) == 2 and out['shape'][1] == 8:
            hazard = interp.get_tensor(out['index'])[0]
        elif len(out['shape']) <= 2:
            severity = interp.get_tensor(out['index'])[0]

    if hazard is None: hazard = interp.get_tensor(outs[0]['index'])[0]
    if severity is None: severity = interp.get_tensor(outs[1]['index'])[0]
    if isinstance(severity, np.ndarray):
        severity = severity.item() if severity.size == 1 else severity[0]

    with open(labels_path) as f: labels = json.load(f)
    cls = int(np.argmax(hazard))
    return {
        'hazard': labels[str(cls)],
        'confidence': float(np.max(hazard)),
        'severity': float(severity),
        'latency_ms': latency
    }

if __name__ == '__main__':
    model = sys.argv[1] if len(sys.argv) > 1 else 'hazardnet_int8.tflite'
    means, stds = load_normalization_stats()
    r = predict(model, np.random.randn(1, 15, 10, 64, 64).astype(np.float32), means, stds)
    print(f"Hazard: {r['hazard']} (conf: {r['confidence']:.3f}) | Severity: {r['severity']:.4f} | Latency: {r['latency_ms']:.1f} ms")
