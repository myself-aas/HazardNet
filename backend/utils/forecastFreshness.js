/**
 * Forecast freshness gauge wiring (backlog #5 — the guide's freshness SLO).
 *
 * The `hazardnet_forecast_age_hours` gauge is refreshed whenever /metrics is
 * served (scrape-driven), from the store's cheap getLatestPredictionDate()
 * probe. Semantics:
 *
 *   - store returns a date   → gauge set to now − prediction_date (hours)
 *   - store returns null     → gauge REMOVED from the exposition (absent
 *                              series = nothing ingested yet; alert with
 *                              absent(hazardnet_forecast_age_hours))
 *   - store query fails      → gauge REMOVED + warn log (a flat or zeroed
 *                              value would hide the failure; absent is honest)
 *
 * The store lookup is cached for `maxAgeMs` (default 60 s) so a 15–30 s
 * Prometheus scrape interval — or a public /metrics being hammered — costs at
 * most one indexed read (Firestore) per minute.
 * The age itself is recomputed from the cached date on every call, so the
 * gauge keeps advancing between lookups.
 */
import { getForecastStore } from '../forecastStore.js';
import metrics, { forecastAgeHoursFromPredictionDate } from '../metrics.js';

const DEFAULT_MAX_AGE_MS = 60_000;

let cache = { at: 0, date: null };

/**
 * Refresh the forecast-age gauge. Never throws — the outcome is returned.
 *
 * @returns {Promise<{status: 'ok'|'empty'|'error', date: string|null, ageHours: number|null, error?: Error}>}
 */
export async function refreshForecastAgeGauge({ maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
  const now = Date.now();
  if (now - cache.at >= maxAgeMs) {
    try {
      cache = { at: now, date: await getForecastStore().getLatestPredictionDate() };
    } catch (err) {
      cache = { at: now, date: null };
      metrics.hideForecastAgeHours(); // freshness unknown → series absent
      console.warn('[forecastFreshness] store lookup failed:', err.message);
      return { status: 'error', date: null, ageHours: null, error: err };
    }
  }

  if (!cache.date) {
    metrics.hideForecastAgeHours(); // no forecasts ingested yet → series absent
    return { status: 'empty', date: null, ageHours: null };
  }

  const ageHours = forecastAgeHoursFromPredictionDate(cache.date);
  if (ageHours === null) {
    metrics.hideForecastAgeHours();
    return { status: 'error', date: cache.date, ageHours: null, error: new Error(`unparseable prediction_date: ${cache.date}`) };
  }
  metrics.setForecastAgeHours(ageHours);
  return { status: 'ok', date: cache.date, ageHours };
}

/** Test hook: drop the lookup cache so the next refresh re-queries the store. */
export function _resetForecastFreshnessCacheForTests() {
  cache = { at: 0, date: null };
}
