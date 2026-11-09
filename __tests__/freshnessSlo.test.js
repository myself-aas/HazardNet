/**
 * @jest-environment node
 *
 * One freshness vocabulary.
 *
 * A hazard site states age and trust in one place and asserts it in another: the pipeline
 * builds `frontend/public/data/freshness.json` saying "the forecast is 41.2 h old against a
 * 192 h SLO", and the status page reads that artifact and decides whether to show a warning
 * chip. Those two are separated by a file, a deploy and a build step — so nothing structural
 * made them agree. They agreed because someone wrote the same four numbers in two files and
 * a comment in each pointed at the other.
 *
 * This suite closes that loop the only way it can be closed: it builds the artifact from
 * committed inputs, reads the result through the *browser's* reader, and compares the numbers
 * and the state words. It also fails if a sixth copy of an SLO appears.
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const slo = require('../packages/core/src/freshnessSlo.js');

describe('the SLOs have one owner', () => {
  it('serves the numbers the artifact, the browser and mobile all need', () => {
    expect(slo.SLO_HOURS).toEqual({
      FORECAST: 192,
      ALERT_SNAPSHOT: 48,   // the name `alertPolicy.ts` published first
      DAILY_ADVISORIES: 36,
      ALERTS: 48,           // the name the artifact, the browser and mobile read
      HEALTH_PROBE: 2,
      WIND: 9,
    });
    // A rename in progress: one number under two names, not two declarations.
    expect(slo.SLO_HOURS.ALERT_SNAPSHOT).toBe(slo.SLO_HOURS.ALERTS);
    expect(Object.isFrozen(slo.SLO_HOURS)).toBe(true);
  });

  it('keeps the pipeline and the browser reading the same object, not copies', () => {
    // The pipeline imports the module directly.
    const pipeline = require('../scripts/build_freshness_artifact.mjs');
    expect(pipeline.FORECAST_SLO_HOURS).toBe(slo.SLO_HOURS.FORECAST);
    expect(pipeline.DAILY_ADVISORIES_SLO_HOURS).toBe(slo.SLO_HOURS.DAILY_ADVISORIES);
    expect(pipeline.ALERTS_SLO_HOURS).toBe(slo.SLO_HOURS.ALERTS);
    expect(pipeline.PROBE_SLO_HOURS).toBe(slo.SLO_HOURS.HEALTH_PROBE);
    expect(pipeline.STATE_SEVERITY).toBe(slo.STATE_SEVERITY);

    // The browser reaches them through the package alias.
    const browser = require('../frontend/src/lib/freshness.ts');
    expect(browser.FRESHNESS_SLO_HOURS).toEqual({ ...slo.SLO_HOURS });
    expect(browser.DAILY_ADVISORIES_SLO_HOURS).toBe(slo.SLO_HOURS.DAILY_ADVISORIES);
    expect(require('../frontend/src/lib/wind.ts').WIND_FRESH_SLO_HOURS).toBe(slo.SLO_HOURS.WIND);
  });

  it('ages a day-granular prediction_date from that day\'s UTC midnight, once', () => {
    // 2026-11-09T12:00Z against a prediction_date of 2026-11-08 is 36 h — not 12 h, which is
    // what `Date.parse('2026-11-08')` yields on a machine west of UTC in some engines.
    const now = new Date('2026-11-09T12:00:00Z');
    expect(slo.ageHoursFromDate('2026-11-08', now)).toBe(36);
    expect(slo.ageHoursFromDate('2026-11-08T23:59:00Z', now)).toBe(36);
    expect(slo.ageHoursFromDate('nonsense', now)).toBeNull();
    expect(slo.ageHoursFromDate('', now)).toBeNull();

    // `backend/metrics.js` publishes the same number through the same function.
    const metrics = require('../backend/metrics.js');
    expect(typeof metrics.forecastAgeHoursFromPredictionDate).toBe('function');
  });

  it('names the states in one order, worst-last, and ranks them the same way', () => {
    expect([...slo.ARTIFACT_STATES]).toEqual(['fresh', 'unknown', 'stale', 'failing', 'missing']);
    expect(slo.worstState(['fresh', 'stale'])).toBe('stale');
    expect(slo.worstState(['stale', 'missing'])).toBe('missing');
    expect(slo.worstState([])).toBe('unknown');       // no sources is not "all fine"
    expect(slo.worstState([null, undefined])).toBe('unknown');
    expect(slo.worstState(['fresh', 'nonsense'])).toBe('fresh');
  });

  it('answers within_slo as null when the age is unknown, never as false', () => {
    expect(slo.withinSlo(41.2, 192)).toBe(true);
    expect(slo.withinSlo(200, 192)).toBe(false);
    expect(slo.withinSlo(null, 192)).toBeNull();
    expect(slo.withinSlo(41.2, 0)).toBeNull();       // an SLO of zero is a configuration bug
    expect(slo.classifyAge(41.2, 192)).toBe('fresh');
    expect(slo.classifyAge(200, 192)).toBe('stale');
    expect(slo.classifyAge(null, 192)).toBe('unknown');
  });
});

describe('the built artifact and the browser reader agree', () => {
  it('states the same SLO, age and state as the module it was built from', () => {
    const pipeline = require('../scripts/build_freshness_artifact.mjs');
    const browser = require('../frontend/src/lib/freshness.ts');

    // The same five committed inputs the artifact build reads, by the same relative paths.
    const inputs = pipeline.readInputs({
      snapshot: 'frontend/public/data/forecasts-latest.json',
      manifest: 'backend/data/forecasts/manifest.json',
      daily: 'frontend/public/data/daily-advisories-v1.json',
      alerts: 'frontend/public/data/alerts-latest.json',
      probe: 'data/site-health/latest.json',
      out: 'frontend/public/data/freshness.json',
    });
    const built = {
      value: pipeline.buildFreshnessArtifact({ now: new Date('2026-11-09T00:00:00Z'), ...inputs }),
    };
    expect(built.value).toBeTruthy();

    const parsed = browser.parseFreshness(built.value);
    expect(parsed).not.toBeNull();
    expect(parsed.overall.state).toBe(built.value.overall.state);

    for (const source of built.value.sources) {
      expect(source.slo_hours).toBeGreaterThan(0);
      // The state the builder wrote is the state its own classifier would write.
      expect(slo.classifyAge(source.age_hours, source.slo_hours)).toBe(
        source.age_hours === null ? 'unknown' : source.state,
      );
    }

    // The one number a reader can compare across the file and the module.
    const forecast = built.value.sources.find((s) => s.slo_hours === slo.SLO_HOURS.FORECAST);
    expect(forecast).toBeTruthy();
  });
});

describe('no sixth copy of an SLO', () => {
  it('finds no numeric SLO literal outside the owner and its tests', () => {
    /* A literal `192` is indistinguishable from a viewport height, so the scan looks for the
       *name* being assigned a number, which is how every copy began. */
    const patterns = [
      /(?:FORECAST_SLO_HOURS|forecastSloHours|FORECAST_MAX_AGE_HOURS)\s*[:=]\s*\d/,
      /(?:ALERT(?:S)?_SLO_HOURS|ALERT_SNAPSHOT_SLO_HOURS)\s*[:=]\s*\d/,
      /(?:DAILY_ADVISOR(?:Y|IES)_(?:MAX_AGE|SLO)_HOURS)\s*[:=]\s*\d/,
    ];
    const allow = new Set([
      'packages/core/src/freshnessSlo.js',
      'frontend/public/data/freshness.json',
    ]);
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.git', 'dist', 'build', 'coverage'].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) continue;
        const rel = path.relative(ROOT, full).split(path.sep).join('/');
        if (allow.has(rel) || rel.startsWith('__tests__/') || rel.includes('/__tests__/')) continue;
        const source = fs.readFileSync(full, 'utf8');
        for (const pattern of patterns) {
          if (pattern.test(source)) offenders.push(`${rel}: declares an SLO literal`);
        }
      }
    };
    walk(ROOT);
    expect(offenders).toEqual([]);
  });
});
