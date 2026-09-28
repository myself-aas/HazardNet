/**
 * Hero Media Configuration
 *
 * Owns the inline SVG poster for the NASA-inspired Global Observatory hero.
 *
 * The hero's moving image is no longer configured here: as of 2026-09-28 it is
 * drawn at random from the 15-clip catalogue in `./heroVideoPlaylist` and played
 * by `../components/HeroVideoPlayer`, which fails over clip-by-clip and lands on
 * `EARTH_HERO_POSTER` when none of them play.
 *
 * The local `EARTH_HERO_VIDEO_*` constants below are retained but unreferenced —
 * the files still ship in `frontend/assets/hero-section/` and
 * `frontend/public/hero-section/`, so they remain available as an offline or
 * CSP-locked-down source if a deployment ever needs to opt out of the CDNs.
 */

/**
 * Local 1080p (Full HD) Earth and Moon animation loop.
 * Fast, offline-capable, and immune to third-party CSP/network blocking.
 * Retired from the hero — see the note at the top of this file.
 */
export const EARTH_HERO_VIDEO_1080P = '/hero-section/Hero_Section_hd_1920_1080_30fps.mp4';

/**
 * Local 720p version for tablet devices.
 */
export const EARTH_HERO_VIDEO_720P = '/hero-section/Hero_Section_hd_1280_720_30fps.mp4';

/**
 * Local 4K (UHD 2160p) version for ultra-high-DPI displays.
 */
export const EARTH_HERO_VIDEO_4K = '/hero-section/Hero_Section_hd_3840_2160_30fps.mp4';

/**
 * Local 2K (1440p) version.
 */
export const EARTH_HERO_VIDEO_1440P = '/hero-section/Hero_Section_hd_2560_1440_30fps.mp4';

/**
 * Local SD (540p) version for mobile devices and low-bandwidth connections.
 */
export const EARTH_HERO_VIDEO_540P = '/hero-section/Hero_Section_sd_960_540_30fps.mp4';

/**
 * Primary default video source for the Hero section.
 */
export const EARTH_HERO_VIDEO_MP4 = EARTH_HERO_VIDEO_1080P;

/**
 * High-definition online CDN fallback (Pexels 10915129 direct video stream).
 *
 * Note: the Pexels asset page now advertises `10915129-hd_2560_1440_30fps.mp4`
 * as this clip's canonical stream, and that is the URL the hero playlist uses.
 * The 1920x1080 rendition below is the one this repo has shipped historically;
 * it is left untouched because nothing verified either file from a real browser.
 */
export const EARTH_HERO_VIDEO_BACKUP_MP4 =
  'https://videos.pexels.com/video-files/10915129/10915129-hd_1920_1080_30fps.mp4';

/**
 * High-resolution inline SVG poster depicting the Earth glowing in deep space against stars.
 * Ensures the hero background renders immediately even before video playback initiates.
 */
const HERO_POSTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <defs>
    <radialGradient id="spaceGrad" cx="50%" cy="50%" r="75%">
      <stop offset="0%" stop-color="#0b1426" />
      <stop offset="50%" stop-color="#040814" />
      <stop offset="100%" stop-color="#000000" />
    </radialGradient>
    <radialGradient id="earthGrad" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#4facfe" />
      <stop offset="40%" stop-color="#005bea" />
      <stop offset="75%" stop-color="#082567" />
      <stop offset="100%" stop-color="#020b1e" />
    </radialGradient>
    <radialGradient id="earthAtmosphere" cx="50%" cy="50%" r="50%">
      <stop offset="85%" stop-color="#38bdf8" stop-opacity="0" />
      <stop offset="98%" stop-color="#38bdf8" stop-opacity="0.45" />
      <stop offset="100%" stop-color="#7dd3fc" stop-opacity="0.8" />
    </radialGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="15" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Deep Space Backdrop -->
  <rect width="100%" height="100%" fill="url(#spaceGrad)" />

  <!-- Distant Stars -->
  <g fill="#ffffff" opacity="0.65">
    <circle cx="120" cy="180" r="1.5" />
    <circle cx="280" cy="90" r="1" opacity="0.4" />
    <circle cx="450" cy="220" r="1.2" />
    <circle cx="620" cy="80" r="2" opacity="0.8" />
    <circle cx="850" cy="160" r="1" />
    <circle cx="1100" cy="70" r="1.4" opacity="0.5" />
    <circle cx="1350" cy="210" r="1.8" />
    <circle cx="1600" cy="120" r="1" />
    <circle cx="1780" cy="260" r="1.5" opacity="0.7" />
    <circle cx="200" cy="500" r="1" />
    <circle cx="380" cy="720" r="1.5" />
    <circle cx="750" cy="850" r="1.2" />
    <circle cx="1200" cy="650" r="1" />
    <circle cx="1480" cy="800" r="1.6" opacity="0.7" />
    <circle cx="1700" cy="600" r="1.3" />
    <circle cx="1840" cy="750" r="1.5" />
  </g>

  <!-- Glowing Earth Sphere -->
  <circle cx="960" cy="540" r="380" fill="url(#earthGrad)" filter="url(#glow)" />
  <circle cx="960" cy="540" r="380" fill="url(#earthAtmosphere)" />

  <!-- Atmospheric Glow Ring -->
  <circle cx="960" cy="540" r="382" stroke="#38bdf8" stroke-width="3" fill="none" opacity="0.6" />
</svg>`;

/**
 * The poster as a data URI, for HTML attributes — `<video poster>`, `<img src>`.
 *
 * Byte-identical to the value this file always exported: `#` must be escaped as `%23`
 * inside a data URI or the browser reads it as the start of a fragment and truncates the
 * SVG at the first colour value.
 */
export const EARTH_HERO_POSTER = `data:image/svg+xml;utf8,${HERO_POSTER_SVG.replace(/#/g, '%23')}`;

/**
 * The same poster, encoded for use inside a CSS `url()`.
 *
 * This one exists because of a bug that rendered the hero's every poster fallback as
 * pure black. The SVG source contains 236 double quotes and 56 newlines; both are illegal
 * inside a quoted `url()` token, so the browser rejects the whole `background-image`
 * declaration and paints nothing — leaving the container's `#05070E` showing through.
 * A rejected CSS declaration raises no error, which is why this was invisible: the video
 * layer failed over through all fifteen clips, landed on the poster, and the poster
 * silently did not exist. Verified by assigning the declaration in jsdom and reading back
 * an empty `style.backgroundImage`.
 *
 * Use this for `backgroundImage`. Use `EARTH_HERO_POSTER` for attributes — the attribute
 * form is fine there, and `encodeURIComponent` would double-escape its `%23`.
 */
/**
 * `encodeURIComponent` leaves `!'()*` untouched, and this SVG is full of `(` and `)` —
 * every gradient reference is written `fill="url(#spaceGrad)"`. Those parentheses are
 * legal inside a quoted CSS `url()` string per the spec, but not every parser agrees, so
 * percent-encode them as well and leave the payload containing nothing but unreserved
 * characters and `%XX` escapes. That is accepted by strict and lenient parsers alike.
 */
const encodeForCssDataUri = (value: string): string =>
  encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

export const EARTH_HERO_POSTER_CSS = `data:image/svg+xml,${encodeForCssDataUri(HERO_POSTER_SVG)}`;
