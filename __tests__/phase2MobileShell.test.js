/**
 * Phase 2 Mobile Shell Verification Suite
 *
 * Verifies Expo React Native app configuration, App Store Audit compliance,
 * Google Play Store 48dp touch targets, and Material 3 Expressive mobile components.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getAppState } from '../apps/mobile/App';
import { ExpressiveBentoCard } from '../apps/mobile/src/components/ExpressiveBentoCard';
import { ExpressiveFloatingControlBar } from '../apps/mobile/src/components/ExpressiveFloatingControlBar';
import { ExpressiveBottomSheet } from '../apps/mobile/src/components/ExpressiveBottomSheet';

const APP_JSON_PATH = join(process.cwd(), 'apps/mobile/app.json');

describe('Phase 2 — Expo Mobile Shell & Manifest Configuration', () => {
  it('has valid Expo app.json manifest with required App Store & Play Store permissions', () => {
    expect(existsSync(APP_JSON_PATH)).toBe(true);
    const manifest = JSON.parse(readFileSync(APP_JSON_PATH, 'utf8'));

    expect(manifest.expo.name).toBe('HazardNet Mobile');
    expect(manifest.expo.ios.bundleIdentifier).toBe('live.hazardnet.mobile');
    expect(manifest.expo.android.package).toBe('live.hazardnet.mobile');
    expect(manifest.expo.android.targetSdkVersion).toBe(34); // Android 14 requirement

    // App Store Review Audit Checklist Requirements
    expect(manifest.expo.ios.infoPlist.NSLocationWhenInUseUsageDescription).toContain('HazardNet uses your location');
    expect(manifest.expo.ios.infoPlist.NSCameraUsageDescription).toContain('HazardNet uses your camera');
  });

  it('renders root App state cleanly using shared core and design tokens', () => {
    const appState = getAppState();
    expect(appState.appName).toBe('HazardNet Mobile');
    expect(appState.sampleDistrictData.risk).toBe('High');
    expect(appState.expressiveTouchFloor.googlePlayDp).toBe(48);
  });
});

describe('Phase 2 — Material 3 Expressive Mobile Primitives', () => {
  it('ExpressiveBentoCard enforces 48dp minimum hit targets and M3 surface shapes', () => {
    const card = ExpressiveBentoCard({
      title: 'Kurigram Flood Risk',
      value: '0.88',
      severityScore: 0.88,
      expressiveShape: 'semiExpressive',
    });

    expect(card.type).toBe('BentoCard');
    expect(card.props.minHitHeight).toBe(48);
    expect(card.props.borderRadius).toBe(16);
    expect(card.props.severityLabel).toBe('Extreme Critical');
  });

  it('ExpressiveFloatingControlBar enforces 48dp touch heights and pill radius', () => {
    const controlBar = ExpressiveFloatingControlBar({
      searchValue: 'Kurigram',
      placeholder: 'Search districts...',
    });

    expect(controlBar.type).toBe('FloatingControlBar');
    expect(controlBar.props.targetHeight).toBe(48);
    expect(controlBar.props.pillRadius).toBe(9999);
  });

  it('ExpressiveBottomSheet enforces 28dp top radius and 48dp handle area', () => {
    const sheet = ExpressiveBottomSheet({
      isOpen: true,
      onClose: () => {},
      title: 'Telemetry Context',
    });

    expect(sheet.type).toBe('BottomSheet');
    expect(sheet.props.topRadius).toBe(28);
    expect(sheet.props.handleTouchArea).toBe(48);
  });
});
