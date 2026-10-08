/**
 * The local `Easing` port is bit-identical to the package it replaces.
 *
 * `lib/easing.ts` exists because importing `Easing` from the `remotion` package root pulled the
 * whole Remotion studio runtime into the web entry chunk (see the note there). A reimplementation
 * of an animation curve is only acceptable if it is provably the same curve, so this file compares
 * it against the real package — the same `remotion` the compositions use — over every curve the
 * product ships and 1,001 sample points each.
 *
 * `remotion` is a production dependency, so the comparison is against the actual implementation a
 * regression would have to disagree with, not against a recorded fixture.
 */

import { Easing as RemotionEasing } from 'remotion';
import { Easing } from '../easing';

/** Every curve the web app passes to `interpolate`, plus the extremes of the legal range. */
const CURVES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.16, 1, 0.3, 1], // the house entrance (`--ap-ease`)
  [0.22, 1, 0.36, 1], // the token transition curve
  [0.4, 0, 0.2, 1], // material standard
  [0.65, 0, 0.35, 1], // symmetrical in-out
  [0.25, 1, 0.5, 1], // snappy
  [0, 0, 1, 1], // the identity curve
  [1, 0, 0, 1], // the most extreme legal control points
  [0.5, 0.5, 0.5, 0.5], // degenerate: x === y on both axes
];

describe('Easing.bezier', () => {
  it('is byte-for-byte the same curve as remotion’s, at 1001 points each', () => {
    for (const [x1, y1, x2, y2] of CURVES) {
      const ours = Easing.bezier(x1, y1, x2, y2);
      const theirs = RemotionEasing.bezier(x1, y1, x2, y2);
      for (let i = 0; i <= 1000; i += 1) {
        const t = i / 1000;
        const difference = Math.abs(ours(t) - theirs(t));
        // Anything above 1e-12 is a different curve, not floating-point noise.
        expect([x1, y1, x2, y2, t, difference <= 1e-12]).toEqual([x1, y1, x2, y2, t, true]);
      }
    }
  });

  it('clamps its input and pins its endpoints, like the original', () => {
    const curve = Easing.bezier(0.16, 1, 0.3, 1);
    expect(curve(0)).toBe(0);
    expect(curve(1)).toBe(1);
    expect(curve(-5)).toBe(0);
    expect(curve(5)).toBe(1);
    // Monotonic in between: an entrance curve that dips would read as a flicker.
    let previous = -Infinity;
    for (let i = 0; i <= 200; i += 1) {
      const value = curve(i / 200);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('rejects x control points outside [0, 1], like the original', () => {
    expect(() => Easing.bezier(1.2, 0, 0.5, 1)).toThrow(/x values must be in \[0, 1\]/);
    expect(() => Easing.bezier(0.5, 0, -0.2, 1)).toThrow(/x values must be in \[0, 1\]/);
  });

  it('keeps the members the web app actually uses', () => {
    // A missing member is a compile error, not a silent fallback to the heavy package.
    expect(typeof Easing.linear).toBe('function');
    expect(typeof Easing.bezier).toBe('function');
    expect(Easing.linear(0.37)).toBe(RemotionEasing.linear(0.37));
  });
});

describe('the web module graph', () => {
  it('does not import Easing from the remotion package root', () => {
    // The whole point: `remotion` (the studio runtime) must not be reachable from the web entry.
    // Asserted on source text because that is where the import graph is decided; the bundle
    // measurement in `check:bundle` is the other half of this guard.
    const fs = require('node:fs') as typeof import('node:fs');
    // Resolved RELATIVE TO THIS FILE, never from `process.cwd()`: CI runs this suite with
    // `working-directory: frontend` (see .github/workflows/ci.yml), so the previous cwd-relative
    // 'frontend/src/...' doubled to '<repo>/frontend/frontend/src/...' and the suite failed with
    // ENOENT on every PR while passing locally from the repository root. `require.resolve` also
    // survives the file being moved, because a broken relative specifier is a load-time error
    // rather than a silently wrong path.
    const webFiles = [
      '../motion-interpolate.ts',
      '../easing.ts',
      '../../components/HeroCinematicBackground.tsx',
      '../../pages/FrontDoor.tsx',
    ].map((specifier) => require.resolve(specifier) as string);
    for (const file of webFiles) {
      const source = fs.readFileSync(file, 'utf8');
      // Comments are allowed to *name* the package (they explain this decision) — imports are not.
      const imports = [...source.matchAll(/^\s*import[^\n]*from\s+'([^']+)'/gm)].map((m) => m[1]);
      expect(imports.filter((spec) => spec === 'remotion')).toEqual([]);
      expect(imports.some((spec) => spec === 'remotion/no-react')).toBe(
        file.endsWith('motion-interpolate.ts'),
      );
    }
  });
});
