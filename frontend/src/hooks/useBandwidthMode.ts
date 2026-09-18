/**
 * Low-bandwidth mode as React state (see `lib/bandwidth.ts` for the rules).
 *
 * Wires the pure decision to the browser: reads the stored override, reads the
 * device/connection signals, listens for `online`/`offline` and for connection
 * changes (a phone moving between 2G and wifi), and exposes a setter that persists.
 *
 * The one non-obvious detail: setting `lowBandwidth` also sets or clears the
 * `data-low-bandwidth` attribute on `<html>`. CSS keys off that attribute for the
 * expensive decorative effects (blur, gradients, pulse animations), which means the
 * tree-shaken components that never read this hook still render cheaply.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type BandwidthDecision, type DeviceSignals, BANDWIDTH_STORAGE_KEY, decideBandwidthMode,
  readDeviceSignals,
} from '../lib/bandwidth';

export interface UseBandwidthMode extends BandwidthDecision {
  /** The user's stored choice: true/false is an explicit override, null means auto. */
  override: boolean | null;
  setLowBandwidth: (value: boolean) => void;
  /** Back to letting the device signals decide. */
  useAuto: () => void;
  signals: DeviceSignals;
}

function readOverride(): boolean | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(BANDWIDTH_STORAGE_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

function writeOverride(value: boolean | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(BANDWIDTH_STORAGE_KEY);
    else localStorage.setItem(BANDWIDTH_STORAGE_KEY, String(value));
  } catch {
    /* storage disabled — the in-memory state still applies for this session */
  }
}

function currentSignals(): DeviceSignals {
  const prefersReducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : null;
  return readDeviceSignals(
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }),
    { prefersReducedMotion },
  );
}

export function useBandwidthMode(): UseBandwidthMode {
  const [override, setOverride] = useState<boolean | null>(() => readOverride());
  const [signals, setSignals] = useState<DeviceSignals>(() => currentSignals());

  useEffect(() => {
    const update = () => setSignals(currentSignals());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const connection = (navigator as Navigator & { connection?: EventTarget }).connection;
    connection?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      connection?.removeEventListener?.('change', update);
    };
  }, []);

  const decision = useMemo(() => decideBandwidthMode(signals, override), [signals, override]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.lowBandwidth = String(decision.lowBandwidth);
  }, [decision.lowBandwidth]);

  const setLowBandwidth = useCallback((value: boolean) => {
    const next = Boolean(value);
    writeOverride(next);
    setOverride(next);
  }, []);

  const useAuto = useCallback(() => {
    writeOverride(null);
    setOverride(null);
  }, []);

  return { ...decision, override, setLowBandwidth, useAuto, signals };
}
