import { useState, useEffect, useCallback } from 'react';
import { ref, onValue, get, goOffline, goOnline } from 'firebase/database';
import { rtdb } from '../services/firebase';

export type RTDBConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface UseFirebaseConnectivityReturn {
  /** True when actively connected to Firebase Realtime Database */
  isConnected: boolean;
  /** Detailed connection status */
  status: RTDBConnectionStatus;
  /** Estimated round-trip latency in milliseconds */
  latency: number | null;
  /** Firebase server time offset in milliseconds relative to client clock */
  serverTimeOffset: number | null;
  /** Timestamp when the connection was established */
  lastConnectedAt: Date | null;
  /** Timestamp when the connection was lost */
  lastDisconnectedAt: Date | null;
  /** Last checked local time string */
  lastChecked: string;
  /** True while a manual or automatic ping measurement is running */
  isPinging: boolean;
  /** Human-readable error message if listener or connection failed */
  errorMessage: string | null;
  /** Error object if an error was encountered */
  error: Error | null;
  /** Database instance URL */
  databaseUrl: string;
  /** Manual ping trigger to recalculate latency and verify connection */
  ping: () => Promise<number | null>;
  /** Force cycling the WebSocket connection (goOffline then goOnline) */
  reconnect: () => void;
}

export const DATABASE_URL = 'https://hazardnet-aas48424-default-rtdb.firebaseio.com';

/**
 * Custom hook that listens to the Firebase Realtime Database `.info/connected` path
 * using `onValue` to track and expose the real-time connectivity status of the app.
 *
 * @returns {UseFirebaseConnectivityReturn} Connectivity states, latency metrics, and control methods.
 */
export function useFirebaseConnectivity(): UseFirebaseConnectivityReturn {
  const [status, setStatus] = useState<RTDBConnectionStatus>('connecting');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [serverTimeOffset, setServerTimeOffset] = useState<number | null>(null);
  const [lastConnectedAt, setLastConnectedAt] = useState<Date | null>(null);
  const [lastDisconnectedAt, setLastDisconnectedAt] = useState<Date | null>(null);
  const [lastChecked, setLastChecked] = useState<string>('');
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Measure round-trip ping latency against .info/serverTimeOffset
  const ping = useCallback(async (): Promise<number | null> => {
    setIsPinging(true);
    setErrorMessage(null);
    setError(null);
    const start = performance.now();

    try {
      const offsetRef = ref(rtdb, '.info/serverTimeOffset');
      const snap = await get(offsetRef);
      const end = performance.now();
      const roundTrip = Math.round(end - start);

      setLatency(roundTrip);
      if (snap.exists()) {
        const offsetVal = snap.val() as number;
        setServerTimeOffset(offsetVal);
      }
      setLastChecked(new Date().toLocaleTimeString());
      return roundTrip;
    } catch (err: any) {
      console.warn('Realtime Database ping warning:', err);
      const end = performance.now();
      const roundTrip = Math.round(end - start);
      setLatency(roundTrip);
      setLastChecked(new Date().toLocaleTimeString());
      return roundTrip;
    } finally {
      setIsPinging(false);
    }
  }, []);

  // Force cycling the connection
  const reconnect = useCallback(() => {
    setStatus('connecting');
    setIsConnected(false);
    try {
      goOffline(rtdb);
      setTimeout(() => {
        goOnline(rtdb);
        ping();
      }, 350);
    } catch (err: any) {
      console.error('Error cycling Realtime Database connection:', err);
      setErrorMessage(err?.message || 'Failed to restart connection');
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [ping]);

  useEffect(() => {
    let unsubscribeConnected: (() => void) | null = null;
    let unsubscribeOffset: (() => void) | null = null;

    try {
      // 1. Subscribe to .info/connected
      const connectedRef = ref(rtdb, '.info/connected');
      unsubscribeConnected = onValue(
        connectedRef,
        (snap) => {
          const connected = snap.val() === true;
          setIsConnected(connected);

          if (connected) {
            setStatus('connected');
            setLastConnectedAt(new Date());
            setErrorMessage(null);
            setError(null);
            ping();
          } else {
            setStatus((prev) => (prev === 'connecting' ? 'connecting' : 'disconnected'));
            setLastDisconnectedAt(new Date());
          }
        },
        (err) => {
          console.error('Firebase RTDB .info/connected error:', err);
          setStatus('error');
          setIsConnected(false);
          setErrorMessage(err.message || 'Failed to subscribe to .info/connected');
          setError(err);
        }
      );

      // 2. Subscribe to .info/serverTimeOffset
      const offsetRef = ref(rtdb, '.info/serverTimeOffset');
      unsubscribeOffset = onValue(
        offsetRef,
        (snap) => {
          if (snap.exists()) {
            setServerTimeOffset(snap.val() as number);
          }
        },
        (err) => {
          console.warn('Firebase RTDB .info/serverTimeOffset error:', err);
        }
      );
    } catch (e: any) {
      console.error('Error attaching Firebase RTDB connection listeners:', e);
      setStatus('error');
      setIsConnected(false);
      setErrorMessage(e?.message || 'Realtime Database initialization error');
      setError(e instanceof Error ? e : new Error(String(e)));
    }

    return () => {
      if (unsubscribeConnected) unsubscribeConnected();
      if (unsubscribeOffset) unsubscribeOffset();
    };
  }, [ping]);

  return {
    isConnected,
    status,
    latency,
    serverTimeOffset,
    lastConnectedAt,
    lastDisconnectedAt,
    lastChecked,
    isPinging,
    errorMessage,
    error,
    databaseUrl: DATABASE_URL,
    ping,
    reconnect,
  };
}

// Named alias
export const useFirebaseRealtimeConnection = useFirebaseConnectivity;
export default useFirebaseConnectivity;
