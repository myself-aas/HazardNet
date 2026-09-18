/**
 * Hazard-class names in the active language.
 *
 * The model has exactly eight classes (`Models/labels.json`, enforced by the CSV
 * ingest). The Bengali names here are the *display* names for those eight — data, not
 * prose, so they live in one map rather than in the translation dictionary where a
 * missing key would render as English mid-sentence.
 *
 * Anything not in the map is returned unchanged: the engines and the API validate the
 * class, so an unknown value reaching the UI means a contract break, and showing it
 * verbatim is more useful (and more honest) than substituting a guess.
 */

import { useCallback } from 'react';
import { useI18n } from './useI18n';

/** Bengali names, in the model's class order. */
export const HAZARD_LABELS_BN: Record<string, string> = {
  'Cold Wave': 'শৈত্যপ্রবাহ',
  Drought: 'খরা',
  Fire: 'অগ্নিকাণ্ড',
  'Flash Flood': 'আকস্মিক বন্যা',
  Flood: 'বন্যা',
  'Heat Wave': 'তাপপ্রবাহ',
  'Severe Local Storm': 'তীব্র স্থানীয় ঝড়',
  'Tropical Cyclone': 'ঘূর্ণিঝড়',
};

/** Short icon name per class (MaterialIcon keys). */
export const HAZARD_ICONS: Record<string, string> = {
  'Cold Wave': 'cold_wave',
  Drought: 'drought',
  Fire: 'fire',
  'Flash Flood': 'flash_flood',
  Flood: 'flood',
  'Heat Wave': 'heat',
  'Severe Local Storm': 'thunderstorm',
  'Tropical Cyclone': 'cyclone',
};

export function hazardLabel(hazard: string | null | undefined, language: 'en' | 'bn'): string {
  if (!hazard) return '—';
  if (language === 'bn') return HAZARD_LABELS_BN[hazard] || hazard;
  return hazard;
}

export function hazardIcon(hazard: string | null | undefined): string {
  if (!hazard) return 'emergency';
  return HAZARD_ICONS[hazard] || 'emergency';
}

export function useHazardLabel() {
  const { language } = useI18n();
  return useCallback((hazard: string | null | undefined) => hazardLabel(hazard, language), [language]);
}

export function useHazardIcon() {
  return useCallback((hazard: string | null | undefined) => hazardIcon(hazard), []);
}
