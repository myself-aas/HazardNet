import { APPLE_HAZARD } from '@hazardnet/design-system';
import { getHazardBorder, getHazardColor, getHazardSurface } from '../hazardPalette';

describe('HazardNet hazard identity palette', () => {
  it('resolves every label and slug onto the Apple hazard identity layer', () => {
    expect(getHazardColor('Tropical Cyclone')).toBe('var(--ap-haz-cyclone)');
    expect(getHazardColor('cyclone')).toBe('var(--ap-haz-cyclone)');
    expect(getHazardColor('Flood')).toBe('var(--ap-haz-flood)');
    expect(getHazardColor('Monsoon Flood')).toBe('var(--ap-haz-flood)');
    expect(getHazardColor('Flash Flood')).toBe('var(--ap-haz-flash-flood)');
    expect(getHazardColor('severe_local_storm')).toBe('var(--ap-haz-storm)');
    expect(getHazardColor('Drought')).toBe('var(--ap-haz-drought)');
    expect(getHazardColor('Cold Wave')).toBe('var(--ap-haz-cold-wave)');
    expect(getHazardColor('Heat Wave')).toBe('var(--ap-haz-heat-wave)');
    expect(getHazardColor('Fire')).toBe('var(--ap-haz-fire)');
  });

  it('never paints hazard identity from the severity ramp or the chrome accent', () => {
    // The bug this replaced: identity was drawn from severity, so a flood was
    // the chrome blue and a drought was extreme-severity red no matter how
    // severe either actually was. Severity is ordinal, identity is categorical;
    // a reader cannot tell which question a colour is answering if both use the
    // same hues.
    const labels = [
      'Flood', 'Monsoon Flood', 'Flash Flood', 'Tropical Cyclone', 'Cyclone',
      'Drought', 'Heat Wave', 'Cold Wave', 'Severe Local Storm', 'Fire', 'Lightning',
    ];
    for (const label of labels) {
      expect(getHazardColor(label)).toMatch(/^var\(--ap-haz-[a-z-]+\)$/);
    }
  });

  it('keeps the categories distinguishable instead of collapsing them', () => {
    // Eleven keys used to resolve to five colours, with four hazards sharing
    // one blue. Distinct hazards must stay distinct, or the encoding is decor.
    const distinct = ['Flood', 'Flash Flood', 'Tropical Cyclone', 'Drought',
                      'Heat Wave', 'Cold Wave', 'Severe Storm', 'Fire'];
    const colours = distinct.map(getHazardColor);
    expect(new Set(colours).size).toBe(distinct.length);
    expect(colours).toHaveLength(Object.keys(APPLE_HAZARD).length);
  });

  it('treats synonyms of one hazard as the same encoding', () => {
    expect(getHazardColor('Heatwave')).toBe(getHazardColor('Heat Wave'));
    expect(getHazardColor('Wildfire')).toBe(getHazardColor('Fire'));
    expect(getHazardColor('Riverine Flood')).toBe(getHazardColor('Flood'));
    expect(getHazardColor('Storm Surge')).toBe(getHazardColor('Tropical Cyclone'));
  });

  it('uses a calm neutral for hazards outside the documented climatic set', () => {
    // Earthquake is geophysical. Borrowing a climatic hue would imply a kinship
    // that is not there, so it falls back like any unrecognised label.
    expect(getHazardColor('Earthquake')).toBe('var(--ap-label-secondary)');
    expect(getHazardColor('Uncatalogued event')).toBe('var(--ap-label-secondary)');
    expect(getHazardColor(null)).toBe('var(--ap-label-secondary)');
  });

  it('derives quiet, bounded surfaces and borders from the same identity token', () => {
    expect(getHazardSurface('Flood')).toBe(
      'color-mix(in srgb, var(--ap-haz-flood) 8%, var(--ap-bg-canvas))',
    );
    expect(getHazardSurface('Flood', 140)).toContain('100%');
    expect(getHazardSurface('Flood', -12)).toContain('0%');
    expect(getHazardBorder('Fire', 32)).toBe(
      'color-mix(in srgb, var(--ap-haz-fire) 32%, var(--ap-separator))',
    );
  });
});
