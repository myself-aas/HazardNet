/**
 * HazardNet "Loop" — the geometry of the brand mark, computed (not hand-placed).
 *
 * The mark is a CROSSED BELT: two circles of radius R whose centres are 2D apart, joined by the two INTERNAL
 * tangents, which cross at the origin. Closed, that is an infinity loop made of two circular lobes and two straight
 * diagonals. Uniform stroke weight, round joins, and a woven crossing (one strand passes over; the other is cut
 * either side with a small gap) — the opposite of a ribbon with swelling width, on purpose: it reads as a network
 * knot and as a closed cycle (observe → forecast → warn → learn → observe …), and the same path carries the
 * loading animation (a light travelling a closed loop).
 *
 * Every number the mark, the loader, the lockups, the app icons and the React components use comes from here.
 */
const D = 30; // half the distance between the two lobe centres
const R = 21; // lobe radius (centre line)
const SW = 10; // stroke width
const GAP = 3; // clear gap either side of the over-strand, at the crossing

const alpha = Math.asin(R / D); // half the angle between the two crossing tangents
const tangent = Math.sqrt(D * D - R * R); // tangent length from the crossing to a lobe
const n = (v) => Math.round(v * 1000) / 1000;
const tx = n(tangent * Math.cos(alpha));
const ty = n(tangent * Math.sin(alpha));

/** The closed centre line, starting on the over-strand: line → right lobe → line → left lobe. */
const full = `M${-tx} ${-ty}L${tx} ${ty}A${R} ${R} 0 1 0 ${tx} ${-ty}L${-tx} ${ty}A${R} ${R} 0 1 1 ${-tx} ${-ty}Z`;
/** Everything except the over-strand (the lobes and the under-strand). Drawn with `cut` masked out. */
const under = `M${tx} ${ty}A${R} ${R} 0 1 0 ${tx} ${-ty}L${-tx} ${ty}A${R} ${R} 0 1 1 ${-tx} ${-ty}`;
/** The over-strand: the first diagonal. */
const over = `M${-tx} ${-ty}L${tx} ${ty}`;

const rotate = n((alpha * 180) / Math.PI);
const cutLength = 24;
const cut = { x: -cutLength / 2, y: -(SW / 2 + GAP), width: cutLength, height: SW + 2 * GAP, rotate };

// Arc length of each lobe (the far way round) and of each straight, to place nodes by path fraction.
const arcAngle = 2 * Math.PI - 2 * Math.acos(R / D);
const line = 2 * tangent;
const arc = R * arcAngle;
const total = 2 * line + 2 * arc;
const fraction = {
  rightApex: n(((line + arc / 2) / total) * 100),
  leftApex: n(((2 * line + arc + arc / 2) / total) * 100),
};

const halfW = D + R + SW / 2; // 56
const halfH = R + SW / 2; // 26

export const GEOMETRY = {
  D,
  R,
  SW,
  GAP,
  tx,
  ty,
  full,
  under,
  over,
  cut,
  apex: { left: [-(D + R), 0], right: [D + R, 0] },
  fraction,
  halfW,
  halfH,
  /** the mark's viewBox: 4 units of air */
  viewBox: `${-(halfW + 4)} ${-(halfH + 4)} ${2 * (halfW + 4)} ${2 * (halfH + 4)}`,
  /** the loader's viewBox: room for the glow and the nodes */
  loaderViewBox: `${-(halfW + 8)} ${-(halfH + 10)} ${2 * (halfW + 8)} ${2 * (halfH + 10)}`,
};

/** Brand gradient, left → right. Every stop's relative luminance sits in [0.12, 0.30], which keeps the mark at ≥ 3:1
 *  on BOTH white and ink-950 — one file works on any surface. (Verified by __tests__/brandAssets.test.js.) */
export const GRADIENT = [
  [0, '#0064E0'],
  [0.55, '#1A7BF5'],
  [1, '#3D93FA'],
];

/** The loader: one lap in LAP seconds; two comets half a lap apart. Each comet is a stack of dashes whose HEADS line
 *  up: a long faint tail, a mid body, a vivid head and a thin white glint on the very tip. The head is the most
 *  saturated part on any ground (a pale tip would read as the *tail* on white), and the white glint pops on both. */
export const LOOP = {
  LAP: 2.6,
  LAYERS: [
    { name: 'tail', len: 24, opacity: 0.3, color: '#0064E0', width: 10 },
    { name: 'mid', len: 14, opacity: 0.65, color: '#1A7BF5', width: 10 },
    { name: 'head', len: 6, opacity: 1, color: '#3D93FA', width: 10 },
    { name: 'core', len: 2.4, opacity: 0.95, color: '#FFFFFF', width: 4 },
  ],
};
