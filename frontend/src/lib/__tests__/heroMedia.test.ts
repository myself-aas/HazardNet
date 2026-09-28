/**
 * @jest-environment jsdom
 *
 * The hero poster, in both of the encodings it is consumed as.
 *
 * This is a regression test for a bug that made the hero's every fallback render as pure
 * black. The SVG poster was exported once, as a data URI written for an HTML attribute,
 * and then interpolated into `background-image: url("…")`. That source contains 236
 * double quotes and 56 newlines; both are illegal inside a quoted `url()` token, so the
 * browser discards the whole declaration. Nothing paints, the container's `#05070E` shows
 * through, and — because a rejected CSS declaration raises no error — nothing reports it.
 * The video layer would fail over through all fifteen clips, land on the poster, and the
 * poster silently did not exist.
 */

import { EARTH_HERO_POSTER, EARTH_HERO_POSTER_CSS } from '../heroMedia';

/** Assign the way the components do, and read back what the CSS parser kept. */
const acceptedBackgroundImage = (dataUri: string): string => {
  const el = document.createElement('div');
  el.style.backgroundImage = `url("${dataUri}")`;
  return el.style.backgroundImage;
};

describe('hero poster encodings', () => {
  it('survives interpolation into a CSS url() token', () => {
    expect(acceptedBackgroundImage(EARTH_HERO_POSTER_CSS)).not.toBe('');
    expect(acceptedBackgroundImage(EARTH_HERO_POSTER_CSS)).toContain('data:image/svg+xml');
  });

  it('carries nothing in the CSS form that would break a quoted url()', () => {
    const payload = EARTH_HERO_POSTER_CSS.slice('data:image/svg+xml,'.length);
    expect(payload).not.toContain('"');
    expect(payload).not.toContain("'");
    expect(payload).not.toContain('\n');
    expect(payload).not.toContain('#');
  });

  it('keeps the attribute form a valid data URI with no bare fragment delimiter', () => {
    expect(EARTH_HERO_POSTER.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    // A bare `#` would be read as the start of a fragment and truncate the SVG at the
    // first colour value.
    expect(EARTH_HERO_POSTER).not.toContain('#');
    // The attribute form is *not* CSS-safe, and must not be used as a background.
    expect(acceptedBackgroundImage(EARTH_HERO_POSTER)).toBe('');
  });

  it('leaves only unreserved characters and %XX escapes in the CSS payload', () => {
    const payload = EARTH_HERO_POSTER_CSS.slice('data:image/svg+xml,'.length);
    // `encodeURIComponent` spares `!'()*`, and this SVG is full of `(` / `)` from its
    // `fill="url(#spaceGrad)"` references. Not every CSS parser accepts those inside a
    // quoted url() string, so they are encoded too.
    expect(payload).not.toContain('(');
    expect(payload).not.toContain(')');
    expect(payload.replace(/%[0-9A-Fa-f]{2}/g, '')).toMatch(/^[A-Za-z0-9\-_.~]*$/);
  });

  it('renders the same picture in both forms', () => {
    // The CSS form must decode back to the real Earth scene, not a stub that parses.
    const decoded = decodeURIComponent(EARTH_HERO_POSTER_CSS.slice('data:image/svg+xml,'.length));
    for (const marker of ['<svg', 'earthGrad', 'spaceGrad', '960']) {
      expect(decoded).toContain(marker);
      // The attribute form carries the same SVG with `<` and `>` left literal.
      expect(EARTH_HERO_POSTER).toContain(marker);
    }
  });
});
