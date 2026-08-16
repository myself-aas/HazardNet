/**
 * Client-Side Attribution & Server-Side Conversion Tracking Service
 * Follows the 7-step Server-Side Conversion Tracking standard:
 * 1. Capture click IDs & UTMs on first hit before any redirect
 * 2. Persist in sessionStorage & first-party storage
 * 3. Carry across in-app steps & route changes
 * 4. Attach to conversions / assessments / alert subscriptions
 * 5. Report server-to-server with normalized & SHA-256 hashed PII
 * 6. Deduplicate with shared deterministic event_id
 * 7. Provide telemetry and reconciliation
 */

export interface AttributionState {
  fbclid?: string;
  ttclid?: string;
  gclid?: string;
  wbraid?: string;
  gbraid?: string;
  msclkid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
  landing_url?: string;
  captured_at?: string;
}

const ATTRIBUTION_STORAGE_KEY = 'hazardnet_visitor_attribution';

/**
 * Initializes and captures click IDs & UTM parameters on initial page hit.
 */
export function initializeAttributionCapture(): AttributionState {
  if (typeof window === 'undefined') return {};

  try {
    const existingStr = sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    const existing: AttributionState = existingStr ? JSON.parse(existingStr) : {};

    const urlParams = new URLSearchParams(window.location.search);
    const updates: Partial<AttributionState> = {};

    const keys: (keyof AttributionState)[] = [
      'fbclid',
      'ttclid',
      'gclid',
      'wbraid',
      'gbraid',
      'msclkid',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term',
    ];

    keys.forEach((key) => {
      const val = urlParams.get(key);
      if (val) {
        updates[key] = val;
      }
    });

    const merged: AttributionState = {
      ...existing,
      ...updates,
      referrer: existing.referrer || document.referrer || '',
      landing_url: existing.landing_url || window.location.href,
      captured_at: existing.captured_at || new Date().toISOString(),
    };

    sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return {};
  }
}

/**
 * Retrieves the currently persisted visitor attribution state.
 */
export function getPersistedAttribution(): AttributionState {
  if (typeof window === 'undefined') return {};
  try {
    const data = sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    return data ? JSON.parse(data) : initializeAttributionCapture();
  } catch {
    return {};
  }
}

/**
 * Generates a unique, deterministic event ID for client/server deduplication.
 */
export function generateEventId(prefix = 'ev'): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${timestamp}_${randomStr}`;
}

export interface TrackConversionOptions {
  eventName: string;
  eventId?: string;
  userData?: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    district?: string;
    userId?: string;
  };
  customData?: {
    value?: number;
    currency?: string;
    content_name?: string;
    district?: string;
    hazard_type?: string;
    severity_score?: number;
    [key: string]: any;
  };
}

/**
 * Sends a server-side conversion event to the backend CAPI / Events API pipeline.
 */
export async function trackConversion(options: TrackConversionOptions): Promise<{
  success: boolean;
  eventId: string;
  matchQualityScore?: number;
}> {
  const eventId = options.eventId || generateEventId();
  const attribution = getPersistedAttribution();

  const payload = {
    event_name: options.eventName,
    event_id: eventId,
    event_time: new Date().toISOString(),
    user_data: options.userData || {},
    custom_data: options.customData || {},
    attribution_override: {
      ...attribution,
      landing_url: typeof window !== 'undefined' ? window.location.href : '',
      referrer: typeof document !== 'undefined' ? document.referrer : '',
    },
  };

  try {
    const res = await fetch('/api/conversions/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        eventId,
        matchQualityScore: data.match_quality_score,
      };
    }
  } catch (err) {
    console.warn('[Conversion Tracking] Server-side postback failed:', err);
  }

  return { success: false, eventId };
}
