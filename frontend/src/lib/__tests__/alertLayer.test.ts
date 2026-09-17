/**
 * @jest-environment jsdom
 *
 * The alert layer is where the model's vocabulary meets the map's geometry, so the
 * tests here are about identity, not styling: the right district is keyed the right way,
 * several alerts for one district collapse to the most serious one, and the layer never
 * contains a district that has no published alert.
 */

import { buildAlertLevelLayer, districtSlugForUrl, districtsAtOrAbove } from '../alertLayer';
import type { AlertRecord } from '../alerts';

const alert = (over: Partial<AlertRecord> = {}): AlertRecord => ({
  id: 'x', state: 'PUBLISHED', level: 'WATCH', district_name: 'Sunamganj', district_id: 60,
  ...over,
});

describe('buildAlertLevelLayer', () => {
  it('keys districts by slug and keeps the highest level when several alerts exist', () => {
    const layer = buildAlertLevelLayer([
      alert({ id: 'a', level: 'WATCH' }),
      alert({ id: 'b', level: 'WARNING', hazard_type: 'Flood' }),
      alert({ id: 'c', level: 'NO_ALERT', hazard_type: 'Drought' }),
    ]);
    expect(layer).toEqual({ sunamganj: 'WARNING' });
  });

  it('is order-independent (a lower level arriving last must not downgrade the map)', () => {
    const layer = buildAlertLevelLayer([
      alert({ id: 'a', level: 'SEVERE' }),
      alert({ id: 'b', level: 'WATCH' }),
    ]);
    expect(layer.sunamganj).toBe('SEVERE');
  });

  it("normalises punctuated names the same way the router does", () => {
    const layer = buildAlertLevelLayer([alert({ district_name: "Cox's Bazar" })]);
    expect(Object.keys(layer)).toEqual(['coxsbazar']);
    expect(districtSlugForUrl("Cox's Bazar")).toBe('coxsbazar');
  });

  it('falls back to the district id when a row has no name', () => {
    const layer = buildAlertLevelLayer([alert({ district_name: null, district_id: 46 })]);
    expect(layer).toEqual({ 46: 'WATCH' });
  });

  it('skips rows with neither a name nor an id instead of inventing a key', () => {
    expect(buildAlertLevelLayer([alert({ district_name: null, district_id: null })])).toEqual({});
    expect(buildAlertLevelLayer([])).toEqual({});
  });

  it('contains only districts that have an alert — a baseline district is absent, not green', () => {
    const layer = buildAlertLevelLayer([alert({ district_name: 'Kurigram' })]);
    expect('dhaka' in layer).toBe(false);
    expect(Object.keys(layer)).toEqual(['kurigram']);
  });
});

describe('districtsAtOrAbove', () => {
  it('filters by level floor, most serious first alphabetically', () => {
    const alerts = [
      alert({ id: '1', district_name: 'Barguna', level: 'WATCH' }),
      alert({ id: '2', district_name: 'Sylhet', level: 'SEVERE' }),
      alert({ id: '3', district_name: 'Khulna', level: 'WARNING' }),
    ];
    expect(districtsAtOrAbove(alerts, 'WARNING')).toEqual(['khulna', 'sylhet']);
    expect(districtsAtOrAbove(alerts, 'WATCH')).toEqual(['barguna', 'khulna', 'sylhet']);
  });
});

describe('districtSlugForUrl', () => {
  it('produces the slug the district route accepts', () => {
    expect(districtSlugForUrl('Sunamganj')).toBe('sunamganj');
    expect(districtSlugForUrl(null)).toBe('');
  });
});
