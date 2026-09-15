/** @jest-environment node */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { predict, hazardClasses } from '../backend/inference.js';
const hash = crypto.createHash('sha256').update(fs.readFileSync('Models/hazardnet_fp32.tflite')).digest('hex');
const tensor = { data: async () => new Float32Array(15 * 10 * 64 * 64) };
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; delete process.env.MODEL_SERVICE_URL; delete process.env.MODEL_SERVICE_API_KEY; });
function configure(result = {}) {
  process.env.MODEL_SERVICE_URL = 'http://127.0.0.1:8000';
  process.env.MODEL_SERVICE_API_KEY = 'test';
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({
    probabilities: Array(8).fill(0.125), severity: 0.4, model_sha256: hash, ...result,
  }) });
}
test('eight labels in trained model order', () => {
  expect(hazardClasses).toHaveLength(8);
  expect(hazardClasses[0]).toBe('Cold Wave');
});
test('fails closed without model service, never emits heuristic predictions', async () => {
  await expect(predict(tensor)).rejects.toMatchObject({ status: 503 });
});
test('validates model provenance and emits established response shape', async () => {
  configure();
  const result = await predict(tensor);
  expect(result).toMatchObject({ source: 'tflite', model_sha256: hash, severity_score: 0.4, hazard: 'Cold Wave' });
  expect(result.top_3).toHaveLength(3);
  expect(result.class_probabilities).toHaveLength(8);
  expect(global.fetch.mock.calls[0][1].body.length).toBe(2457600);
});
test.each([{ model_sha256: 'wrong' }, { probabilities: [1] }, { severity: NaN }, { probabilities: Array(8).fill(1) }])(
  'rejects bad output or another model: %j', async (response) => {
    configure(response);
    await expect(predict(tensor)).rejects.toThrow('validation failed');
  },
);
test('does not mask upstream errors', async () => {
  configure(); global.fetch.mockResolvedValue({ ok: false });
  await expect(predict(tensor)).rejects.toThrow('service failed');
});
