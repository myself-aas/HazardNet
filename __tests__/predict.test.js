/** @jest-environment node */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

test('the handwritten inference and tensor request runtime is retired', () => {
  for (const file of ['backend/inference.js', 'backend/tfjs.js', 'backend/middleware/validation.js', 'backend/utils/normalization.js', 'backend/utils/predictionCache.js']) {
    expect(existsSync(path.resolve(file))).toBe(false);
  }
  expect(readFileSync('backend/routes/predict.js', 'utf8')).toContain('serveStoredPrediction');
  expect(readFileSync('api/predict.js', 'utf8')).toContain('serveStoredPrediction');
});
