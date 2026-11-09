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
  // The endpoint table. Exported from the package root because the web app needs the paths
  // without the request plumbing — importing `endpoints` directly would pull zod and the
  // client into every module that only wants a URL string.
  API_PATHS,
  API_PATH_BUILDERS,
  pathOf,
  relativePath,
  BulkForecastsResponseSchema,
  AlertsListResponseSchema,
  AppConfigResponseSchema,
  FreshnessArtifactSchema,
  bindEndpoints,
} from './endpoints';
export type {
  ApiPathName,
  BulkForecastsResponse,
  AlertsListResponse,
  AppConfigResponse,
  Endpoints,
} from './endpoints';
