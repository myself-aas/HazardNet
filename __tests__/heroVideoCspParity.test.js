/**
 * @jest-environment node
 *
 * The hero's video catalogue and the Content-Security-Policy must agree.
 *
 * This is a regression test for a real break: the hero moved from bundled
 * `public/hero-section/*.mp4` (same-origin, allowed by `media-src 'self'`) to a remote
 * CDN catalogue, and `media-src` was never widened. Every candidate was blocked by
 * policy, the player walked its entire failover order, and the hero settled on the
 * poster. That looks *exactly* like a dead CDN — which is the one failure the failover
 * chain exists to absorb — so nothing in the app or in CI reported it.
 *
 * A blocked media request and an unreachable one are indistinguishable from inside the
 * player, so the only place this can be caught is a static check that the policy covers
 * the catalogue.
 */

import { CSP, HERO_MEDIA_ORIGINS } from '../backend/security/csp.js';
import { HERO_VIDEO_SOURCES, PLAYABLE_HERO_VIDEO_SOURCES } from '../frontend/src/lib/heroVideoPlaylist';

/** The media-src directive, without its leading name. */
const mediaSrc = /media-src([^;]*)/.exec(CSP)[1];
const mediaTokens = mediaSrc.trim().split(/\s+/);

describe('hero catalogue vs media-src', () => {
  it('allows the origin of every playable clip', () => {
    for (const source of PLAYABLE_HERO_VIDEO_SOURCES) {
      const origin = new URL(source.src).origin;
      expect(mediaTokens).toContain(origin);
    }
  });

  it('exposes the hero origins as a named allowlist rather than a wildcard', () => {
    expect(HERO_MEDIA_ORIGINS.length).toBeGreaterThan(0);
    for (const origin of HERO_MEDIA_ORIGINS) {
      expect(mediaTokens).toContain(origin);
    }
    // Widening media-src to a bare scheme or wildcard would let any host serve the hero.
    expect(mediaTokens).not.toContain('*');
    expect(mediaTokens).not.toContain('https:');
    expect(mediaTokens).not.toContain('data:');
  });

  it('keeps same-origin and blob media working', () => {
    expect(mediaTokens).toContain("'self'");
    expect(mediaTokens).toContain('blob:');
  });

  it('does not allowlist a host the rotation never uses', () => {
    // Every allowlisted https origin must back at least one catalogue entry. An entry for
    // a source we never load is surface area with no purpose.
    const catalogueOrigins = new Set(HERO_VIDEO_SOURCES.map((source) => new URL(source.src).origin));
    for (const origin of HERO_MEDIA_ORIGINS) {
      expect(catalogueOrigins.has(origin)).toBe(true);
    }
  });
});
