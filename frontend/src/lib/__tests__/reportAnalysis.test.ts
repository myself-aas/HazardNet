import { analyzeDailySnapshot } from '../reportAnalysis';
import type { DailyAdvisory, DailySnapshot } from '../reports';

const row = (overrides: Partial<DailyAdvisory> = {}): DailyAdvisory => ({
  district: 'Kurigram',
  division: 'Rangpur',
  hazard: 'Flood',
  targetDate: '2026-11-08',
  tier: 'WATCH',
  severityScore: 0.3,
  ...overrides,
});

const snapshot = (advisories: DailyAdvisory[], coverage?: Partial<DailySnapshot['coverage']>): DailySnapshot => ({
  run: { id: 'run-test', generatedAt: '2026-11-07T00:00:00.000Z', modelVersion: 'test' },
  coverage: { districts: 1, forecastDays: 1, publishedRows: advisories.length, ...coverage },
  advisories,
});

describe('daily report analysis', () => {
  it('computes exact descriptive summary statistics for the published rows', () => {
    const result = analyzeDailySnapshot(snapshot([
      row({ severityScore: 0 }),
      row({ severityScore: 0.25 }),
      row({ severityScore: 0.75 }),
      row({ severityScore: 1 }),
    ]));

    expect(result.severity).toMatchObject({
      rowCount: 4,
      validCount: 4,
      missingCount: 0,
      mean: 0.5,
      median: 0.5,
      min: 0,
      q1: 0.1875,
      q3: 0.8125,
      iqr: 0.625,
      max: 1,
      range: 1,
      distinctValues: 4,
      tukeyOutlierCount: 0,
    });
    expect(result.severity.populationStdDev).toBeCloseTo(Math.sqrt(0.15625));
    expect(result.severity.coefficientOfVariation).toBeCloseTo((Math.sqrt(0.15625) / 0.5) * 100);
    expect(result.severity.skewness).toBeCloseTo(0);
    expect(result.divisions[0].populationStdDev).toBeCloseTo(Math.sqrt(0.15625));
    expect(result.dates[0].median).toBe(0.5);
    expect(result.dates[0].populationStdDev).toBeCloseTo(Math.sqrt(0.15625));
    expect(result.severityHistogram.find((bin) => bin.name === '0.9–1.0')?.count).toBe(1);
  });

  it('treats repeated rows as a full descriptive population and does not invent variance', () => {
    const result = analyzeDailySnapshot(snapshot([
      row({ severityScore: 0.3, targetDate: '2026-11-08' }),
      row({ severityScore: 0.3, targetDate: '2026-11-09' }),
    ], { districts: 1, forecastDays: 2 }));

    expect(result.severity.populationStdDev).toBe(0);
    expect(result.severity.coefficientOfVariation).toBe(0);
    expect(result.severity.skewness).toBeNull();
    expect(result.trend.slopePerDay).toBe(0);
    expect(result.trend.correlation).toBeNull();
    expect(result.dates.map((point) => point.targetDate)).toEqual(['2026-11-08', '2026-11-09']);
  });

  it('keeps missing and out-of-range values visible in the quality summary', () => {
    const result = analyzeDailySnapshot(snapshot([
      row({ district: 'Kurigram', hazard: '', tier: '', severityScore: Number.NaN }),
      row({ district: '', division: '', targetDate: '', severityScore: 1.2 }),
    ], { districts: 2, forecastDays: 1, publishedRows: 3 }));

    expect(result.severity).toMatchObject({ rowCount: 2, validCount: 1, missingCount: 1, min: 1.2, max: 1.2 });
    expect(result.coverage).toMatchObject({
      publishedRows: 2,
      declaredRows: 3,
      rowsMatch: false,
      districtsObserved: 1,
      districtsDeclared: 2,
      districtsMatch: false,
      targetDatesObserved: 1,
      forecastDaysDeclared: 1,
      forecastDaysMatch: true,
      districtDatePairsObserved: 1,
      districtDatePairsExpected: 2,
      districtDatePairCoveragePercent: 50,
      scoresOutsideZeroToOne: 1,
    });
    expect(result.coverage.missingByField).toEqual([
      { field: 'District', count: 1 },
      { field: 'Division', count: 1 },
      { field: 'Hazard', count: 1 },
      { field: 'Target date', count: 1 },
      { field: 'Advisory tier', count: 1 },
      { field: 'Severity score', count: 1 },
    ]);
  });

  it('counts category shares, district-hazard-date duplicates and cross-tab values', () => {
    const result = analyzeDailySnapshot(snapshot([
      row({ district: 'Kurigram', division: 'Rangpur', hazard: 'Flood', targetDate: '2026-11-08', severityScore: 0.2 }),
      row({ district: 'Kurigram', division: 'Rangpur', hazard: 'Flood', targetDate: '2026-11-08', severityScore: 0.4 }),
      row({ district: 'Kurigram', division: 'Rangpur', hazard: 'Fire', targetDate: '2026-11-09', tier: 'NORMAL', severityScore: 0.6 }),
      row({ district: 'Dhaka', division: 'Dhaka', hazard: 'Flood', targetDate: '2026-11-08', tier: 'WARNING', severityScore: 0.8 }),
    ], { districts: 2, forecastDays: 2 }));

    expect(result.tiers).toEqual([
      { name: 'WATCH', count: 2, share: 0.5 },
      { name: 'NORMAL', count: 1, share: 0.25 },
      { name: 'WARNING', count: 1, share: 0.25 },
    ]);
    expect(result.hazards.map(({ name, count }) => [name, count])).toEqual([['Flood', 3], ['Fire', 1]]);
    expect(result.coverage.duplicateDistrictHazardDateRows).toBe(1);
    expect(result.coverage.districtDatePairsObserved).toBe(3);
    expect(result.coverage.districtDatePairCoveragePercent).toBe(75);
    expect(result.divisionHazardRows).toEqual([
      { division: 'Dhaka', Flood: 1, Fire: 0, total: 1 },
      { division: 'Rangpur', Flood: 2, Fire: 1, total: 3 },
    ]);
  });

  it('reports empty and unrecorded data as absent rather than zero observations', () => {
    const empty = snapshot([], { districts: 0, forecastDays: 0, publishedRows: 0 });
    const result = analyzeDailySnapshot(empty);

    expect(result.rowCount).toBe(0);
    expect(result.severity.mean).toBeNull();
    expect(result.severity.median).toBeNull();
    expect(result.trend).toEqual({ slopePerDay: null, correlation: null, points: 0 });
    expect(result.coverage.districtDatePairsExpected).toBeNull();
    expect(result.severityHistogram.every((bin) => bin.count === 0 && bin.share === 0)).toBe(true);
  });
});
