/**
 * Phase 4 — E2E Migration Audit Verification Suite
 *
 * Verifies App Store Review Guidelines compliance, Google Play Store Quality requirements,
 * React Native for Windows (RNW) configuration, and workspace monorepo dependencies.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { M3_EXPRESSIVE_TOKENS } from '@hazardnet/design-system';

const APP_JSON_PATH = join(process.cwd(), 'apps/mobile/app.json');
const WIN_PKG_PATH = join(process.cwd(), 'apps/windows/package.json');
const ROOT_PKG_PATH = join(process.cwd(), 'package.json');

describe('Phase 4 — End-to-End Migration Readiness & Standards Audit', () => {
  it('verifies App Store Review Guidelines compliance (Audit Skill)', () => {
    expect(existsSync(APP_JSON_PATH)).toBe(true);
    const appJson = JSON.parse(readFileSync(APP_JSON_PATH, 'utf8'));

    // App Store Review Guideline 5.1.1 (Data Collection & Privacy)
    expect(appJson.expo.ios.infoPlist.NSLocationWhenInUseUsageDescription).toBeDefined();
    expect(appJson.expo.ios.infoPlist.NSLocationWhenInUseUsageDescription.length).toBeGreaterThan(20);

    // App Store Review Guideline 2.1 (Performance & Stability Bundle ID)
    expect(appJson.expo.ios.bundleIdentifier).toMatch(/^[a-zA-Z0-9.-]+$/);
  });

  it('verifies Google Play Store Quality Requirements (Playstore Toolkit)', () => {
    const appJson = JSON.parse(readFileSync(APP_JSON_PATH, 'utf8'));

    // Google Play Target API Level Requirement (Android 14 / API 34+)
    expect(appJson.expo.android.targetSdkVersion).toBeGreaterThanOrEqual(34);
    expect(appJson.expo.android.package).toBe('live.hazardnet.mobile');

    // Material 3 Touch Target Floor (48dp x 48dp)
    expect(M3_EXPRESSIVE_TOKENS.touchTargetFloor.googlePlayDp).toBe(48);
  });

  it('verifies Windows Desktop (RNW) WinUI 3 Configuration', () => {
    expect(existsSync(WIN_PKG_PATH)).toBe(true);
    const winPkg = JSON.parse(readFileSync(WIN_PKG_PATH, 'utf8'));

    expect(winPkg.name).toBe('@hazardnet/windows');
    expect(winPkg.dependencies['react-native-windows']).toBeDefined();
  });

  it('verifies Monorepo Workspace Package Dependencies', () => {
    const rootPkg = JSON.parse(readFileSync(ROOT_PKG_PATH, 'utf8'));

    expect(rootPkg.workspaces).toContain('packages/*');
    expect(rootPkg.workspaces).toContain('apps/*');
  });
});
