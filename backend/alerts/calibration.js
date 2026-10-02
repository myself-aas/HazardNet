/**
 * Isotonic Probability Calibration & Lead-Time Backtest Engine (Phase 3)
 *
 * Implements the `hazardnet-calibration/v1` contract defined in
 * `Models/calibration/confidence_map.template.json`:
 *   - Pool Adjacent Violators Algorithm (PAVA) for monotone non-decreasing
 *     isotonic probability calibration over [0, 1].
 *   - Strict validation refusing unfitted template maps (`status !== 'fitted'`,
 *     `samples <= 0`, non-monotone `pairs`, or missing provenance).
 *   - Piecewise-linear interpolation stamping `confidence_calibrated`,
 *     `confidence_raw`, and `confidence_kind = 'calibrated_probability'`.
 *   - Lead-time backtest verification (`POD`, `FAR`, `CSI`, `Brier`, `ECE`)
 *     stratified across `7_days` and `15_days` forecast horizons.
 */

export const CALIBRATION_FORMAT = 'hazardnet-calibration/v1';

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);
const round6 = (v) => (isFiniteNum(v) ? Math.round(v * 1e6) / 1e6 : null);

/**
 * Compute Brier score: mean((p_i - y_i)^2).
 *
 * @param {Array<{ p: number, y: number }>} pairs
 * @returns {number|null}
 */
export function computeBrierScore(pairs = []) {
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  let sum = 0;
  for (const { p, y } of pairs) {
    const diff = p - y;
    sum += diff * diff;
  }
  return round6(sum / pairs.length);
}

/**
 * Compute 10-bin Expected Calibration Error (ECE).
 *
 * @param {Array<{ p: number, y: number }>} pairs
 * @param {number} [numBins=10]
 * @returns {number|null}
 */
export function computeECE(pairs = [], numBins = 10) {
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  const n = pairs.length;
  const bins = Array.from({ length: numBins }, () => ({ count: 0, sumP: 0, sumY: 0 }));

  for (const { p, y } of pairs) {
    const clamped = Math.max(0, Math.min(1, p));
    const idx = Math.min(numBins - 1, Math.floor(clamped * numBins));
    bins[idx].count += 1;
    bins[idx].sumP += clamped;
    bins[idx].sumY += y;
  }

  let ece = 0;
  for (const bin of bins) {
    if (bin.count === 0) continue;
    const avgP = bin.sumP / bin.count;
    const avgY = bin.sumY / bin.count;
    ece += (bin.count / n) * Math.abs(avgP - avgY);
  }
  return round6(ece);
}

/**
 * Validate a `hazardnet-calibration/v1` document.
 * Strictly refuses `Models/calibration/confidence_map.template.json` (`status: 'awaiting-outcomes'`).
 *
 * @param {any} mapDoc
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCalibrationMap(mapDoc) {
  const errors = [];
  if (!mapDoc || typeof mapDoc !== 'object' || Array.isArray(mapDoc)) {
    return { valid: false, errors: ['Calibration map must be a JSON object'] };
  }
  if (mapDoc.format !== CALIBRATION_FORMAT) {
    errors.push(`Unsupported format "${mapDoc.format}" (expected "${CALIBRATION_FORMAT}")`);
  }
  if (mapDoc.status !== 'fitted') {
    errors.push(`Calibration map status is "${mapDoc.status}" (must be "fitted"; unfitted templates are refused)`);
  }
  if (!Number.isInteger(mapDoc.samples) || mapDoc.samples <= 0) {
    errors.push(`Calibration map samples must be a positive integer, got ${mapDoc.samples}`);
  }
  if (mapDoc.monotone !== true || mapDoc.converged !== true) {
    errors.push('Calibration map must record monotone=true and converged=true');
  }
  if (!Array.isArray(mapDoc.pairs) || mapDoc.pairs.length < 2) {
    errors.push('Calibration map pairs must contain at least 2 [raw, calibrated] knots');
  } else {
    let prevX = -Infinity;
    let prevY = -Infinity;
    for (let i = 0; i < mapDoc.pairs.length; i++) {
      const pair = mapDoc.pairs[i];
      if (!Array.isArray(pair) || pair.length !== 2) {
        errors.push(`Pair at index ${i} is not a 2-tuple [x, y]`);
        break;
      }
      const [x, y] = pair;
      if (!isFiniteNum(x) || !isFiniteNum(y) || x < 0 || x > 1 || y < 0 || y > 1) {
        errors.push(`Pair at index ${i} [${x}, ${y}] is outside [0, 1]`);
        break;
      }
      if (x + 1e-12 < prevX || y + 1e-12 < prevY) {
        errors.push(`Calibration map pairs violate monotonicity at index ${i}`);
        break;
      }
      prevX = x;
      prevY = y;
    }
  }
  for (const field of ['fit_period', 'fitted_on', 'fit_source', 'label_definition']) {
    if (!mapDoc[field] || typeof mapDoc[field] !== 'string' || !mapDoc[field].trim()) {
      errors.push(`Missing required provenance field "${field}"`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Fit an isotonic probability calibration map using the Pool Adjacent Violators Algorithm (PAVA).
 *
 * @param {Array<{ confidence: number, outcome: number }>} samples
 * @param {{ fit_period?: string, fitted_on?: string, fit_source?: string, label_definition?: string }} [metadata={}]
 * @returns {object} Fitted `hazardnet-calibration/v1` document
 */
export function fitIsotonicCalibration(samples = [], metadata = {}) {
  if (!Array.isArray(samples) || samples.length < 2) {
    throw new Error('fitIsotonicCalibration requires at least 2 labelled { confidence, outcome } samples');
  }

  const cleaned = samples.map((s, idx) => {
    const p = Number(s?.confidence);
    const y = Number(s?.outcome);
    if (!Number.isFinite(p) || p < 0 || p > 1) {
      throw new Error(`Sample ${idx}: confidence must be in [0, 1], got ${s?.confidence}`);
    }
    if (y !== 0 && y !== 1) {
      throw new Error(`Sample ${idx}: outcome must be binary 0 or 1, got ${s?.outcome}`);
    }
    return { p, y };
  });

  // Sort by ascending raw confidence, breaking ties by outcome
  const sorted = [...cleaned].sort((a, b) => (a.p !== b.p ? a.p - b.p : a.y - b.y));

  // Pool Adjacent Violators Algorithm (PAVA)
  const blocks = sorted.map((pt) => ({
    minX: pt.p,
    maxX: pt.p,
    sumY: pt.y,
    count: 1,
  }));

  let i = 0;
  while (i < blocks.length - 1) {
    const currMean = blocks[i].sumY / blocks[i].count;
    const nextMean = blocks[i + 1].sumY / blocks[i + 1].count;
    if (currMean > nextMean + 1e-12) {
      blocks[i] = {
        minX: blocks[i].minX,
        maxX: blocks[i + 1].maxX,
        sumY: blocks[i].sumY + blocks[i + 1].sumY,
        count: blocks[i].count + blocks[i + 1].count,
      };
      blocks.splice(i + 1, 1);
      if (i > 0) i -= 1;
    } else {
      i += 1;
    }
  }

  const pairs = [];
  for (const b of blocks) {
    const yHat = round6(Math.max(0, Math.min(1, b.sumY / b.count)));
    const xStart = round6(b.minX);
    const xEnd = round6(b.maxX);
    if (pairs.length === 0 || pairs[pairs.length - 1][0] !== xStart || pairs[pairs.length - 1][1] !== yHat) {
      pairs.push([xStart, yHat]);
    }
    if (xEnd !== xStart) {
      pairs.push([xEnd, yHat]);
    }
  }
  if (pairs.length === 1) {
    pairs.push([1.0, pairs[0][1]]);
  }

  const tempMap = {
    format: CALIBRATION_FORMAT,
    method: 'isotonic',
    samples: cleaned.length,
    monotone: true,
    converged: true,
    pairs,
    fit_period: metadata.fit_period || 'unspecified-period',
    fitted_on: metadata.fitted_on || new Date().toISOString().slice(0, 10),
    fit_source: metadata.fit_source || 'historical-backtest',
    label_definition: metadata.label_definition || 'observed-hazard-impact',
    status: 'fitted',
  };

  const calibratedEval = cleaned.map(({ p, y }) => ({
    p: applyCalibrationToScore(p, tempMap),
    y,
  }));

  const baseRate = round6(cleaned.reduce((acc, s) => acc + s.y, 0) / cleaned.length);
  return {
    ...tempMap,
    base_rate: baseRate,
    brier: computeBrierScore(calibratedEval),
    brier_raw: computeBrierScore(cleaned),
    ece: computeECE(calibratedEval),
    ece_raw: computeECE(cleaned),
  };
}

/**
 * Apply a validated `hazardnet-calibration/v1` map to a single raw confidence score in [0, 1].
 *
 * @param {number} rawScore
 * @param {object} mapDoc
 * @returns {number} Calibrated probability in [0, 1]
 */
export function applyCalibrationToScore(rawScore, mapDoc) {
  const check = validateCalibrationMap(mapDoc);
  if (!check.valid) {
    throw new Error(`Invalid or unfitted calibration map: ${check.errors.join('; ')}`);
  }
  const x = Number(rawScore);
  if (!Number.isFinite(x) || x < 0 || x > 1) {
    throw new Error(`Raw confidence score must be in [0, 1], got ${rawScore}`);
  }

  const pairs = mapDoc.pairs;
  if (x <= pairs[0][0]) return round6(pairs[0][1]);
  if (x >= pairs[pairs.length - 1][0]) return round6(pairs[pairs.length - 1][1]);

  for (let i = 0; i < pairs.length - 1; i++) {
    const [x0, y0] = pairs[i];
    const [x1, y1] = pairs[i + 1];
    if (x >= x0 && x <= x1) {
      if (Math.abs(x1 - x0) <= 1e-12) return round6(y1);
      const t = (x - x0) / (x1 - x0);
      return round6(y0 + t * (y1 - y0));
    }
  }
  return round6(pairs[pairs.length - 1][1]);
}

/**
 * Apply a validated `hazardnet-calibration/v1` map to a forecast row, preserving
 * `confidence_raw` and setting `confidence_kind = 'calibrated_probability'`.
 *
 * @param {object} row
 * @param {object} mapDoc
 * @returns {object}
 */
export function applyCalibrationToRow(row, mapDoc) {
  if (!row || typeof row !== 'object') {
    throw new Error('Forecast row must be an object');
  }
  const rawConfidence = Number(row.confidence_raw ?? row.confidence);
  const calibrated = applyCalibrationToScore(rawConfidence, mapDoc);
  return {
    ...row,
    confidence: calibrated,
    confidence_raw: round6(rawConfidence),
    confidence_calibrated: calibrated,
    confidence_kind: 'calibrated_probability',
  };
}

/**
 * Compute contingency-table & probabilistic skill metrics (POD, FAR, CSI, Brier, ECE)
 * overall and stratified by forecast horizon (`7_days`, `15_days`).
 *
 * @param {Array<{ confidence: number, outcome: number, horizon?: string, lead_time_days?: number }>} records
 * @param {{ threshold?: number }} [options={}]
 * @returns {object}
 */
export function evaluateLeadTimeBacktest(records = [], { threshold = 0.65 } = {}) {
  const scoreSubset = (items) => {
    let hits = 0;
    let misses = 0;
    let falseAlarms = 0;
    let correctNegatives = 0;
    const pairs = [];

    for (const r of items) {
      const p = Number(r.confidence);
      const y = Number(r.outcome) === 1 ? 1 : 0;
      const flagged = p >= threshold;
      if (flagged && y === 1) hits += 1;
      else if (!flagged && y === 1) misses += 1;
      else if (flagged && y === 0) falseAlarms += 1;
      else correctNegatives += 1;
      if (Number.isFinite(p)) pairs.push({ p, y });
    }

    const pod = hits + misses > 0 ? round6(hits / (hits + misses)) : null;
    const far = hits + falseAlarms > 0 ? round6(falseAlarms / (hits + falseAlarms)) : null;
    const csi = hits + misses + falseAlarms > 0 ? round6(hits / (hits + misses + falseAlarms)) : null;

    return {
      total: items.length,
      threshold,
      hits,
      misses,
      false_alarms: falseAlarms,
      correct_negatives: correctNegatives,
      pod,
      far,
      csi,
      brier: computeBrierScore(pairs),
      ece: computeECE(pairs),
    };
  };

  const overall = scoreSubset(records);
  const horizons = ['7_days', '15_days'];
  const perHorizon = {};
  for (const h of horizons) {
    perHorizon[h] = scoreSubset(records.filter((r) => r.horizon === h));
  }

  return {
    ...overall,
    per_horizon: perHorizon,
  };
}
