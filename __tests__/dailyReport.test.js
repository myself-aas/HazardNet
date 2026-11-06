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
  test('summarizeAdvisories aggregates tiers, hazards and severity', () => {
    const stats = summarizeAdvisories(snapshot.advisories);
    expect(stats.tierCounts.WARNING).toBe(1);
    expect(stats.hazardCounts['Flash Flood']).toBe(1);
    expect(stats.maxRow.district).toBe('Kurigram');
    expect(stats.meanSeverity).toBeCloseTo(0.4666, 3);
  });

  test('renderReport embeds real-time values and template directives', () => {
    const md = renderReport({ snapshot, auditMarkdown: '# Audit\nshort form', generatedBy: 'test' });
    expect(md).toContain('# HazardNet Daily Report — 2026-11-06');
    expect(md).toContain('{{chart:tier-distribution}}');
    expect(md).toContain('{{table:top-advisories}}');
    expect(md).toContain(':::warning');
    expect(md).toContain('short form');
    expect(md).toContain('kaggle-v1-test');
  });

  test('renderReport rejects a run without a usable date', () => {
    expect(() => renderReport({
      snapshot: { ...snapshot, run: { ...snapshot.run, generatedAt: 'not-a-date' } },
      generatedBy: 'test',
    })).toThrow();
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
