import { HDS_TOKENS, getSeverityTokenScore } from '../frontend/src/design-system/tokens';

describe('HazardNet Design System (HDS v2.2) Tokens & Parity Contract', () => {
  test('HDS_TOKENS exposes mandatory brand metadata', () => {
    expect(HDS_TOKENS.brand.name).toBe('HazardNet');
    expect(HDS_TOKENS.brand.version).toBe('2.2.0');
  });

  test('Touch target sizes satisfy 44px WCAG AAA / Apple HIG minimums', () => {
    expect(HDS_TOKENS.touch.minTargetSize).toBeGreaterThanOrEqual(44);
    expect(HDS_TOKENS.touch.fabSize).toBe(60);
    expect(HDS_TOKENS.touch.fabIconSize).toBe(32);
  });

  test('Primary red shade and NASA blue satisfy contrast tokens', () => {
    expect(HDS_TOKENS.colors.primaryRedShade).toBe('#b60109');
    expect(HDS_TOKENS.colors.nasaBlueShade).toBe('#0b3b95');
    expect(HDS_TOKENS.colors.inkPrimary).toBe('#17171b');
  });

  test('Multi-hazard severity scale contains all 5 agricultural levels', () => {
    const severity = HDS_TOKENS.colors.severity;
    expect(severity.low).toBeDefined();
    expect(severity.moderate).toBeDefined();
    expect(severity.high).toBeDefined();
    expect(severity.veryHigh).toBeDefined();
    expect(severity.extreme).toBeDefined();
  });

  test('getSeverityTokenScore returns appropriate token for scores', () => {
    expect(getSeverityTokenScore(0.95)).toEqual(HDS_TOKENS.colors.severity.extreme);
    expect(getSeverityTokenScore(0.75)).toEqual(HDS_TOKENS.colors.severity.veryHigh);
    expect(getSeverityTokenScore(0.55)).toEqual(HDS_TOKENS.colors.severity.high);
    expect(getSeverityTokenScore(0.35)).toEqual(HDS_TOKENS.colors.severity.moderate);
    expect(getSeverityTokenScore(0.15)).toEqual(HDS_TOKENS.colors.severity.low);
  });

  test('Bilingual typography stack includes Bengali line height safety floor', () => {
    expect(HDS_TOKENS.typography.lineHeights.bengali).toBeGreaterThanOrEqual(1.3);
    expect(HDS_TOKENS.typography.families.bengali).toContain('Noto Sans Bengali');
  });
});
