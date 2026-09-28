/**
 * Hero Video Playlist — the FrontDoor hero background catalogue.
 *
 * The hero used to play a single bundled Earth/Moon loop
 * (`public/hero-section/*.mp4`) with one hard-coded Pexels fallback. It now
 * plays one of 16 curated "Earth from orbit" clips, re-drawn on every page
 * load, and fails over to the next clip when one cannot be played.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * The 16 assets were supplied as *page* URLs (pixabay.com/videos/…,
 * pexels.com/video/…, mixkit.co/free-stock-video/…). A `<video>` element cannot
 * load any of those — they are HTML documents. Each entry below therefore pairs
 * the page URL the request listed (`pageUrl`, kept for attribution and for
 * re-checking the licence) with the direct CDN stream that actually gets
 * loaded (`src`).
 *
 * ── Reachability, as probed on 2026-09-28 ───────────────────────────────────
 * `probe` records what was actually measured, not what is assumed:
 *   - 'http-200'      — the CDN answered 200 for the stream (all 10 Pixabay).
 *   - 'not-probed'    — URL taken verbatim from the asset page's own canonical
 *                       `file-url`, but reachability could not be measured from
 *                       the sandbox: `videos.pexels.com` answers HTTP 500 to the
 *                       proxy for every .mp4, including the URL this repo has
 *                       been shipping all along. These are exactly the entries
 *                       the runtime failover chain exists to absorb.
 *   - 'access-denied' — the CDN refused the request. Mixkit's preview bucket
 *                       answers `AccessDenied` to a direct GET, so it is not
 *                       hotlinkable; its free 720p file is also "Personal Use
 *                       only" under the Mixkit Restricted License. It stays in
 *                       the catalogue for provenance but is excluded from
 *                       rotation, so a random draw can never land on a clip
 *                       that would sit on a timeout before failing over.
 *
 * Adding an entry: fill in `src` from the asset page's own download/stream URL
 * (never guess the CDN hash), set `probe` to what you actually measured, and set
 * `excluded` if the host blocks hotlinking or the licence forbids product use.
 */

export type HeroVideoProvider = 'pixabay' | 'pexels' | 'mixkit';

/** What was actually measured against `src` — see the note at the top. */
export type HeroVideoProbe = 'http-200' | 'not-probed' | 'access-denied';

export interface HeroVideoSource {
  /** Stable identity, e.g. `pixabay-37665`. Used as the React remount key. */
  id: string;
  provider: HeroVideoProvider;
  /** The page URL from the original request — attribution and licence check. */
  pageUrl: string;
  /** Direct CDN stream. This is the only URL handed to a `<video>` element. */
  src: string;
  /** Author, where the asset page named one. */
  credit?: string;
  probe: HeroVideoProbe;
  /** When set, the entry is kept for provenance but never drawn. */
  excluded?: string;
}

/* ── the catalogue ─────────────────────────────────────────────────────────── */

export const HERO_VIDEO_SOURCES: readonly HeroVideoSource[] = [
  // ── Pixabay — all 10 confirmed HTTP 200 on 2026-09-28 ──────────────────────
  {
    id: 'pixabay-37665',
    provider: 'pixabay',
    pageUrl: 'https://pixabay.com/videos/earth-planet-blue-planet-blue-37665/',
    src: 'https://cdn.pixabay.com/video/2020-04-30/37665-414086282_large.mp4',
    credit: 'Sidibe_KaGaks',
    probe: 'http-200',
  },
  {
    id: 'pixabay-145366',
    provider: 'pixabay',
    pageUrl: 'https://pixabay.com/videos/satellite-space-earth-cosmos-145366/',
    src: 'https://cdn.pixabay.com/video/2023-01-05/145366-786474915_large.mp4',
    credit: 'Gucellos',
    probe: 'http-200',
  },
  {
    id: 'pixabay-26016',
    provider: 'pixabay',
    pageUrl: 'https://pixabay.com/videos/planet-earth-atlantic-global-nasa-26016/',
    src: 'https://cdn.pixabay.com/video/2019-08-13/26016-353764200_large.mp4',
    probe: 'http-200',
  },
  {
    id: 'pixabay-86063',
    provider: 'pixabay',
    pageUrl: 'https://pixabay.com/videos/satellite-cosmos-earth-space-nasa-86063/',
    src: 'https://cdn.pixabay.com/video/2021-08-23/86063-593058981_large.mp4',
    credit: 'SquirrelMonkey',
    probe: 'http-200',
  },
  {
    id: 'pixabay-2611',
    provider: 'pixabay',
    pageUrl: 'https://pixabay.com/videos/manere-tacete-orare-2611/',
    src: 'https://cdn.pixabay.com/video/2016-03-30/2611-865412751_large.mp4',
    probe: 'http-200',
  },
  {
    id: 'pixabay-28049',
    provider: 'pixabay',
    pageUrl: 'https://pixabay.com/videos/earth-day-night-light-pollution-28049/',
    src: 'https://cdn.pixabay.com/video/2019-10-18/28049-367411286_large.mp4',
    credit: 'MasterTux',
    probe: 'http-200',
  },
  {
    id: 'pixabay-145367',
    provider: 'pixabay',
    pageUrl: 'https://pixabay.com/videos/planet-space-earth-satellite-nasa-145367/',
    src: 'https://cdn.pixabay.com/video/2023-01-05/145367-786474918_large.mp4',
    credit: 'Gucellos',
    probe: 'http-200',
  },
  {
    id: 'pixabay-146580',
    provider: 'pixabay',
    pageUrl: 'https://pixabay.com/videos/earth-moon-space-146580/',
    src: 'https://cdn.pixabay.com/video/2023-01-15/146580-789534202_large.mp4',
    credit: 'u_stx2v3nlqd',
    probe: 'http-200',
  },
  {
    id: 'pixabay-232205',
    provider: 'pixabay',
    pageUrl: 'https://pixabay.com/videos/earth-moon-land-planet-space-232205/',
    src: 'https://cdn.pixabay.com/video/2024-09-19/232205_large.mp4',
    credit: 'olenchic',
    probe: 'http-200',
  },
  {
    id: 'pixabay-216038',
    provider: 'pixabay',
    pageUrl: 'https://pixabay.com/videos/earth-double-planet-exoplanets-216038/',
    src: 'https://cdn.pixabay.com/video/2024-06-09/216038_large.mp4',
    credit: 'UniverseUnique',
    probe: 'http-200',
  },

  // ── Pexels — canonical `file-url` from each asset page ─────────────────────
  {
    id: 'pexels-10409075',
    provider: 'pexels',
    pageUrl: 'https://www.pexels.com/video/view-from-satellite-on-earth-10409075/',
    src: 'https://videos.pexels.com/video-files/10409075/10409075-hd_1920_1080_24fps.mp4',
    credit: 'Colin Jones',
    probe: 'not-probed',
  },
  {
    id: 'pexels-8295528',
    provider: 'pexels',
    pageUrl: 'https://www.pexels.com/video/planet-earth-revolving-8295528/',
    src: 'https://videos.pexels.com/video-files/8295528/8295528-hd_1920_1080_30fps.mp4',
    credit: 'Borys Zaitsev',
    probe: 'not-probed',
  },
  {
    id: 'pexels-33393909',
    provider: 'pexels',
    pageUrl: 'https://www.pexels.com/video/breathtaking-aerial-view-of-earth-from-space-33393909/',
    src: 'https://videos.pexels.com/video-files/33393909/14216244_1920_1080_24fps.mp4',
    credit: 'Gonzalo Garcia',
    probe: 'not-probed',
  },
  {
    id: 'pexels-10915129',
    provider: 'pexels',
    pageUrl: 'https://www.pexels.com/video/digital-animation-of-planet-earth-and-the-moon-10915129/',
    src: 'https://videos.pexels.com/video-files/10915129/10915129-hd_2560_1440_30fps.mp4',
    credit: 'Nino Souza',
    probe: 'not-probed',
  },
  {
    id: 'pexels-1851190',
    provider: 'pexels',
    pageUrl: 'https://www.pexels.com/video/the-sun-illuminating-earth-s-surface-1851190/',
    src: 'https://videos.pexels.com/video-files/1851190/1851190-uhd_2560_1440_25fps.mp4',
    credit: 'Ingrid',
    probe: 'not-probed',
  },

  // ── Mixkit — not hotlinkable, personal-use-only licence ────────────────────
  {
    id: 'mixkit-29351',
    provider: 'mixkit',
    pageUrl: 'https://mixkit.co/free-stock-video/video-of-the-earth-slowly-spinning-on-its-axis-29351/',
    src: 'https://assets.mixkit.co/videos/preview/mixkit-spinning-around-the-earth-29351-large.mp4',
    credit: 'DC_Studio',
    probe: 'access-denied',
    excluded: 'CDN answers AccessDenied to a direct GET (not hotlinkable); free 720p file is personal-use-only.',
  },
];

/* ── selection helpers ─────────────────────────────────────────────────────── */

/** Catalogue entries that are safe to draw at random. */
export const PLAYABLE_HERO_VIDEO_SOURCES: readonly HeroVideoSource[] = HERO_VIDEO_SOURCES.filter(
  (source) => !source.excluded,
);

/**
 * Fisher–Yates shuffle. Pure: returns a new array, leaves `items` untouched.
 *
 * `random` is injectable so tests (and any future A/B bucketing) can drive the
 * draw deterministically instead of asserting on `Math.random()`.
 */
export function shuffleHeroSources<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    // Clamp: a caller-supplied `random` returning exactly 1 would otherwise
    // index past the end of the array.
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

/**
 * The failover order for this page load: every playable clip, shuffled.
 *
 * Position 0 is what the hero plays; the rest are tried in order if it fails.
 * Called once per mount, so a refresh draws a different first clip.
 */
export function buildHeroVideoOrder(random: () => number = Math.random): HeroVideoSource[] {
  return shuffleHeroSources(PLAYABLE_HERO_VIDEO_SOURCES, random);
}
