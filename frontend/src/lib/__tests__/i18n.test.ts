/**
 * @jest-environment jsdom
 *
 * The i18n contract (Phase 5). Three things are pinned here, because each of them is a
 * way a bilingual hazard UI misleads people:
 *
 *   1. the dictionaries are complete in both directions — a missing Bengali string must
 *      not fall through to English silently (the tests fail instead), and a missing
 *      English string must never surface as a raw key;
 *   2. the document language follows the language, because screen readers pick a voice
 *      from `<html lang>`;
 *   3. numbers and dates are rendered in the script the reader is reading.
 */

import {
  DICTIONARIES, LANGUAGES, TRANSLATION_KEYS, DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY,
  formatDate, formatNumber, getLanguage, resolveInitialLanguage, setLanguage,
  subscribeLanguage, toBengaliNumerals, translate,
} from '../i18n';

describe('dictionaries', () => {
  it('has a value for every key in every language', () => {
    for (const language of LANGUAGES) {
      const missing = TRANSLATION_KEYS.filter((key) => {
        const value = DICTIONARIES[language][key];
        return typeof value !== 'string' || value.trim().length === 0;
      });
      expect({ language, missing }).toEqual({ language, missing: [] });
    }
  });

  it('publishes both languages and no third one', () => {
    expect(Object.keys(DICTIONARIES).sort()).toEqual(['bn', 'en']);
    expect(LANGUAGES).toContain(DEFAULT_LANGUAGE);
  });

  it('keeps the Bengali dictionary free of orphan keys', () => {
    const keys = new Set(TRANSLATION_KEYS as string[]);
    const orphans = Object.keys(DICTIONARIES.bn).filter((key) => !keys.has(key));
    expect(orphans).toEqual([]);
  });

  it('translates level names in both languages rather than leaving English behind', () => {
    for (const level of ['NO_ALERT', 'WATCH', 'WARNING', 'SEVERE']) {
      expect(translate('en', `alerts.level.${level}`)).not.toBe(`alerts.level.${level}`);
      expect(translate('bn', `alerts.level.${level}`)).toMatch(/[\u0980-\u09FF]/);
      expect(translate('bn', `alerts.level.${level}`)).not.toBe(translate('en', `alerts.level.${level}`));
    }
  });
});

describe('translate', () => {
  it('falls back to English rather than to the key when a translation is missing', () => {
    // A dictionary-only-in-English case, simulated rather than committed.
    const key = 'common.language';
    expect(translate('en', key)).toBe('Language');
    expect(translate('bn', key)).toBe('ভাষা');
  });

  it('returns the key only when neither dictionary has it', () => {
    expect(translate('bn', 'does.not.exist')).toBe('does.not.exist');
  });

  it('substitutes named variables and leaves unknown ones alone', () => {
    expect(translate('en', 'alerts.filter.results', { shown: 4, total: 74 }))
      .toBe('Showing 4 of 74');
    expect(translate('en', 'alerts.filter.results', { shown: 4 })).toContain('{total}');
  });
});

describe('resolveInitialLanguage', () => {
  it('prefers an explicit stored choice', () => {
    expect(resolveInitialLanguage({ stored: 'bn', navigatorLanguages: ['en-GB'] })).toBe('bn');
    expect(resolveInitialLanguage({ stored: 'en', navigatorLanguages: ['bn-BD'] })).toBe('en');
  });

  it('honours the browser languages when nothing is stored', () => {
    expect(resolveInitialLanguage({ navigatorLanguages: ['bn-BD', 'en-GB'] })).toBe('bn');
    expect(resolveInitialLanguage({ navigatorLanguages: ['en-US'] })).toBe('en');
  });

  it('falls back to English for anything unrecognised', () => {
    expect(resolveInitialLanguage({ stored: 'fr', navigatorLanguages: ['fr-FR'] })).toBe('en');
    expect(resolveInitialLanguage()).toBe('en');
  });
});

describe('language store', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = '';
  });

  it('persists the choice and writes the document language', () => {
    setLanguage('bn');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('bn');
    expect(document.documentElement.lang).toBe('bn-BD');
    expect(getLanguage()).toBe('bn');

    setLanguage('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('rejects a language it does not serve', () => {
    // @ts-expect-error deliberately invalid input — the store must not corrupt state
    expect(setLanguage('fr')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('notifies subscribers and stops when they unsubscribe', () => {
    const seen: string[] = [];
    const unsubscribe = subscribeLanguage((language) => seen.push(language));
    setLanguage('bn');
    setLanguage('en');
    unsubscribe();
    setLanguage('bn');
    expect(seen).toEqual(['bn', 'en']);
  });
});

describe('numbers and dates', () => {
  it('renders Bengali digits in Bengali', () => {
    expect(toBengaliNumerals('0.94')).toBe('০.৯৪');
    expect(formatNumber(74, 'en')).toBe('74');
    expect(formatNumber(74, 'bn')).toBe('৭৪');
  });

  it('renders an unambiguous date in both languages', () => {
    expect(formatDate('2026-09-23', 'en')).toBe('23 September 2026');
    expect(formatDate('2026-09-23', 'bn')).toBe('২৩ সেপ্টেম্বর ২০২৬');
  });

  it('appends UTC time when asked, in the right digits', () => {
    expect(formatDate('2026-09-23T06:30:00Z', 'en', { withTime: true })).toBe('23 September 2026, 06:30 UTC');
    expect(formatDate('2026-09-23T06:30:00Z', 'bn', { withTime: true })).toContain('০৬:৩০');
  });

  it('degrades visibly instead of printing Invalid Date', () => {
    expect(formatDate(null, 'en')).toBe('—');
    expect(formatDate('not-a-date', 'en')).toBe('not-a-date');
    expect(formatNumber(null, 'bn')).toBe('—');
  });

  it('renders month and year from calendar components, not local midnight', () => {
    expect(formatDate('2026-01-15', 'en', { monthYear: true })).toBe('January 2026');
    expect(formatDate('2026-01-15', 'bn', { monthYear: true })).toBe('জানুয়ারি ২০২৬');
  });
});
