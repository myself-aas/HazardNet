// Pure pagination helpers for the client-side PDF exporter.
// Slices a tall capture canvas into page-sized regions WITHOUT cutting
// through visible content: break candidates are snapped to the nearest
// "quiet" (uniform, e.g. blank) row inside a small search radius.
// No DOM dependencies — fully unit-testable.

export interface SlicePlan {
  /** Top edge of the slice in source-canvas pixels. */
  top: number;
  /** Height of the slice in source-canvas pixels (always >= 1). */
  height: number;
}

/**
 * Baseline slicing: divide the canvas into equal content-height pages.
 * The final slice is clamped so plans are contiguous and cover [0, canvasHeight).
 */
export function computeSliceBounds(canvasHeight: number, contentHeight: number): SlicePlan[] {
  if (canvasHeight <= 0 || contentHeight <= 0) return [];

  const slices: SlicePlan[] = [];
  let top = 0;
  while (top < canvasHeight) {
    const height = Math.min(contentHeight, canvasHeight - top);
    slices.push({ top, height });
    top += height;
  }
  return slices;
}

/**
 * Mean absolute luma deviation of a single row (0 = perfectly uniform row).
 * `data` is an RGBA buffer for a strip of the given pixel `width`.
 */
export function rowDeviation(data: Uint8ClampedArray, width: number, row: number): number {
  const base = row * width * 4;
  if (base < 0 || base + width * 4 > data.length) return 0;
  let sum = 0;
  const lumas = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    // ITU-R BT.601 luma approximation
    const luma = 0.299 * data[base + x * 4] + 0.587 * data[base + x * 4 + 1] + 0.114 * data[base + x * 4 + 2];
    lumas[x] = luma;
    sum += luma;
  }
  const mean = sum / width;
  let deviation = 0;
  for (let x = 0; x < width; x++) deviation += Math.abs(lumas[x] - mean);
  return deviation / width;
}

export interface QuietRowOptions {
  /** Y-coordinate of the strip's first row within the source canvas. */
  stripTop: number;
  /** Desired break position (canvas pixels) — e.g. the equal-slice boundary. */
  desiredY: number;
  /** Search radius in canvas pixels around desiredY. */
  radius: number;
  /** Deviation below which a row is considered blank/quiet. Default ~2/255. */
  quietThreshold?: number;
}

/**
 * Find the quietest row near `desiredY` (within `radius`, bounded to the strip).
 * Scans outward from `desiredY` and returns the first row whose deviation is
 * at or below `quietThreshold`; if no row is quiet, returns the row with the
 * lowest deviation so cuts land in the least-busy line available.
 */
export function snapToQuietRow(data: Uint8ClampedArray, width: number, opts: QuietRowOptions): number {
  const { stripTop, desiredY, radius, quietThreshold = 2 } = opts;
  const rowCount = Math.floor(data.length / (width * 4));
  const minY = Math.max(stripTop, desiredY - radius);
  const maxY = Math.min(stripTop + rowCount - 1, desiredY + radius);
  if (maxY < minY) return desiredY;

  const deviationAt = (y: number) => rowDeviation(data, width, y - stripTop);

  // Closest quiet row first.
  for (let d = 0; d <= radius; d++) {
    for (const y of d === 0 ? [desiredY] : [desiredY - d, desiredY + d]) {
      if (y < minY || y > maxY) continue;
      if (deviationAt(y) <= quietThreshold) return y;
    }
  }

  // Fallback: least busy row in range.
  let bestY = desiredY;
  let bestDeviation = Number.POSITIVE_INFINITY;
  for (let y = minY; y <= maxY; y++) {
    const deviation = deviationAt(y);
    if (deviation < bestDeviation) {
      bestDeviation = deviation;
      bestY = y;
    }
  }
  return bestY;
}

/** Validate that a plan is contiguous, ordered, in-bounds and non-degenerate. */
export function isValidSlicePlan(plan: SlicePlan[], canvasHeight: number): boolean {
  if (plan.length === 0) return canvasHeight <= 0;
  let expectedTop = 0;
  for (const slice of plan) {
    if (slice.top !== expectedTop) return false;
    if (!Number.isInteger(slice.height) || slice.height < 1) return false;
    if (slice.top + slice.height > canvasHeight) return false;
    expectedTop = slice.top + slice.height;
  }
  return expectedTop === canvasHeight;
}
