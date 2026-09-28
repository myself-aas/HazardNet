/// <reference types="jest" />
/**
 * The hero video catalogue.
 *
 * The asset list arrived as 16 *page* URLs, none of which a `<video>` element
 * can load. These tests pin the two properties that make the hero work: every
 * page URL from the request is represented, and every entry carries a direct CDN
 * stream rather than a page URL. A future edit that swaps in a page URL, or
 * quietly drops one of the 16, fails here instead of in front of a user.
 */

import {
  HERO_VIDEO_SOURCES,
  PLAYABLE_HERO_VIDEO_SOURCES,
  buildHeroVideoOrder,
  shuffleHeroSources,
} from '../heroVideoPlaylist';

/** The 16 page URLs from the request, verbatim. */
const REQUESTED_PAGE_URLS = [
  'https://pixabay.com/videos/earth-planet-blue-planet-blue-37665/',
  'https://pixabay.com/videos/satellite-space-earth-cosmos-145366/',
  'https://pixabay.com/videos/planet-earth-atlantic-global-nasa-26016/',
  'https://pixabay.com/videos/satellite-cosmos-earth-space-nasa-86063/',
  'https://pixabay.com/videos/manere-tacete-orare-2611/',
  'https://pixabay.com/videos/earth-day-night-light-pollution-28049/',
  'https://pixabay.com/videos/planet-space-earth-satellite-nasa-145367/',
  'https://pixabay.com/videos/earth-moon-space-146580/',
  'https://pixabay.com/videos/earth-moon-land-planet-space-232205/',
  'https://pixabay.com/videos/earth-double-planet-exoplanets-216038/',
  'https://mixkit.co/free-stock-video/video-of-the-earth-slowly-spinning-on-its-axis-29351/',
  'https://www.pexels.com/video/view-from-satellite-on-earth-10409075/',
  'https://www.pexels.com/video/planet-earth-revolving-8295528/',
  'https://www.pexels.com/video/breathtaking-aerial-view-of-earth-from-space-33393909/',
  'https://www.pexels.com/video/digital-animation-of-planet-earth-and-the-moon-10915129/',
  'https://www.pexels.com/video/the-sun-illuminating-earth-s-surface-1851190/',
];

/** Hosts that actually serve bytes, as opposed to the pages that describe them. */
const CDN_HOSTS = ['cdn.pixabay.com', 'videos.pexels.com', 'assets.mixkit.co'];

/** Deterministic RNG so shuffle assertions do not flake. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('hero video catalogue', () => {
  it('represents exactly the 16 page URLs from the request', () => {
    const actual = HERO_VIDEO_SOURCES.map((source) => source.pageUrl);
    expect(actual).toHaveLength(REQUESTED_PAGE_URLS.length);
    expect([...actual].sort()).toEqual([...REQUESTED_PAGE_URLS].sort());
  });

  it('gives every entry a direct CDN stream, never a page URL', () => {
    for (const source of HERO_VIDEO_SOURCES) {
      const url = new URL(source.src);
      expect(CDN_HOSTS).toContain(url.host);
      expect(url.pathname.endsWith('.mp4')).toBe(true);
      // The failure this guards against: pasting the page URL back into `src`.
      // The stream must be served by a CDN host, not by the site that hosts the
      // asset's HTML page.
      expect(url.host).not.toBe(new URL(source.pageUrl).host);
      expect(source.src).not.toBe(source.pageUrl);
    }
  });

  it('keeps ids unique so the player can key on them', () => {
    const ids = HERO_VIDEO_SOURCES.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('records a measured probe result for every entry', () => {
    for (const source of HERO_VIDEO_SOURCES) {
      expect(['http-200', 'not-probed', 'access-denied']).toContain(source.probe);
    }
  });

  it('excludes the Mixkit clip, whose CDN refuses direct GETs', () => {
    const mixkit = HERO_VIDEO_SOURCES.find((source) => source.provider === 'mixkit');
    expect(mixkit).toBeDefined();
    expect(mixkit?.excluded).toBeTruthy();
    expect(mixkit?.probe).toBe('access-denied');
    expect(PLAYABLE_HERO_VIDEO_SOURCES).not.toContain(mixkit);
  });

  it('draws from 15 playable clips, none of them flagged excluded', () => {
    expect(PLAYABLE_HERO_VIDEO_SOURCES).toHaveLength(HERO_VIDEO_SOURCES.length - 1);
    expect(PLAYABLE_HERO_VIDEO_SOURCES.every((source) => !source.excluded)).toBe(true);
  });
});

describe('buildHeroVideoOrder', () => {
  it('returns every playable clip exactly once', () => {
    const order = buildHeroVideoOrder(seeded(1));
    expect(order).toHaveLength(PLAYABLE_HERO_VIDEO_SOURCES.length);
    expect(order.map((source) => source.id).sort()).toEqual(
      PLAYABLE_HERO_VIDEO_SOURCES.map((source) => source.id).sort(),
    );
  });

  it('does not leave the catalogue in declaration order', () => {
    const declarationOrder = PLAYABLE_HERO_VIDEO_SOURCES.map((source) => source.id).join(',');
    const orders = new Set(
      Array.from({ length: 12 }, (_, i) =>
        buildHeroVideoOrder(seeded(i + 1))
          .map((source) => source.id)
          .join(','),
      ),
    );
    // A draw that always reproduces the source order is not a draw.
    expect(orders.size).toBeGreaterThan(1);
    expect(orders.has(declarationOrder)).toBe(false);
  });

  it('is reproducible for a given seed', () => {
    const a = buildHeroVideoOrder(seeded(7)).map((source) => source.id);
    const b = buildHeroVideoOrder(seeded(7)).map((source) => source.id);
    expect(a).toEqual(b);
  });

  it('draws the confirmed-reachable clips ahead of the unprobed ones', () => {
    const order = buildHeroVideoOrder(seeded(5));
    const verifiedCount = PLAYABLE_HERO_VIDEO_SOURCES.filter((source) => source.probe === 'http-200').length;

    // A hero background cannot afford to open on a clip nobody has seen serve bytes:
    // the user would sit on the poster for the whole load timeout.
    expect(verifiedCount).toBeGreaterThan(0);
    expect(order.slice(0, verifiedCount).every((source) => source.probe === 'http-200')).toBe(true);
    expect(order.slice(verifiedCount).every((source) => source.probe !== 'http-200')).toBe(true);
  });

  it('varies the opening clip between draws', () => {
    // The property the request actually asked for: a different video each refresh.
    const openingClips = new Set(Array.from({ length: 20 }, (_, i) => buildHeroVideoOrder(seeded(i + 100))[0].id));
    expect(openingClips.size).toBeGreaterThan(1);
  });
});

describe('shuffleHeroSources', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];

  it('does not mutate the input', () => {
    const frozen = Object.freeze(items.slice());
    shuffleHeroSources(frozen, seeded(3));
    expect(frozen).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('preserves the multiset', () => {
    expect(shuffleHeroSources(items, seeded(11)).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('survives an RNG that returns the boundary value 1', () => {
    // Math.random() is [0,1) but an injected RNG need not be; an out-of-range
    // draw must not read past the end of the array.
    const shuffled = shuffleHeroSources(items, () => 1);
    expect(shuffled).toHaveLength(items.length);
    expect(shuffled).not.toContain(undefined);
    expect(shuffled.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('survives an empty list', () => {
    expect(shuffleHeroSources([], seeded(1))).toEqual([]);
  });
});
