/**
 * Analytics event name constants.
 *
 * Events are shared between web (Vercel Analytics) and mobile (Firebase/Sentry
 * or custom). Each platform implements a thin `track(event, properties)`
 * adapter that forwards to its SDK; this module only names the events and
 * documents their expected properties.
 *
 * Naming convention: object_action (snake_case). Properties are camelCase.
 *
 * PII RULES:
 *   - Never log precise location. Coarse district-level OK for safety events.
 *   - Never log saved place names or addresses.
 *   - Never log phone numbers, emails, or auth UIDs.
 *   - Crash reports include installation ID only (random UUID).
 */

export const ANALYTICS_EVENTS = {
  // App lifecycle
  APP_OPENED: 'app_opened',
  APP_BACKGROUNDED: 'app_backgrounded',
  APP_FOREGROUNDED: 'app_foregrounded',

  // Navigation
  TAB_SELECTED: 'tab_selected',
  SCREEN_VIEW: 'screen_view',
  ALERT_DETAIL_OPENED: 'alert_detail_opened',
  DEEPLINK_OPENED: 'deeplink_opened',

  // Safety-critical interactions
  EMERGENCY_CALL_TAPPED: 'emergency_call_tapped',
  OFFICIAL_SOURCE_OPENED: 'official_source_opened',
  OFFICIAL_INSTRUCTIONS_VIEWED: 'official_instructions_viewed',

  // Alerts
  ALERT_RECEIVED: 'alert_received',             // push received (background+foreground)
  ALERT_TAPPED: 'alert_tapped',
  ALERT_SHARED: 'alert_shared',
  ALERT_MARKED_READ: 'alert_marked_read',

  // Map
  MAP_MARKER_TAPPED: 'map_marker_tapped',
  MAP_LAYER_TOGGLED: 'map_layer_toggled',
  MAP_RECENTER_TAPPED: 'map_recenter_tapped',
  MAP_REGION_CHANGED: 'map_region_changed',

  // Saved places
  PLACE_SAVED: 'place_saved',
  PLACE_DELETED: 'place_deleted',
  PLACE_NOTIFICATION_PREFS_CHANGED: 'place_notification_prefs_changed',

  // Notification permission
  NOTIFICATION_PERMISSION_REQUESTED: 'notification_permission_requested',
  NOTIFICATION_PERMISSION_GRANTED: 'notification_permission_granted',
  NOTIFICATION_PERMISSION_DENIED: 'notification_permission_denied',
  NOTIFICATION_SETTINGS_OPENED: 'notification_settings_opened',

  // Location
  LOCATION_PERMISSION_REQUESTED: 'location_permission_requested',
  LOCATION_PERMISSION_GRANTED: 'location_permission_granted',
  LOCATION_PERMISSION_DENIED: 'location_permission_denied',

  // Data/connectivity
  OFFLINE_BANNER_SHOWN: 'offline_banner_shown',
  STALE_DATA_SHOWN: 'stale_data_shown',
  CACHE_CLEARED: 'cache_cleared',
  PULL_TO_REFRESH: 'pull_to_refresh',

  // Performance markers (numbers are in ms)
  PERF_COLD_START: 'perf_cold_start',
  PERF_FIRST_USABLE_CONTENT: 'perf_first_usable_content',
  PERF_SCREEN_TRANSITION: 'perf_screen_transition',

  // Errors (do not log stack traces here; Sentry handles those)
  ERROR_BOUNDARY_TRIGGERED: 'error_boundary_triggered',
  API_REQUEST_FAILED: 'api_request_failed',
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/** Common properties every event may carry. Platforms fill in sensible defaults. */
export interface CommonEventProperties {
  appVersion?: string;
  platform?: 'web' | 'ios' | 'android';
  osVersion?: string;
  deviceClass?: 'phone' | 'tablet' | 'desktop';
  /** 'light' | 'dark' | 'oled-dark' */
  colorScheme?: string;
  /** BCP 47 language tag (en, bn-BD, …). */
  locale?: string;
  /** Connection effective type ('4g', '3g', '2g', 'slow-2g', 'offline'). */
  connectionType?: string;
}
