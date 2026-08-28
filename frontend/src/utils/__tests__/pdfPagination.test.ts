import { computeSliceBounds, rowDeviation, snapToQuietRow, isValidSlicePlan, SlicePlan } from '../pdfPagination';

/** Build an RGBA strip where each row is either uniform white or checkerboard noise. */
function makeStrip(rows: Array<'white' | 'noise'>, width: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(rows.length * width * 4);
  rows.forEach((kind, y) => {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (kind === 'white') {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      } else {
        const v = x % 2 === 0 ? 20 : 220;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
      }
      data[i + 3] = 255;
    }
  });
  return data;
}

describe('computeSliceBounds', () => {
  it('returns an empty plan for empty canvases', () => {
    expect(computeSliceBounds(0, 1000)).toEqual([]);
    expect(computeSliceBounds(1000, 0)).toEqual([]);
    expect(computeSliceBounds(-5, 100)).toEqual([]);
  });

  it('returns a single slice when content fits one page', () => {
    expect(computeSliceBounds(500, 1000)).toEqual([{ top: 0, height: 500 }]);
  });

  it('slices equal pages with a clamped final partial page', () => {
    const plan = computeSliceBounds(2500, 1000);
    expect(plan).toEqual([
      { top: 0, height: 1000 },
      { top: 1000, height: 1000 },
      { top: 2000, height: 500 },
    ]);
    expect(isValidSlicePlan(plan, 2500)).toBe(true);
  });

  it('always produces contiguous, in-bounds, non-degenerate plans', () => {
    for (let height = 1; height <= 120; height += 7) {
      const plan = computeSliceBounds(height, 30);
      expect(isValidSlicePlan(plan, height)).toBe(true);
    }
  });
});

describe('rowDeviation', () => {
  it('is zero for a uniform row', () => {
    const strip = makeStrip(['white'], 10);
    expect(rowDeviation(strip, 10, 0)).toBe(0);
  });

  it('is positive for a noisy row', () => {
    const strip = makeStrip(['noise'], 10);
    expect(rowDeviation(strip, 10, 0)).toBeGreaterThan(50);
  });

  it('is zero for out-of-range rows', () => {
    const strip = makeStrip(['white'], 10);
    expect(rowDeviation(strip, 10, 99)).toBe(0);
  });
});

describe('snapToQuietRow', () => {
  const width = 50;

  it('snaps to the closest quiet row within the search radius', () => {
    // rows 0-14 noise, 15-25 blank, 26-39 noise; desired cut at 30.
    const rows: Array<'white' | 'noise'> = [
      ...Array(15).fill('noise'),
      ...Array(11).fill('white'),
      ...Array(14).fill('noise'),
    ] as Array<'white' | 'noise'>;
    const strip = makeStrip(rows, width);
    expect(snapToQuietRow(strip, width, { stripTop: 0, desiredY: 30, radius: 10 })).toBe(25);
  });

  it('returns desiredY when it is already quiet', () => {
    const strip = makeStrip(['noise', 'white', 'noise'], width);
    expect(snapToQuietRow(strip, width, { stripTop: 0, desiredY: 1, radius: 2 })).toBe(1);
  });

  it('falls back to the least busy row when nothing is quiet', () => {
    const width = 50;
    const rows = 20;
    // Rows 0-9: strong checkerboard noise (high deviation).
    // Rows 10-19: low-amplitude noise (small but non-zero deviation).
    const data = new Uint8ClampedArray(rows * width * 4);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const v = y < 10 ? (x % 2 === 0 ? 20 : 220) : x % 2 === 0 ? 127 : 130;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    // Threshold 1: low-amplitude rows deviate ~1.5 -> nothing is "quiet".
    const result = snapToQuietRow(data, width, { stripTop: 0, desiredY: 0, radius: 19, quietThreshold: 1 });
    expect(result).toBeGreaterThanOrEqual(10);
    expect(result).toBeLessThanOrEqual(19);
  });

  it('clamps the search window to the strip bounds', () => {
    // stripTop = 100: only rows 100-119 exist locally; quiet band at 100-104.
    const rows: Array<'white' | 'noise'> = [
      ...Array(5).fill('white'),
      ...Array(15).fill('noise'),
    ] as Array<'white' | 'noise'>;
    const strip = makeStrip(rows, width);
    const result = snapToQuietRow(strip, width, { stripTop: 100, desiredY: 112, radius: 50 });
    expect(result).toBe(104);
  });

  it('returns desiredY for an empty/invalid strip', () => {
    const strip = new Uint8ClampedArray(0);
    expect(snapToQuietRow(strip, width, { stripTop: 0, desiredY: 42, radius: 5 })).toBe(42);
  });
});

describe('isValidSlicePlan', () => {
  it('accepts contiguous plans that exactly cover the canvas', () => {
    const plan: SlicePlan[] = [
      { top: 0, height: 100 },
      { top: 100, height: 100 },
      { top: 200, height: 50 },
    ];
    expect(isValidSlicePlan(plan, 250)).toBe(true);
  });

  it('rejects gaps, overlaps, out-of-bounds and degenerate slices', () => {
    expect(isValidSlicePlan([{ top: 0, height: 100 }, { top: 120, height: 50 }], 170)).toBe(false); // gap
    expect(isValidSlicePlan([{ top: 0, height: 100 }, { top: 90, height: 50 }], 140)).toBe(false); // overlap
    expect(isValidSlicePlan([{ top: 0, height: 300 }], 250)).toBe(false); // out of bounds
    expect(isValidSlicePlan([{ top: 0, height: 0 }], 0)).toBe(false); // degenerate
    expect(isValidSlicePlan([], 250)).toBe(false);
    expect(isValidSlicePlan([], 0)).toBe(true);
  });
});
