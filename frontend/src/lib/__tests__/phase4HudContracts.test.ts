import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const liveMap = readFileSync(
  join(__dirname, '../../components/LiveMapView.tsx'),
  'utf8',
);

describe('Phase 4 HUD contracts (LiveMapView)', () => {
  it('does not use glass chrome on the map HUD', () => {
    expect(liveMap).not.toMatch(/backdrop-blur/);
  });

  it('does not use sub-12px HUD type', () => {
    expect(liveMap).not.toMatch(/text-\[(?:9|10|11)px\]/);
  });

  it('keeps 44px toolbar and close targets', () => {
    expect(liveMap).toMatch(/min-h-\[44px\]/);
    expect(liveMap).toMatch(/tap-target w-11 h-11/);
  });

  it('skips optional radar tiles in low-bandwidth mode', () => {
    expect(liveMap).toMatch(/isRadarActive && !lowBandwidth/);
  });
});
