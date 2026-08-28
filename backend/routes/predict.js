import express from 'express';
import { validateTensor } from '../middleware/validation.js';
import { normalize } from '../utils/normalization.js';
import { predict } from '../inference.js';
import metrics from '../metrics.js';
import { getModelInfo } from '../modelInfo.js';
import { getTf } from '../tfjs.js';

const router = express.Router();

router.post('/', validateTensor, async (req, res) => {
  metrics.apiRequestsTotal.inc();
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  let tensor = req.tensor;
  let normalized = null;
  const tf = await getTf();

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
    res.json({
      prediction: result,
      inference: inferenceInfo,
      metadata: metadata
    });
  } catch (err) {
    console.error('Prediction error:', err);
    res.status(500).json({ error: 'Inference calculation failed' });
  } finally {
    if (normalized) tf.dispose(normalized);
    if (tensor) tf.dispose(tensor);
  }
});

export default router;
