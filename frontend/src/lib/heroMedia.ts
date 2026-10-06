/**
 * Hero Media Configuration
 *
 * Owns the inline SVG poster for the NASA-inspired Global Observatory hero.
 *
 * The hero's backdrop is a cross-fading carousel of self-hosted frames in
 * `../components/HeroImageCarousel` (manifest in `./heroCarouselImages`), so nothing in
 * this file is fetched at runtime and no `media-src` allowance is needed for the hero.
 *
 * The poster is still worth keeping, as a static fallback painted *behind* that canvas. A
 * 2D context is not guaranteed — an old engine, a disabled GPU, a privacy mode that
 * refuses canvas — and with nothing underneath, the hero would fall back to its
 * container's near-black fill. That is a silent blank, which is exactly how the previous
 * video implementation failed.
 *
 * The five local `EARTH_HERO_VIDEO_*` constants were deleted on 2026-10-06 (see the note where
 * they were). The MP4s themselves are still on disk, in `frontend/assets/hero-section/` and
 * `frontend/public/hero-section/`, so a deployment that needs a real `<video>` element is one
 * source line away — but nothing in the app reads them, so nothing in the app names them.
 */

/* ── The retired hero videos ──────────────────────────────────────────────────
   Five MP4s (113 MB) still sit in `frontend/public/hero-section/` and
   `frontend/assets/hero-section/`. Playback ended when the carousel replaced them, and on
   2026-10-06 the five `EARTH_HERO_VIDEO_*` exports below this note were deleted: a repo-wide grep
   found no importer, no test and no script, and the audit trail already records them as dead
   (`docs/audits/2026-10-02-frontend-design-system-audit-apple-meta.md` §P2, which also notes the
   files themselves are deliberately left on disk). The build's `excludeUnreferencedHeroVideos()`
   plugin strips them from `dist/` so they never ship. To bring video back, add a source here and
   wire the element — the files are one directory away.

   Kept as a comment rather than as five unreferenced exports: a constant nothing reads is not a
   spare part, it is a thing the next reader has to check. */

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
      <stop offset="85%" stop-color="#0066cc" stop-opacity="0" />
      <stop offset="98%" stop-color="#0066cc" stop-opacity="0.45" />
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
  <circle cx="960" cy="540" r="382" stroke="#0066cc" stroke-width="3" fill="none" opacity="0.6" />
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
