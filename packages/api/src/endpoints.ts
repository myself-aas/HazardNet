/**
 * Endpoint wrappers for HazardNet's public API.
 *
 * Each function is thin: it composes a path and (optionally) a Zod schema with
 * the ApiClient.request() method. Web and mobile import these wrappers so both
 * platforms stay in lockstep on URL shape, schema validation, and query
 * parameters.
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
 * Bulk forecasts response (/api/v1/forecasts/bulk).
 *
 * NOTE: The web currently uses ad-hoc forecast endpoints; Phase 1 defines the
 * canonical shape. The server may not yet implement all fields — Zod `.passthrough()`
 * keeps unknown fields so we don't reject a real response.
 */
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
      return client.get(`/v1/forecasts/bulk`, {
        params: { horizon },
        fields: opts?.fields,
        signal: opts?.signal,
        schema: BulkForecastsResponseSchema,
      });
    },
    async getAlerts(opts = {}) {
      return client.get(`/v1/alerts`, {
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
      return client.get(`/v1/alerts/${encodeURIComponent(id)}`, {
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
      // The freshness artifact is served as a static JSON file, not an API path.
      // We call the baseUrl's parent — caller should configure the client with
      // baseUrl like 'https://hazardnet.live' for static artifacts or '/api/v1'
      // for API-only clients. Endpoints that need both should use separate clients.
      return client.get(`/data/freshness.json`, {
        signal: opts?.signal,
        schema: FreshnessArtifactSchema,
      });
    },
  };
}
