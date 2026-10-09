import fs from 'fs';
import path from 'path';

/**
 * Phase 5 source contracts for the district brief (§14.6).
 * Rendering the 2.6k-line page in jsdom is out of scope here; the honesty
 * rules (no fake sparkline, no Compound Vulnerability series, HTML print
 * primary, no glass sticky) are enforced against the page plus extracted
 * `components/district/` modules.
 */
describe('DistrictDetailPage Phase 5 contracts', () => {
  const pagePath = path.join(__dirname, '..', 'DistrictDetailPage.tsx');
  const page = fs.readFileSync(pagePath, 'utf8');
  const districtDir = path.join(__dirname, '..', '..', 'components', 'district');
  const extracted = fs
    .readdirSync(districtDir)
    .filter((name) => name.endsWith('.tsx') || name.endsWith('.ts'))
    .map((name) => fs.readFileSync(path.join(districtDir, name), 'utf8'))
    .join('\n');
  const source = `${page}\n${extracted}`;
  const districtOutlook = fs.readFileSync(path.join(districtDir, 'DistrictOutlookCard.tsx'), 'utf8');
  const body = fs.readFileSync(path.join(districtDir, 'DistrictBriefBody.tsx'), 'utf8');

  it('does not invent a 24-hour telemetry sparkline', () => {
    expect(source).not.toMatch(/telemetryTrendData/);
    expect(source).not.toMatch(/24-hour gauge trend/);
  });

  it('does not render synthesised exposure figures', () => {
    expect(source).not.toMatch(/getGranularDisasterData|data\/disasterDetails/);
    expect(source).not.toMatch(/affectedPopulation|affectedHouseholds|affectedCropLandHectares|reliefDistributedTons|activeShelters|medicalTeamsDeployed/);
    expect(source).toMatch(/Not available/);
  });

  it('carries no claim of official status or of an issued dispatch', () => {
    expect(source).not.toMatch(/MoDMR|PKI Verified|DISPATCH ID|OFFICIAL USE ONLY|SOD 2019/);
    expect(source).not.toMatch(/handleTriggerDispatch|Betar|SMS queued|Emergency SOPs transmitted/);
  });

  it('keeps the authority boundary on the outlook and at the end of the brief', () => {
    expect(districtOutlook).toMatch(/not an official warning service/i);
    expect(districtOutlook).toMatch(/999/);
    expect(body).toMatch(/not an official warning service/i);
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
    expect(source).toMatch(/z-\[var\(--ap-z-sticky\)\]/);
  });

  it('does not nest a second main landmark', () => {
    expect(source).not.toMatch(/<main[\s>]/);
  });

  it('does not use sub-12px type or 2xl/3xl card radii', () => {
    expect(source).not.toMatch(/text-\[(?:8|9|10|11)px\]/);
    expect(source).not.toMatch(/rounded-(?:2xl|3xl)/);
  });

  it('places the stored outlook before the CSV forecast table', () => {
    const outlook = page.indexOf('<DistrictOutlookCard');
    const table = page.indexOf('<DistrictForecastRecords');
    expect(outlook).toBeGreaterThan(-1);
    expect(table).toBeGreaterThan(-1);
    expect(outlook).toBeLessThan(table);
  });


});
