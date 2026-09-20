import fs from 'fs';
import path from 'path';

/**
 * Phase 5 source contracts for the district brief (§14.6).
 * Rendering the 2.6k-line page in jsdom is out of scope here; the honesty
 * rules (no fake sparkline, no Compound Vulnerability series, HTML print
 * primary, no glass sticky) are enforced against the source.
 */
describe('DistrictDetailPage Phase 5 contracts', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'DistrictDetailPage.tsx'),
    'utf8',
  );

  it('does not invent a 24-hour telemetry sparkline', () => {
    expect(source).not.toMatch(/telemetryTrendData/);
    expect(source).toMatch(/not recorded for this district/);
  });

  it('withholds Compound Vulnerability as a chart series', () => {
    expect(source).not.toMatch(/dataKey=["']Compound Vulnerability["']/);
  });

  it('offers HTML print as the primary export', () => {
    expect(source).toMatch(/window\.print\(\)/);
    expect(source).toMatch(/Print brief/);
  });

  it('uses an opaque sticky subnav without glass', () => {
    expect(source).not.toMatch(/backdrop-blur/);
    expect(source).toMatch(/z-\[var\(--z-sticky\)\]/);
  });

  it('does not nest a second main landmark', () => {
    expect(source).not.toMatch(/<main[\s>]/);
  });

  it('does not use sub-12px type or 2xl/3xl card radii', () => {
    expect(source).not.toMatch(/text-\[(?:8|9|10|11)px\]/);
    expect(source).not.toMatch(/rounded-(?:2xl|3xl)/);
  });
});
