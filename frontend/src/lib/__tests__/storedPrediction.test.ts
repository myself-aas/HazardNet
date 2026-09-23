import {
  fetchStoredPrediction,
  shouldRetryStoredPrediction,
  StoredPredictionError,
} from '../storedPrediction';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

const validEnvelope = {
  prediction: { hazard: 'Flood', confidence: 0.9, severity_score: 0.5, confidence_kind: 'model_softmax_top_class' },
  provenance: { district_id: 'dhaka', district_name: 'Dhaka', prediction_date: '2026-09-20', target_date: '2026-09-27', horizon: '15_days' },
  inference: { served_from: 'stored-forecast', model_version: null },
};

test('requests a stored district and horizon, never a raster or tensor', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => validEnvelope });
  await expect(fetchStoredPrediction('dhaka', '15_days')).resolves.toMatchObject({
    prediction: { hazard: 'Flood', confidence: 0.9, severity_score: 0.5 },
    inference: { served_from: 'stored-forecast' },
  });
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/predict',
    expect.objectContaining({ body: JSON.stringify({ districtId: 'dhaka', horizon: '15_days' }) }),
  );
});

test('classifies HTTP 404 as uncovered, not a generic failure', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
  await expect(fetchStoredPrediction('unknown')).rejects.toMatchObject({
    name: 'StoredPredictionError',
    reason: 'uncovered',
    status: 404,
  });
});

test('classifies HTTP 429 as rate-limited', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });
  await expect(fetchStoredPrediction('dhaka')).rejects.toBeInstanceOf(StoredPredictionError);
  await expect(fetchStoredPrediction('dhaka')).rejects.toMatchObject({ reason: 'rate-limited' });
});

test('classifies network failure as offline', async () => {
  global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
  await expect(fetchStoredPrediction('dhaka')).rejects.toMatchObject({ reason: 'offline' });
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
});

test('refuses old inline-inference envelopes', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      prediction: { hazard: 'Flood', confidence: 0.9, severity_score: 0.5 },
      inference: { latency_ms: 1 },
    }),
  });
  await expect(fetchStoredPrediction('dhaka')).rejects.toMatchObject({ reason: 'invalid-data' });
});

test('does not retry uncovered, invalid, or offline errors', () => {
  expect(shouldRetryStoredPrediction(0, new StoredPredictionError('uncovered', 'missing', 404))).toBe(false);
  expect(shouldRetryStoredPrediction(0, new StoredPredictionError('invalid-data', 'bad'))).toBe(false);
  expect(shouldRetryStoredPrediction(0, new StoredPredictionError('offline', 'offline'))).toBe(false);
  expect(shouldRetryStoredPrediction(0, new StoredPredictionError('server', '500', 500))).toBe(true);
  expect(shouldRetryStoredPrediction(2, new StoredPredictionError('server', '500', 500))).toBe(false);
});

test('forwards AbortSignal to fetch', async () => {
  const controller = new AbortController();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => validEnvelope });
  await fetchStoredPrediction('dhaka', '7_days', { signal: controller.signal });
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/predict',
    expect.objectContaining({ signal: controller.signal }),
  );
});
