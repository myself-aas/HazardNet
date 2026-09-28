/**
 * HeroSpaceCanvas — the hero background, drawn rather than streamed.
 *
 * The concept this replaces was "Earth seen from space": a sphere turning under a
 * fixed sun, an atmosphere rim catching the light, a starfield behind it. That was
 * sourced as stock video, and sourcing it that way turned out to be the wrong call for
 * three separate reasons, each of which showed up as a different failure:
 *
 *   - Third-party CDNs refuse under load. A hero that fires up to fifteen sequential
 *     requests per page load gets rate-limited, and the E2E request-health gate
 *     (`full-app-qa.spec.ts`) failed the build on the resulting 404s.
 *   - Remote media needs `media-src` widened in a CSP that was deliberately tight.
 *   - Every candidate failing looked identical to a dead CDN, so the failure mode was
 *     a black hero with nothing logged.
 *
 * Drawing it removes all three at once: no requests, no policy change, and a
 * deterministic frame that either renders or does not.
 *
 * Cost discipline, since this is a full-bleed surface that runs while the user reads:
 *   - device pixel ratio capped at 2 — beyond that the pixels are invisible and the
 *     fill rate is not free;
 *   - the loop is throttled to 30fps, because this is ambience and not content;
 *   - an IntersectionObserver stops the loop entirely once the hero scrolls away, so a
 *     user reading the archive is not paying for frames nobody sees;
 *   - `prefers-reduced-motion` draws exactly one frame and never starts the loop.
 */

import React, { useEffect, useRef } from 'react';

/* ────────────────────────────────── constants ──────────────────────────────── */

/** Ambient background: half the display rate is indistinguishable here, and cheaper. */
const TARGET_FPS = 30;

/** Rendering above 2x costs real fill rate for pixels no one can resolve. */
const MAX_DPR = 2;

/** One rotation, in seconds. Slow enough to read as a planet and not a spinner. */
const ROTATION_PERIOD_S = 120;

/** Clouds drift ahead of the surface, which is what makes them read as weather. */
const CLOUD_DRIFT = 1.35;

/** Seconds of camera drift for one full breathing cycle. */
const BREATH_PERIOD_S = 24;

/* ───────────────────────────── deterministic scene ─────────────────────────── */

/**
 * `mulberry32` — a small deterministic PRNG.
 *
 * The scene must be identical on every mount: a starfield that reshuffles per visit
 * reads as noise rather than as a sky, and a random scene cannot be snapshot-tested.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Body {
  /** Longitude in radians. */
  lon: number;
  /** Latitude in radians. */
  lat: number;
  /** Radius as a fraction of the sphere radius. */
  size: number;
  /** Colour, pre-resolved so the draw loop never builds a string. */
  fill: string;
}

/** Landmasses, hand-placed to read as continents without being a map of anything. */
const LANDMASSES: Body[] = [
  { lon: -0.4, lat: 0.55, size: 0.3, fill: 'rgba(46,86,62,0.92)' },
  { lon: -0.05, lat: 0.2, size: 0.22, fill: 'rgba(58,98,66,0.9)' },
  { lon: 0.25, lat: -0.35, size: 0.17, fill: 'rgba(74,104,62,0.88)' },
  { lon: 1.5, lat: 0.6, size: 0.26, fill: 'rgba(52,90,64,0.9)' },
  { lon: 1.9, lat: 0.15, size: 0.2, fill: 'rgba(86,110,66,0.86)' },
  { lon: 2.3, lat: -0.25, size: 0.24, fill: 'rgba(64,96,60,0.88)' },
  { lon: -2.2, lat: 0.45, size: 0.23, fill: 'rgba(56,92,64,0.9)' },
  { lon: -1.7, lat: -0.1, size: 0.15, fill: 'rgba(78,106,64,0.84)' },
  { lon: -1.4, lat: -0.6, size: 0.13, fill: 'rgba(92,112,72,0.8)' },
  { lon: 2.9, lat: 0.75, size: 0.16, fill: 'rgba(60,94,66,0.86)' },
];

function buildClouds(count: number): Body[] {
  const rng = mulberry32(0x5eed);
  const clouds: Body[] = [];
  for (let i = 0; i < count; i += 1) {
    clouds.push({
      lon: rng() * Math.PI * 2,
      lat: (rng() - 0.5) * 2.4,
      size: 0.05 + rng() * 0.13,
      fill: `rgba(255,255,255,${(0.1 + rng() * 0.16).toFixed(3)})`,
    });
  }
  return clouds;
}

interface Star {
  /** Normalised 0..1 within the canvas, so a resize needs no regeneration. */
  x: number;
  y: number;
  r: number;
  /** Base opacity. */
  a: number;
  /** Twinkle phase and rate. */
  phase: number;
  rate: number;
}

function buildStars(count: number): Star[] {
  const rng = mulberry32(0x57a4);
  const stars: Star[] = [];
  for (let i = 0; i < count; i += 1) {
    const roll = rng();
    stars.push({
      x: rng(),
      y: rng(),
      // A few bright anchors, many faint ones — that distribution is what reads as depth.
      r: roll > 0.97 ? 1.5 + rng() * 0.9 : 0.35 + rng() * 0.85,
      a: roll > 0.97 ? 0.75 + rng() * 0.25 : 0.18 + rng() * 0.45,
      phase: rng() * Math.PI * 2,
      rate: 0.25 + rng() * 0.9,
    });
  }
  return stars;
}

/** City lights, placed on land so the night side is not random speckle. */
function buildCityLights(count: number): Body[] {
  const rng = mulberry32(0xc17);
  const lights: Body[] = [];
  for (let i = 0; i < count; i += 1) {
    const host = LANDMASSES[Math.floor(rng() * LANDMASSES.length)];
    lights.push({
      lon: host.lon + (rng() - 0.5) * host.size * 1.5,
      lat: host.lat + (rng() - 0.5) * host.size * 1.2,
      size: 0.004 + rng() * 0.006,
      fill: `rgba(255,214,150,${(0.35 + rng() * 0.5).toFixed(3)})`,
    });
  }
  return lights;
}

const STARS = buildStars(320);
const CLOUDS = buildClouds(34);
const CITY_LIGHTS = buildCityLights(46);

/* ────────────────────────────── projection helpers ─────────────────────────── */

/**
 * Project a point on the sphere to screen space.
 *
 * Returns `null` for points on the far side, which is the whole trick: features
 * disappear over the limb instead of wrapping around the front, so the rotation reads
 * as a solid body rather than a scrolling texture.
 */
function project(
  lon: number,
  lat: number,
  rotation: number,
  radius: number,
  cx: number,
  cy: number,
): { x: number; y: number; depth: number } | null {
  const l = lon + rotation;
  const cosLat = Math.cos(lat);
  // Depth toward the viewer. Negative means behind the sphere.
  const depth = cosLat * Math.cos(l);
  if (depth <= 0.02) return null;
  return {
    x: cx + radius * cosLat * Math.sin(l),
    y: cy - radius * Math.sin(lat),
    depth,
  };
}

/* ──────────────────────────────────── drawing ──────────────────────────────── */

interface SceneOptions {
  width: number;
  height: number;
  /** Seconds since the scene started. */
  t: number;
}

function drawScene(ctx: CanvasRenderingContext2D, { width, height, t }: SceneOptions): void {
  const cx = width / 2;
  const cy = height / 2;
  // The sphere fills the frame's short axis with room for the atmosphere and the
  // overlay copy above it.
  const radius = Math.min(width, height) * 0.36;

  /*
   * Slow camera breathing, applied to the whole scene rather than to the sphere, so the
   * starfield drifts with it and the frame reads as held by a camera instead of
   * composited from layers. It has to be set *before* anything is drawn — setting it
   * afterwards only affects the next frame, and the caller resets the transform first,
   * which would silently drop the motion entirely.
   */
  const breath = Math.sin((t / BREATH_PERIOD_S) * Math.PI * 2);
  const scale = 1 + breath * 0.012;
  ctx.setTransform(scale, 0, 0, scale, cx * (1 - scale), cy * (1 - scale));

  /* ── deep space ── */
  const space = ctx.createRadialGradient(cx, cy * 0.7, 0, cx, cy, Math.max(width, height) * 0.78);
  space.addColorStop(0, '#0b1426');
  space.addColorStop(0.45, '#060b16');
  space.addColorStop(1, '#010205');
  ctx.fillStyle = space;
  // Oversized: the breathing transform scales the scene, so an exact-size fill would
  // leave a visible sliver of cleared canvas at the edges on the downswing.
  ctx.fillRect(-width * 0.05, -height * 0.05, width * 1.1, height * 1.1);

  /* ── starfield ── */
  for (const star of STARS) {
    // Slow twinkle: a sine offset per star, so the field shimmers without crawling.
    const twinkle = 0.72 + 0.28 * Math.sin(t * star.rate + star.phase);
    ctx.globalAlpha = star.a * twinkle;
    ctx.fillStyle = '#eaf4ff';
    ctx.beginPath();
    ctx.arc(star.x * width, star.y * height, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* ── atmosphere halo, drawn before the sphere so it reads as backlight ── */
  const halo = ctx.createRadialGradient(cx, cy, radius * 0.92, cx, cy, radius * 1.22);
  halo.addColorStop(0, 'rgba(56,189,248,0)');
  halo.addColorStop(0.55, 'rgba(56,189,248,0.16)');
  halo.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.22, 0, Math.PI * 2);
  ctx.fill();

  /* ── the sphere ── */
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  // Ocean, shaded toward the sun. The gradient centre is offset to the upper left, so
  // one pass produces both the lit hemisphere and the terminator in one fill.
  const sunX = cx - radius * 0.42;
  const sunY = cy - radius * 0.38;
  const ocean = ctx.createRadialGradient(sunX, sunY, radius * 0.05, cx, cy, radius * 1.45);
  ocean.addColorStop(0, '#2b6f9e');
  ocean.addColorStop(0.28, '#17456d');
  ocean.addColorStop(0.58, '#0a2338');
  ocean.addColorStop(0.82, '#03080f');
  ocean.addColorStop(1, '#000000');
  ctx.fillStyle = ocean;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  const rotation = ((t / ROTATION_PERIOD_S) % 1) * Math.PI * 2;

  const drawBodies = (bodies: Body[], rot: number, limbFade: number): void => {
    for (const body of bodies) {
      const p = project(body.lon, body.lat, rot, radius, cx, cy);
      if (!p) continue;
      // Foreshortening: a feature at the limb is seen edge-on, so it narrows. Without
      // this the landmasses slide across the disk instead of wrapping around it.
      const squash = Math.max(0.08, p.depth);
      const fade = Math.min(1, p.depth / limbFade);
      ctx.globalAlpha = fade;
      ctx.fillStyle = body.fill;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, body.size * radius * squash, body.size * radius, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  drawBodies(LANDMASSES, rotation, 0.28);
  drawBodies(CLOUDS, rotation * CLOUD_DRIFT, 0.2);
  drawBodies(CITY_LIGHTS, rotation, 0.42);

  // Night side. Multiplied over everything already drawn, so the terminator falls
  // across land and ocean alike rather than only over the base fill.
  const night = ctx.createRadialGradient(sunX, sunY, radius * 0.2, cx, cy, radius * 1.5);
  night.addColorStop(0, 'rgba(0,0,0,0)');
  night.addColorStop(0.5, 'rgba(0,0,0,0.35)');
  night.addColorStop(1, 'rgba(0,0,0,0.9)');
  ctx.fillStyle = night;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  // Rim light: the thin cyan edge where the atmosphere catches the sun.
  ctx.strokeStyle = 'rgba(125,211,252,0.5)';
  ctx.lineWidth = Math.max(1, radius * 0.012);
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.995, Math.PI * 0.85, Math.PI * 2.15);
  ctx.stroke();

  ctx.restore();
}

/* ───────────────────────────────── component ───────────────────────────────── */

interface HeroSpaceCanvasProps {
  /** Freezes the loop but keeps the last frame — the hero's pause control. */
  paused?: boolean;
  /** Skips animation entirely and draws a single frame. */
  reducedMotion?: boolean;
  style?: React.CSSProperties;
}

export const HeroSpaceCanvas: React.FC<HeroSpaceCanvasProps> = ({ paused = false, reducedMotion = false, style }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    // jsdom and a few headless contexts have no 2D context. Nothing to draw, and
    // throwing here would take the whole hero down over a decorative layer.
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let width = 0;
    let height = 0;

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = Math.max(1, Math.round(rect.width * dpr));
      height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };

    const render = (t: number): void => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawScene(ctx, { width: canvas.width, height: canvas.height, t });
    };

    resize();

    /*
     * A fixed still, not a black rectangle: at t=0 the scene is fully drawn, so a
     * reduced-motion visitor gets the same composition everyone else sees, held still.
     */
    if (reducedMotion) {
      render(0);
      return undefined;
    }

    let frame = 0;
    let running = true;
    let visible = true;
    let last = performance.now();
    let elapsed = 0;
    const step = 1000 / TARGET_FPS;

    const tick = (now: number): void => {
      if (!running) return;
      frame = window.requestAnimationFrame(tick);
      const delta = now - last;
      if (delta < step) return;
      last = now;
      // Clamped: a background tab returns a huge delta, and replaying it would spin
      // the planet forward through several rotations in a single frame.
      if (!paused) elapsed += Math.min(delta, 250);
      if (visible) render(elapsed / 1000);
    };

    /* Stop paying for frames the user has scrolled past. */
    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((entries) => {
            visible = entries.some((entry) => entry.isIntersecting);
          })
        : null;
    observer?.observe(canvas);

    const onResize = (): void => {
      resize();
      render(elapsed / 1000);
    };
    window.addEventListener('resize', onResize);

    frame = window.requestAnimationFrame(tick);

    return () => {
      running = false;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [paused, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="hero-space-canvas"
      aria-hidden="true"
      role="presentation"
      style={{ width: '100%', height: '100%', display: 'block', ...style }}
    />
  );
};

export default HeroSpaceCanvas;
