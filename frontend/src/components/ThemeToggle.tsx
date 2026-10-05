/**
 * Appearance control — System / Light / Dark.
 *
 * The theme has followed `prefers-color-scheme` since Phase 9 (see
 * `components/apple/motion.ts`), which means a visitor whose OS is in dark mode gets the dark
 * theme and, until this control existed, no way to leave it: `App.tsx` called
 * `useAppleTheme()` and threw the return value away. That is where "why is everything black?"
 * came from on 2026-10-04 — the honest answer is "your OS says so, and the app never asked".
 *
 * Three states, not two: `system` is a real answer (follow the OS, live), and dropping it would
 * strand the visitors who *want* the evening switch. It is a segmented control rather than a
 * select because there are three options and they are one tap each.
 *
 * Accessible the same way `LanguageToggle` is: `role="group"` with a label, `aria-pressed` on
 * each option so a screen reader reports the current state rather than just three words.
 */

import React from 'react';
import { useI18n } from '../hooks/useI18n';
import type { AppleThemeName } from './apple/motion';

export interface ThemeToggleProps {
  /** The current preference, including `system`. */
  theme: AppleThemeName;
  onChange: (theme: AppleThemeName) => void;
  className?: string;
}

/** The options, in the order they are offered: the default first, then each fixed choice. */
const OPTIONS: { value: AppleThemeName; labelKey: string }[] = [
  { value: 'system', labelKey: 'common.themeSystem' },
  { value: 'light', labelKey: 'common.themeLight' },
  { value: 'dark', labelKey: 'common.themeDark' },
];

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onChange, className = '' }) => {
  const { t } = useI18n();

  return (
    <div
      className={`inline-flex items-center rounded-xl border border-carbon-30 bg-white p-0.5 text-xs font-semibold ${className}`}
      role="group"
      aria-label={t('common.appearance')}
      data-testid="theme-toggle"
    >
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            data-theme-option={option.value}
            className={`inline-flex min-h-[44px] min-w-[44px] flex-1 items-center justify-center rounded-lg px-3 py-2 transition-colors touch-manipulation ${
              active ? 'bg-carbon-90 text-ap-on-inverse' : 'text-carbon-70 hover:bg-carbon-10'
            }`}
          >
            {t(option.labelKey)}
          </button>
        );
      })}
    </div>
  );
};

export default ThemeToggle;
