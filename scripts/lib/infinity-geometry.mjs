/**
 * The ONE geometry every HazardNet brand asset is drawn from — restored 2026-10-25.
 *
 * The file was deleted in the history squash while `scripts/build-brand-assets.mjs` and
 * `__tests__/brandAssets.test.js` still imported it. The constants below are the exact
 * values the committed, generated assets carry (frontend/public/hazardnet-*.svg and
 * frontend/src/design-system/brand/infinity.generated.ts — whose header names this file as
 * its source), which is why the `--check` mode of the builder passes byte-for-byte against
 * them. The path data is kept stable by construction: derive a new crossing/radius and the
 * brand files, the test suite and `--check` all change together.
 *
 * The mark is a lemniscate-like woven loop: one closed path (`full`) split into the strand
 * that passes UNDER (`under`, masked at the crossing by `cut`) and the strand that passes
 * OVER (`over`). Two apex nodes sit where the comets are brightest (`apex`, positioned on
 * the path at `fraction` percent of its length).
 *
 * Claims about these assets (outlined wordmark, ≥ 3:1 gradient on both grounds, loader
 * reduced-motion, tiny files, correct icon sizes) are verified in
 * `__tests__/brandAssets.test.js`.
 */

/** Half-spans of the mark's own coordinate space (origin at the crossing). */
const HALF_W = 56; // gradient spans the full width: x from -HALF_W to +HALF_W
const HALF_H = 26; // viewBox height is ±(HALF_H + 4) of padding

/** Stroke weight across the whole mark. */
const STROKE_WIDTH = 10;

/** The two crossing points, (±CROSS_X, ∓CROSS_Y), joined by the over-strand chord. */
const CROSS_X = 15.3;
const CROSS_Y = 14.997;

/** Arc radius of the two lobes. */
const LOBE_R = 21;

/** The strand that passes OVER at the crossing. */
const over = `M-${CROSS_X} -${CROSS_Y}L${CROSS_X} ${CROSS_Y}`;

/** The strand that passes UNDER: from the over-landing point around both lobes home. */
const under =
  `M${CROSS_X} ${CROSS_Y}` +
  `A${LOBE_R} ${LOBE_R} 0 1 0 ${CROSS_X} -${CROSS_Y}` +
  `L-${CROSS_X} ${CROSS_Y}` +
  `A${LOBE_R} ${LOBE_R} 0 1 1 -${CROSS_X} -${CROSS_Y}`;

/** Closed loop: over-chord, then both lobes, closed. One path so the loader can dash it. */
const full = `${over}${under.slice(`M${CROSS_X} ${CROSS_Y}`.length)}Z`;

export const GEOMETRY = {
  viewBox: `-${HALF_W + 4} -${HALF_H + 4} ${2 * (HALF_W + 4)} ${2 * (HALF_H + 4)}`,
  loaderViewBox: `-${HALF_W + 8} -${HALF_H + 10} ${2 * (HALF_W + 8)} ${2 * (HALF_H + 10)}`, // -64 -36 128 72: extra vertical room for the comet glow
  SW: STROKE_WIDTH,
  halfW: HALF_W,
  halfH: HALF_H,
  full,
  under,
  over,
  /** The dark rectangle in the mask that hides the under-strand at the crossing. */
  cut: { x: -12, y: -8, width: 24, height: 16, rotate: 44.427 },
  /** Where the apex nodes sit, in the mark's coordinate space. */
  apex: { left: [-51, 0], right: [51, 0] },
  /** Where the apex nodes sit on the closed path, as a percentage of its length. */
  fraction: { rightApex: 32.576, leftApex: 82.576 },
};

/**
 * The brand gradient, as [offset, hex] stops. One gradient serves every surface, so every
 * stop must hold ≥ 3:1 against white AND against ink-950 — both halves of that promise are
 * asserted in __tests__/brandAssets.test.js. Only the product blues may appear.
 */
export const GRADIENT = [
  [0, '#0064E0'],
  [0.55, '#1A7BF5'],
  [1, '#3D93FA'],
];

/**
 * The loader's comet stack: four dash layers a comet, two comets half a lap apart
 * (`class="c"` count in hazardnet-loader.svg is 2 × LAYERS.length), one 2.6 s lap.
 * Layers are longest-first so their HEADS line up (see layerDelay in the builder).
 */
export const LOOP = {
  LAP: 2.6,
  LAYERS: [
    { name: 'tail', len: 24, opacity: 0.3, color: '#0064E0', width: 10 },
    { name: 'mid', len: 14, opacity: 0.65, color: '#1A7BF5', width: 10 },
    { name: 'head', len: 6, opacity: 1, color: '#3D93FA', width: 10 },
    { name: 'core', len: 2.4, opacity: 0.95, color: '#FFFFFF', width: 4 },
  ],
};
