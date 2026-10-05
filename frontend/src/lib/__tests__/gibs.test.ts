/**
 * Phase C contracts for the GIBS client (2026-10-05).
 *
 * The fetch-spy tests are the acceptance proof for the plan's concurrency
 * governor: no matter how many tiles the map wants, no more than
 * GIBS_MAX_IN_FLIGHT requests are ever in flight at once, and pausing the gate
 * (tab hidden, layer off) holds queued work until resume. The ladder tests pin
 * Terra -> VIIRS SNPP -> UNAVAILABLE; the date tests pin honest UTC dates.
 */
import {
  ConcurrencyGate,
  GIBS_IMERG_RAIN,
  GIBS_MAX_IN_FLIGHT,
  GIBS_TRUECOLOR,
  IMERG_FRAME_COUNT,
  clearGibsProbeCache,
  clearImergProbeCache,
  floorToHalfHour,
  gibsDateCandidates,
  gibsSubDailyTileUrl,
  gibsTimeIso,
  gibsTimeLabel,
  gibsTileUrl,
  imergFrameCandidates,
  lonLatToTile,
  probeGibsDate,
  resolveImergFrames,
  resolveNewestGibsDate,
  resolveTrueColorPlan,
  stepGibsDate,
  utcDateIso,
} from '../gibs';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const flush = async () => delay(0);

function okFetch(observed: { inFlight: number; peak: number; calls: number }): typeof fetch {
  return (async () => {
    observed.calls += 1;
    observed.inFlight += 1;
    observed.peak = Math.max(observed.peak, observed.inFlight);
    await delay(8);
    observed.inFlight -= 1;
    return { ok: true } as Response;
  }) as unknown as typeof fetch;
}

describe('ConcurrencyGate', () => {
  it('never exceeds the cap and drains every queued task', async () => {
    const gate = new ConcurrencyGate(GIBS_MAX_IN_FLIGHT);
    let running = 0;
    let peak = 0;
    let completed = 0;
    const tasks = Array.from({ length: 20 }, () => async () => {
      const release = await gate.acquire();
      running += 1;
      peak = Math.max(peak, running);
      await delay(4);
      running -= 1;
      completed += 1;
      release();
    });
    await Promise.all(tasks.map((t) => t()));
    expect(peak).toBeLessThanOrEqual(GIBS_MAX_IN_FLIGHT);
    expect(peak).toBe(GIBS_MAX_IN_FLIGHT);
    expect(completed).toBe(20);
    expect(gate.activeCount).toBe(0);
    expect(gate.queuedCount).toBe(0);
  });

  it('pause holds queued work until resume; running work is untouched', async () => {
    const gate = new ConcurrencyGate(2);
    const r1 = await gate.acquire();
    const r2 = await gate.acquire();
    let thirdStarted = false;
    const third = gate.acquire().then((release) => {
      thirdStarted = true;
      return release;
    });
    gate.pause();
    r1();
    await flush();
    expect(thirdStarted).toBe(false);
    gate.resume();
    const r3 = await third;
    expect(thirdStarted).toBe(true);
    r2();
    r3();
    expect(gate.activeCount).toBe(0);
  });

  it('deduplicates releases', async () => {
    const gate = new ConcurrencyGate(1);
    const release = await gate.acquire();
    release();
    release();
    expect(gate.activeCount).toBe(0);
  });
});

describe('GIBS concurrency cap, proven through the fetch path', () => {
  it('caps concurrent GIBS requests at six even under a 20-request burst', async () => {
    clearGibsProbeCache();
    const gate = new ConcurrencyGate(GIBS_MAX_IN_FLIGHT);
    const observed = { inFlight: 0, peak: 0, calls: 0 };
    const fetchImpl = okFetch(observed);
    const [terra] = GIBS_TRUECOLOR;
    await Promise.all(
      Array.from({ length: 20 }, () => probeGibsDate(terra, '2026-10-04', { gate, fetchImpl }))
    );
    expect(observed.calls).toBe(20);
    expect(observed.peak).toBeLessThanOrEqual(GIBS_MAX_IN_FLIGHT);
  });

  it('a paused gate keeps probe requests queued until resumed', async () => {
    clearGibsProbeCache();
    const gate = new ConcurrencyGate(GIBS_MAX_IN_FLIGHT);
    const observed = { inFlight: 0, peak: 0, calls: 0 };
    const fetchImpl = okFetch(observed);
    const [terra] = GIBS_TRUECOLOR;
    gate.pause();
    const pending = probeGibsDate(terra, '2026-10-04', { gate, fetchImpl });
    await flush();
    expect(observed.calls).toBe(0);
    gate.resume();
    await expect(pending).resolves.toBe(true);
    expect(observed.calls).toBe(1);
  });
});

describe('GIBS dates and urls', () => {
  it('formats UTC dates', () => {
    expect(utcDateIso(new Date('2026-10-05T23:59:00Z'))).toBe('2026-10-05');
  });

  it('lists newest-first UTC candidates', () => {
    const now = new Date('2026-10-05T09:00:00Z');
    expect(gibsDateCandidates(now)).toEqual(['2026-10-05', '2026-10-04', '2026-10-03']);
  });

  it('steps back by whole UTC days', () => {
    expect(stepGibsDate('2026-10-05', 0)).toBe('2026-10-05');
    expect(stepGibsDate('2026-10-05', 2)).toBe('2026-10-03');
    expect(stepGibsDate('2026-10-01', 1)).toBe('2026-09-30');
  });

  it('computes the Bangladesh probe tile at z4', () => {
    expect(lonLatToTile(90.35, 23.68, 4)).toEqual({ x: 12, y: 6 });
  });

  it('builds the documented WMTS REST template', () => {
    const url = gibsTileUrl('MODIS_Terra_CorrectedReflectance_TrueColor', '2026-10-04');
    expect(url).toContain('gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best');
    expect(url).toContain('MODIS_Terra_CorrectedReflectance_TrueColor/default/2026-10-04');
    expect(url).toContain('GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg');
  });
});

describe('newest-date probe and ladder', () => {
  beforeEach(() => clearGibsProbeCache());

  it('returns the newest date GIBS answers for, probing newest-first', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      // today not available yet; yesterday is.
      return { ok: !String(input).includes('2026-10-05') } as Response;
    }) as unknown as typeof fetch;
    const [terra] = GIBS_TRUECOLOR;
    const date = await resolveNewestGibsDate(terra, ['2026-10-05', '2026-10-04', '2026-10-03'], { fetchImpl });
    expect(date).toBe('2026-10-04');
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain('2026-10-05');
    expect(seen[1]).toContain('2026-10-04');
  });

  it('returns null when no candidate answers', async () => {
    const fetchImpl = (async () => ({ ok: false }) as Response) as unknown as typeof fetch;
    const [terra] = GIBS_TRUECOLOR;
    await expect(resolveNewestGibsDate(terra, ['2026-10-05'], { fetchImpl })).resolves.toBeNull();
  });

  it('demotes Terra to VIIRS SNPP when Terra cannot answer (L1)', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return { ok: String(input).includes('VIIRS_SNPP') } as Response;
    }) as unknown as typeof fetch;
    const plan = await resolveTrueColorPlan(['2026-10-05', '2026-10-04'], { fetchImpl });
    expect(plan).not.toBeNull();
    expect(plan?.source.id).toBe('viirs-snpp');
    expect(plan?.degraded).toBe(true);
    expect(plan?.dateIso).toBe('2026-10-05');
    expect(seen.some((u) => u.includes('MODIS_Terra'))).toBe(true);
  });

  it('falls to UNAVAILABLE when neither source answers (L4)', async () => {
    const fetchImpl = (async () => ({ ok: false }) as Response) as unknown as typeof fetch;
    await expect(resolveTrueColorPlan(['2026-10-05'], { fetchImpl })).resolves.toBeNull();
  });

  it('takes Terra when Terra answers, without asking VIIRS', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return { ok: true } as Response;
    }) as unknown as typeof fetch;
    const plan = await resolveTrueColorPlan(['2026-10-05'], { fetchImpl });
    expect(plan?.source.id).toBe('modis-terra');
    expect(plan?.degraded).toBe(false);
    expect(seen.some((u) => u.includes('VIIRS_SNPP'))).toBe(false);
  });
});

describe('IMERG rain-rate frames (Phase D)', () => {
  const NOW = new Date('2026-10-05T18:07:00Z');

  beforeEach(() => clearImergProbeCache());

  it('floors instants to the half hour', () => {
    expect(floorToHalfHour(new Date('2026-10-05T18:07:00Z')).toISOString()).toBe('2026-10-05T18:00:00.000Z');
    expect(floorToHalfHour(new Date('2026-10-05T18:44:00Z')).toISOString()).toBe('2026-10-05T18:30:00.000Z');
    expect(floorToHalfHour(new Date('2026-10-05T18:59:59Z')).toISOString()).toBe('2026-10-05T18:30:00.000Z');
  });

  it('lists newest-first frame candidates behind the latency horizon', () => {
    const periodStart = imergFrameCandidates(NOW, 0, 4).map(gibsTimeIso);
    expect(periodStart).toEqual([
      '2026-10-05T14:00:00Z',
      '2026-10-05T13:30:00Z',
      '2026-10-05T13:00:00Z',
      '2026-10-05T12:30:00Z',
    ]);
    // Midpoint labels (:15/:45) stay behind the same horizon.
    const midpoint = imergFrameCandidates(NOW, 15, 3).map(gibsTimeIso);
    expect(midpoint).toEqual([
      '2026-10-05T13:45:00Z',
      '2026-10-05T13:15:00Z',
      '2026-10-05T12:45:00Z',
    ]);
  });

  it('formats and labels GIBS frame times', () => {
    expect(gibsTimeIso(new Date('2026-10-05T13:30:00Z'))).toBe('2026-10-05T13:30:00Z');
    expect(gibsTimeLabel('2026-10-05T13:30:00Z')).toBe('13:30 UTC');
  });

  it('builds the sub-daily WMTS template at Level6', () => {
    const url = gibsSubDailyTileUrl(GIBS_IMERG_RAIN.gibsLayer, '2026-10-05T13:30:00Z', GIBS_IMERG_RAIN.tileMatrixSet);
    expect(url).toContain('IMERG_Precipitation_Rate/default/2026-10-05T13:30:00Z');
    expect(url).toContain('GoogleMapsCompatible_Level6/{z}/{y}/{x}.png');
  });

  it('collects the newest six frames when GIBS answers (fetch spy)', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return { ok: true } as Response;
    }) as unknown as typeof fetch;
    const plan = await resolveImergFrames({ fetchImpl }, NOW);
    expect(plan).not.toBeNull();
    expect(plan?.frames).toHaveLength(IMERG_FRAME_COUNT);
    expect(plan?.frames[0]).toBe('2026-10-05T14:00:00Z');
    expect(plan?.frames[5]).toBe('2026-10-05T11:30:00Z');
    // Newest first, and nothing beyond the six collected frames.
    expect(seen).toHaveLength(IMERG_FRAME_COUNT);
    expect(plan?.offsetMinutes).toBe(0);
  });

  it('falls back to midpoint labelling when period-start labels fail', async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      // Only :15/:45-stamped frames answer.
      return { ok: url.includes('T13:45:00Z') || url.includes(':15:00Z') || url.includes(':45:00Z') } as Response;
    }) as unknown as typeof fetch;
    const plan = await resolveImergFrames({ fetchImpl }, NOW);
    expect(plan).not.toBeNull();
    expect(plan?.offsetMinutes).toBe(15);
    expect(plan?.frames[0]).toBe('2026-10-05T13:45:00Z');
  });

  it('reaches the distinct UNAVAILABLE state under total failure', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return { ok: false } as Response;
    }) as unknown as typeof fetch;
    await expect(resolveImergFrames({ fetchImpl }, NOW)).resolves.toBeNull();
    // Bounded probing: at most the per-convention budget, twice.
    expect(calls).toBeLessThanOrEqual(24);
  });

  it('routes frame probes through the concurrency gate', async () => {
    const gate = new ConcurrencyGate(GIBS_MAX_IN_FLIGHT);
    const observed = { inFlight: 0, peak: 0, calls: 0 };
    const fetchImpl = okFetch(observed);
    const plan = await resolveImergFrames({ gate, fetchImpl }, NOW);
    expect(plan?.frames).toHaveLength(IMERG_FRAME_COUNT);
    expect(observed.peak).toBeLessThanOrEqual(GIBS_MAX_IN_FLIGHT);
  });
});
