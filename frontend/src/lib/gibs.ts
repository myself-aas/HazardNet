/**
 * NASA GIBS client for the live map (Phase C, 2026-10-05).
 *
 * GIBS (gibs.earthdata.nasa.gov) serves corrected-reflectance true-colour
 * imagery as WMTS tiles, CORS-open and keyless, so the browser fetches them
 * directly. The plan's rules apply (docs/plans/2026-10-05-live-realtime-map-plan.md):
 *
 *  - bounded fetching: a concurrency gate caps in-flight tile requests at six
 *    (GEV's cap); the gate pauses when the tab is hidden or the layer is off;
 *  - honesty: the UI advertises the observation date the tiles actually carry,
 *    says "newest available", never "live", and never reprojects or invents
 *    frames;
 *  - the fallback ladder: Terra -> VIIRS SNPP (L1 same-role swap) -> UNAVAILABLE
 *    (L4, a distinct honest state with a link to NASA's status page). Tiles
 *    skip L2/L3 by policy: they show, or the layer says why it cannot.
 */

/** GEV's cap: at most six GIBS requests in flight at once; queue the rest. */
export const GIBS_MAX_IN_FLIGHT = 6;

/** L0 deadline from the plan: 12 s bounded fetch. */
export const GIBS_FETCH_TIMEOUT_MS = 12_000;

/** Probe results are cached for 30 minutes; GIBS frames arrive a few times a day. */
export const GIBS_PROBE_TTL_MS = 30 * 60 * 1000;

/**
 * A counting concurrency gate. `acquire()` resolves with a release callback once
 * a slot is free and the gate is not paused; waiters queue in order. Pausing
 * stops new issues but never aborts downloads already in flight.
 */
export class ConcurrencyGate {
  private readonly max: number;
  private running = 0;
  private waiters: Array<() => void> = [];
  private paused = false;

  constructor(max: number) {
    if (max < 1) throw new Error('ConcurrencyGate needs at least one slot');
    this.max = max;
  }

  get activeCount(): number {
    return this.running;
  }

  get queuedCount(): number {
    return this.waiters.length;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const tryStart = (): void => {
        if (this.paused || this.running >= this.max) {
          this.waiters.push(tryStart);
          return;
        }
        this.running += 1;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.running -= 1;
          const next = this.waiters.shift();
          if (next) next();
        });
      };
      tryStart();
    });
  }

  /** Stop issuing queued work (tab hidden, layer off). Running work finishes. */
  pause(): void {
    this.paused = true;
  }

  /** Resume issuing queued work. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    while (this.waiters.length > 0 && this.running < this.max && !this.paused) {
      const next = this.waiters.shift();
      if (next) next();
    }
  }
}

export interface GibsTrueColorDef {
  id: 'modis-terra' | 'viirs-snpp';
  /** GIBS layer identifier used in the WMTS REST path. */
  gibsLayer: string;
  name: string;
  /** Native resolution of the corrected-reflectance product. */
  resolution: string;
  /** Typical lag between acquisition and GIBS availability. */
  typicalLag: string;
}

/**
 * Ladder order matters: Terra first (morning overpass, ~4 h latency), VIIRS
 * SNPP as the same-role L1 alternate (sharper 375 m, daily). Both render as
 * Level9 (256 px tiles up to zoom 9) in Web Mercator.
 */
export const GIBS_TRUECOLOR: GibsTrueColorDef[] = [
  {
    id: 'modis-terra',
    gibsLayer: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    name: 'MODIS Terra',
    resolution: '250 m',
    typicalLag: '~4 h',
  },
  {
    id: 'viirs-snpp',
    gibsLayer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
    name: 'VIIRS SNPP',
    resolution: '375 m',
    typicalLag: '~4 h',
  },
];

/** Where a layer row points when tiles fail: NASA's live status page. */
export const GIBS_STATUS_URL = 'https://status.earthdata.nasa.gov/';

/**
 * XYZ template for a GIBS layer on a UTC date. Subdomains {s} are a/b/c
 * (GIBS mirrors). `{time}` is a concrete date: we advertise what we asked for.
 */
export function gibsTileUrl(gibsLayer: string, dateIso: string): string {
  return (
    'https://gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/' +
    `${gibsLayer}/default/${dateIso}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`
  );
}

export const GIBS_TILE_SUBDOMAINS = 'abc';
export const GIBS_TILE_MAX_NATIVE_ZOOM = 9;

/** YYYY-MM-DD in UTC (GIBS time dimension is UTC dates). */
export function utcDateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Newest-first candidate dates: today, yesterday, two days ago (all UTC). */
export function gibsDateCandidates(now: Date = new Date(), back = 2): string[] {
  const out: string[] = [];
  for (let i = 0; i <= back; i += 1) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    out.push(utcDateIso(d));
  }
  return out;
}

/** Standard slippy-map tile coordinates for a lon/lat at zoom z. */
export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/** Probe tile: z4 cell covering central Bangladesh. Cheap, decisive. */
export const GIBS_PROBE_TILE = (() => {
  const { x, y } = lonLatToTile(90.35, 23.68, 4);
  return { z: 4, x, y };
})();

export interface GibsFetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  gate?: ConcurrencyGate;
  signal?: AbortSignal;
}

/**
 * Probe one date for one GIBS layer by requesting the Bangladesh probe tile.
 * True when GIBS answers 200 for that layer + date. All requests go through
 * the caller's concurrency gate when supplied.
 */
export async function probeGibsDate(
  def: GibsTrueColorDef,
  dateIso: string,
  options: GibsFetchOptions = {}
): Promise<boolean> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? GIBS_FETCH_TIMEOUT_MS;
  const { z, x, y } = GIBS_PROBE_TILE;
  const url = gibsTileUrl(def.gibsLayer, dateIso)
    .replace('{s}', 'a')
    .replace('{z}', String(z))
    .replace('{y}', String(y))
    .replace('{x}', String(x));

  const release = options.gate ? await options.gate.acquire() : () => undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timer);
      release();
      return false;
    }
    options.signal.addEventListener('abort', onOuterAbort);
  }
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    if (options.signal) options.signal.removeEventListener('abort', onOuterAbort);
    release();
  }
}

const probeCache = new Map<string, { at: number; date: string | null }>();

/** Test hook: forget cached probe outcomes. */
export function clearGibsProbeCache(): void {
  probeCache.clear();
}

/**
 * Find the newest available UTC date for a layer, newest-first, within the
 * candidates. Result cached for GIBS_PROBE_TTL_MS keyed by layer id.
 */
export async function resolveNewestGibsDate(
  def: GibsTrueColorDef,
  candidates: string[],
  options: GibsFetchOptions = {}
): Promise<string | null> {
  const cached = probeCache.get(def.id);
  if (cached && options.fetchImpl === undefined && Date.now() - cached.at < GIBS_PROBE_TTL_MS) {
    return cached.date;
  }
  for (const dateIso of candidates) {
    // eslint-disable-next-line no-await-in-loop -- deliberate: newest first, stop early
    const ok = await probeGibsDate(def, dateIso, options);
    if (ok) {
      probeCache.set(def.id, { at: Date.now(), date: dateIso });
      return dateIso;
    }
  }
  probeCache.set(def.id, { at: Date.now(), date: null });
  return null;
}

export interface TrueColorPlan {
  source: GibsTrueColorDef;
  dateIso: string;
  /** True when the primary source failed and the L1 alternate took over. */
  degraded: boolean;
}

/**
 * Ladder decision for the true-colour overlay: probe Terra newest-first; if
 * Terra cannot answer any candidate, probe VIIRS SNPP (L1); if neither can,
 * null, which the UI renders as the distinct UNAVAILABLE state (L4).
 */
export async function resolveTrueColorPlan(
  candidates: string[],
  options: GibsFetchOptions = {}
): Promise<TrueColorPlan | null> {
  const [primary, alternate] = GIBS_TRUECOLOR;
  const primaryDate = await resolveNewestGibsDate(primary, candidates, options);
  if (primaryDate) return { source: primary, dateIso: primaryDate, degraded: false };
  const altDate = await resolveNewestGibsDate(alternate, candidates, options);
  if (altDate) return { source: alternate, dateIso: altDate, degraded: true };
  return null;
}

/** Step back from the newest date by whole UTC days. */
export function stepGibsDate(dateIso: string, backDays: number): string {
  const base = new Date(`${dateIso}T00:00:00Z`);
  return utcDateIso(new Date(base.getTime() - backDays * 24 * 60 * 60 * 1000));
}

/* ── Phase D: GPM IMERG rain rate (sub-daily, 30-min frames) ────────────── */

/**
 * IMERG Early Run on GIBS: 0.1° half-hourly precipitation rate, minimum
 * latency about 4 hours (gpm.nasa.gov/data/directory). Tiles ship
 * pre-coloured by GIBS (greens→reds for rain, cyan→purple for snow as liquid
 * equivalent), so the client renders them as-is and documents the ramp.
 */
export const GIBS_IMERG_RAIN = {
  id: 'imerg-rain',
  gibsLayer: 'IMERG_Precipitation_Rate',
  name: 'GPM IMERG',
  tileMatrixSet: 'GoogleMapsCompatible_Level6',
  maxNativeZoom: 6,
  resolution: '0.1° (~10 km)',
  cadence: '30 min',
  typicalLag: '~4 h',
} as const;

/** IMERG frames are 30 minutes apart. */
export const IMERG_FRAME_STEP_MS = 30 * 60 * 1000;

/** Early Run minimum latency; probe no newer than this behind now. */
export const IMERG_LATENCY_MS = 4 * 60 * 60 * 1000;

/** How many replay frames the panel keeps (plan: newest six). */
export const IMERG_FRAME_COUNT = 6;

/** How many candidate frames to probe per labelling convention, at most. */
export const IMERG_PROBE_BUDGET = 12;

/** Probe cache for frames is short: IMERG publishes every 30 minutes. */
export const IMERG_PROBE_TTL_MS = 10 * 60 * 1000;

/**
 * XYZ template for a GIBS layer on a concrete UTC date-time (sub-daily layers
 * take `YYYY-MM-DDTHH:MM:SSZ` in the time slot; daily layers take a date).
 */
export function gibsSubDailyTileUrl(gibsLayer: string, timeIso: string, tileMatrixSet: string): string {
  return (
    'https://gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/' +
    `${gibsLayer}/default/${timeIso}/${tileMatrixSet}/{z}/{y}/{x}.png`
  );
}

/** Floor an instant to the half hour (UTC). */
export function floorToHalfHour(date: Date): Date {
  const d = new Date(date.getTime());
  d.setUTCMinutes(d.getUTCMinutes() >= 30 ? 30 : 0, 0, 0);
  return d;
}

/** `YYYY-MM-DDTHH:MM:00Z` for the GIBS time dimension. */
export function gibsTimeIso(date: Date): string {
  return `${date.toISOString().slice(0, 17)}00Z`;
}

/** `HH:MM UTC` — the advertised observation time, for chips and replay labels. */
export function gibsTimeLabel(iso: string): string {
  return `${iso.slice(11, 16)} UTC`;
}

/**
 * Newest-first candidate frame instants: the newest frame that could plausibly
 * exist given Early Run latency, then half-hour steps back. `offsetMinutes`
 * selects the labelling convention to try (GIBS labels IMERG frames at the
 * middle of each 30-minute period, i.e. :15 and :45; period-start labels are
 * tried too so a relabelled product still resolves).
 */
export function imergFrameCandidates(
  now: Date = new Date(),
  offsetMinutes: 0 | 15 = 0,
  budget: number = IMERG_PROBE_BUDGET
): Date[] {
  const horizon = now.getTime() - IMERG_LATENCY_MS;
  let start = floorToHalfHour(new Date(horizon));
  if (offsetMinutes === 15) start = new Date(start.getTime() + 15 * 60 * 1000);
  // Keep every candidate behind the latency horizon, newest first.
  if (start.getTime() > horizon) start = new Date(start.getTime() - IMERG_FRAME_STEP_MS);
  const out: Date[] = [];
  for (let i = 0; i < budget; i += 1) {
    out.push(new Date(start.getTime() - i * IMERG_FRAME_STEP_MS));
  }
  return out;
}

async function probeGibsTime(
  gibsLayer: string,
  timeIso: string,
  tileMatrixSet: string,
  options: GibsFetchOptions
): Promise<boolean> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? GIBS_FETCH_TIMEOUT_MS;
  const { z, x, y } = GIBS_PROBE_TILE;
  const url = gibsSubDailyTileUrl(gibsLayer, timeIso, tileMatrixSet)
    .replace('{s}', 'a')
    .replace('{z}', String(z))
    .replace('{y}', String(y))
    .replace('{x}', String(x));

  const release = options.gate ? await options.gate.acquire() : () => undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    release();
  }
}

export interface ImergFramePlan {
  /** Newest-first UTC frame times (`YYYY-MM-DDTHH:MM:00Z`), up to six. */
  frames: string[];
  /** Which labelling convention GIBS answered under. */
  offsetMinutes: 0 | 15;
}

let imergCacheValue: { at: number; plan: ImergFramePlan | null } | null = null;

/** Test hook: forget the cached frame probe. */
export function clearImergProbeCache(): void {
  imergCacheValue = null;
}

/**
 * Find the newest six IMERG frames GIBS answers for. Probes newest-first under
 * the period-start convention first; if that convention yields nothing, the
 * midpoint convention (:15/:45, the documented IMERG labelling) is tried. All
 * probes go through the caller's concurrency gate. Null means UNAVAILABLE.
 */
export async function resolveImergFrames(
  options: GibsFetchOptions = {},
  now: Date = new Date()
): Promise<ImergFramePlan | null> {
  if (imergCacheValue && options.fetchImpl === undefined && Date.now() - imergCacheValue.at < IMERG_PROBE_TTL_MS) {
    return imergCacheValue.plan;
  }
  const { gibsLayer, tileMatrixSet } = GIBS_IMERG_RAIN;
  for (const offsetMinutes of [0, 15] as const) {
    const frames: string[] = [];
    for (const instant of imergFrameCandidates(now, offsetMinutes)) {
      if (frames.length >= IMERG_FRAME_COUNT) break;
      const iso = gibsTimeIso(instant);
      // eslint-disable-next-line no-await-in-loop -- deliberate: newest first, bounded
      const ok = await probeGibsTime(gibsLayer, iso, tileMatrixSet, options);
      if (ok) frames.push(iso);
    }
    if (frames.length > 0) {
      const plan: ImergFramePlan = { frames, offsetMinutes };
      imergCacheValue = { at: Date.now(), plan };
      return plan;
    }
  }
  imergCacheValue = { at: Date.now(), plan: null };
  return null;
}
