/**
 * @jest-environment node
 *
 * Phase 1's reachability invariant.
 *
 * The batch bug was latent because `/api/v1/weather/batch` 404'd during the Pages cutover:
 * nothing called it, so its wrong shape sat in production-ready code until a human probed
 * it. The rule this test enforces: **every API path the front end can call is either a real
 * Pages Function or a dated, reasoned disposition** in `docs/ops/route-register.json`.
 * No third state ("we meant to port it", "it is probably fine") is representable.
 *
 * It also fails when a Function exists but is missing from the register, when a disposition
 * has no date, when a disposition goes stale (the route has since been ported), and when a
 * registered edge route has no value-assertion test. Structural presence is not enough.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const REGISTER = path.join(ROOT, 'docs', 'ops', 'route-register.json');
const FUNCTIONS_ROOT = path.join(ROOT, 'functions', 'api');
const FRONTEND_ROOT = path.join(ROOT, 'frontend', 'src');

function walk(dir, extensions, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, extensions, out);
    else if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

/** Pages' file-based routing: functions/api/v1/alerts/index.ts → /api/v1/alerts. */
function functionRoutePaths() {
  return walk(FUNCTIONS_ROOT, ['.ts', '.js']).map((file) => {
    let relative = path.relative(FUNCTIONS_ROOT, file).replace(/\\/g, '/');
    relative = relative.replace(/\.(ts|js)$/, '').replace(/\/index$/, '');
    return `/api/${relative}`;
  }).sort();
}

/**
 * Every `/api/...` literal in browser source. Template expressions become `*`; external
 * URLs (anything with `://` before the match) are ignored; test files are excluded.
 */
function frontendApiPaths() {
  const found = new Set();
  for (const file of walk(FRONTEND_ROOT, ['.ts', '.tsx', '.js', '.jsx'])) {
    if (file.includes(`${path.sep}__tests__${path.sep}`)) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\/api\/[A-Za-z0-9_.\-/${}]*/g)) {
      const before = source.slice(Math.max(0, match.index - 40), match.index);
      if (before.includes('://')) continue;   // e.g. https://discord.com/api/webhooks
      let value = match[0].split('?')[0];
      if (value.includes('${')) value = `${value.slice(0, value.indexOf('${'))}*`;
      value = value.replace(/\/+$/, '');
      if (value && value !== '/api/') found.add(value);
    }
  }
  return [...found].sort();
}

function wildcardToRegExp(route) {
  const escaped = route.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${escaped.join('[^/]*')}$`);
}

const register = JSON.parse(fs.readFileSync(REGISTER, 'utf8'));

describe('route register', () => {
  test('has a dated schema, dated dispositions, and one row per Functions file', () => {
    expect(register.schema).toBe('hazardnet-route-register/v1');
    expect(register.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(functionRoutePaths()).toEqual(register.edgeRoutes.map((r) => r.path).sort());
    for (const disposition of register.dispositions) {
      expect(disposition.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(disposition.reason.length).toBeGreaterThan(40);
      expect(disposition.verify.length).toBeGreaterThan(20);
      expect(disposition.paths.length).toBeGreaterThan(0);
      expect(disposition.ownerAction).toContain('Action 21');
    }
  });

  test('every edge route names a value-assertion test that exists and asserts values', () => {
    for (const route of register.edgeRoutes) {
      const file = path.join(ROOT, route.valueAssertion);
      expect(fs.existsSync(file)).toBe(true);
      const source = fs.readFileSync(file, 'utf8');
      expect(source).toContain(route.path);
      expect(source).toMatch(/expect\(/);
      // A value assertion, not just toBeDefined()/toBeTruthy().
      expect(source).toMatch(/\.to(Be|Equal|StrictEqual)\((?!\)|.*toBeDefined)/);
      expect(route.firstLiveCall).toMatch(/2026-\d{2}-\d{2}|2026-10-2/);
      expect(route.cutover404).toBe(true);
    }
  });

  test('no disposition is stale — a ported route must be removed from the list', () => {
    const functionPaths = functionRoutePaths();
    const dispositioned = register.dispositions.flatMap((d) => d.paths.map((p) => ({ p, date: d.date })));
    for (const { p, date } of dispositioned) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(functionPaths.some((f) => wildcardToRegExp(p).test(f))).toBe(false);
    }
  });
});

describe('reachability invariant', () => {
  test('a route called from frontend/src exists in functions/api/ or has a dated disposition', () => {
    const functionPaths = functionRoutePaths();
    const dispositioned = register.dispositions.flatMap((d) => d.paths);
    const called = frontendApiPaths();

    // Guard against a scanner that silently finds nothing — that would make the invariant
    // pass vacuously, which is exactly the class of test this phase is removing.
    expect(called.length).toBeGreaterThan(20);
    expect(called).toContain('/api/v1/weather/batch');
    expect(called).toContain('/api/v1/telemetry');

    const unreachable = called.filter((calledPath) => {
      if (functionPaths.includes(calledPath)) return false;
      return !dispositioned.some((d) => wildcardToRegExp(d).test(calledPath));
    });
    expect(unreachable).toEqual([]);
  });
});

describe('weather query contract — one parser, three runtimes', () => {
  const { parsePointQuery, parseCoordsQuery, parsePointsBody } = require('../backend/utils/weatherQuery.js');

  test('lon is an alias for lng in the verification matrix, on URLSearchParams and req.query', () => {
    const edge = parsePointQuery(new URL('https://x/api/v1/weather?lat=23.8&lon=90.4&mini=1').searchParams);
    const node = parsePointQuery({ lat: '23.8', lon: '90.4', mini: '1' });
    expect(edge).toEqual(node);
    expect(edge).toMatchObject({ lat: 23.8, lng: 90.4, mini: true });
    expect(parsePointQuery({ lat: '23.8', lng: '90.4', lon: '1' }).lng).toBe(90.4);
    expect(parsePointQuery({ lat: 'abc', lon: '90.4' }).error)
      .toBe('lat and lng query parameters are required (numeric)');
  });

  test('; and | are the same separator, including the encoded matrix form', () => {
    const encoded = new URL('https://x/api/v1/weather/batch?coords=23.8%2C90.4%3B22.3%2C91.8').searchParams.get('coords');
    expect(encoded).toBe('23.8,90.4;22.3,91.8');
    const matrix = parseCoordsQuery(encoded);
    expect(matrix.points).toEqual([
      { lat: 23.8, lng: 90.4, id: undefined },
      { lat: 22.3, lng: 91.8, id: undefined },
    ]);
    expect(parseCoordsQuery('23.8103,90.4125,dhaka|22.3569,91.7832,chattogram').points)
      .toHaveLength(2);
    expect(parseCoordsQuery('nonsense').error).toBe('coords query must be lat,lng,id|lat,lng,id|...');
  });

  test('POST bodies keep the numeric-coordinate rule and the same wording', () => {
    expect(parsePointsBody([{ id: 'x', lat: 'north', lng: null }]).error)
      .toBe('points array must contain {id,lat,lng} entries');
    expect(parsePointsBody([{ id: 'dhaka', lat: 23.8103, lon: 90.4125 }]).points)
      .toEqual([{ id: 'dhaka', lat: 23.8103, lng: 90.4125 }]);
  });
});
