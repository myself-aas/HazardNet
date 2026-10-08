/**
 * The web app's easing functions — React-free, renderer-free.
 *
 * **Why this file exists.** The web app animates with `interpolate()` from Remotion, and passes it
 * an easing. Until 2026-10-06 it imported both from the `remotion` package root, which drags the
 * entire Remotion studio runtime (React renderer, player, audio, player state) into the **entry
 * chunk** — the file every visitor downloads before the front door paints. `remotion/no-react`
 * exports `interpolate` without any of that, but it does not export `Easing`; so `bezier` is
 * ported here and `motion-interpolate.ts` re-exports this module's `Easing` in its place. The two
 * compositions that run in the Studio/CLI keep importing `Easing` from `'remotion'`.
 *
 * **The port is verbatim** — same constants, same Newton-Raphson first pass, same bisection
 * fallback, same endpoint clamping — so the curves the product ships are unchanged. That is not a
 * claim, it is asserted: `lib/__tests__/easing.test.ts` compares this implementation against
 * `Easing.bezier` from the real Remotion package across every curve the app uses, over 1,001
 * sample points each, and fails on any difference greater than 1e-12.
 *
 * Source: `facebook/react-native` (`Libraries/Animated/src/bezier.js`), which is what Remotion
 * itself ports from — MIT licensed, copyright Facebook, Inc.
 *
 * Only what the web app uses is implemented: `bezier` (13 call sites) and `linear`. A missing
 * member is a compile error rather than a silent import of the heavy package.
 */

const NEWTON_ITERATIONS = 4;
const NEWTON_MIN_SLOPE = 0.001;
const SUBDIVISION_PRECISION = 0.0000001;
const SUBDIVISION_MAX_ITERATIONS = 10;
const kSplineTableSize = 11;
const kSampleStepSize = 1.0 / (kSplineTableSize - 1.0);

const a = (aA1: number, aA2: number): number => 1.0 - 3.0 * aA2 + 3.0 * aA1;
const b = (aA1: number, aA2: number): number => 3.0 * aA2 - 6.0 * aA1;
const c = (aA1: number): number => 3.0 * aA1;

/** x(t) given t, x1, x2 — or y(t) given t, y1, y2. */
const calcBezier = (aT: number, aA1: number, aA2: number): number =>
  ((a(aA1, aA2) * aT + b(aA1, aA2)) * aT + c(aA1)) * aT;

/** dx/dt given t, x1, x2 — or dy/dt given t, y1, y2. */
const getSlope = (aT: number, aA1: number, aA2: number): number =>
  3.0 * a(aA1, aA2) * aT * aT + 2.0 * b(aA1, aA2) * aT + c(aA1);

const binarySubdivide = (
  aX: number,
  _aA: number,
  _aB: number,
  mX1: number,
  mX2: number,
): number => {
  let currentX: number;
  let currentT: number;
  let i = 0;
  let aA = _aA;
  let aB = _aB;
  do {
    currentT = aA + (aB - aA) / 2.0;
    currentX = calcBezier(currentT, mX1, mX2) - aX;
    if (currentX > 0.0) aB = currentT;
    else aA = currentT;
  } while (Math.abs(currentX) > SUBDIVISION_PRECISION && ++i < SUBDIVISION_MAX_ITERATIONS);
  return currentT;
};

const newtonRaphsonIterate = (aX: number, _aGuessT: number, mX1: number, mX2: number): number => {
  let aGuessT = _aGuessT;
  for (let i = 0; i < NEWTON_ITERATIONS; ++i) {
    const currentSlope = getSlope(aGuessT, mX1, mX2);
    if (currentSlope === 0.0) return aGuessT;
    const currentX = calcBezier(aGuessT, mX1, mX2) - aX;
    aGuessT -= currentX / currentSlope;
  }
  return aGuessT;
};

export type EasingFunction = (t: number) => number;

const bezier = (mX1: number, mY1: number, mX2: number, mY2: number): EasingFunction => {
  if (!(mX1 >= 0 && mX1 <= 1 && mX2 >= 0 && mX2 <= 1)) {
    throw new Error('bezier x values must be in [0, 1] range');
  }

  const sampleValues = new Float32Array(kSplineTableSize);
  if (mX1 !== mY1 || mX2 !== mY2) {
    for (let i = 0; i < kSplineTableSize; ++i) {
      sampleValues[i] = calcBezier(i * kSampleStepSize, mX1, mX2);
    }
  }

  const getTForX = (aX: number): number => {
    let intervalStart = 0.0;
    let currentSample = 1;
    const lastSample = kSplineTableSize - 1;
    for (; currentSample !== lastSample && sampleValues[currentSample] <= aX; ++currentSample) {
      intervalStart += kSampleStepSize;
    }
    --currentSample;

    const dist =
      (aX - sampleValues[currentSample]) /
      (sampleValues[currentSample + 1] - sampleValues[currentSample]);
    const guessForT = intervalStart + dist * kSampleStepSize;
    const initialSlope = getSlope(guessForT, mX1, mX2);
    if (initialSlope >= NEWTON_MIN_SLOPE) {
      return newtonRaphsonIterate(aX, guessForT, mX1, mX2);
    }
    if (initialSlope === 0.0) return guessForT;
    return binarySubdivide(aX, intervalStart, intervalStart + kSampleStepSize, mX1, mX2);
  };

  return (x: number): number => {
    const clampedX = Math.min(1, Math.max(0, x));
    if (mX1 === mY1 && mX2 === mY2) return clampedX; // linear
    if (clampedX === 0) return 0;
    if (clampedX === 1) return 1;
    return calcBezier(getTForX(clampedX), mY1, mY2);
  };
};

export const Easing = {
  linear: (t: number): number => t,
  bezier,
};
