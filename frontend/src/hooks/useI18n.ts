/**
 * Language state for React components.
 *
 * Pairs with `lib/i18n.ts` (the dictionary) and honours the three rules documented
 * there: the document language is written with the language, `t()` falls back to
 * English rather than to a raw key, and numbers/dates follow the language.
 *
 * The hook also keeps the resolved language in React state so a toggle re-renders
 * every consumer without a provider in the tree (the site has no i18n context, and
 * adding one would mean touching every route).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  type Language, DEFAULT_LANGUAGE, formatDate, formatNumber, getLanguage, setLanguage as setActiveLanguage,
  subscribeLanguage, translate,
} from '../lib/i18n';

export interface UseI18n {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  isBengali: boolean;
  formatNumber: (value: number | null | undefined, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: string | null | undefined, options?: { withTime?: boolean }) => string;
}

export function useI18n(): UseI18n {
  const [language, setLanguageState] = useState<Language>(() => getLanguage());

  useEffect(() => {
    // Adopt whatever the module resolved (a stored choice, or the browser's) and
    // make sure the document advertises it even before any toggle happens.
    setActiveLanguage(getLanguage());
    return subscribeLanguage((next) => setLanguageState(next));
  }, []);

  const change = useCallback((next: Language) => {
    setLanguageState(setActiveLanguage(next));
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(language, key, vars),
    [language],
  );

  const number = useCallback(
    (value: number | null | undefined, options?: Intl.NumberFormatOptions) =>
      formatNumber(value, language, options),
    [language],
  );

  const date = useCallback(
    (value: string | null | undefined, options?: { withTime?: boolean }) =>
      formatDate(value, language, options),
    [language],
  );

  return {
    language,
    setLanguage: change,
    toggleLanguage: useCallback(
      () => change(language === 'bn' ? 'en' : 'bn'),
      [change, language],
    ),
    t,
    isBengali: language === 'bn',
    formatNumber: number,
    formatDate: date,
  };
}

export { DEFAULT_LANGUAGE };
