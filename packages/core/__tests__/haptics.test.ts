/**
 * Unit tests for haptic profiles.
 */

import { hapticForAlert, HAPTIC_PROFILES } from '../src/haptics';

describe('hapticForAlert', () => {
  it('maps each alert level to the correct haptic intent', () => {
    expect(hapticForAlert('NO_ALERT')).toBe('none');
    expect(hapticForAlert('WATCH')).toBe('selection');
    expect(hapticForAlert('WARNING')).toBe('warning');
    expect(hapticForAlert('SEVERE')).toBe('critical');
  });
});

describe('HAPTIC_PROFILES', () => {
  it('provides valid iOS and Android mappings for every intent', () => {
    for (const [name, profile] of Object.entries(HAPTIC_PROFILES)) {
      expect(['none', 'selection', 'confirmation', 'warning', 'error', 'critical', 'sheetSnap']).toContain(name);
      expect(profile.ios.type).toBeDefined();
      expect(profile.android.type).toBeDefined();
    }
  });
});
