import { getHazardBorder, getHazardColor, getHazardSurface } from '../hazardPalette';

describe('HazardNet semantic hazard palette', () => {
  it('maps common labels and slugs to a restrained set of existing brand/status tokens', () => {
    expect(getHazardColor('Tropical Cyclone')).toBe('var(--chart-1)');
    expect(getHazardColor('cyclone')).toBe('var(--chart-1)');
    expect(getHazardColor('Flood')).toBe('var(--chart-1)');
    expect(getHazardColor('Flash Flood')).toBe('var(--chart-3)');
    expect(getHazardColor('severe_local_storm')).toBe('var(--chart-2)');
    expect(getHazardColor('Drought')).toBe('var(--chart-5)');
    expect(getHazardColor('Cold Wave')).toBe('var(--chart-3)');
    expect(getHazardColor('Heat Wave')).toBe('var(--chart-2)');
    expect(getHazardColor('Earthquake')).toBe('var(--chart-4)');
    expect(getHazardColor('Fire')).toBe('var(--chart-2)');
  });

  it('uses a calm neutral for an unknown hazard rather than inventing a new color', () => {
    expect(getHazardColor('Uncatalogued event')).toBe('var(--ap-label-secondary)');
    expect(getHazardColor(null)).toBe('var(--ap-label-secondary)');
  });

  it('derives quiet, bounded surfaces and borders from the same semantic token', () => {
    expect(getHazardSurface('Flood')).toBe(
      'color-mix(in srgb, var(--chart-1) 8%, var(--ap-bg-canvas))',
    );
    expect(getHazardSurface('Flood', 140)).toContain('100%');
    expect(getHazardSurface('Flood', -12)).toContain('0%');
    expect(getHazardBorder('Fire', 32)).toBe(
      'color-mix(in srgb, var(--chart-2) 32%, var(--ap-separator))',
    );
  });
});
