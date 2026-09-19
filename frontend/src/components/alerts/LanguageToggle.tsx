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

/**
 * Colour tokens per surface.
 *
 * The alerts/map surfaces were built on the slate palette and keep it; the editorial front
 * door uses the NASA HDS tokens (`carbon-*`, `nasa-*`) that `docs/PUBLIC_SURFACE.md` and the
 * rest of `/` are written in. Rather than fork a second toggle — two implementations of the
 * same `aria-pressed` logic is exactly how a control drifts out of one of them — the palette
 * is a prop, and the *behaviour* stays in one place.
 */
const TONES = {
  slate: {
    wrapper: 'rounded-xl border border-carbon-30 bg-white p-0.5',
    button: 'rounded-lg',
    active: 'bg-carbon-90 text-white',
    idle: 'text-carbon-70 hover:bg-carbon-10',
  },
  hds: {
    wrapper: 'rounded-none border border-carbon-20 bg-white p-0.5',
    button: 'rounded-none',
    active: 'bg-carbon-90 text-white',
    idle: 'text-carbon-70 hover:bg-carbon-05',
  },
} as const;

export interface LanguageToggleProps {
  className?: string;
  /** `compact` renders a single button; `switch` renders both labels. */
  variant?: 'compact' | 'switch';
  /** Palette of the surface it sits on. Defaults to the alerts/map slate palette. */
  tone?: keyof typeof TONES;
}

export const LanguageToggle: React.FC<LanguageToggleProps> = ({
  className = '',
  variant = 'compact',
  tone = 'slate',
}) => {
  const { language, setLanguage, toggleLanguage, t } = useI18n();
  const bengaliActive = language === 'bn';
  const palette = TONES[tone];

  if (variant === 'switch') {
    return (
      <div
        className={`inline-flex items-center ${palette.wrapper} text-xs font-semibold ${className}`}
        role="group"
        aria-label={t('common.language')}
      >
        <button
          type="button"
          onClick={() => setLanguage('en')}
          aria-pressed={!bengaliActive}
          className={`px-2.5 py-1 transition-colors ${palette.button} ${
            !bengaliActive ? palette.active : palette.idle
          }`}
        >
          <span lang="en">{t('common.english')}</span>
        </button>
        <button
          type="button"
          onClick={() => setLanguage('bn')}
          aria-pressed={bengaliActive}
          className={`px-2.5 py-1 transition-colors ${palette.button} ${bengaliActive ? palette.active : palette.idle}`}
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
      className={`inline-flex items-center gap-1.5 rounded-lg border border-carbon-30 bg-white px-2.5 py-1.5 text-xs font-bold text-carbon-80 hover:bg-carbon-05 ${className}`}
    >
      <span className="text-carbon-60" aria-hidden="true">
        EN
      </span>
      <span className="text-carbon-30" aria-hidden="true">
        /
      </span>
      <span lang="bn" className="text-carbon-90">
        বাং
      </span>
      <span className="sr-only">{bengaliActive ? 'Switch to English' : 'বাংলায় দেখুন'}</span>
    </button>
  );
};

export default LanguageToggle;
