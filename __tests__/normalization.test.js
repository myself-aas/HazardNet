/**
 * @jest-environment node
 */
import { normalize } from '../backend/utils/normalization.js';

describe('normalize (per-channel z-score)', () => {
  it('preserves shape and produces finite standardized values', async () => {
    // Small stand-in for [1,15,10,64,64]: same 15-channel layout, tiny spatial dims.
    const H = 2, W = 2, T = 2;
    const size = 1 * 15 * T * H * W;
    const data = new Float32Array(size).fill(1.0);
    const { getTf } = await import('../backend/tfjs.js');
    const lib = await getTf();
    const input = lib.tensor5d(data, [1, 15, T, H, W], 'float32');

    const output = await normalize(input);

    expect(output.shape).toEqual([1, 15, T, H, W]); // batch dim preserved (ML-04 fix)
    const values = await output.data();
    expect(values.length).toBe(size);
    for (const v of values) expect(Number.isFinite(v)).toBe(true);

    // Constant input standardizes to (1 - mean_c)/std_c per channel: constant
    // WITHIN each channel (contiguous NCDHW block), distinct across channels.
    const spatial = T * H * W;
    for (let c = 0; c < 15; c++) {
      const block = values.slice(c * spatial, (c + 1) * spatial);
      for (const v of block) expect(v).toBeCloseTo(block[0], 5);
    }
    // Channels have different stats, so at least two distinct standardized values exist.
    expect(new Set(Array.from(values.map((v) => v.toFixed(4)))).size).toBeGreaterThan(1);

    input.dispose();
    output.dispose();
  });

  it('replaces NaN/Inf inputs with zeros before normalizing', async () => {
    const { getTf } = await import('../backend/tfjs.js');
    const lib = await getTf();
    const H = 1, W = 1, T = 1;
    const data = new Float32Array(1 * 15 * T * H * W).fill(1);
    data[7] = NaN; // Precip channel invalid
    const input = lib.tensor5d(data, [1, 15, T, H, W], 'float32');

    const output = await normalize(input);
    const values = await output.data();
    for (const v of values) expect(Number.isFinite(v)).toBe(true);

    input.dispose();
    output.dispose();
  });
});
