import { useEffect } from 'react';
import {
  initializeAttributionCapture,
  getPersistedAttribution,
  trackConversion,
  generateEventId,
  type TrackConversionOptions,
  type AttributionState,
} from '../services/conversionTracking';

/**
 * Hook for capturing initial landing click IDs (fbclid, gclid, etc.) and firing server-side conversions.
 */
export function useConversionTracking() {
  useEffect(() => {
    initializeAttributionCapture();
  }, []);

  return {
    getAttribution: getPersistedAttribution,
    track: trackConversion,
    generateEventId,
  };
}
