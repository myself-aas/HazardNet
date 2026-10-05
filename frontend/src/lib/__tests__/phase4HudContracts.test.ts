import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const files = {
  liveMap: readFileSync(join(__dirname, '../../components/LiveMapView.tsx'), 'utf8'),
  toolbar: readFileSync(join(__dirname, '../../components/map/MapToolbar.tsx'), 'utf8'),
  table: readFileSync(join(__dirname, '../../components/map/MapDistrictTable.tsx'), 'utf8'),
};

describe('Phase 4 HUD contracts (LiveMapView + extracted map modules)', () => {
  it('does not use glass chrome on the map HUD', () => {
    for (const source of Object.values(files)) {
      expect(source).not.toMatch(/backdrop-blur/);
    }
  });

  it('does not use sub-12px HUD type', () => {
    for (const source of Object.values(files)) {
      expect(source).not.toMatch(/text-\[(?:9|10|11)px\]/);
    }
  });

  it('keeps 44px toolbar, table rows, and map control targets', () => {
    expect(files.toolbar).toMatch(/min-h-\[44px\]/);
    expect(files.table).toMatch(/min-h-\[44px\]/);
    expect(files.liveMap).toMatch(/min-h-\[44px\]/);
    expect(files.liveMap).toMatch(/tap-target w-11 h-11/);
  });

  it('extracts toolbar and table into map/ and keeps Leaflet mounted on table mode', () => {
    expect(files.liveMap).toMatch(/from '\.\/map\/MapToolbar'/);
    expect(files.liveMap).toMatch(/from '\.\/map\/MapDistrictTable'/);
    expect(files.liveMap).toMatch(/viewMode === 'table' \? 'hidden'/);
    expect(files.liveMap).toMatch(/invalidateSize/);
    expect(files.table).toMatch(/<caption/);
  });
});
