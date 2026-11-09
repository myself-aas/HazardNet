/**
 * @jest-environment node
 *
 * The endpoint table is the only place a path is written.
 *
 * `/api/v1/forecasts/bulk` was spelled nine times in the web app and again in every handler
 * that answers it, in two runtimes, with nothing comparing the two lists. A rename was a
 * search-and-replace with no failure mode: miss one site and the page falls back to the
 * committed snapshot, which is what it does when the API is down — so a typo looks like an
 * outage, not like a typo.
 *
 * Three properties, each of which was false before this suite:
 *
 *   1. The paths the web app calls are the paths the handlers answer (`API_PATHS`).
 *   2. The routes that state their own path state the table's value.
 *   3. A path literal outside the table fails the build.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { API_PATHS, pathOf, relativePath } = require('../packages/api/src/endpoints.ts');

describe('the endpoint table', () => {
  it('names every path the two apps call, absolute and without a query string', () => {
    for (const [name, value] of Object.entries(API_PATHS)) {
      expect({ name, absolute: value.startsWith('/') }).toEqual({ name, absolute: true });
      expect({ name, noQuery: value.includes('?') }).toEqual({ name, noQuery: false });
    }
    expect(pathOf('forecastsBulk')).toBe('/api/v1/forecasts/bulk');
    expect(pathOf('alertsPolicy')).toBe('/api/v1/alerts/policy');
    expect(pathOf('freshnessArtifact')).toBe('/data/freshness.json');
    expect(Object.isFrozen(API_PATHS)).toBe(true);
  });

  it('gives the client and the web the same path under two spellings', () => {
    // `bindEndpoints` strips the base; the web app uses the absolute path as-is.
    expect(relativePath('forecastsBulk')).toBe('/v1/forecasts/bulk');
    expect(relativePath('alerts', '/api')).toBe('/v1/alerts');
    expect(relativePath('freshnessArtifact', '/api')).toBe('/data/freshness.json'); // not under /api
    expect(relativePath('alerts', '')).toBe('/api/v1/alerts');
  });

  it('is what the web readers resolve to, not a parallel copy', () => {
    const alerts = require('../frontend/src/lib/alerts.ts');
    expect(alerts.ALERTS_API_URL).toBe(API_PATHS.alerts);
    expect(alerts.ALERTS_POLICY_URL).toBe(API_PATHS.alertsPolicy);

    expect(require('../frontend/src/lib/freshness.ts').FRESHNESS_URL)
      .toBe(API_PATHS.freshnessArtifact);
    expect(require('../frontend/src/lib/dailyAdvisories.ts').DAILY_API_URL)
      .toBe(API_PATHS.advisories);
  });

  it('is what the handlers state they answer', () => {
    const routes = {
      'functions/api/v1/alerts/index.ts': 'alerts',
      'functions/api/v1/alerts/policy.ts': 'alertsPolicy',
    };
    for (const [file, name] of Object.entries(routes)) {
      const module = require(path.join(ROOT, file));
      expect({ file, route: module.ROUTE_PATH }).toEqual({ file, route: API_PATHS[name] });
    }
  });
});

describe('no path literal outside the table', () => {
  it('finds no /api/v1/… string in a module that is not the table', () => {
    /* The scan reads source, because the defect is a *literal*, not a bad import. Comments are
       stripped first: this repository documents its routes in prose on purpose, and the
       documentation is worth more than the pattern's tidiness. */
    const allow = new Set([
      'packages/api/src/endpoints.ts',
      // The serverless/ dispatcher owns its own route table by design — it is the Node twin of
      // the Pages file router, and `__tests__/api/serverlessRouting.test.js` pins it.
      'serverless/dispatch.js',
      'api/v1/[resource].js',
      'api/v1/alerts/[action].js',
    ]);
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.git', 'dist', 'build', 'coverage', 'public'].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const rel = path.relative(ROOT, full).split(path.sep).join('/');
        if (allow.has(rel) || rel.startsWith('__tests__/') || rel.includes('/__tests__/')) continue;
        if (!/^(frontend\/src|functions)\//.test(rel)) continue;
        const source = fs
          .readFileSync(full, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        const hits = [...source.matchAll(/['"`](\/api\/v1\/[^'"`?]*)/g)].map((m) => m[1]);
        if (hits.length) offenders.push(`${rel}: ${hits.join(', ')}`);
      }
    };
    walk(path.join(ROOT, 'frontend', 'src'));
    walk(path.join(ROOT, 'functions'));
    expect(offenders).toEqual([]);
  });
});
