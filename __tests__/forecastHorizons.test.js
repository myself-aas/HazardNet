/**
 * @jest-environment node
 *
 * One definition of "how long is this horizon?".
 *
 * Two horizon keys carry a number each — 7 and 15 — and the number was written out at five
 * call sites in three shapes:
 *
 *   `backend/utils/forecastRow.js`            parseInt(horizon.split('_')[0])  — derived
 *   `backend/mcp/tools.js`                    horizon === '7_days' ? 7 : 15    — ternary
 *   `backend/utils/dailyAdvisoryPublic.js`    an inline [['7_days',7],['15_days',15]] table
 *   `frontend/src/lib/dailyAdvisories.ts`     horizon === '7_days' ? 7 : 15    — twice
 *
 * The ternaries share a defect the derived form does not: an unrecognised key answers **15**.
 * `rollupDailyAdvisoriesToForecastRows(rows, run, '7day')` therefore returns the fifteen-day
 * window and nothing logs it — a two-spelling value silently answering the wrong one, which is
 * the defect the district registry closed for names.
 *
 * This suite pins the owner, the arithmetic, and the absence of a sixth spelling.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const horizon = require('../packages/core/src/horizon.js');

describe('the horizon and its length', () => {
  it('names two keys and two lengths', () => {
    expect([...horizon.FORECAST_HORIZONS]).toEqual(['7_days', '15_days']);
    expect(horizon.horizonDays('7_days')).toBe(7);
    expect(horizon.horizonDays('15_days')).toBe(15);
  });

  it('refuses to guess a length for an unknown key', () => {
    // The ternary this replaced answered 15 for every one of these.
    for (const bad of ['7day', '7_Days', '15', 'daily', '', null, undefined, 7, {}, ['7_days']]) {
      expect({ key: bad, days: horizon.horizonDays(bad) }).toEqual({ key: bad, days: null });
      expect(horizon.isForecastHorizon(bad)).toBe(false);
    }
  });

  it('is the only place a day count is derived', () => {
    expect(horizon.isForecastHorizon('7_days')).toBe(true);
    expect(horizon.isForecastHorizon('15_days')).toBe(true);

    // The row parser reads the owner too, so `forecast_day` windows and `/bulk` agree.
    const forecastRow = require('../backend/utils/forecastRow.js');
    expect(forecastRow.VALID_HORIZONS).toBe(horizon.FORECAST_HORIZONS);
    expect(forecastRow.horizonDays('7_days')).toBe(7);

    // …and the browser reaches it through `lib/forecasts`, the path every page uses.
    const browser = require('../frontend/src/lib/forecasts.ts');
    expect(browser.FORECAST_HORIZONS).toEqual([...horizon.FORECAST_HORIZONS]);
    expect(browser.horizonDays('15_days')).toBe(15);
    expect(browser.horizonDays('daily')).toBeNull();
  });
});

describe('no sixth spelling', () => {
  it('finds no ternary or table that turns a horizon into a day count', () => {
    /* The scan looks for the *shape* of the copies: a `'7_days'` comparison resolving to a
       numeric literal, and the horizon→15 default. Comparisons that only branch copy or branch
       a key (no arithmetic) are not matched, so the many legitimate `=== '7_days'` sites stand. */
    const patterns = [
      /===\s*'7_days'\s*\?\s*7\s*:/,
      /'\d+_days'\s*,\s*(?:7|15)\s*\]/,          // the inline [['7_days', 7], …] table
      /parseInt\(\s*String\(\s*horizon\s*\)\.split\(/,
    ];
    const allow = new Set(['packages/core/src/horizon.js']);
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
          if (pattern.test(source)) offenders.push(`${rel}: derives a horizon length (${pattern})`);
        }
      }
    };
    walk(ROOT);
    expect(offenders).toEqual([]);
  });
});
