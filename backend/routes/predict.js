import express from 'express';
import { validateTensor } from '../middleware/validation.js';
import { normalize } from '../utils/normalization.js';
import { predict } from '../inference.js';
import metrics from '../metrics.js';
import { getModelInfo } from '../modelInfo.js';
import { getTf } from '../tfjs.js';
import { createPredictionCache } from '../utils/predictionCache.js';

const router = express.Router();

// Identical tensor payloads within the TTL bypass the ~6.7 s CPU inference.
const predictionCache = createPredictionCache();

router.post('/', validateTensor, async (req, res) => {
  metrics.apiRequestsTotal.inc();
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  let tensor = req.tensor;
  let normalized = null;
  const tf = await getTf();

  // Full-tensor cache lookup: same payload + TTL → serve the previous result.
  try {
    const tensorValues = await tensor.array();
    const cached = predictionCache.get(tensorValues);
    if (cached) {
      tf.dispose(tensor);
      tensor = null;
      return res.json({
        ...cached,
        inference: { ...cached.inference, cached: true },
      });
    }
  } catch {
    // Cache is best-effort; fall through to inference on any lookup issue.
  }

  try {
    normalized = await normalize(tensor);
    const start = Date.now();
    const result = await predict(normalized);
    const latency = Date.now() - start;
    metrics.inferenceLatency.observe(latency);
    const metadata = {
      input_shape: [1, 15, 10, 64, 64],
      normalization_applied: true,
      transpose_applied: 'NCDHW -> NDHWC'
    };
    const inferenceInfo = {
      latency_ms: latency,
      model_version: getModelInfo().version,
      timestamp: new Date().toISOString()
    };
    const responseBody = {
      prediction: result,
      inference: inferenceInfo,
      metadata: metadata
    };
    try {
      const tensorValues = await tensor.array();
      predictionCache.set(tensorValues, responseBody);
    } catch {
      // best-effort caching
    }
    res.json(responseBody);
  } catch (err) {
    console.error('Prediction error:', err);
    res.status(err.status === 503 ? 503 : 502).json({ error: err.status === 503
      ? 'Trained model service is not configured. No prediction was generated.'
      : 'Trained model inference failed. No prediction was generated.' });
  } finally {
    if (normalized) tf.dispose(normalized);
    if (tensor) tf.dispose(tensor);
  }
});

export default router;
