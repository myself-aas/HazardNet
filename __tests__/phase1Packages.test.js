/**
 * Phase 1 Execution Verification: Decoupled Workspace Packages
 *
 * Verifies that `@hazardnet/design-system` and `@hazardnet/core` packages
 * are properly structured, export required HDS v2.2 tokens, Material 3 Expressive
 * specs, and platform-agnostic forecast/alert contracts.
 */

import { HDS_TOKENS, M3_EXPRESSIVE_TOKENS, getSeverityTokenScore } from '../packages/design-system/src/index';
import { FORECAST_HORIZONS, severityBin, confidenceBin, canonicalKey } from '../packages/core/src/index';

describe('Phase 1 Workspace Decoupling — @hazardnet/design-system', () => {
  it('exports HDS_TOKENS with density-independent geometry & touch ergonomics', () => {
    expect(HDS_TOKENS.brand.name).toBe('HazardNet');
    expect(HDS_TOKENS.touch.minTargetSize).toBe(44);
    expect(HDS_TOKENS.touch.minTargetSizeAndroid).toBe(48);
    expect(HDS_TOKENS.touch.fabSize).toBe(60);
    expect(HDS_TOKENS.radii.sheet).toBe(28);
  });

  it('exports Material 3 Expressive design tokens', () => {
    expect(M3_EXPRESSIVE_TOKENS.version).toBe('3.0.0-expressive');
    expect(M3_EXPRESSIVE_TOKENS.containerShape.fullExpressive).toBe(28);
    expect(M3_EXPRESSIVE_TOKENS.touchTargetFloor.googlePlayDp).toBe(48);
    expect(M3_EXPRESSIVE_TOKENS.hapticProfiles.hazardAlert).toBe('heavy');
  });

  it('maps severity scores correctly', () => {
    expect(getSeverityTokenScore(0.90).label).toBe('Extreme Critical');
    expect(getSeverityTokenScore(0.10).label).toBe('Low / Normal');
  });
});

describe('Phase 1 Workspace Decoupling — @hazardnet/core', () => {
  it('exports forecast horizons and binning utilities', () => {
    expect(FORECAST_HORIZONS).toEqual(['7_days', '15_days']);
    expect(severityBin(0.85)).toBe('High');
    expect(confidenceBin(0.90)).toBe('Certain');
  });

  it('canonicalizes district name aliases', () => {
    expect(canonicalKey('Jessore')).toBe('jashore');
    expect(canonicalKey('Chittagong')).toBe('chattogram');
  });
});
