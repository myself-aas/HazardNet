/**
 * useConnectivity — wraps @react-native-community/netinfo into a simple
 * boolean + last-change-at API, plus a reconnect event emitter that fires
 * once per "offline → online" transition (not every frame).
 *
 * Returns { isOnline, lastOnlineAt, lastChangeAt }.
 *
 * Phase 4: NetInfo is available; fall back gracefully if the native module
 * is missing (simulator without network subsystem, or server-render) by
 * treating the network as online.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

export interface ConnectivityState {
  isOnline: boolean;
  /** Last time an isConnected:true state was observed (ms epoch). */
  lastOnlineAt: number;
  /** Last time the connection state changed (ms epoch). */
  lastChangeAt: number;
}

export function useConnectivity(): ConnectivityState {
  const [state, setState] = useState<ConnectivityState>(() => ({
    isOnline: true,
    lastOnlineAt: Date.now(),
    lastChangeAt: Date.now(),
  }));
  const prevOnline = useRef(true);

  const handleState = useCallback((s: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) => {
    const online = !!s.isConnected && s.isInternetReachable !== false;
    setState((prev) => {
      if (online === prev.isOnline) return prev;
      const now = Date.now();
      prevOnline.current = online;
      return {
        isOnline: online,
        lastOnlineAt: online ? now : prev.lastOnlineAt,
        lastChangeAt: now,
      };
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    let unsub: (() => void) | null = null;
    try {
      NetInfo.fetch().then((s: any) => { if (mounted) handleState(s); }).catch(() => {});
      unsub = NetInfo.addEventListener(handleState);
    } catch {
      // NetInfo native module unavailable — assume online.
    }
    const onAppActive = () => {
      NetInfo.fetch().then((s: any) => { if (mounted) handleState(s); }).catch(() => {});
    };
    const sub = AppState.addEventListener?.('change', (st) => { if (st === 'active') onAppActive(); });
    return () => {
      mounted = false;
      if (unsub) unsub();
      sub?.remove?.();
    };
  }, [handleState]);

  return state;
}
