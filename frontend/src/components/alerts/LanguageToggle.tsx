/**
 * Language toggle (Phase 5).
 *
 * A two-state button rather than a dropdown: there are two languages, and on the
 * devices this dashboard targets every extra interaction costs taps and bandwidth.
 *
 * Accessibility notes that are easy to get wrong and matter here:
 *  - The button's accessible name is in the *target* language ("বাংলা" while the page
 *    is English), because a Bengali speaker looking for Bengali reads that word.
 *  - `aria-pressed` reports whether Bengali is currently active, so a screen reader
 *    announces state, not just the label.
 *  - Each label span carries `lang` so a screen reader pronounces "বাংলা" with a
 *    Bengali voice even while `<html lang="en">`.
 */

import React from 'react';
import { useI18n } from '../../hooks/useI18n';

export interface LanguageToggleProps {
  className?: string;
  /** `compact` renders a single button; `switch` renders both labels. */
  variant?: 'compact' | 'switch';
}

export const LanguageToggle: React.FC<LanguageToggleProps> = ({
  className = '',
  variant = 'compact',
}) => {
  const { language, setLanguage, toggleLanguage, t } = useI18n();
  const bengaliActive = language === 'bn';

  if (variant === 'switch') {
    return (
      <div
        className={`inline-flex items-center rounded-xl border border-slate-300 bg-white p-0.5 text-xs font-semibold ${className}`}
        role="group"
        aria-label={t('common.language')}
      >
        <button
          type="button"
          onClick={() => setLanguage('en')}
          aria-pressed={!bengaliActive}
          className={`px-2.5 py-1 rounded-lg transition-colors ${
            !bengaliActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span lang="en">{t('common.english')}</span>
        </button>
        <button
          type="button"
          onClick={() => setLanguage('bn')}
          aria-pressed={bengaliActive}
          className={`px-2.5 py-1 rounded-lg transition-colors ${
            bengaliActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span lang="bn">{t('common.bengali')}</span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      aria-pressed={bengaliActive}
      title={t('common.language')}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 ${className}`}
    >
      <span className="text-slate-500" aria-hidden="true">EN</span>
      <span className="text-slate-300" aria-hidden="true">/</span>
      <span lang="bn" className="text-slate-900">বাং</span>
      <span className="sr-only">
        {bengaliActive ? 'Switch to English' : 'বাংলায় দেখুন'}
      </span>
    </button>
  );
};

export default LanguageToggle;
