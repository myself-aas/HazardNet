/**
 * scripts/build_daily_report.mjs — the daily report + archive generator that
 * public_daily_advisories.yml runs after a verified Kaggle fetch.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  renderReport,
  summarizeAdvisories,
  updateArchive,
  runBuild,
} from '../scripts/build_daily_report.mjs';

const snapshot = {
  run: {
    id: 'kaggle-v1-test',
    generatedAt: '2026-11-06T01:00:00.000Z',
    dataCutoff: '2026-11-06T00:00:00.000Z',
    expiresAt: '2026-11-07T00:00:00.000Z',
    modelVersion: 'test+model.abc',
    inputSha256: 'deadbeef',
    sourceDatasetVersion: 1,
  },
  coverage: { districts: 64, forecastDays: 15, publishedRows: 3 },
  advisories: [
    { district: 'Kurigram', division: 'Rangpur', hazard: 'Tropical Cyclone', targetDate: '2026-11-07', tier: 'WARNING', severityScore: 0.9 },
    { district: 'Dhaka', division: 'Dhaka', hazard: 'Flash Flood', targetDate: '2026-11-07', tier: 'WATCH', severityScore: 0.4 },
    { district: 'Cox\'s Bazar', division: 'Chattogram', hazard: 'Flood', targetDate: '2026-11-08', tier: 'NORMAL', severityScore: 0.1 },
  ],
};

describe('build_daily_report', () => {
  test('summarizeAdvisories aggregates tiers, hazards and robust descriptive statistics', () => {
    const stats = summarizeAdvisories(snapshot.advisories, snapshot.coverage);
    expect(stats.tierCounts.WARNING).toBe(1);
    expect(stats.hazardCounts['Flash Flood']).toBe(1);
    expect(stats.maxRow.district).toBe('Kurigram');
    expect(stats.meanSeverity).toBeCloseTo(0.4666, 3);
    expect(stats.severity).toMatchObject({
      count: 3,
      missingCount: 0,
      median: 0.4,
      min: 0.1,
      max: 0.9,
      distinctValues: 3,
      tukeyOutlierCount: 0,
    });
    expect(stats.severityByDate.map((day) => day.targetDate)).toEqual(['2026-11-07', '2026-11-08']);
    expect(stats.forecastTrend).toMatchObject({ points: 2 });
    expect(stats.forecastTrend.slopePerDay).toBeCloseTo(-0.55);
    expect(stats.forecastTrend.correlation).toBeCloseTo(-1);
    expect(stats.dataQuality.rowsMatch).toBe(true);
    expect(stats.dataQuality.districtDatePairCoveragePercent).toBeCloseTo(3 / 960 * 100);
  });

  test('summarizeAdvisories keeps absent scores absent and reports tied distributions', () => {
    const stats = summarizeAdvisories([
      { ...snapshot.advisories[0], severityScore: null },
      { ...snapshot.advisories[1], severityScore: 0.3 },
      { ...snapshot.advisories[2], severityScore: 0.3 },
    ], snapshot.coverage);
    expect(stats.severity.count).toBe(2);
    expect(stats.severity.missingCount).toBe(1);
    expect(stats.severity.mean).toBe(0.3);
    expect(stats.severity.populationStdDev).toBe(0);
    expect(stats.severity.skewness).toBeNull();
    expect(stats.forecastTrend.correlation).toBeNull();
    expect(stats.dataQuality.missingByField['Severity score']).toBe(1);
  });

  test('renderReport embeds real-time values and template directives', () => {
    const md = renderReport({ snapshot, auditMarkdown: '# Audit\nshort form', generatedBy: 'test' });
    expect(md).toContain('# HazardNet Daily Report: 2026-11-06');
    expect(md).toContain('{{chart:tier-distribution}}');
    expect(md).toContain('{{chart:severity-distribution}}');
    expect(md).toContain('{{chart:severity-by-date}}');
    expect(md).toContain('{{chart:hazard-by-division}}');
    expect(md).toContain('{{table:top-advisories}}');
    expect(md).toContain('## 9. Frequently asked questions');
    expect(md).toContain('Population standard deviation (σ)');
    expect(md).toContain('Forecast-horizon slope of daily mean');
    expect(md).toContain('Pearson r: target date vs daily mean');
    expect(md).toContain('ordinary least-squares slope');
    expect(md).toContain('No p-values, significance claims or confidence intervals');
    expect(md).toContain(':::warning');
    expect(md).toContain('short form');
    expect(md).toContain('kaggle-v1-test');
  });

  test('renderReport rejects malformed and impossible run dates', () => {
    for (const generatedAt of ['not-a-date', '2026-02-29T01:00:00.000Z']) {
      expect(() => renderReport({
        snapshot: { ...snapshot, run: { ...snapshot.run, generatedAt } },
        generatedBy: 'test',
      })).toThrow();
    }
  });

  test('runBuild writes the report and maintains a newest-first archive', () => {
    const dir = mkdtempSync(join(tmpdir(), 'daily-report-'));
    try {
      const out = join(dir, 'reports');
      const result = runBuild({
        snapshotPath: writeTmp(dir, 'snap.json', snapshot),
        auditPath: null,
        outDir: out,
      });
      expect(result.file).toBe('2026-11-06.md');
      expect(existsSync(join(out, '2026-11-06.md'))).toBe(true);
      const archive = JSON.parse(readFileSync(join(out, 'archive.json'), 'utf8'));
      expect(archive.entries[0].date).toBe('2026-11-06');
      expect(archive.entries[0].topAdvisory.district).toBe('Kurigram');

      // a second, older-dated run keeps the archive sorted and deduplicated
      const older = { ...snapshot, run: { ...snapshot.run, generatedAt: '2026-11-05T01:00:00.000Z' } };
      runBuild({ snapshotPath: writeTmp(dir, 'snap2.json', older), auditPath: null, outDir: out });
      runBuild({ snapshotPath: writeTmp(dir, 'snap.json', snapshot), auditPath: null, outDir: out });
      const archive2 = JSON.parse(readFileSync(join(out, 'archive.json'), 'utf8'));
      expect(archive2.entries.map((e) => e.date)).toEqual(['2026-11-06', '2026-11-05']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function writeTmp(dir, name, value) {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(value));
  return path;
}
