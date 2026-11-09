/**
 * The endpoint table: one place where the API's paths are written down.
 *
 * `bindEndpoints(client)` is the typed client — request shaping, retry, error normalisation,
 * schema validation. That is the mobile app's path and it is exercised by
 * `packages/api/__tests__/client.test.ts`.
 *
 * What the web app needed from this package was smaller and had been written nine times
 * instead: **the path**. `frontend/src` spelled `/api/v1/forecasts/bulk`, `/api/v1/alerts`,
 * `/api/v1/alerts/policy`, `/api/v1/telemetry`, `/api/v1/kaggle`, `/api/v1/advisories` and
 * `/data/freshness.json` as string literals in seven modules, and the same seven paths again in
 * the handlers that answer them. Renaming one was a search-and-replace across two runtimes with
 * nothing to fail if a third site was missed.
 *
 * `API_PATHS` is that table. It is deliberately dependency-free — no client, no zod — so a
 * module that only needs a path (or a route that only needs to state the path it answers) can
 * import it without pulling in the request plumbing.
 *
 * `bindEndpoints` reads the same table, so the client and the literals cannot disagree. Two
 * entries are new with it: `blog` and `predict`, the two routes the web app calls that this
 * table did not know about.
 */

import { z } from 'zod';
import type { ApiClient } from './client';
import { cursorParams } from './client';
// Reuse Zod schemas from core where they exist.
import {
  ForecastRowSchema,
  AlertItemSchema,
} from '@hazardnet/core';

/**
 * Every API path the two apps call, in one object.
 *
 * Paths are absolute and carry no query string: callers append `?horizon=…` or use the client,
 * whose `params` argument does the encoding. Static artifacts (`/data/*.json`) sit beside the
 * API paths because they are read by the same pages and drift with them — `freshness.json` is
 * the file the status page and the alert panel both read.
 *
 * A route that answers one of these should state it with `pathOf(...)` rather than re-typing
 * the literal; `__tests__/apiPathTable.test.js` fails if a handler and the table disagree.
 */
export const API_PATHS = Object.freeze({
  forecastsBulk: '/api/v1/forecasts/bulk',
  forecastsMetadata: '/api/v1/forecasts/metadata',
  alerts: '/api/v1/alerts',
  alertsPolicy: '/api/v1/alerts/policy',
  advisories: '/api/v1/advisories',
  kaggle: '/api/v1/kaggle',
  kaggleAdvisories: '/api/v1/kaggle/advisories',
  weather: '/api/v1/weather',
  weatherBatch: '/api/v1/weather/batch',
  telemetry: '/api/v1/telemetry',
  predict: '/api/predict',
  /**
   * The events mirror. Trailing slashes are load-bearing: `eventsClient.ts` appends an id, and
   * the route register dispositions these as `/api/v1/events/district/*` — a prefix, which the
   * reachability gate reads as a wildcard. Written without the slash they read as routes that
   * do not exist, and the gate said so.
   */
  eventsSummary: '/api/v1/events/summary',
  eventsDistrict: '/api/v1/events/district/',
  eventsDivision: '/api/v1/events/division/',
  eventsHazard: '/api/v1/events/hazard/',
  chatQuery: '/api/chat/query',
  chatSampleQuestions: '/api/chat/sample-questions',
  /** Static artifacts, read with `frontend/src/lib/artifacts.ts`. */
  freshnessArtifact: '/data/freshness.json',
  dailyAdvisoriesArtifact: '/data/daily-advisories-v1.json',
  alertsArtifact: '/data/alerts-latest.json',
  forecastsArtifact: '/data/forecasts-latest.json',
});

export type ApiPathName = keyof typeof API_PATHS;

/**
 * Paths with a variable segment, kept as functions so the encoding cannot be forgotten.
 *
 * `eventsDistrict('Khulna')` is `/api/v1/events/district/Khulna`; the four call sites in
 * `eventsClient.ts` interpolated and encoded by hand, which is the shape that loses an
 * `encodeURIComponent` in a refactor.
 */
export const API_PATH_BUILDERS = Object.freeze({
  eventsDistrict: (id: string) => `${API_PATHS.eventsDistrict}${encodeURIComponent(id)}`,
  eventsDivision: (id: string) => `${API_PATHS.eventsDivision}${encodeURIComponent(id)}`,
  eventsHazard: (id: string) => `${API_PATHS.eventsHazard}${encodeURIComponent(id)}`,
});

/**
 * The path for a named endpoint.
 *
 * A named lookup rather than the object itself, so a caller takes a string and a typo is a
 * compile error (`pathOf('forecastsBulk')`), not `undefined` in a template literal.
 */
export function pathOf(name: ApiPathName): string {
  return API_PATHS[name];
}

/**
 * A path relative to the client's base URL.
 *
 * `bindEndpoints` builds its requests from absolute paths; a client configured with
 * `baseUrl: '/api'` or `'https://hazardnet.live'` needs the same path without its first
 * segment. One helper, so the two callers cannot strip different amounts.
 */
export function relativePath(name: ApiPathName, baseUrl = '/api'): string {
  const absolute = API_PATHS[name];
  const base = baseUrl.replace(/\/$/, '');
  return absolute.startsWith(base) ? absolute.slice(base.length) || '/' : absolute;
}

/** Bulk forecasts response (/api/v1/forecasts/bulk). */
export const BulkForecastsResponseSchema = z.object({
  horizon: z.string(),
  count: z.number().int().nonnegative(),
  generated_at: z.string(),
  forecasts: z.array(ForecastRowSchema.passthrough()),
}).passthrough();
export type BulkForecastsResponse = z.infer<typeof BulkForecastsResponseSchema>;

export const AlertsListResponseSchema = z.object({
  schema: z.string().default('hazardnet-alerts/v1'),
  generated_at: z.string().nullable().optional(),
  disclaimer: z.string().optional(),
  alerts: z.array(AlertItemSchema.passthrough()),
}).passthrough();
export type AlertsListResponse = z.infer<typeof AlertsListResponseSchema>;

export const AppConfigResponseSchema = z.object({
  minimum_version: z.string().optional(),
  latest_version: z.string().optional(),
  force_update: z.boolean().default(false),
  update_url: z.string().url().optional(),
  feature_flags: z.record(z.string(), z.boolean()).default({}),
  maintenance: z.boolean().default(false),
  maintenance_message: z.string().nullable().optional(),
}).passthrough();
export type AppConfigResponse = z.infer<typeof AppConfigResponseSchema>;

export const FreshnessArtifactSchema = z.object({
  schema: z.string(),
  built_at: z.string().nullable().optional(),
  overall: z.any().optional(),
  sources: z.array(z.any()).default([]),
  coverage: z.any().nullable().optional(),
  model: z.any().nullable().optional(),
  honesty: z.array(z.string()).default([]),
}).passthrough();

/** Endpoint methods bound to a client. */
export interface Endpoints {
  getForecastsBulk(horizon: string, opts?: { signal?: AbortSignal; fields?: string[] }): Promise<BulkForecastsResponse>;
  getAlerts(opts?: { signal?: AbortSignal; fields?: string[]; districtId?: string; level?: string; hazard?: string; limit?: number; after?: string | null }): Promise<AlertsListResponse>;
  getAlertById(id: string, opts?: { signal?: AbortSignal; fields?: string[] }): Promise<z.infer<typeof AlertItemSchema>>;
  getAppConfig(opts?: { signal?: AbortSignal }): Promise<AppConfigResponse>;
  getFreshness(opts?: { signal?: AbortSignal }): Promise<z.infer<typeof FreshnessArtifactSchema>>;
}

export function bindEndpoints(client: ApiClient): Endpoints {
  return {
    async getForecastsBulk(horizon, opts) {
      return client.get(relativePath('forecastsBulk'), {
        params: { horizon },
        fields: opts?.fields,
        signal: opts?.signal,
        schema: BulkForecastsResponseSchema,
      });
    },
    async getAlerts(opts = {}) {
      return client.get(relativePath('alerts'), {
        params: {
          ...(opts.districtId ? { district_id: opts.districtId } : {}),
          ...(opts.level ? { level: opts.level } : {}),
          ...(opts.hazard ? { hazard: opts.hazard } : {}),
          ...cursorParams(opts.limit ?? 50, opts.after ?? null),
        },
        fields: opts.fields,
        signal: opts.signal,
        schema: AlertsListResponseSchema,
      });
    },
    async getAlertById(id, opts) {
      // The single-alert path is a child of the list path, so it is derived from it rather than
      // written a second time.
      return client.get(`${relativePath('alerts')}/${encodeURIComponent(id)}`, {
        fields: opts?.fields,
        signal: opts?.signal,
        schema: AlertItemSchema.passthrough(),
      });
    },
    async getAppConfig(opts) {
      return client.get(`/app-config`, {
        signal: opts?.signal,
        schema: AppConfigResponseSchema,
      });
    },
    async getFreshness(opts) {
      // The freshness artifact is served as a static JSON file, not an API path — which is why
      // it is in the table as an artifact and why the client is configured with a site root
      // rather than an API base when a caller needs it.
      return client.get(API_PATHS.freshnessArtifact, {
        signal: opts?.signal,
        schema: FreshnessArtifactSchema,
      });
    },
  };
}
