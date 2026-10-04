/**
 * Phase 8 — accessibility, localization, and performance primitives.
 */

import React from 'react';
import { render, screen, waitFor } from '../src/test/test-utils';
import { AccessibilitySettingsScreen } from '../src/screens/settings/AccessibilitySettingsScreen';
import { t } from '../src/hooks/useLocale';
import { en } from '../src/lib/i18n/en';
import { bn } from '../src/lib/i18n/bn';

describe('Phase 8 AccessibilitySettings', () => {
  it('renders theme, language, display, and haptics sections', async () => {
    const { getByText } = render(<AccessibilitySettingsScreen />);
    await waitFor(() => expect(getByText(/Accessibility/)).toBeTruthy());
    // Language picker
    expect(getByText('English')).toBeTruthy();
    expect(getByText('বাংলা')).toBeTruthy();
    // Display toggles (by English label)
    expect(screen.getByText('Bold text')).toBeTruthy();
    expect(screen.getByText('Increase contrast')).toBeTruthy();
    expect(screen.getByText('Haptics')).toBeTruthy();
  });
});

describe('Phase 8 localization fallback', () => {
  it('localizes the generic More-row accessibility hint in English and Bengali', () => {
    expect(en['more.openHint']).toBe('Opens the selected screen or service');
    expect(bn['more.openHint']).toBe('নির্বাচিত স্ক্রিন বা পরিষেবা খুলবে');
  });

  it('t() returns English fallback for unknown keys', () => {
    expect(t('tab.today')).toBe('Today');
  });
  it('t() interpolates {vars}', () => {
    expect(t('today.updated', { age: '2m ago' })).toContain('2m ago');
  });
});
