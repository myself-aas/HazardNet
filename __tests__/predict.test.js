/** @jest-environment node */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

test('the handwritten inference and tensor request runtime is retired', () => {
  for (const file of ['backend/inference.js', 'backend/tfjs.js', 'backend/middleware/validation.js', 'backend/utils/normalization.js', 'backend/utils/predictionCache.js']) {
    expect(existsSync(path.resolve(file))).toBe(false);
  }
  expect(readFileSync('backend/routes/predict.js', 'utf8')).toContain('serveStoredPrediction');
  expect(readFileSync('serverless/predict.js', 'utf8')).toContain('serveStoredPrediction');
  // …and the deployed entry point still routes /api/predict to it.
  expect(readFileSync('api/[endpoint].js', 'utf8')).toContain("predict: () => import('../serverless/predict.js')");
});
