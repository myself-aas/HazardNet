/**
 * TanStack Query (React Query) key constants, shared between web and mobile.
 *
 * Using shared keys guarantees that:
 *   - A refresh triggered on one platform invalidates the same cache concept.
 *   - Web and mobile cannot accidentally disagree on cache identity.
 *
 * Keys are plain nested readonly arrays — they do NOT import from @tanstack/react-query.
 * Each app composes them into QueryKey types at the call site.
 */

export const QUERY_KEYS = {
  forecasts: ['forecasts'] as const,
  forecastByDistrict: (districtId: string | number) =>
    ['forecasts', 'district', String(districtId)] as const,
  forecastBulk: (horizon: string) => ['forecasts', 'bulk', horizon] as const,
  alerts: ['alerts'] as const,
  alertById: (id: string) => ['alerts', id] as const,
  alertsByPlace: (placeId: string) => ['alerts', 'place', placeId] as const,
  weather: (districtId: string | number) =>
    ['weather', String(districtId)] as const,
  savedPlaces: ['savedPlaces'] as const,
  savedPlaceById: (id: string) => ['savedPlaces', id] as const,
  appConfig: ['appConfig'] as const,
  freshness: ['freshness'] as const,
  status: ['status'] as const,
  districts: ['districts'] as const,
  districtById: (id: string) => ['districts', id] as const,
  cameraStreams: ['cameras'] as const,
  notificationPrefs: ['notificationPrefs'] as const,
  authState: ['authState'] as const,
} as const;

/** Mutation keys (for useMutation's mutationKey — used for cache invalidation grouping). */
export const MUTATION_KEYS = {
  savePlace: ['savePlace'] as const,
  deletePlace: ['deletePlace'] as const,
  updateNotificationPrefs: ['updateNotificationPrefs'] as const,
  markAlertRead: ['markAlertRead'] as const,
  submitReport: ['submitReport'] as const,
} as const;
