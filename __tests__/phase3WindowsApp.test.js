/**
 * Phase 3 — React Native for Windows (RNW) Verification Suite
 *
 * Verifies React Native for Windows (WinUI 3) configuration, desktop keyboard shortcuts,
 * master-detail pane layout parameters, and Windows Action Center notification hooks.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getWindowsAppState } from '../apps/windows/App.windows';
import { WindowsDesktopOverview } from '../apps/windows/src/components/WindowsDesktopOverview';

const WINDOWS_PKG_PATH = join(process.cwd(), 'apps/windows/package.json');

describe('Phase 3 — React Native for Windows (RNW) Configuration', () => {
  it('has valid apps/windows/package.json with react-native-windows dependency', () => {
    expect(existsSync(WINDOWS_PKG_PATH)).toBe(true);
    const pkg = JSON.parse(readFileSync(WINDOWS_PKG_PATH, 'utf8'));

    expect(pkg.name).toBe('@hazardnet/windows');
    expect(pkg.dependencies['react-native-windows']).toBeDefined();
    expect(pkg.scripts.windows).toBe('react-native run-windows');
  });

  it('renders Windows app state with WinUI 3 platform parameters', () => {
    const appState = getWindowsAppState();
    expect(appState.appName).toBe('HazardNet Windows Desktop');
    expect(appState.platform).toBe('React Native for Windows (WinUI 3)');
    expect(appState.expressiveTouchFloor.googlePlayDp).toBe(48);
  });
});

describe('Phase 3 — WinUI 3 Desktop Ergonomics & Components', () => {
  it('WindowsDesktopOverview provides master-detail layout and desktop keyboard shortcuts', () => {
    let printTriggered = false;
    let notificationTriggered = false;

    const desktop = WindowsDesktopOverview({
      selectedDistrict: 'Kurigram',
      onEmergencyPrint: () => { printTriggered = true; },
      onTriggerWindowsNotification: () => { notificationTriggered = true; },
    });

    expect(desktop.type).toBe('WindowsDesktopOverview');
    expect(desktop.props.masterPaneWidth).toBe(320);
    expect(desktop.props.keyboardShortcuts).toContainEqual({
      key: 'Ctrl+P',
      action: 'Generate WinUI 3 A4 Emergency Directive PDF',
    });

    desktop.props.handlePrint();
    expect(printTriggered).toBe(true);

    desktop.props.handleNotification();
    expect(notificationTriggered).toBe(true);
  });
});
