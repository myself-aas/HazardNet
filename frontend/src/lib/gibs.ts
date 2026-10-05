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
