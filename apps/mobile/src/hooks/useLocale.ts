/**
 * useLocale — minimal l10n hook for Phase 8.
 *
 * Picks locale from: (1) override in settings store, (2) `expo-localization`
 * locales (graceful fallback if unavailable), (3) 'en' as final fallback.
 * Provides a `t(key, vars?)` function that returns the translated string with
 * simple {var} interpolation and falls back to English on missing keys.
 */

import { useMemo } from 'react';
import { useSettingsStore } from '../state/settingsStore';
import { en, type StringKey } from '../lib/i18n/en';
import { bn } from '../lib/i18n/bn';

type Locale = 'en' | 'bn';

let Localization: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  Localization = require('expo-localization');
} catch { Localization = null; }

function detectLocale(): Locale {
  try {
    if (Localization?.getLocales) {
      const locales = Localization.getLocales();
      const code: string = (locales?.[0]?.languageCode ?? 'en').toLowerCase();
      if (code === 'bn' || code === 'bn-bd') return 'bn';
    }
  } catch {}
  return 'en';
}

const dictionaries: Record<Locale, Record<string, string>> = { en, bn: { ...en, ...bn } };

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

export function useLocale() {
  const override = useSettingsStore((s) => (s as any).locale) as Locale | undefined;
  const locale: Locale = override ?? detectLocale();

  const t = useMemo(() => {
    const dict = dictionaries[locale] ?? en;
    return (key: StringKey, vars?: Record<string, string | number>) => {
      const val = dict[key] ?? en[key] ?? key;
      return interpolate(val, vars);
    };
  }, [locale]);

  return { locale, setLocale: (l: Locale) => (useSettingsStore.setState as any)({ locale: l }), t };
}

/** Non-hook variant for use in non-React contexts (e.g. banner callbacks). */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const dict = dictionaries[detectLocale()] ?? en;
  return interpolate(dict[key] ?? en[key] ?? key, vars);
}
