/**
 * @hazardnet/api — cross-platform fetch client and endpoint wrappers.
 *
 * Works on web (browsers), React Native 0.74+ (Expo SDK 51+), and Node 18+
 * using the WHATWG fetch API.
 */

export * from './client';
export * from './errors';
export * from './retry';
export {
  BulkForecastsResponseSchema,
  AlertsListResponseSchema,
  AppConfigResponseSchema,
  FreshnessArtifactSchema,
  bindEndpoints,
} from './endpoints';
export type {
  BulkForecastsResponse,
  AlertsListResponse,
  AppConfigResponse,
  Endpoints,
} from './endpoints';
