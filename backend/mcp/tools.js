/**
 * HazardNet's public, read-only MCP tool pack.
 *
 * One descriptor and handler set serves /mcp, the native WebMCP bridge and the
 * discovery card. Keep this module platform-neutral: Pages supplies ASSETS;
 * the Node adapter supplies an equivalent, allow-listed asset reader.
 * No credentials, review actions, model files or research-private inputs cross
 * this boundary. Weather is the only upstream read.
 */
import { lookupDistrict } from '../../packages/core/src/districtRegistry.js';
import { loadForecastSnapshot, snapshotRows } from '../utils/forecastSnapshotServe.js';
import { loadAlertSnapshot, PUBLIC_ALERT_STATE } from '../utils/alertSnapshotServe.js';
import { publicAlertView } from '../alerts/publicView.js';
import { parsePublicDailySnapshot, publicDailyStatus } from '../utils/dailyAdvisoryPublic.js';
import { fetchCurrentWeather } from '../utils/openMeteo.js';

export const MCP_SERVER_INFO = Object.freeze({
  name: 'hazardnet',
  title: 'HazardNet public hazard outlooks',
  version: '3.2.0',
});
export const MCP_INSTRUCTIONS =
  'Read published Bangladesh hazard outlooks with their dates, provenance and limits. ' +
  'Confidence is an uncalibrated model softmax, not a probability of harm. An empty result is not an all-clear. ' +
  'HazardNet is not an official warning service. Follow BMD, FFWC and local administration; in an emergency call 999.';
export const SAFETY_NOTICE =
  'HazardNet is not an official warning service. Follow the Bangladesh Meteorological Department (BMD), ' +
  'the Flood Forecasting and Warning Centre (FFWC) and local administration. In an emergency call 999. ' +
  'An absent or empty result is not an all-clear.';
export const CONFIDENCE_NOTICE =
  'Published confidence is an uncalibrated model softmax, not a probability of harm. Read it with the severity, dates and provenance.';

// The eight published hazard classes live in `@hazardnet/core` (`hazards.js`) so the
// on-device planner and the server tool pack cannot drift apart. Re-exported here
// because this module's public surface has always included the name.
export { HAZARDS } from '../../packages/core/src/hazards.js';
import { HAZARDS } from '../../packages/core/src/hazards.js';
const HORIZONS = ['7_days', '15_days'];
const ALERT_LEVELS = ['WATCH', 'WARNING', 'SEVERE'];
const HISTORICAL_HAZARDS = [...HAZARDS, 'earthquake'];
const string = (description, extra = {}) => ({ type: 'string', minLength: 1, maxLength: 100, description, ...extra });
const enumString = (description, values) => string(description, { enum: values });
const limitSchema = (maximum, defaultValue) => ({
  type: 'integer', minimum: 1, maximum, default: defaultValue, description: `Maximum records in this page (1–${maximum}).`,
});
const offsetSchema = { type: 'integer', minimum: 0, maximum: 100000, default: 0, description: 'Number of matching records to skip.' };
const districtSchema = string('Bangladesh district name or established alias, e.g. Dhaka, Chattogram or Chittagong.');
const hazardSchema = enumString('Published hazard class.', HAZARDS);
const horizonSchema = enumString('Forecast horizon; defaults to 15_days.', HORIZONS);
const schema = (properties, required = []) => ({
  type: 'object', properties, required, additionalProperties: false,
});
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const defineTool = (name, title, description, inputSchema, execute, extraAnnotations = {}) => ({
  name, title, description, inputSchema, annotations: { ...annotations, ...extraAnnotations }, execute,
});

/** Validate the JSON Schema subset used by this pack, without a runtime dependency. */
export function validateToolInput(schema, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'Tool arguments must be an object.';
  for (const key of schema.required || []) {
    if (!Object.hasOwn(input, key)) return `Missing required argument: ${key}.`;
  }
  for (const [key, value] of Object.entries(input)) {
    const rule = schema.properties[key];
    if (!rule) return `Unknown argument: ${key}.`;
    const validType = rule.type === 'integer' ? Number.isSafeInteger(value)
      : rule.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
      : rule.type === 'boolean' ? typeof value === 'boolean'
      : typeof value === 'string';
    if (!validType) return `${key} must be a valid ${rule.type}.`;
    if (rule.enum && !rule.enum.includes(value)) return `${key} must be one of: ${rule.enum.join(', ')}.`;
    if (rule.minLength !== undefined && value.length < rule.minLength) return `${key} must not be empty.`;
    if (rule.maxLength !== undefined && value.length > rule.maxLength) return `${key} is too long (maximum ${rule.maxLength}).`;
    if (rule.minimum !== undefined && value < rule.minimum) return `${key} must be at least ${rule.minimum}.`;
    if (rule.maximum !== undefined && value > rule.maximum) return `${key} must be at most ${rule.maximum}.`;
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) return `${key} has an invalid format.`;
  }
  return null;
}

export class ToolError extends Error {}
const fail = (message) => { throw new ToolError(message); };
const key = (value) => String(value).trim().toLowerCase().replace(/[\s_]+/g, '-');
const requireDistrict = (value) => lookupDistrict(value) || fail('District not recognised. Use a Bangladesh district name or established alias.');
const calendarDate = (value) => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};
const invalidArguments = (schema, args) => {
  const schemaError = validateToolInput(schema, args);
  if (schemaError) return schemaError;
  if (args.district !== undefined && !lookupDistrict(args.district)) return 'District not recognised. Use a Bangladesh district name or established alias.';
  if (args.prediction_date !== undefined && !calendarDate(args.prediction_date)) return 'prediction_date must be a real YYYY-MM-DD date.';
  return null;
};
const page = (rows, args, max, fallback) => {
  const limit = args.limit ?? fallback;
  const offset = args.offset ?? 0;
  return {
    total_count: rows.length,
    count: Math.min(limit, Math.max(0, rows.length - offset)),
    offset,
    next_offset: offset + limit < rows.length ? offset + limit : null,
    records: rows.slice(offset, offset + limit),
  };
};
const base = (source) => ({ source, disclaimer: SAFETY_NOTICE });

/** Only fixed public artifact paths may be read; never accept a caller-supplied URL. */
export const PUBLIC_ASSET_PATHS = Object.freeze([
  '/data/forecasts-latest.json',
  '/data/daily-advisories-v1.json',
  '/data/alerts-latest.json',
  '/data/freshness.json',
  '/data/content-index.json',
  '/data/historical/hazard-catalog-index.json',
  ...HAZARDS.map((hazard) => `/markdown/hazards/${hazard}.md`),
]);
async function asset(env, request, path, format = 'json') {
  if (!PUBLIC_ASSET_PATHS.includes(path)) fail('This public artifact is not available.');
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') fail('The public artifact reader is unavailable.');
  let response;
  try {
    // A new Request deliberately drops cookies, authorization and reviewer headers.
    response = await env.ASSETS.fetch(new Request(new URL(path, request.url), {
      headers: { Accept: format === 'json' ? 'application/json' : 'text/markdown' },
      signal: request.signal,
    }));
  } catch {
    fail('The published artifact could not be read. Try again later.');
  }
  if (!response.ok) fail(`The published artifact is unavailable (HTTP ${response.status}).`);
  try {
    return format === 'json' ? await response.json() : await response.text();
  } catch {
    fail('The published artifact could not be decoded.');
  }
}
const snapshotMeta = (snapshot) => ({
  generated_at: snapshot.generated_at ?? null,
  prediction_date: snapshot.prediction_date ?? null,
  source: snapshot.source ?? null,
  provenance: snapshot.provenance ?? null,
  coverage: snapshot.coverage ?? null,
});

export const MCP_TOOLS = Object.freeze([
  defineTool('get_hazard_forecast', 'Get district outlook',
    'Read the deployed daily district outlook, optionally filtered by hazard and horizon. Returns dated advisory rows and run provenance, not an official warning. A missing hazard row does not mean no risk.',
    schema({ district: districtSchema, hazard: hazardSchema, horizon: horizonSchema }, ['district']),
    async (args, env, request) => {
      const place = requireDistrict(args.district);
      const snapshot = parsePublicDailySnapshot(await asset(env, request, '/data/daily-advisories-v1.json'));
      if (!snapshot) fail('The daily outlook artifact is unavailable or failed validation; no current outlook is asserted.');
      const horizonDays = args.horizon === '7_days' ? 7 : 15;
      const rows = snapshot.advisories.filter((row) => row.districtId === place.district_id
        && row.forecastDay <= horizonDays && (!args.hazard || key(row.hazard) === args.hazard));
      return {
        ...base('/data/daily-advisories-v1.json'),
        district: place.district_name,
        horizon: args.horizon ?? '15_days',
        hazard_filter: args.hazard ?? null,
        status: publicDailyStatus(snapshot),
        run: snapshot.run,
        confidence_notice: CONFIDENCE_NOTICE,
        count: rows.length,
        advisories: rows,
        coverage_note: 'These are the published daily advisory rows, not a complete probability distribution over all eight hazards. A filtered empty result is not an all-clear.',
      };
    }),
  defineTool('list_forecasts', 'List published horizon forecasts',
    'List the latest deployed district-horizon forecast records. Filter by district, hazard or horizon. Only the deployed prediction date is available; this is not a historical forecast archive.',
    schema({
      district: string('Optional district name or alias.'), hazard: hazardSchema, horizon: horizonSchema,
      prediction_date: string('Optional YYYY-MM-DD; must match the deployed snapshot date.', { pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
      limit: limitSchema(64, 20), offset: offsetSchema,
    }),
    async (args, env, request) => {
      const loaded = await loadForecastSnapshot(env, request);
      if (loaded.error) fail('The published forecast snapshot is unavailable.');
      const snapshot = loaded.snapshot;
      if (args.prediction_date && args.prediction_date !== snapshot.prediction_date) {
        fail(`Only the deployed prediction date (${snapshot.prediction_date ?? 'not reported'}) is available; historical forecast snapshots are not served.`);
      }
      const place = args.district ? requireDistrict(args.district) : null;
      const horizons = args.horizon ? [args.horizon] : HORIZONS;
      const rows = horizons.flatMap((horizon) => snapshotRows(snapshot, horizon)).filter((row) =>
        (!place || row.district_id === place.district_id) && (!args.hazard || key(row.hazard_type) === args.hazard));
      return {
        ...base('/data/forecasts-latest.json'), ...snapshotMeta(snapshot),
        confidence_notice: CONFIDENCE_NOTICE, filters: { district: place?.district_name ?? null, hazard: args.hazard ?? null, horizon: args.horizon ?? null },
        ...page(rows, args, 64, 20),
      };
    }),
  defineTool('get_weather', 'Get current weather',
    'Read current weather observations for caller-supplied latitude and longitude through the existing Open-Meteo proxy. Never reads device geolocation. Weather observations are not a hazard warning.',
    schema({
      latitude: { type: 'number', minimum: -90, maximum: 90, description: 'Latitude in decimal degrees.' },
      longitude: { type: 'number', minimum: -180, maximum: 180, description: 'Longitude in decimal degrees.' },
    }, ['latitude', 'longitude']),
    async (args) => {
      let weather;
      try { weather = await fetchCurrentWeather(args.latitude, args.longitude); }
      catch { fail('Open-Meteo weather observations are temporarily unavailable.'); }
      return { ...base('Open-Meteo /api/v1/weather'), location: { latitude: args.latitude, longitude: args.longitude }, weather };
    }, { openWorldHint: true }),
  defineTool('list_alerts', 'List published alerts',
    'Read PUBLISHED alerts only, with real hazard, level, district and horizon filters. Includes evidence, freshness and provenance. Does not publish alerts, expose drafts, or contact anyone.',
    schema({
      district: string('Optional district name or alias.'), hazard: hazardSchema,
      level: enumString('Published alert level.', ALERT_LEVELS), horizon: horizonSchema,
      limit: limitSchema(100, 20), offset: offsetSchema,
    }),
    async (args, env, request) => {
      const loaded = await loadAlertSnapshot(env, request);
      if (loaded.error) fail('The published alert snapshot is unavailable.');
      const place = args.district ? requireDistrict(args.district) : null;
      const rows = (loaded.snapshot.alerts || [])
        .filter((row) => row && row.state === PUBLIC_ALERT_STATE)
        .filter((row) => (!place || row.district_id === place.district_id)
          && (!args.hazard || key(row.hazard_type) === args.hazard)
          && (!args.level || row.level === args.level) && (!args.horizon || row.horizon === args.horizon))
        .sort((a, b) => String(b.published_at || b.created_at || '').localeCompare(String(a.published_at || a.created_at || '')))
        .map((row) => publicAlertView(row));
      return {
        ...base('/data/alerts-latest.json'), generated_at: loaded.snapshot.generated_at ?? null,
        policy_version: loaded.snapshot.policy_version ?? null, states_visible: [PUBLIC_ALERT_STATE],
        filters: { district: place?.district_name ?? null, hazard: args.hazard ?? null, level: args.level ?? null, horizon: args.horizon ?? null },
        ...page(rows, args, 100, 20),
      };
    }),
  defineTool('get_historical_events', 'Search historical events',
    'Search the deployed historical hazard catalogue by district, hazard and year. Returns compact event records and pagination counts. Historical events are not current forecasts.',
    schema({
      district: string('Optional district name or alias.'),
      hazard: enumString('Catalogued hazard class; the archive also includes earthquakes.', HISTORICAL_HAZARDS),
      year: { type: 'integer', minimum: 1, maximum: 9999, description: 'Optional event year.' },
      limit: limitSchema(50, 20), offset: offsetSchema,
    }),
    async (args, env, request) => {
      const catalog = await asset(env, request, '/data/historical/hazard-catalog-index.json');
      if (!Array.isArray(catalog)) fail('The historical catalogue is unavailable or malformed.');
      const place = args.district ? requireDistrict(args.district) : null;
      const rows = catalog.filter((row) => (!place || key(row.district) === key(place.district_name)
        || lookupDistrict(row.district)?.district_id === place.district_id)
        && (!args.hazard || key(row.hazard_type) === args.hazard)
        && (args.year === undefined || row.year === args.year));
      return { ...base('/data/historical/hazard-catalog-index.json'),
        filters: { district: place?.district_name ?? null, hazard: args.hazard ?? null, year: args.year ?? null },
        ...page(rows, args, 50, 20) };
    }),
  defineTool('get_district_info', 'Get district identity',
    'Resolve a Bangladesh district name or alias to its canonical identity, division, pcode and reference centroid. Does not invent crop, elevation or baseline-risk facts.',
    schema({ district: districtSchema }, ['district']),
    async (args, env, request) => {
      const place = requireDistrict(args.district);
      const index = await asset(env, request, '/data/content-index.json');
      const route = Array.isArray(index.routes) && index.routes.find((item) =>
        item.path.startsWith('/districts/') && item.title.startsWith(`${place.district_name} district`));
      return { ...base('/data/content-index.json'), district: place,
        path: route ? route.path : null,
        coordinate_note: 'Reference district centroid, not the visitor’s location.' };
    }),
  defineTool('get_site_status', 'Read artifact freshness',
    'Read the deployed freshness artifact: source ages, coverage and stated limits. This is a build-time statement about artifacts, not a live service-health probe.',
    schema({}),
    async (_args, env, request) => ({
      ...base('/data/freshness.json'),
      status: await asset(env, request, '/data/freshness.json'),
      interpretation: 'Read what_this_is, built_at and each source state. Fresh artifacts do not establish that every running service is healthy.',
    })),
  defineTool('get_hazard_info', 'Read public hazard explainer',
    'Read the public markdown explainer for one hazard. Returns published explanations and limitations, never model files or research-private methodology.',
    schema({ hazard: hazardSchema }, ['hazard']),
    async (args, env, request) => {
      const path = `/markdown/hazards/${args.hazard}.md`;
      const markdown = await asset(env, request, path, 'markdown');
      if (!markdown.trim() || markdown.trimStart().startsWith('<!')) fail('The public hazard explainer is unavailable.');
      return { ...base(path), hazard: args.hazard, markdown };
    }),
]);

export const MCP_TOOL_DESCRIPTORS = Object.freeze(MCP_TOOLS.map(({ execute: _execute, ...descriptor }) => descriptor));

/** Execution errors are data for the agent; protocol/schema errors stay JSON-RPC errors. */
export async function executeMcpTool(name, args, env, request) {
  const tool = MCP_TOOLS.find((item) => item.name === name);
  if (!tool) return { invalidParams: true, message: `Unknown tool: ${String(name).slice(0, 128)}` };
  const invalid = invalidArguments(tool.inputSchema, args ?? {});
  if (invalid) return { invalidParams: true, message: invalid };
  try {
    const structuredContent = await tool.execute(args ?? {}, env, request);
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent, isError: false };
  } catch (error) {
    const message = error instanceof ToolError ? error.message : 'The tool could not complete this read. Try again later.';
    const structuredContent = { error: message, disclaimer: SAFETY_NOTICE };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent, isError: true };
  }
}
