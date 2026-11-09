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
  const files = walk(FUNCTIONS_ROOT, ['.ts', '.js']).filter((file) => {
    const relative = path.relative(FUNCTIONS_ROOT, file).replace(/\\/g, '/');
    // Pages wiring, not routes: the middleware (`_middleware.ts`) and the catch-all asset
    // handler (`[[path]].ts`) answer everything and match no path of their own.
    return !/^(?:_middleware|\[\[path\]\])\.(ts|js)$/.test(relative);
  });
  return files.map((file) => {
    let relative = path.relative(FUNCTIONS_ROOT, file).replace(/\\/g, '/');
    relative = relative.replace(/\.(ts|js)$/, '').replace(/\/index$/, '');
    return `/api/${relative}`;
  }).sort();
}

/**
 * Every `/api/...` literal in browser source. Template expressions become `*`; external
 * URLs (anything with `://` before the match) are ignored; test files are excluded.
 */
/* The routes the frontend calls are written once, in `packages/api/src/endpoints.ts`, and the
   call sites read that table — so the table is part of the frontend's route surface and has to
   be scanned with it. Scanning `frontend/src` alone still finds the paths this repository names
   in comments and i18n copy, which is why the guard count below stayed above 20 while the two
   paths asserted by name went missing. */
const API_TABLE_ROOT = path.join(ROOT, 'packages', 'api', 'src');

function frontendApiPaths() {
  const found = new Set();
  for (const file of [
    ...walk(FRONTEND_ROOT, ['.ts', '.tsx', '.js', '.jsx']),
    ...walk(API_TABLE_ROOT, ['.ts', '.tsx', '.js']),
  ]) {
    if (file.includes(`${path.sep}__tests__${path.sep}`)) continue;
    // `packages/api/src/…` is a path too, and it is not an API route.
    if (file.includes(`${path.sep}packages${path.sep}`) && !file.endsWith('endpoints.ts')) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\/api\/[A-Za-z0-9_.\-/${}]*/g)) {
      const before = source.slice(Math.max(0, match.index - 40), match.index);
      if (before.includes('://')) continue;   // e.g. https://discord.com/api/webhooks
      if (before.includes('packages')) continue;  // the package's own `packages/api/src/…` paths
      let raw = match[0];
      // A path ending in `/` is a prefix (`/api/v1/events/district` + the id), so it is a
      // wildcard route — the same shape the disposition register records. Read before the
      // query split, because `/api/v1/kaggle?horizon=` has a query and no trailing slash.
      const isPrefix = raw.endsWith('/');
      let value = raw.split('?')[0];
      if (value.includes('${')) value = `${value.slice(0, value.indexOf('${'))}*`;
      value = value.replace(/\/+$/, '');
      if (isPrefix && value && !value.includes('*')) value = `${value}/*`;
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
      if (route.status === 'pending-publication') {
        expect(route.firstLiveCall).toBeNull();
        expect(route.verification).toMatch(/Not yet called on a deployed site/);
      } else {
        expect(route.firstLiveCall).toMatch(/2026-\d{2}-\d{2}|2026-10-2/);
      }
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

describe('non-API agent routes', () => {
  test('/mcp is a real Pages Function, registered and reachable through _routes.json', () => {
    const route = register.agentRoutes.find((entry) => entry.path === '/mcp');
    expect(route).toBeDefined();
    expect(route.file).toBe('functions/mcp.ts');
    expect(fs.existsSync(path.join(ROOT, route.file))).toBe(true);
    expect(route.status).toBe('pending-publication');
    expect(route.firstLiveCall).toBeNull();
    expect(route.verification).toMatch(/Not yet called on a deployed site/);
    const source = fs.readFileSync(path.join(ROOT, route.valueAssertion), 'utf8');
    expect(source).toContain("'/mcp'");
    expect(source).toMatch(/\.toBe\(/);
    const routes = JSON.parse(fs.readFileSync(path.join(ROOT, 'frontend/public/_routes.json'), 'utf8'));
    expect(routes.include).toContain('/*');
    expect(routes.exclude).not.toContain('/mcp');
    expect(routes.exclude).not.toContain('/mcp/*');
  });

  test('RFC 9728 PRM is a registered Pages Function, not a static-only discovery claim', () => {
    const pathname = '/.well-known/oauth-protected-resource';
    const route = register.agentRoutes.find((entry) => entry.path === pathname);
    expect(route).toBeDefined();
    expect(route.file).toBe('functions/.well-known/oauth-protected-resource.ts');
    expect(route.methods).toEqual(['GET', 'HEAD']);
    expect(fs.existsSync(path.join(ROOT, route.file))).toBe(true);
    expect(route.status).toBe('pending-publication');
    expect(route.firstLiveCall).toBeNull();
    expect(route.verification).toMatch(/Not yet called on a deployed site/);
    const source = fs.readFileSync(path.join(ROOT, route.valueAssertion), 'utf8');
    expect(source).toContain(pathname);
    expect(source).toMatch(/\.toBe\(/);

    // _routes.json wildcards span path segments; exclude wins over include.
    const matches = (rule) => new RegExp(`^${rule.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(pathname);
    const routes = JSON.parse(fs.readFileSync(path.join(ROOT, 'frontend/public/_routes.json'), 'utf8'));
    expect(routes.include.some(matches)).toBe(true);
    expect(routes.exclude.some(matches)).toBe(false);
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
