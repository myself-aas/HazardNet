/**
 * @jest-environment jsdom
 *
 * The hero backdrop's design system: three layers, one grade, one arc.
 *
 * The component is simple; the *contract* is what needs holding, because every value in it was
 * once a hand-typed literal in two files at the same time:
 *
 *   - the grade (mesh glow, wash, exposure curve, vignette) is one object in `lib/heroGrade.ts`,
 *     read by this component and by the Remotion export. The stops are pinned as a *floor*: they
 *     may be deepened, never lightened, because the 12px boundary sentence over a bright frame is
 *     a safety statement (audit H-P1-4 measured 2.45:1 at the old depth).
 *   - the exposure curve and the vignette are one node with two background layers. Split them back
 *     into two nodes and this fails — which is the point, since the whole exercise was fewer
 *     places for the hero to disagree with itself.
 *   - the type shadows are two published utilities (`text-shadow-hero-display` /
 *     `text-shadow-hero-fine`) whose values live in one place in `index.css`.
 *
 * The assertions read the server-rendered markup rather than the jsdom DOM: jsdom's CSS parser
 * drops a `background` shorthand with more than one layer, which is exactly the declaration under
 * test here. React's own serialiser writes the style string out verbatim, so one static render
 * shows every value the component actually painted.
 */

import '@testing-library/jest-dom';
import { cleanup, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import HeroCinematicBackground from '../HeroCinematicBackground';
import { HERO_GRADE } from '../../lib/heroGrade';
import { EARTH_HERO_POSTER_CSS } from '../../lib/heroMedia';
import { HERO_CAROUSEL_IMAGES } from '../../lib/heroCarouselImages';

/** Every inline style in the markup, whitespace-stripped so the assertions are about values. */
const styleAttributes = (markup: string): string[] =>
  [...markup.matchAll(/style="([^"]*)"/g)].map((m) => m[1].replace(/\s+/g, ''));

const only = (styles: string[], value: string): string => {
  const needle = value.replace(/\s+/g, '');
  const hits = styles.filter((s) => s.includes(needle));
  expect(hits).toHaveLength(1);
  return hits[0];
};

describe('<HeroCinematicBackground /> — the hero design system', () => {
  // framer-motion's motion.div uses useLayoutEffect, which the server renderer warns about once
  // per render. The warning is about React's SSR constraints, not about this component; every
  // other console.error still reaches the runner.
  const realError = console.error;
  beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) return;
      realError(...(args as []));
    });
  });
  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    // The carousel and the mesh both arm timers; none of these assertions depend on them.
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    cleanup();
  });

  const markup = renderToStaticMarkup(<HeroCinematicBackground />);
  const styles = styleAttributes(markup);

  it('renders exactly three backdrop layers: mesh, photograph, grade', () => {
    // Structure, not style: the backdrop root has four element children — the glow, the photograph
    // wrapper, the blend-mode wash and the grade — and nothing paints over the copy. Anything more
    // is a fourth layer, and the hero has had four layers before (`renderToStaticMarkup` cannot
    // answer this one; jsdom can, because it only needs the tree).
    const { container } = render(<HeroCinematicBackground />);
    const layers = Array.from(container.firstElementChild!.children) as HTMLElement[];
    expect(layers).toHaveLength(4);
    expect(layers[1].getAttribute('style')).toContain('background-image'); // the photograph
    expect(layers[2].style.mixBlendMode).toBe('soft-light'); // the wash
    expect(layers[3].style.zIndex).toBe('4'); // the grade, over the wash
  });

  it('paints the grade as ONE node, with the vignette over the exposure curve', () => {
    const graded = only(styles, HERO_GRADE.exposure);
    expect(graded).toContain(HERO_GRADE.vignette.replace(/\s+/g, ''));
    // Layer order in a `background` shorthand: the first layer paints on top. The vignette has
    // always been the topmost of the two (it was zIndex 6 over an exposure curve at zIndex 4).
    expect(graded.indexOf(HERO_GRADE.vignette.replace(/\s+/g, ''))).toBeLessThan(
      graded.indexOf(HERO_GRADE.exposure.replace(/\s+/g, '')),
    );
  });

  it('never lets the grade come out lighter than the depths the copy was audited against', () => {
    // Floor, in order: [% along the curve, minimum alpha]. The first two stops are the "some glow
    // survives up here" part of the curve; the last two are the band the copy sits in.
    const EXPOSURE_FLOOR: ReadonlyArray<readonly [number, number]> = [
      [0, 0.4],
      [30, 0.26],
      [70, 0.8],
      [100, 0.96],
    ];
    const VIGNETTE_FLOOR = [0.0, 0.64, 0.97];

    // Read each stop as "position, then the alpha in the rgba that follows it" — including the
    // last one, where the alpha comes before the percentage.
    const stops = [...HERO_GRADE.exposure.matchAll(/(?:rgba\([^)]*?([0-9.]+)\)\s*([0-9.]+)%)/g)];
    expect(stops.map((m) => Number(m[2]))).toEqual(EXPOSURE_FLOOR.map(([at]) => at));
    stops.forEach((m, i) => expect(Number(m[1])).toBeGreaterThanOrEqual(EXPOSURE_FLOOR[i][1]));

    const vignette = [...HERO_GRADE.vignette.matchAll(/rgba\([^)]*?([0-9.]+)\)/g)].map((m) =>
      Number(m[1]),
    );
    expect(vignette).toHaveLength(VIGNETTE_FLOOR.length);
    vignette.forEach((a, i) => expect(a).toBeGreaterThanOrEqual(VIGNETTE_FLOOR[i]));

    // The wash is the blue, and it is deeper than the 0.20 it shipped at.
    expect(Number(/rgba\([^)]*?([0-9.]+)\)/.exec(HERO_GRADE.gradeWash)![1])).toBeGreaterThanOrEqual(
      0.26,
    );
  });

  it('keeps the wash a blend-mode layer of its own', () => {
    // It cannot join the gradient stack: `mix-blend-mode` applies to the element against its
    // backdrop, so a merged layer would stop being a soft-light wash over the photograph.
    expect(only(styles, HERO_GRADE.gradeWash)).toContain('mix-blend-mode:soft-light');
  });

  it('glows through the shared mesh value and the one blur token, and rests under test', () => {
    const glow = only(styles, HERO_GRADE.meshGlow);
    // The blur is a token, not a number typed here.
    expect(glow).toContain('blur(var(--hero-glow-blur-primary))');
    // Under test the frame is pinned at its static end state: the glow sits at rest rather than
    // mid-breath, so a test never depends on where in the 14-second arc it happened to render.
    expect(glow).toContain('opacity:0.32');
    // At rest: no scale, no offset. (framer-motion writes `transform: none` when the scale prop is
    // 1; the `will-change` in the string is its own, not this component asking for a layer.)
    expect(glow).toContain('transform:none');
    expect(glow).not.toContain('opacity:0.44');
  });

  it('keeps the poster behind every carousel slide', () => {
    // A static frame is painted behind the carousel, so a missing image is a photograph rather
    // than the container's near-black fill (the silent-blank failure this layer has had twice).
    expect(only(styles, EARTH_HERO_POSTER_CSS)).toContain('background-size:cover');
    expect(markup.match(/data-testid="hero-slide"/g)).toHaveLength(HERO_CAROUSEL_IMAGES.length);
  });

  it('publishes the two type shadows from one place in the stylesheet', () => {
    // The values live in `:root`; the utilities are theme keys pointing at them. Asserting the
    // source text is the only way to see a Tailwind theme key from a test, and it is the same
    // shape as the other bands-and-tokens guards in this repository.
    const css = readFileSync(join(process.cwd(), 'frontend/src/index.css'), 'utf8');
    expect(css).toMatch(/--hero-type-shadow-display:\s*0 1px 2px rgba\(3, 5, 11, 0\.92\)/);
    expect(css).toMatch(/--hero-type-shadow-fine:\s*0 1px 2px rgba\(3, 5, 11, 0\.95\)/);
    expect(css).toContain('--text-shadow-hero-display: var(--hero-type-shadow-display)');
    expect(css).toContain('--text-shadow-hero-fine: var(--hero-type-shadow-fine)');
  });
});
