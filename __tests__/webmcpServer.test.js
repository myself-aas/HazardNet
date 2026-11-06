/** @jest-environment node */
import fs from 'node:fs';
import { handleMcpRequest, MCP_BODY_LIMIT, readMcpBody } from '../backend/mcp/protocol.js';
import { MCP_TOOL_DESCRIPTORS, MCP_SERVER_INFO, MCP_INSTRUCTIONS, validateToolInput } from '../backend/mcp/tools.js';
import { createNodeAssetReader, nodeMcpHandler } from '../backend/mcp/nodeAdapter.js';
import express from 'express';
import supertest from 'supertest';
import { onRequest } from '../functions/mcp.ts';
import { clearCache } from '../backend/utils/openMeteo.js';

const ORIGIN = 'https://www.hazardnet.live';
const read = (name) => JSON.parse(fs.readFileSync(`frontend/public/data/${name}.json`, 'utf8'));
const daily = read('daily-advisories-v1');
const forecasts = read('forecasts-latest');
const alerts = read('alerts-latest');
const history = read('historical/hazard-catalog-index');
const freshness = read('freshness');
const index = read('content-index');
const artifacts = {
  '/data/daily-advisories-v1.json': daily,
  '/data/forecasts-latest.json': forecasts,
  '/data/alerts-latest.json': alerts,
  '/data/historical/hazard-catalog-index.json': history,
  '/data/freshness.json': freshness,
  '/data/content-index.json': index,
};
let assets;
let upstream;
beforeEach(() => {
  clearCache();
  assets = { fetch: jest.fn(async (request) => {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/markdown/hazards/')) return new Response('# Public hazard explainer\nFollow BMD and FFWC.');
    return artifacts[path] ? Response.json(artifacts[path]) : new Response('Missing', { status: 404 });
  }) };
  upstream = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(
    require('./fixtures/weatherFullObject.js'),
  ));
});
afterEach(() => { jest.restoreAllMocks(); clearCache(); });

function request(body, headers = {}) {
  return new Request(`${ORIGIN}/mcp`, { method: 'POST', headers: {
    'Content-Type': 'application/json', Accept: 'application/json', ...headers,
  }, body: typeof body === 'string' ? body : JSON.stringify(body) });
}
const rpc = (method, params, id = 7) => ({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
const call = (name, args) => request(rpc('tools/call', { name, arguments: args }));
const send = (req) => handleMcpRequest(req, { ASSETS: assets });
async function result(req) {
  const response = await send(req);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.jsonrpc).toBe('2.0');
  return body;
}

describe('/mcp protocol', () => {
  test('negotiates the current supported revision and advertises only tools', async () => {
    const body = await result(request(rpc('initialize', {
      protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' },
    }), { 'MCP-Protocol-Version': '2025-11-25' }));
    expect(body.id).toBe(7);
    expect(body.result.protocolVersion).toBe('2025-11-25');
    expect(body.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(body.result.instructions).toContain('not an official warning service');
    expect(body.result.instructions).toContain('999');
  });
  test('offers a supported version when the client requests an unknown one', async () => {
    const body = await result(request(rpc('initialize', { protocolVersion: '1999-01-01', capabilities: {}, clientInfo: { name: 'test', version: '1' } })));
    expect(body.result.protocolVersion).toBe('2025-11-25');
  });
  test('the Cloudflare blog bridge can list and call without initialization', async () => {
    const body = await result(request(rpc('tools/list', {})));
    expect(body.result.tools).toEqual(MCP_TOOL_DESCRIPTORS);
    expect(body.result.tools).toHaveLength(8);
    expect(body.result.tools.every((tool) => tool.annotations.readOnlyHint)).toBe(true);
    expect(JSON.stringify(body)).not.toContain('execute');
    const response = await send(call('get_district_info', { district: 'Dhaka' }));
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
  test('notifications have HTTP 202 and no JSON-RPC response', async () => {
    const response = await send(request({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    expect(response.status).toBe(202);
    expect(await response.text()).toBe('');
  });
  test.each([
    ['GET', 405], ['DELETE', 405],
  ])('does not pretend to support %s sessions or SSE', async (method, status) => {
    const response = await send(new Request(`${ORIGIN}/mcp`, { method }));
    expect(response.status).toBe(status);
    expect(response.headers.get('allow')).toBe('POST, OPTIONS');
  });
  test.each([
    ['not json', 400, -32700],
    [[], 400, -32600],
    [{ jsonrpc: '1.0', id: 1, method: 'ping' }, 400, -32600],
    [{ jsonrpc: '2.0', id: null, method: 'ping' }, 400, -32600],
    [{ jsonrpc: '2.0', id: 1, method: 'ping', params: [] }, 400, -32600],
    [rpc('resources/list', {}), 200, -32601],
    [rpc('tools/call', { name: 'publish_alert', arguments: {} }), 200, -32602],
    [rpc('tools/call', { name: 'get_district_info', arguments: [] }), 200, -32602],
    [rpc('tools/list', { cursor: 'more' }), 200, -32602],
  ])('handles malformed/unimplemented requests %#', async (body, status, code) => {
    const response = await send(request(body));
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    expect(assets.fetch).not.toHaveBeenCalled();
  });
  test('rejects cross-origin browser reads, invalid media types and versions', async () => {
    for (const [headers, status] of [
      [{ Origin: 'https://other.example' }, 403],
      [{ 'Sec-Fetch-Site': 'cross-site' }, 403],
      [{ 'Content-Type': 'text/plain' }, 415],
      [{ Accept: 'text/event-stream' }, 406],
      [{ 'MCP-Protocol-Version': 'unknown' }, 400],
    ]) {
      const response = await send(request(rpc('tools/list', {}), headers));
      expect(response.status).toBe(status);
    }
    expect((await send(request(rpc('ping'), { Origin: ORIGIN }))).status).toBe(200);
  });
  test('enforces the byte cap even without Content-Length', async () => {
    const huge = ' '.repeat(MCP_BODY_LIMIT + 1);
    expect((await send(request(huge))).status).toBe(413);
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(' '.repeat(MCP_BODY_LIMIT)));
      controller.enqueue(new TextEncoder().encode('x'));
      controller.close();
    } });
    expect(await readMcpBody(new Request(`${ORIGIN}/mcp`, { method: 'POST', body: stream, duplex: 'half' }))).toEqual({ error: 'too-large' });
  });
  test('the Pages adapter and Node asset adapter serve the same deployed values', async () => {
    const response = await onRequest({ request: call('get_district_info', { district: 'Chittagong' }), env: { ASSETS: assets } });
    const body = await response.json();
    expect(body.result.structuredContent.district.district_name).toBe('Chattogram');
    const nodeResponse = await createNodeAssetReader().fetch(new Request(`${ORIGIN}/data/forecasts-latest.json`));
    expect((await nodeResponse.json()).prediction_date).toBe(forecasts.prediction_date);
    expect((await createNodeAssetReader().fetch(new Request(`${ORIGIN}/Models/labels.json`))).status).toBe(404);
  });
});

describe('Node HTTP adapter', () => {
  const app = express();
  app.set('trust proxy', 1);
  app.all('/mcp', nodeMcpHandler());
  app.use(express.json({ limit: '10mb' }));

  test('streams the small cap before the global JSON parser and keeps canonical headers', async () => {
    const response = await supertest(app).post('/mcp')
      .set('Content-Type', 'application/json').set('Accept', 'application/json')
      .send(JSON.stringify(rpc('tools/list', {})));
    expect(response.status).toBe(200);
    expect(response.body.result.tools).toHaveLength(8);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    const huge = await supertest(app).post('/mcp')
      .set('Content-Type', 'application/json').send(' '.repeat(MCP_BODY_LIMIT + 1));
    expect(huge.status).toBe(413);
    expect(huge.body.error.code).toBe(-32600);
  });
  test('preserves the public origin behind the Vite TLS proxy and rejects foreign origins', async () => {
    const body = JSON.stringify(rpc('ping'));
    const same = await supertest(app).post('/mcp')
      .set('Host', '3000-preview.e2b.app').set('X-Forwarded-Proto', 'https')
      .set('Origin', 'https://3000-preview.e2b.app').set('Content-Type', 'application/json').send(body);
    expect(same.status).toBe(200);
    expect(same.body.result).toEqual({});
    const foreign = await supertest(app).post('/mcp')
      .set('Host', 'www.hazardnet.live').set('X-Forwarded-Proto', 'https')
      .set('Origin', 'https://other.example').set('Content-Type', 'application/json').send(body);
    expect(foreign.status).toBe(403);
  });
  test('GET and OPTIONS advertise the stateless method contract', async () => {
    const get = await supertest(app).get('/mcp');
    expect(get.status).toBe(405);
    expect(get.headers.allow).toBe('POST, OPTIONS');
    const options = await supertest(app).options('/mcp');
    expect(options.status).toBe(204);
    expect(options.text).toBe('');
  });
});

describe('public tool values and safety', () => {
  test('district outlook actually filters days and hazards and carries run provenance', async () => {
    const body = await result(call('get_hazard_forecast', { district: 'Dhaka', horizon: '7_days' }));
    const data = body.result.structuredContent;
    const expected = daily.advisories.filter((row) => row.district === 'Dhaka' && row.forecastDay <= 7);
    expect(data.advisories).toEqual(expected);
    expect(data.count).toBe(7);
    expect(data.run).toEqual(daily.run);
    expect(data.disclaimer).toContain('999');
    expect(data.confidence_notice).toContain('not a probability');
    const filtered = (await result(call('get_hazard_forecast', { district: 'Dhaka', hazard: 'drought' }))).result.structuredContent;
    expect(filtered.advisories.every((row) => row.hazard === 'Drought')).toBe(true);
    expect(filtered.coverage_note).toContain('not an all-clear');
  });
  test('horizon snapshots filter instead of returning the entire artifact under a district label', async () => {
    const body = await result(call('list_forecasts', { district: 'Dhaka', horizon: '15_days', hazard: 'flash-flood' }));
    const data = body.result.structuredContent;
    const expected = forecasts.horizons['15_days'].find((row) => row.district_name === 'Dhaka');
    expect(data.records).toEqual([expected]);
    expect(data.total_count).toBe(1);
    expect(data.provenance).toEqual(forecasts.provenance);
    const empty = (await result(call('list_forecasts', { district: 'Dhaka', hazard: 'fire' }))).result.structuredContent;
    expect(empty.records).toEqual([]);
    expect(empty.total_count).toBe(0);
  });
  test('pagination reports real totals and does not skip or duplicate rows', async () => {
    const first = (await result(call('list_forecasts', { horizon: '7_days', limit: 10 }))).result.structuredContent;
    const second = (await result(call('list_forecasts', { horizon: '7_days', limit: 10, offset: first.next_offset }))).result.structuredContent;
    expect(first.total_count).toBe(64);
    expect(first.next_offset).toBe(10);
    expect(first.records).toEqual(forecasts.horizons['7_days'].slice(0, 10));
    expect(second.records).toEqual(forecasts.horizons['7_days'].slice(10, 20));
  });
  test('alerts apply every filter, expose only PUBLISHED rows and redact reviewer contact', async () => {
    const draft = { ...alerts.alerts[0], id: 'draft', state: 'DRAFT', review: { reviewer: 'private@example.org' } };
    assets.fetch.mockImplementation(async (req) => new URL(req.url).pathname === '/data/alerts-latest.json'
      ? Response.json({ ...alerts, alerts: [...alerts.alerts, draft] }) : Response.json({}));
    const body = await result(call('list_alerts', { district: 'Dhaka', hazard: 'flash-flood', level: 'WATCH', horizon: '15_days' }));
    const data = body.result.structuredContent;
    const expected = alerts.alerts.filter((row) => row.district_name === 'Dhaka' && row.state === 'PUBLISHED');
    expect(data.records).toEqual(expected.map((row) => ({ ...row, history: [] })));
    expect(data.states_visible).toEqual(['PUBLISHED']);
    expect(JSON.stringify(body)).not.toContain('private@example.org');
    expect(data.records[0].confidence_kind).toBe(expected[0].confidence_kind);
  });
  test('historical filters use the compact public catalogue', async () => {
    const expected = history.filter((row) => row.district === 'Barishal' && row.hazard_type === 'Flood' && row.year === 2002);
    const data = (await result(call('get_historical_events', { district: 'Barishal', hazard: 'flood', year: 2002, limit: 50 }))).result.structuredContent;
    expect(expected.length).toBeGreaterThan(0);
    expect(data.total_count).toBe(expected.length);
    expect(data.records).toEqual(expected.slice(0, 50));
    expect(data.source).toBe('/data/historical/hazard-catalog-index.json');
  });
  test('weather uses caller coordinates and the existing upstream, never device location', async () => {
    const data = (await result(call('get_weather', { latitude: 23.8103, longitude: 90.4125 }))).result.structuredContent;
    expect(data.location).toEqual({ latitude: 23.8103, longitude: 90.4125 });
    expect(data.weather.current.temperature_2m).toBe(require('./fixtures/weatherFullObject.js').current.temperature_2m);
    expect(String(upstream.mock.calls[0][0])).toContain('api.open-meteo.com');
    expect(data.disclaimer).toContain('BMD');
  });
  test('freshness is explicitly an artifact statement, not a live health claim', async () => {
    const data = (await result(call('get_site_status', {}))).result.structuredContent;
    expect(data.status).toEqual(freshness);
    expect(data.interpretation).toContain('not establish');
  });
  test('public hazard explainers are read without exposing research methodology JSON', async () => {
    const data = (await result(call('get_hazard_info', { hazard: 'flood' }))).result.structuredContent;
    expect(data.markdown).toContain('Public hazard explainer');
    expect(new URL(assets.fetch.mock.calls[0][0].url).pathname).toBe('/markdown/hazards/flood.md');
    expect(data.source).not.toContain('hazard-methodology');
  });
  test.each([
    ['get_district_info', {}],
    ['get_district_info', { district: 'Atlantis' }],
    ['get_weather', { latitude: 91, longitude: 90 }],
    ['get_weather', { latitude: '23', longitude: 90 }],
    ['list_alerts', { level: 'DANGER' }],
    ['list_forecasts', { limit: 1000 }],
    ['list_forecasts', { offset: -1 }],
    ['list_forecasts', { prediction_date: '2026-99-99' }],
    ['list_forecasts', { prediction_date: '1900-02-30' }],
    ['get_site_status', { path: '/Models/labels.json' }],
  ])('rejects invalid arguments %# without reading an artifact', async (name, args) => {
    const body = await result(call(name, args));
    expect(body.error.code).toBe(-32602);
    expect(assets.fetch).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });
  test('missing or malformed data is an isError result, never a successful empty outlook', async () => {
    assets.fetch.mockResolvedValue(new Response('missing', { status: 404 }));
    const body = await result(call('get_hazard_forecast', { district: 'Dhaka' }));
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.error).toContain('unavailable');
    expect(body.result.structuredContent.disclaimer).toContain('999');
    expect(body.result.structuredContent.advisories).toBeUndefined();
  });
  test('asset requests do not forward the visitor credentials', async () => {
    await result(request(rpc('tools/call', { name: 'get_site_status', arguments: {} }), {
      Authorization: 'Bearer secret', Cookie: 'session=secret',
    }));
    const assetRequest = assets.fetch.mock.calls[0][0];
    expect(assetRequest.headers.get('authorization')).toBeNull();
    expect(assetRequest.headers.get('cookie')).toBeNull();
  });
});

describe('discovery truth', () => {
  test('server card describes exactly the executable public pack', () => {
    const card = JSON.parse(fs.readFileSync('frontend/public/.well-known/mcp/server-card.json', 'utf8'));
    expect(card.tools).toEqual(MCP_TOOL_DESCRIPTORS);
    expect(card.serverInfo).toEqual(MCP_SERVER_INFO);
    expect(card.instructions).toBe(MCP_INSTRUCTIONS);
    expect(card.authentication).toEqual({ required: false, schemes: [] });
    expect(card.transport.endpoint).toBe('/mcp');
    expect(card.capabilities).toEqual({ tools: { listChanged: false } });
  });
  test('AI catalog advertises the same eight MCP tools and ten browser capabilities', () => {
    const catalog = JSON.parse(fs.readFileSync('frontend/public/.well-known/ai-catalog.json', 'utf8'));
    const mcp = catalog.entries.find((entry) => entry.metadata?.protocol === 'mcp');
    const web = catalog.entries.find((entry) => entry.metadata?.protocol === 'webmcp');
    expect(mcp.capabilities).toEqual(MCP_TOOL_DESCRIPTORS.map((tool) => tool.name));
    expect(mcp.metadata.authentication).toBe('none');
    expect(web.capabilities).toEqual([...MCP_TOOL_DESCRIPTORS.map((tool) => tool.name), 'search-district', 'navigate-to-page']);
    expect(web.data.tools).toHaveLength(10);
  });
  test('every schema uses the validated subset', () => {
    for (const tool of MCP_TOOL_DESCRIPTORS) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
      for (const rule of Object.values(tool.inputSchema.properties)) {
        expect(['string', 'number', 'integer', 'boolean']).toContain(rule.type);
      }
    }
    expect(validateToolInput(MCP_TOOL_DESCRIPTORS[0].inputSchema, { district: 'Dhaka', extra: true })).toContain('Unknown argument');
  });
});
