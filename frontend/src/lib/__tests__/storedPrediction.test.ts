import { fetchStoredPrediction } from '../storedPrediction';
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});
test('requests a stored district and horizon, never a raster or tensor', async () => {
  const data = {
    prediction: { hazard: 'Flood', confidence: 0.9, severity_score: 0.5 },
    provenance: {},
    inference: { served_from: 'stored-forecast' },
  };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => data });
  await expect(fetchStoredPrediction('dhaka', '15_days')).resolves.toEqual(data);
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/predict',
    expect.objectContaining({ body: JSON.stringify({ districtId: 'dhaka', horizon: '15_days' }) }),
  );
});
test('propagates HTTP failures without fabricating a result', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false });
  await expect(fetchStoredPrediction('unknown')).rejects.toThrow('Stored forecast unavailable');
});
test('refuses old inline-inference envelopes', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({
        prediction: { hazard: 'Flood', confidence: 0.9, severity_score: 0.5 },
        inference: { latency_ms: 1 },
      }),
    });
  await expect(fetchStoredPrediction('dhaka')).rejects.toThrow('Invalid stored forecast');
});
