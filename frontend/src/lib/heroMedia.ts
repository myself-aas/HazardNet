/**
 * Hero Media Configuration
 *
 * Provides media assets for the NASA-inspired Global Observatory Hero section.
 * Renders the Planet Earth and Moon animation from local assets
 * (frontend/assets/hero-section/ and frontend/public/hero-section/)
 * with resolution-adaptive sources, online CDN fallback, and inline SVG poster fallback.
 */

/**
 * Local 1080p (Full HD) Earth and Moon animation loop.
 * Fast, offline-capable, and immune to third-party CSP/network blocking.
 */
export const EARTH_HERO_VIDEO_1080P =
  '/hero-section/Hero_Section_hd_1920_1080_30fps.mp4';

/**
 * Local 720p version for tablet devices.
 */
export const EARTH_HERO_VIDEO_720P =
  '/hero-section/Hero_Section_hd_1280_720_30fps.mp4';

/**
 * Local 4K (UHD 2160p) version for ultra-high-DPI displays.
 */
export const EARTH_HERO_VIDEO_4K =
  '/hero-section/Hero_Section_hd_3840_2160_30fps.mp4';

/**
 * Local 2K (1440p) version.
 */
export const EARTH_HERO_VIDEO_1440P =
  '/hero-section/Hero_Section_hd_2560_1440_30fps.mp4';

/**
 * Local SD (540p) version for mobile devices and low-bandwidth connections.
 */
export const EARTH_HERO_VIDEO_540P =
  '/hero-section/Hero_Section_sd_960_540_30fps.mp4';

/**
 * Primary default video source for the Hero section.
 */
export const EARTH_HERO_VIDEO_MP4 = EARTH_HERO_VIDEO_1080P;

/**
 * High-definition online CDN fallback (Pexels 10915129 direct video stream).
 */
export const EARTH_HERO_VIDEO_BACKUP_MP4 =
  'https://videos.pexels.com/video-files/10915129/10915129-hd_1920_1080_30fps.mp4';

/**
 * High-resolution inline SVG poster depicting the Earth glowing in deep space against stars.
 * Ensures the hero background renders immediately even before video playback initiates.
 */
export const EARTH_HERO_POSTER = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <defs>
    <radialGradient id="spaceGrad" cx="50%" cy="50%" r="75%">
      <stop offset="0%" stop-color="%230b1426" />
      <stop offset="50%" stop-color="%23040814" />
      <stop offset="100%" stop-color="%23000000" />
    </radialGradient>
    <radialGradient id="earthGrad" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="%234facfe" />
      <stop offset="40%" stop-color="%23005bea" />
      <stop offset="75%" stop-color="%23082567" />
      <stop offset="100%" stop-color="%23020b1e" />
    </radialGradient>
    <radialGradient id="earthAtmosphere" cx="50%" cy="50%" r="50%">
      <stop offset="85%" stop-color="%2338bdf8" stop-opacity="0" />
      <stop offset="98%" stop-color="%2338bdf8" stop-opacity="0.45" />
      <stop offset="100%" stop-color="%237dd3fc" stop-opacity="0.8" />
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
  <rect width="100%" height="100%" fill="url(%23spaceGrad)" />

  <!-- Distant Stars -->
  <g fill="%23ffffff" opacity="0.65">
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
  <circle cx="960" cy="540" r="380" fill="url(%23earthGrad)" filter="url(%23glow)" />
  <circle cx="960" cy="540" r="380" fill="url(%23earthAtmosphere)" />

  <!-- Atmospheric Glow Ring -->
  <circle cx="960" cy="540" r="382" stroke="%2338bdf8" stroke-width="3" fill="none" opacity="0.6" />
</svg>`;
