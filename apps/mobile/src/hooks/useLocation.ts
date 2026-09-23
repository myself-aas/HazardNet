/**
 * useLocationPermission / useCurrentLocation — wraps expo-location.
 *
 * In-context permission request (NOT on launch). Three states:
 *   - 'unknown'  : never asked
 *   - 'granted'  : WhenInUse granted, we can read coords
 *   - 'denied'   : denied (or restricted); UI shows "showing national" fallback
 *
 * Permission is requested the first time the user taps the location-dot
 * or "use my location" in Today's location switcher. Denial gracefully
 * falls back to the national summary (§10/§12).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { safeOpenUrl } from '../lib/security/openUrl';
import { track } from '../lib/telemetry';

export type PermissionState = 'unknown' | 'granted' | 'denied';

export interface LocationCoords {
  lat: number;
  lng: number;
  accuracyMeters?: number;
  timestamp: number;
}

export interface LocationState {
  permission: PermissionState;
  /** Last known low-accuracy coords; null if no permission / no fix yet. */
  coords: LocationCoords | null;
  /** True while actively obtaining a fix. */
  locating: boolean;
  /** Ask system for WhenInUse permission; returns the new state. */
  requestPermission: () => Promise<PermissionState>;
  /** Trigger a single low-accuracy location fix. */
  getCurrentLocation: () => Promise<LocationCoords | null>;
  /** Open OS Settings so user can re-enable after denial. */
  openSettings: () => void;
}

export function useLocation(): LocationState {
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [coords, setCoords] = useState<LocationCoords | null>(null);
  const [locating, setLocating] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const { granted } = await Location.getForegroundPermissionsAsync();
        if (!mounted.current) return;
        setPermission(granted ? 'granted' : 'denied');
      } catch {
        setPermission('denied');
      }
    })();
    return () => { mounted.current = false; };
  }, []);

  const requestPermission = useCallback(async (): Promise<PermissionState> => {
    try {
      const existing = await Location.getForegroundPermissionsAsync();
      let result = existing;
      if (!existing.granted && existing.canAskAgain) {
        result = await Location.requestForegroundPermissionsAsync();
      }
      const state: PermissionState = result.granted ? 'granted' : 'denied';
      setPermission(state);
      track({ name: 'permission.request', props: { which: 'location', result: state } });
      return state;
    } catch {
      setPermission('denied');
      return 'denied';
    }
  }, []);

  const getCurrentLocation = useCallback(async (): Promise<LocationCoords | null> => {
    if (permission !== 'granted') return null;
    setLocating(true);
    try {
      const fix = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low, // low-power default per §12
      }).catch(() => null);
      if (!fix) return null;
      const out: LocationCoords = {
        lat: fix.coords.latitude,
        lng: fix.coords.longitude,
        accuracyMeters: fix.coords.accuracy ?? undefined,
        timestamp: fix.timestamp,
      };
      setCoords(out);
      return out;
    } finally {
      if (mounted.current) setLocating(false);
    }
  }, [permission]);

  const openSettings = useCallback(() => {
    if (Platform.OS === 'ios') safeOpenUrl('app-settings:', 'ios-settings').catch(() => {});
    else Linking.openSettings().catch(() => {});
  }, []);

  return { permission, coords, locating, requestPermission, getCurrentLocation, openSettings };
}
