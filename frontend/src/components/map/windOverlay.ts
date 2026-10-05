/**
 * Wind particle overlay (Phase E, 2026-10-05).
 *
 * A canvas on top of Leaflet advecting particles through ONE wind field. The
 * animation is flow through a single forecast; it does not advance forecast
 * time (GEV's wording, adopted). Budgets follow the plan: at most 1,800
 * particles on fine pointers, 600 on coarse ones; `prefers-reduced-motion`
 * and low-bandwidth collapse the layer to a static quiver plot.
 *
 * This module is dynamically imported only while the wind row is on, so the
 * particle machinery never loads for anyone who does not ask for it (bundle
 * gate acceptance).
 */

import L from 'leaflet';
import { type WindArtifact, sampleWind } from '../../lib/wind';

export interface WindOverlayOptions {
  particleCount?: number;
  /** Static arrows instead of animation (reduced motion / low bandwidth). */
  quiver?: boolean;
}

interface Particle {
  lon: number;
  lat: number;
  age: number;
  maxAge: number;
}

/** Visual speed multiplier: real m/s is invisible at country zooms. */
const FLOW_GAIN = 60;
const MAX_STEP_PX = 6;
const FADE = 0.08;

export class WindOverlay {
  private readonly map: L.Map;
  private artifact: WindArtifact;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly trail: HTMLCanvasElement;
  private readonly trailCtx: CanvasRenderingContext2D;
  private readonly count: number;
  private readonly quiver: boolean;
  private particles: Particle[] = [];
  private raf = 0;
  private lastTs = 0;
  private destroyed = false;
  private onMoveEnd: () => void;

  constructor(map: L.Map, artifact: WindArtifact, options: WindOverlayOptions = {}) {
    this.map = map;
    this.artifact = artifact;
    this.count = options.particleCount ?? 1400;
    this.quiver = options.quiver ?? false;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hn-wind-canvas';
    this.canvas.style.position = 'absolute';
    this.canvas.style.inset = '0';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '450';
    this.canvas.setAttribute('aria-hidden', 'true');
    map.getContainer().appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    const trailCtx = document.createElement('canvas').getContext('2d');
    if (!ctx || !trailCtx) throw new Error('canvas 2d unavailable');
    this.ctx = ctx;
    this.trail = trailCtx.canvas;
    this.trailCtx = trailCtx;

    this.onMoveEnd = () => {
      this.clearTrail();
      if (this.quiver) this.drawQuiver();
    };
    map.on('moveend zoomend resize', this.onMoveEnd);

    this.resize();
    if (this.quiver) {
      this.drawQuiver();
    } else {
      for (let i = 0; i < this.count; i += 1) this.particles.push(this.spawn());
      this.lastTs = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private get grid() {
    return this.artifact.grid;
  }

  private spawn(): Particle {
    const { lon_min, lon_max, lat_min, lat_max } = this.grid;
    return {
      lon: lon_min + Math.random() * (lon_max - lon_min),
      lat: lat_min + Math.random() * (lat_max - lat_min),
      age: Math.floor(Math.random() * 120),
      maxAge: 120 + Math.floor(Math.random() * 180),
    };
  }

  private resize(): void {
    const size = this.map.getSize();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [this.canvas, this.trail]) {
      c.width = Math.max(1, Math.floor(size.x * dpr));
      c.height = Math.max(1, Math.floor(size.y * dpr));
    }
    this.canvas.style.width = `${size.x}px`;
    this.canvas.style.height = `${size.y}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private clearTrail(): void {
    const size = this.map.getSize();
    this.trailCtx.save();
    this.trailCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.trailCtx.clearRect(0, 0, this.trail.width, this.trail.height);
    this.trailCtx.restore();
    this.ctx.clearRect(0, 0, size.x, size.y);
  }

  /** Static mode: one honest arrow per grid node, length scaled by speed. */
  private drawQuiver(): void {
    this.resize();
    const size = this.map.getSize();
    this.ctx.clearRect(0, 0, size.x, size.y);
    const { grid } = this;
    const cols = Math.round((grid.lon_max - grid.lon_min) / grid.step) + 1;
    const rows = Math.round((grid.lat_max - grid.lat_min) / grid.step) + 1;
    this.ctx.lineCap = 'round';
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const lon = grid.lon_min + x * grid.step;
        const lat = grid.lat_min + y * grid.step;
        const wind = sampleWind(this.artifact, lon, lat);
        if (!wind) continue;
        const speed = Math.hypot(wind.u, wind.v);
        if (speed < 0.3) continue;
        const p0 = this.map.latLngToContainerPoint([lat, lon]);
        const len = Math.min(22, 5 + speed * 1.6);
        const dx = (wind.u / speed) * len;
        const dy = (-wind.v / speed) * len;
        const x0 = p0.x - dx / 2;
        const y0 = p0.y - dy / 2;
        const x1 = p0.x + dx / 2;
        const y1 = p0.y + dy / 2;
        // Dark halo, then the stroke: readable on topo and satellite alike.
        this.ctx.strokeStyle = 'rgba(15, 17, 20, 0.55)';
        this.ctx.lineWidth = 3.4;
        this.drawArrow(x0, y0, x1, y1);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
        this.ctx.lineWidth = 1.6;
        this.drawArrow(x0, y0, x1, y1);
      }
    }
  }

  private drawArrow(x0: number, y0: number, x1: number, y1: number): void {
    const angle = Math.atan2(y1 - y0, x1 - x0);
    const head = 4.5;
    this.ctx.beginPath();
    this.ctx.moveTo(x0, y0);
    this.ctx.lineTo(x1, y1);
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x1 - head * Math.cos(angle - 0.5), y1 - head * Math.sin(angle - 0.5));
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x1 - head * Math.cos(angle + 0.5), y1 - head * Math.sin(angle + 0.5));
    this.ctx.stroke();
  }

  private frame = (ts: number): void => {
    if (this.destroyed) return;
    const dt = Math.min(0.05, Math.max(0.001, (ts - this.lastTs) / 1000));
    this.lastTs = ts;

    const size = this.map.getSize();
    // Fade the persistent trail, then advance every particle one step.
    this.trailCtx.globalCompositeOperation = 'destination-out';
    this.trailCtx.fillStyle = `rgba(0, 0, 0, ${FADE})`;
    this.trailCtx.fillRect(0, 0, size.x, size.y);
    this.trailCtx.globalCompositeOperation = 'source-over';
    this.trailCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    this.trailCtx.lineWidth = 1.2;
    this.trailCtx.lineCap = 'round';

    const { grid } = this;
    for (let i = 0; i < this.particles.length; i += 1) {
      const p = this.particles[i];
      const wind = sampleWind(this.artifact, p.lon, p.lat);
      const from = this.map.latLngToContainerPoint([p.lat, p.lon]);
      if (!wind || p.age > p.maxAge) {
        this.particles[i] = this.spawn();
        continue;
      }
      const cosLat = Math.max(0.2, Math.cos((p.lat * Math.PI) / 180));
      let dLon = ((wind.u * FLOW_GAIN) / (111_320 * cosLat)) * dt;
      let dLat = ((wind.v * FLOW_GAIN) / 110_574) * dt;
      // Cap the visual step so strong jets draw curves, not teleports.
      const stepPx = Math.abs(this.map.latLngToContainerPoint([p.lat + dLat, p.lon + dLon]).x - from.x);
      if (stepPx > MAX_STEP_PX) {
        const k = MAX_STEP_PX / Math.max(1e-6, stepPx);
        dLon *= k;
        dLat *= k;
      }
      p.lon += dLon;
      p.lat += dLat;
      p.age += 1;
      if (p.lon < grid.lon_min || p.lon > grid.lon_max || p.lat < grid.lat_min || p.lat > grid.lat_max) {
        this.particles[i] = this.spawn();
        continue;
      }
      const to = this.map.latLngToContainerPoint([p.lat, p.lon]);
      this.trailCtx.beginPath();
      this.trailCtx.moveTo(from.x, from.y);
      this.trailCtx.lineTo(to.x, to.y);
      this.trailCtx.stroke();
    }

    this.ctx.clearRect(0, 0, size.x, size.y);
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.drawImage(this.trail, 0, 0);
    this.ctx.restore();

    this.raf = requestAnimationFrame(this.frame);
  };

  /** Swap the field in place when the artifact refreshes. */
  update(artifact: WindArtifact): void {
    this.artifact = artifact;
    this.clearTrail();
    if (this.quiver) this.drawQuiver();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.map.off('moveend zoomend resize', this.onMoveEnd);
    this.canvas.remove();
    this.particles = [];
  }
}

export function createWindOverlay(
  map: L.Map,
  artifact: WindArtifact,
  options: WindOverlayOptions = {}
): WindOverlay {
  return new WindOverlay(map, artifact, options);
}

/** Plan budgets: 1,800 particles on fine pointers, 600 on coarse ones. */
export function windParticleBudget(): number {
  if (typeof window === 'undefined') return 600;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return coarse ? 600 : 1800;
}

/** Collapse to the static quiver plot under reduced motion. */
export function windPrefersStatic(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
