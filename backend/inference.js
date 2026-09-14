import fs from 'node:fs';
import crypto from 'node:crypto';

const labels = JSON.parse(fs.readFileSync(new URL('../Models/labels.json', import.meta.url), 'utf8'));
const hazardClasses = Object.keys(labels).sort((a, b) => Number(a) - Number(b)).map((key) => labels[key]);
const modelHash = crypto.createHash('sha256')
  .update(fs.readFileSync(new URL('../Models/hazardnet_fp32.tflite', import.meta.url))).digest('hex');

// One authoritative inference path for self-host and Vercel. Native TFLite
// (including CONV_3D) runs in the authenticated model service, not a JS heuristic.
export async function predict(tensor) {
  const url = process.env.MODEL_SERVICE_URL;
  const key = process.env.MODEL_SERVICE_API_KEY;
  if (!url || !key) {
    const error = new Error('Trained model service is not configured');
    error.status = 503;
    throw error;
  }
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname)) {
    throw new Error('Model service requires HTTPS outside local development');
  }
  const values = await tensor.data();
  const body = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => body.writeFloatLE(value, index * 4));
  const response = await fetch(new URL('/predict', endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${key}` },
    body,
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error('Trained model service failed');
  const result = await response.json();
  if (result.model_sha256 !== modelHash || !Array.isArray(result.probabilities)
    || result.probabilities.length !== hazardClasses.length
    || result.probabilities.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
    || Math.abs(result.probabilities.reduce((sum, value) => sum + value, 0) - 1) > 0.001
    || !Number.isFinite(result.severity) || result.severity < 0 || result.severity > 1) {
    throw new Error('Model provenance or output validation failed');
  }
  const probabilities = hazardClasses.map((hazard, index) => ({ hazard, score: result.probabilities[index] }));
  const ranked = [...probabilities].sort((a, b) => b.score - a.score);
  return {
    hazard: ranked[0].hazard,
    confidence: ranked[0].score,
    top_3: ranked.slice(0, 3),
    class_probabilities: probabilities,
    severity_score: result.severity,
    severity_bin: result.severity <= 0.33 ? 'Low' : result.severity <= 0.66 ? 'Moderate' : 'High',
    source: 'tflite',
    model_sha256: modelHash,
  };
}
export { hazardClasses };
