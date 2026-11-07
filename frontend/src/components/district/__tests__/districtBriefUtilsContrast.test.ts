import { APPLE_COLORS, APPLE_SEVERITY, contrastRatio } from '@hazardnet/design-system';
import { getRiskColor } from '../districtBriefUtils';

describe('district brief severity badge ink', () => {
  test.each([
    ['Low', 'low', 'low'],
    ['Moderate', 'moderate', 'moderate'],
    ['High', 'veryHigh', 'very-high'],
  ] as const)('pairs the %s fill with theme-aware severity ink', (risk, level, token) => {
    const { badge } = getRiskColor(risk);
    expect(badge).toContain(`bg-[var(--ap-sev-${token})]`);
    expect(badge).toContain('text-ap-on-sev');

    expect(contrastRatio(APPLE_COLORS.onPrimary, APPLE_SEVERITY[level].text)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(APPLE_COLORS.surfaceBlack, APPLE_SEVERITY[level].onDark)).toBeGreaterThanOrEqual(4.5);
  });
});
