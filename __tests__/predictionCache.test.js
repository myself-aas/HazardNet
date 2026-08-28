/**
 * @jest-environment node
 */
import { createPredictionCache } from '../backend/utils/predictionCache.js';

describe('predictionCache (P3-7)', () => {
  const tensorA = new Array(50).fill(0.5);
  const tensorB = new Array(50).fill(0.9);
  const value = () => ({ prediction: { hazard: 'Flood', severity_score: 0.42 } });

  it('returns null for a miss and the value for a hit', () => {
    const cache = createPredictionCache();
    expect(cache.get(tensorA)).toBeNull();
    cache.set(tensorA, value());
    expect(cache.get(tensorA)).toEqual(value());
    expect(cache.get(tensorB)).toBeNull();
  });

  it('distinguishes different tensors', () => {
    const cache = createPredictionCache();
    cache.set(tensorA, { v: 'A' });
    cache.set(tensorB, { v: 'B' });
    expect(cache.get(tensorA).v).toBe('A');
    expect(cache.get(tensorB).v).toBe('B');
  });

  it('expires entries after the TTL', () => {
    jest.useFakeTimers();
    const cache = createPredictionCache({ ttlMs: 1000 });
    cache.set(tensorA, value());
    jest.advanceTimersByTime(1500);
    expect(cache.get(tensorA)).toBeNull();
    jest.useRealTimers();
  });

  it('evicts the oldest entry beyond maxEntries', () => {
    const cache = createPredictionCache({ maxEntries: 2 });
    const t1 = [1], t2 = [2], t3 = [3];
    cache.set(t1, { v: 1 });
    cache.set(t2, { v: 2 });
    cache.set(t3, { v: 3 }); // evicts t1
    expect(cache.get(t1)).toBeNull();
    expect(cache.get(t2)).toEqual({ v: 2 });
    expect(cache.get(t3)).toEqual({ v: 3 });
    expect(cache.size).toBe(2);
  });

  it('refreshes LRU order on access', () => {
    const cache = createPredictionCache({ maxEntries: 2 });
    const t1 = [1], t2 = [2], t3 = [3];
    cache.set(t1, { v: 1 });
    cache.set(t2, { v: 2 });
    cache.get(t1); // t1 becomes most-recent
    cache.set(t3, { v: 3 }); // evicts t2, not t1
    expect(cache.get(t1)).toEqual({ v: 1 });
    expect(cache.get(t2)).toBeNull();
  });
});
