/**
 * @jest-environment node
 *
 * Serverless routing and the Hobby function budget.
 *
 * The deployment may carry at most 12 Serverless Functions (Hobby plan) and every file
 * under `api/` is one function, so the entry points are URL *families* that dispatch to
 * the per-endpoint handlers in `serverless/` (see docs/codebase/ARCHITECTURE.md#vercel-serverless-surface-the-12-function-budget).
 * That consolidation must not change the public surface: a route that quietly stops being
 * served is worse than the deployment failing outright, because nothing reports it.
 *
 * This suite pins the surface three ways:
 *   1. the function count is within budget (scripts/check-vercel-functions.mjs runs the
 *      same count in CI; here it also fails when a file appears in `api/` that is not a
 *      declared entry point);
 *   2. every public URL still resolves to a handler — asserted per entry point, and by
 *      driving one request through the real entry file;
 *   3. the dispatcher is transparent: it removes its own routing parameter before the
 *      handler runs, answers unknown paths as JSON, and turns either a thrown handler error
 *      or a module that throws while loading into a JSON 500 rather than an unhandled
 *      platform failure.
 *
 * Handlers are loaded per request (`() => import('…')` tables in the entry files), not once
 * per family: a broken import graph must fail only its own endpoint, and a cold start must
 * not pay for its siblings. These tests therefore stub loaders, each returning a module.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createDispatcher, routeSegment, stripRouteParam } from '../../serverless/dispatch.js';
import { listFunctions, HOBBY_FUNCTION_LIMIT } from '../../scripts/check-vercel-functions.mjs';
import { resetGuardsForTests } from '../../backend/middleware/serverlessGuard.js';

/**
 * The public surface of the Vercel deployment: entry file → the URL segments it serves.
 * A static entry (`api/v1/weather/batch.js`) serves exactly its own path and therefore has
 * an empty list.
 */
const PUBLIC_SURFACE = {
  'api/[endpoint].js': ['forecasts', 'historical', 'ingest', 'metrics', 'predict'],
  'api/chat/[action].js': ['query', 'sample-questions'],
  'api/v1/[resource].js': ['alerts', 'historical', 'telemetry', 'weather'],
  'api/v1/alerts/[action].js': ['evidence-card', 'policy', 'review', 'run'],
  'api/v1/forecasts/[action].js': ['bulk', 'history', 'metadata'],
  'api/v1/weather/batch.js': [],
};

const makeRes = () => {
  const headers = {};
  return {
    headersSent: false,
    statusCode: 200,
    body: null,
    setHeader(key, value) { headers[key.toLowerCase()] = value; return this; },
    getHeader(key) { return headers[key.toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.statusCode = this.statusCode || 200; this.body = payload; this.headersSent = true; return this; },
    end(payload) { if (payload !== undefined) this.body = payload; this.headersSent = true; return this; },
  };
};

beforeEach(() => {
  resetGuardsForTests();
  delete process.env.HAZARDNET_DISABLE_SERVERLESS_RATELIMIT;
});

describe('the deployment stays inside the Hobby function budget', () => {
  it('deploys at most 12 functions, and every one of them is a declared entry point', () => {
    const functions = listFunctions();
    expect(functions.length).toBeLessThanOrEqual(HOBBY_FUNCTION_LIMIT);
    expect(functions).toEqual(Object.keys(PUBLIC_SURFACE).sort());
  });

  it('never imports a handler at module scope', () => {
    // A top-level `import` of every handler in a family makes the family share a fate: one
    // module that throws while initialising (missing credential, an unresolvable path)
    // fails every URL in it, including the ones that never touch that dependency. The
    // loaders must stay dynamic and inside the dispatcher's try/catch.
    for (const file of listFunctions()) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      const eager = source
        .split('\n')
        .filter((line) => /^import\s/.test(line.trim()))
        .filter((line) => line.includes('serverless/') && !line.includes('serverless/dispatch.js'));
      expect(`${file}: ${JSON.stringify(eager)}`).toBe(`${file}: []`);
    }
  });

  it('keeps the entry points declarative — a dispatcher, or a re-export', () => {
    // Every deployed file must stay cheap to review: it wires a URL family to handlers in
    // serverless/, and carries no endpoint logic of its own (which would make the count
    // creep back up as the logic splits out).
    for (const file of listFunctions()) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      const declarative = source.includes('createDispatcher(') || /export \{ default \}/.test(source);
      expect(`${file}: ${declarative}`).toBe(`${file}: true`);
    }
  });
});

describe('every public URL still resolves to a handler', () => {
  for (const [entry, segments] of Object.entries(PUBLIC_SURFACE)) {
    it(`${entry} serves ${segments.length ? segments.join(', ') : 'its own path'}`, async () => {
      const { default: handler } = await import(`../../${entry}`);
      expect(typeof handler).toBe('function');
      expect([...(handler.routes || [])].sort()).toEqual(segments);
    });
  }

  it('routes /api/v1/alerts/policy through the real entry file to the policy handler', async () => {
    const { default: handler } = await import('../../api/v1/alerts/[action].js');
    const req = {
      method: 'GET',
      url: '/api/v1/alerts/policy?action=policy',
      query: { action: 'policy' },
      headers: { 'x-forwarded-for': '203.0.113.77' },
    };
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.levels).toBeDefined();
    // The dispatcher's own parameter is gone, exactly as if the handler were its own file.
    expect(req.query).toEqual({});
    expect(req.url).toBe('/api/v1/alerts/policy');
  });

  it('leaves the caller’s own query parameters alone', async () => {
    const { default: handler } = await import('../../api/[endpoint].js');
    const req = {
      method: 'GET',
      url: '/api/metrics?x=1&endpoint=metrics',
      query: { x: '1', endpoint: 'metrics' },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);
    // /api/metrics answers with the Prometheus exposition, not with JSON.
    expect(res.statusCode).not.toBe(404);
    expect(req.query).toEqual({ x: '1' });
    expect(req.url).toBe('/api/metrics?x=1');
  });

  it('serves /api/v1/alerts and /api/v1/weather/batch through the files that declare them', async () => {
    const alerts = await import('../../api/v1/[resource].js');
    expect([...alerts.default.routes]).toContain('alerts');

    const batch = await import('../../api/v1/weather/batch.js');
    expect(typeof batch.default).toBe('function');
    // The body-parser limit is read from the function file, so it must stay declared here.
    expect(batch.config).toEqual({ api: { bodyParser: { sizeLimit: '256kb' } } });
  });
});

describe('the dispatcher is transparent', () => {
  const table = new Map([['known', 'handler']]);

  it('reads the segment from the path, whatever the routing layer did to the query', () => {
    expect(routeSegment({ url: '/api/v1/alerts/policy', query: {} }, 'action', table)).toBe('policy');
    expect(routeSegment({ url: '/api/v1/alerts/policy/', query: {} }, 'action', table)).toBe('policy');
    // No path match (a direct invocation): the platform's appended parameter is the fallback.
    expect(routeSegment({ url: '', query: { action: 'known' } }, 'action', table)).toBe('known');
  });

  it('strips only its own parameter, keeping the rest byte-for-byte', () => {
    const req = { url: '/api/v1/weather?lat=23.7&lng=90.4&resource=weather&from=2026-09-01', query: { lat: '23.7', lng: '90.4', resource: 'weather' } };
    stripRouteParam(req, 'resource');
    expect(req.query).toEqual({ lat: '23.7', lng: '90.4' });
    expect(req.url).toBe('/api/v1/weather?lat=23.7&lng=90.4&from=2026-09-01');
  });

  it('folds a duplicated parameter from an attacker into a routing miss, not a route', () => {
    // `/api/metrics?endpoint=admin` arrives as ["admin", "metrics"]; the appended value is
    // the one the filesystem matched, so routing cannot be steered by the query string.
    const req = { url: '/api/metrics?endpoint=admin&endpoint=metrics', query: { endpoint: ['admin', 'metrics'] } };
    expect(routeSegment(req, 'endpoint', new Map([['metrics', 'handler']]))).toBe('metrics');
  });

  it('answers an unknown path as a metered JSON 404', async () => {
    const handler = createDispatcher({ param: 'endpoint', entry: 'api/[endpoint].js', routes: {} });
    const req = { method: 'GET', url: '/api/nope', query: { endpoint: 'nope' }, headers: { 'x-forwarded-for': '203.0.113.9' } };
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toMatch(/no endpoint "nope"/);
    expect(res.getHeader('ratelimit-limit')).toBeDefined();
    expect(res.getHeader('cache-control')).toBe('no-store');
  });

  it('turns an unexpected handler error into a JSON 500', async () => {
    const handler = createDispatcher({
      param: 'endpoint',
      entry: 'api/[endpoint].js',
      routes: { boom: async () => ({ default: async () => { throw new Error('kaboom'); } }) },
    });
    const req = { method: 'GET', url: '/api/boom', query: { endpoint: 'boom' }, headers: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'internal server error' });
  });

  it('answers a module that fails to initialise as a JSON 500, not a platform error page', async () => {
    // A throw at import time used to take the whole URL family down with it (the platform's
    // FUNCTION_INVOCATION_FAILED page). Because the loaders run per request and inside the
    // same try/catch as the handler call, only the failing endpoint is affected.
    const handler = createDispatcher({
      param: 'endpoint',
      entry: 'api/[endpoint].js',
      routes: { broken: async () => { throw new Error('missing credential at import time'); } },
    });
    const req = { method: 'GET', url: '/api/broken', query: { endpoint: 'broken' }, headers: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'internal server error' });
    expect(res.getHeader('cache-control')).toBe('no-store');
  });

  it('does not answer over a handler that already responded', async () => {
    const handler = createDispatcher({
      param: 'endpoint',
      entry: 'api/[endpoint].js',
      routes: {
        late: async () => ({
          default: async (req, res) => {
            res.status(200).json({ ok: true });
            throw new Error('after the response');
          },
        }),
      },
    });
    const req = { method: 'GET', url: '/api/late', query: { endpoint: 'late' }, headers: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('every deployed module is loadable', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });

  it('resolves every relative import under api/ and serverless/ to a real file', () => {
    // A specifier that climbs out of the repository still *builds* — Vercel emits the
    // function and it throws on the first request. That is how the weather handlers were
    // deployed with `../../../backend/...` from a directory that needed `../../`: a 500 on
    // GET /api/v1/weather and POST /api/v1/weather/batch, invisible until a user hit them.
    const missing = [];
    for (const file of [...walk(join(process.cwd(), 'api')), ...walk(join(process.cwd(), 'serverless'))]) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/(?:from|import\()\s*'(\.[^']+)'/g)) {
        const target = join(file, '..', match[1]);
        if (!existsSync(target)) missing.push(`${file}: ${match[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('no handler is orphaned', () => {
  const entrySources = listFunctions()
    .filter((file) => file.startsWith('api/'))
    .map((file) => readFileSync(join(process.cwd(), file), 'utf8'))
    .join('\n');

  it('imports every module under serverless/ from an entry point', () => {
    const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith('.js') ? [full] : [];
    });

    const orphans = walk(join(process.cwd(), 'serverless'))
      .map((file) => file.split('serverless/')[1])
      .filter((relativePath) => relativePath !== 'dispatch.js')
      .filter((relativePath) => !entrySources.includes(relativePath));

    expect(orphans).toEqual([]);
  });
});
