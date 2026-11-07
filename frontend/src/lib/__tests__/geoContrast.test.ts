import { APPLE_COLORS, APPLE_SEVERITY, contrastRatio } from '@hazardnet/design-system';
import { getVulnerabilityColor } from '../geo';

describe('vulnerability score ink', () => {
  test.each([
    [0.2, 'low'],
    [0.4, 'moderate'],
    [0.65, 'high'],
    [0.8, 'veryHigh'],
    [0.9, 'extreme'],
  ] as const)('uses the dark-surface severity value for score %s', (score, level) => {
    const color = getVulnerabilityColor(score, 'dark');

    expect(color).toBe(APPLE_SEVERITY[level].onDark);
    expect(contrastRatio(color, APPLE_COLORS.surfaceBlack)).toBeGreaterThanOrEqual(4.5);

    const rgb = [0, 2, 4].map((offset) => parseInt(color.slice(1 + offset, 3 + offset), 16));
    const tintedFill = `#${rgb.map((channel) => Math.round(channel * 0x22 / 255).toString(16).padStart(2, '0')).join('')}`;
    expect(contrastRatio(color, tintedFill)).toBeGreaterThanOrEqual(4.5);
  });

  test('keeps the light-surface palette as the default for existing callers', () => {
    expect(getVulnerabilityColor(0.2)).toBe(APPLE_SEVERITY.low.text);
  });
});
