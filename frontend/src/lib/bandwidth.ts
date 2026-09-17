/**
 * Low-bandwidth mode (Phase 5).
 *
 * The audience is Bangladeshi farmers, union parishad offices and volunteers on
 * low-end Android hardware, often on 2G/3G with a small data bundle. The dashboard's
 * default map is a satellite tile layer (LiveMapView, raster tiles from ArcGIS/Carto)
 * and most of its chrome is animated — both expensive and both optional.
 *
 * This module computes a *recommendation* from things the browser can tell us, and
 * exposes a user override that always wins. The rules, and why:
 *
 *   - `navigator.connection.saveData` is the platform's own "I am on a metered
 *     connection" signal. Honour it.
 *   - `effectiveType` 2g/slow-2g means satellite tiles will mostly time out anyway;
 *     the vector map renders from bundled JSON with no network at all.
 *   - `deviceMemory <= 2` (GB) or `hardwareConcurrency <= 4` means the raster path
 *     plus its animations is the difference between a usable page and a hung tab.
 *   - Being offline implies it: nothing will load.
 *
 * The *decision* is a pure function so the tests can pin every rule; the hook in
 * `hooks/useBandwidthMode.ts` adds the browser wiring and storage.
 */

import type { Language } from './i18n';

export const BANDWIDTH_STORAGE_KEY = 'hazardnet-low-bandwidth';

export interface DeviceSignals {
  /** `navigator.connection.saveData` */
  saveData?: boolean | null;
  /** `navigator.connection.effectiveType` — 'slow-2g' | '2g' | '3g' | '4g' */
  effectiveType?: string | null;
  /** `navigator.deviceMemory` (GB, Chromium only; capped at 8) */
  deviceMemory?: number | null;
  /** `navigator.hardwareConcurrency` */
  hardwareConcurrency?: number | null;
  /** `navigator.onLine` */
  online?: boolean | null;
  /** Media query: prefers-reduced-motion */
  prefersReducedMotion?: boolean | null;
}

export type BandwidthReason =
  | 'user-enabled'
  | 'user-disabled'
  | 'save-data'
  | 'slow-connection'
  | 'low-memory'
  | 'few-cores'
  | 'offline'
  | 'default';

export interface BandwidthDecision {
  lowBandwidth: boolean;
  reason: BandwidthReason;
  /** Human-readable explanation, for a UI that wants to say *why*. */
  detail: string;
}

const SLOW_CONNECTIONS = ['slow-2g', '2g'];
const MEMORY_THRESHOLD_GB = 2;
const CORE_THRESHOLD = 4;

/**
 * Decide the mode. `override` is the user's stored choice: `true` forces low
 * bandwidth, `false` forces full, `null`/`undefined` means "decide from signals".
 */
export function decideBandwidthMode(
  signals: DeviceSignals = {},
  override: boolean | null | undefined = null,
): BandwidthDecision {
  if (override === true) {
    return { lowBandwidth: true, reason: 'user-enabled', detail: 'Low-bandwidth mode was turned on manually.' };
  }
  if (override === false) {
    return { lowBandwidth: false, reason: 'user-disabled', detail: 'Low-bandwidth mode was turned off manually.' };
  }
  if (signals.saveData === true) {
    return {
      lowBandwidth: true,
      reason: 'save-data',
      detail: 'Your browser reports Data Saver is on, so satellite tiles and animations are skipped.',
    };
  }
  if (signals.online === false) {
    return {
      lowBandwidth: true,
      reason: 'offline',
      detail: 'You are offline, so the page uses the bundled vector map and cached data.',
    };
  }
  if (signals.effectiveType && SLOW_CONNECTIONS.includes(String(signals.effectiveType).toLowerCase())) {
    return {
      lowBandwidth: true,
      reason: 'slow-connection',
      detail: `The connection reports "${signals.effectiveType}", which cannot carry satellite tiles reliably.`,
    };
  }
  if (typeof signals.deviceMemory === 'number' && signals.deviceMemory > 0
      && signals.deviceMemory <= MEMORY_THRESHOLD_GB) {
    return {
      lowBandwidth: true,
      reason: 'low-memory',
      detail: `This device reports ${signals.deviceMemory} GB of memory; the vector map is used instead of raster tiles.`,
    };
  }
  if (typeof signals.hardwareConcurrency === 'number' && signals.hardwareConcurrency > 0
      && signals.hardwareConcurrency <= CORE_THRESHOLD
      && signals.prefersReducedMotion !== false) {
    return {
      lowBandwidth: true,
      reason: 'few-cores',
      detail: `This device reports ${signals.hardwareConcurrency} CPU cores; animations and raster tiles are skipped.`,
    };
  }
  return { lowBandwidth: false, reason: 'default', detail: 'Full visual mode.' };
}

/** Read the signals from a browser `navigator`, tolerating absent APIs. */
export function readDeviceSignals(
  nav: (Partial<Navigator> & { connection?: { saveData?: boolean; effectiveType?: string } }) | undefined,
  options: { prefersReducedMotion?: boolean | null } = {},
): DeviceSignals {
  if (!nav) {
    return {
      saveData: null, effectiveType: null, deviceMemory: null,
      hardwareConcurrency: null, online: null,
      prefersReducedMotion: options.prefersReducedMotion ?? null,
    };
  }
  const connection = nav.connection || {};
  return {
    saveData: typeof connection.saveData === 'boolean' ? connection.saveData : null,
    effectiveType: connection.effectiveType || null,
    deviceMemory: typeof (nav as { deviceMemory?: number }).deviceMemory === 'number'
      ? (nav as { deviceMemory?: number }).deviceMemory as number
      : null,
    hardwareConcurrency: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    online: typeof nav.onLine === 'boolean' ? nav.onLine : null,
    prefersReducedMotion: options.prefersReducedMotion ?? null,
  };
}

/** Bengali copy for the reasons above, so the banner is translated like everything else. */
export const BANDWIDTH_REASON_BN: Record<BandwidthReason, string> = {
  'user-enabled': 'কম-ব্যান্ডউইথ মোড হাতে চালু করা হয়েছে।',
  'user-disabled': 'কম-ব্যান্ডউইথ মোড হাতে বন্ধ করা হয়েছে।',
  'save-data': 'আপনার ব্রাউজারে ডেটা সেভার চালু আছে, তাই স্যাটেলাইট টাইল ও অ্যানিমেশন বন্ধ রাখা হয়েছে।',
  'slow-connection': 'সংযোগ খুব ধীর, তাই স্যাটেলাইট টাইলের বদলে ভেক্টর মানচিত্র দেখানো হচ্ছে।',
  'low-memory': 'এই যন্ত্রে কম মেমোরি, তাই রাস্টার টাইলের বদলে ভেক্টর মানচিত্র ব্যবহার করা হচ্ছে।',
  'few-cores': 'এই যন্ত্রে কম প্রসেসর কোর, তাই অ্যানিমেশন ও রাস্টার টাইল বন্ধ রাখা হয়েছে।',
  offline: 'আপনি অফলাইনে আছেন, তাই বান্ডল করা ভেক্টর মানচিত্র ও সংরক্ষিত তথ্য ব্যবহার করা হচ্ছে।',
  default: 'পূর্ণ ভিজ্যুয়াল মোড।',
};

export function explainBandwidthReason(decision: BandwidthDecision, language: Language): string {
  return language === 'bn' ? BANDWIDTH_REASON_BN[decision.reason] : decision.detail;
}
