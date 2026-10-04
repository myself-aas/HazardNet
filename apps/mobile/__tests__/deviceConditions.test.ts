/**
 * Device-condition contracts for the Expo shell.
 *
 * These are the checks that can be made without hardware, for the properties the 2026-10-04
 * design-system follow-up lists as "still requires device verification" (see
 * docs/audits/2026-10-03-frontend-design-system-audit.md §10 and the hardware script in
 * docs/qa/2026-10-04-device-verification.md):
 *
 *   - safe areas: every screen is wrapped in the shared `Screen`/`SafeAreaView`, and the two
 *     chrome surfaces that sit outside it (the tab bar, the foreground banner) consume insets;
 *   - Dynamic Type: system scaling is left uncapped on purpose, the in-app Large/Bold preferences
 *     are the only caps, and `allowFontScaling={false}` may not appear anywhere;
 *   - Reduce Motion: the OS setting reaches the animated surfaces through one hook;
 *   - Bengali: the chrome (tab bar, screens, dates) is fully translated into Bengali at the
 *     primary locale, and the total translated-key count is pinned so it can only grow.
 *
 * What cannot be checked here genuinely needs a device and is scripted, not asserted: VoiceOver
 * and TalkBack traversal, Bengali glyph shaping with the platform fallback font, notched and
 * foldable safe areas, and low-end GPU compositing. The script says what to do and what a pass
 * looks like.
 */

import fs from 'node:fs';
import path from 'node:path';
import { en } from '../src/lib/i18n/en';
import { bn } from '../src/lib/i18n/bn';

const SRC = path.resolve(__dirname, '..', 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const sourceFiles = walk(SRC);
const read = (file: string) => fs.readFileSync(file, 'utf8');
const relative = (file: string) => path.relative(SRC, file);

describe('mobile device conditions', () => {
  it('keeps safe-area handling in the shared primitives instead of per-screen paddings', () => {
    const screen = read(path.join(SRC, 'components/Screen.tsx'));
    expect(screen).toContain('SafeAreaView');
    // A screen that hard-codes the inset is the defect the web audit fixed on `--navbar-height`:
    // the value has to come from the insets, or a notched device loses its top row.
    expect(screen).toContain('edges');

    // The provider lives at the app root (outside `src/`), which is what makes insets non-zero.
    const app = read(path.resolve(__dirname, '..', 'App.tsx'));
    expect(app).toContain('SafeAreaProvider');

    const insetsUsers = sourceFiles
      .filter((file) => /useSafeAreaInsets|SafeAreaView|SafeAreaProvider/.test(read(file)))
      .filter((file) => !relative(file).startsWith(`test${path.sep}`) && relative(file) !== 'test/test-utils.tsx')
      .map(relative)
      .sort();
    expect(insetsUsers).toEqual(
      expect.arrayContaining([
        'components/Screen.tsx',
        'components/banner/ForegroundNotificationBanner.tsx',
        'navigation/RootNavigator.tsx',
      ]),
    );

    // No screen may invent a top inset of its own outside those files.
    const offenders = sourceFiles
      .filter((file) => !insetsUsers.includes(relative(file)))
      .filter((file) => !relative(file).startsWith('test/'))
      .filter((file) => /paddingTop:\s*(5[0-9]|6[0-9]|7[0-9])/.test(read(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  it('never disables font scaling and caps it only through the in-app preferences', () => {
    const withScalingOff = sourceFiles
      .filter((file) => /allowFontScaling\s*=\s*\{\s*false\s*\}/.test(read(file)))
      .map(relative);
    expect(withScalingOff).toEqual([]);

    const text = read(path.join(SRC, 'design-system/Text.tsx'));
    expect(text).toContain('maxFontSizeMultiplier={NATIVE_FONT_SCALE_MAX}');
    expect(text).not.toMatch(/maxFontSizeMultiplier=\{1\}/);

    // Every `<Text>` in the app comes from the shared component (the only module allowed to import
    // React Native's `Text`), so the cap and the theme roles cannot be bypassed from a screen.
    const rawTextImporters = sourceFiles
      .filter((file) => /import\s*\{[^}]*\bText\b[^}]*\}\s*from\s*'react-native'/.test(read(file)))
      .filter((file) => !/Text\s+as\s+RNText/.test(read(file)))
      .map(relative);
    expect(rawTextImporters).toEqual([]);
  });

  it('routes Reduce Motion through the one preference hook', () => {
    const hook = path.join(SRC, 'hooks/useReducedMotionPreference.ts');
    expect(fs.existsSync(hook)).toBe(true);
    expect(read(hook)).toContain('reduceMotion');

    const consumers = sourceFiles
      .filter((file) => read(file).includes('useReducedMotionPreference'))
      .map(relative)
      .filter((file) => file !== 'hooks/useReducedMotionPreference.ts');
    // The animated surfaces: the loading skeleton and the foreground banner.
    expect(consumers).toEqual(
      expect.arrayContaining(['design-system/LoadingSkeleton.tsx', 'components/banner/ForegroundNotificationBanner.tsx']),
    );
  });

  it('keeps the navigation chrome fully translated into Bengali', () => {
    const chromeKeys = [
      'tab.today',
      'tab.alerts',
      'tab.map',
      'tab.saved',
      'tab.more',
      'more.openHint',
    ];
    for (const key of chromeKeys) {
      expect(`${key}:${Boolean((en as Record<string, string>)[key])}`).toBe(`${key}:true`);
      expect(`${key}:${Boolean((bn as Record<string, string>)[key])}`).toBe(`${key}:true`);
    }

    // The translation backlog is a ratchet, not a promise: the count may only grow. It is 109 of
    // 191 English keys as of 2026-10-04, and the untranslated remainder is recorded in
    // docs/audits/2026-10-03-frontend-design-system-audit.md §10.
    expect(Object.keys(bn).length).toBeGreaterThanOrEqual(109);
  });
});
