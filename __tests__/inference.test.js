/**
 * @jest-environment node
 *
 * Inference math tests (backend/inference.js) with REAL tfjs on tiny tensors.
 *
 * The heuristic hazard head (channel reductions -> physics logits -> softmax
 * -> severity sigmoid) is pure math over a 15-channel 5D tensor: a tiny
 * [1,15,2,2,2] stand-in exercises every code path in milliseconds, without
 * importing the Express server. The HTTP contract around it is covered by
 * __tests__/api/predict.test.js (mocked tf layer).
 */
import { predict, hazardClasses } from '../backend/inference.js';
import { getTf } from '../backend/tfjs.js';

const HAZARDS = [
  'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
  'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone',
];

async function tinyTensor(fill = 0.5) {
  const tf = await getTf();
  const data = new Float32Array(1 * 15 * 2 * 2 * 2).fill(fill);
  return tf.tensor5d(data, [1, 15, 2, 2, 2], 'float32');
}

describe('hazardClasses', () => {
  it('covers the 8 supported hazards (labels.json order, fallback-safe)', () => {
    expect(hazardClasses).toEqual(HAZARDS);
  });
});

describe('predict (heuristic hazard head)', () => {
  it('returns the documented prediction shape', async () => {
    const result = await predict(await tinyTensor());
    expect(result).toMatchObject({
      hazard: expect.any(String),
      confidence: expect.any(Number),
      severity_score: expect.any(Number),
      severity_bin: expect.stringMatching(/Low|Moderate|High/),
      top_3: expect.any(Array),
      class_probabilities: expect.any(Array),
      channel_features: expect.any(Object),
    });
    expect(HAZARDS).toContain(result.hazard);
    expect(result.top_3).toHaveLength(3);
    expect(result.class_probabilities).toHaveLength(8);
    expect(Object.keys(result.channel_features).sort()).toEqual(
      ['max_temp', 'min_temp', 'ndvi', 'ndwi', 'precip_mean', 'sar_vv', 'soil_moisture'].sort(),
    );
  });

  it('returns scores in the valid range [0, 1]', async () => {
    const result = await predict(await tinyTensor(0.3));
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.severity_score).toBeGreaterThanOrEqual(0);
    expect(result.severity_score).toBeLessThanOrEqual(1);
    for (const entry of result.class_probabilities) {
      expect(entry.score).toBeGreaterThanOrEqual(0);
      expect(entry.score).toBeLessThanOrEqual(1);
    }
  });

  it('emits a normalized distribution (softmax sums to ~1)', async () => {
    const result = await predict(await tinyTensor(0.7));
    const sum = result.class_probabilities.reduce((acc, entry) => acc + entry.score, 0);
    expect(sum).toBeCloseTo(1, 2);
  });

  it('returns top_3 sorted by score descending, headed by the top hazard', async () => {
    const result = await predict(await tinyTensor(0.9));
    const scores = result.top_3.map((entry) => entry.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(result.top_3[0].hazard).toBe(result.hazard);
    expect(result.top_3[0].score).toBe(result.confidence);
  });

  it('is deterministic for identical inputs', async () => {
    const first = await predict(await tinyTensor(0.25));
    const second = await predict(await tinyTensor(0.25));
    expect(second).toEqual(first);
  });
});
