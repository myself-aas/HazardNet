/**
 * @jest-environment node
 *
 * The Kaggle advisory fetch (`scripts/fetch_kaggle_advisory.mjs`).
 *
 * The network is not exercised here — Kaggle needs credentials this repo's CI does not have.
 * What is pinned is the logic that decides what the workflow does next: how the URL is built,
 * how `generated_at` is read out of the CSV, and above all **what counts as new**. That last
 * one is the whole reason the script exists: the daily job used to fail with one message for
 * "the notebook has not run yet", "the key expired" and "the kernel was renamed", and a
 * successful download of yesterday's CSV was indistinguishable from a fresh one.
 */

import {
  DEFAULT_MAX_AGE_HOURS,
  datasetDownloadUrl,
  inspectCsv,
  isNewerThan,
  parseArgs,
  parseGeneratedAt,
  publicationAge,
} from '../scripts/fetch_kaggle_advisory.mjs';

const CSV_HEADER = 'district,division,latitude,longitude,horizon,hazard,confidence,advisory_tier,generated_at\n';
const csv = (rows) => CSV_HEADER + rows.join('\n') + '\n';

describe('datasetDownloadUrl', () => {
  it('requests the single file rather than the whole bundle', () => {
    const url = datasetDownloadUrl('myself-aas/hazardnet-weekly-forecasts', 'hazardnet_advisories_latest.csv');
    expect(url).toBe(
      'https://www.kaggle.com/api/v1/datasets/download/myself-aas/hazardnet-weekly-forecasts'
      + '?file_name=hazardnet_advisories_latest.csv',
    );
  });

  it('defaults to the exact public dataset slug supplied by the owner', () => {
    expect(datasetDownloadUrl()).toBe(
      'https://www.kaggle.com/api/v1/datasets/download/ashifahmedshuvo/hazardnet-weekly-forecasts'
      + '?file_name=hazardnet_advisories_latest.csv',
    );
  });

  it('encodes a file name that would otherwise break the query string', () => {
    expect(datasetDownloadUrl('o/d', 'a file,name.csv')).toContain('?file_name=a%20file%2Cname.csv');
  });
});

describe('inspectCsv', () => {
  it('counts data rows and reads the run timestamp from the first row', () => {
    const info = inspectCsv(csv([
      'Dhaka,Dhaka,23.7,90.2,7_days,Flash Flood,0.98,SEVERE,2026-10-02 04:15:00',
      'Khulna,Khulna,22.4,89.4,7_days,Flood,0.61,WARNING,2026-10-02 04:15:00',
    ]));
    expect(info.rows).toBe(2);
    expect(info.generatedAt).toBe('2026-10-02 04:15:00');
    expect(info.columns[0]).toBe('district');
  });

  it('survives quoted commas in a district or hazard field', () => {
    const info = inspectCsv(csv(['"Cox\'s Bazar",Chittagong,21.4,92.0,7_days,"Flash Flood",0.98,SEVERE,2026-10-02 04:15:00']));
    expect(info.rows).toBe(1);
    expect(info.generatedAt).toBe('2026-10-02 04:15:00');
  });

  it('reports zero rows for an empty or header-only file instead of throwing', () => {
    expect(inspectCsv('').rows).toBe(0);
    expect(inspectCsv(CSV_HEADER).rows).toBe(0);
    expect(inspectCsv(null).rows).toBe(0);
  });
});

describe('parseGeneratedAt', () => {
  it('treats Kaggle’s naive stamp as UTC', () => {
    expect(parseGeneratedAt('2026-10-02 04:15:00')).toBe('2026-10-02T04:15:00.000Z');
  });
  it('leaves an already-qualified stamp alone', () => {
    expect(parseGeneratedAt('2026-10-02T04:15:00Z')).toBe('2026-10-02T04:15:00.000Z');
  });
  it('returns null for junk rather than a wrong date', () => {
    expect(parseGeneratedAt('')).toBeNull();
    expect(parseGeneratedAt('not a date')).toBeNull();
    expect(parseGeneratedAt(undefined)).toBeNull();
  });
});

describe('isNewerThan', () => {
  const manifest = { generated_at: '2026-10-01 04:00:00', row_count: 128, source_csv_sha256: 'abc' };

  it('compares on the notebook timestamp when both sides have one', () => {
    expect(isNewerThan({ generatedAt: '2026-10-02 04:15:00', rows: 128, sha256: 'abc' }, manifest)).toBe(true);
    expect(isNewerThan({ generatedAt: '2026-10-01 04:00:00', rows: 128, sha256: 'abc' }, manifest)).toBe(false);
    // A re-run of the same day must not be re-ingested as news.
    expect(isNewerThan({ generatedAt: '2026-09-30 04:00:00', rows: 128, sha256: 'abc' }, manifest)).toBe(false);
    // But a changed source file with the *same* generated_at is still a new publication.
    expect(isNewerThan({ generatedAt: '2026-10-01 04:00:00', rows: 128, sha256: 'def' }, manifest)).toBe(true);
    expect(isNewerThan({ generatedAt: '2026-10-01 04:00:00', rows: 128, sha256: 'abc' }, manifest)).toBe(false);
  });

  it('falls back to the hash when a timestamp is missing', () => {
    expect(isNewerThan({ generatedAt: null, rows: 128, sha256: 'def' }, manifest)).toBe(true);
    expect(isNewerThan({ generatedAt: null, rows: 128, sha256: 'abc' }, manifest)).toBe(false);
  });

  it('ingests when there is nothing to compare against', () => {
    expect(isNewerThan({ generatedAt: '2026-10-02 04:15:00', rows: 128, sha256: 'abc' }, null)).toBe(true);
    expect(isNewerThan({ generatedAt: '2026-10-02 04:15:00', rows: 128, sha256: 'abc' }, {})).toBe(true);
  });

  it('does not mistake an unparseable manifest date for "no previous run"', () => {
    // A corrupted manifest must not silently authorise a re-ingest of the same rows.
    const broken = { generated_at: 'unknown', row_count: 128, source_csv_sha256: 'abc' };
    expect(isNewerThan({ generatedAt: null, rows: 128, sha256: 'abc' }, broken)).toBe(false);
  });
});

describe('publicationAge', () => {
  const NOW = Date.parse('2026-10-04T14:30:00Z');

  it('measures against the notebook clock, not the download time', () => {
    // The real 2026-10-04 file: generated 2026-09-29 23:29:31Z, checked 4 d 15 h later.
    expect(publicationAge('2026-09-29 23:29:31', NOW)).toBeCloseTo(111.01, 1);
    expect(publicationAge('2026-10-04T10:30:00Z', NOW)).toBeCloseTo(4, 5);
  });

  it('returns null for a missing or unparseable stamp rather than guessing', () => {
    // An unknown age must not be reported as fresh *or* stale; the ingest decides for itself.
    expect(publicationAge(null, NOW)).toBeNull();
    expect(publicationAge('', NOW)).toBeNull();
    expect(publicationAge('not a date', NOW)).toBeNull();
  });

  it('decides staleness exactly where the ingest does', async () => {
    // The fetch called the real 2026-09-29 publication "fresh" (it was newer than the committed
    // 2026-09-16 run) while the ingest rejected it as STALE_DATA, because the two compared
    // different things. The defaults are pinned to each other here, and the boundary is checked
    // on the same fixture the ingest's own suite uses, so the two cannot drift apart again.
    expect(DEFAULT_MAX_AGE_HOURS).toBe(36);
    const { ADVISORY_CSV_COLUMNS, DISTRICT_REGISTRY } = await import('../backend/utils/advisoryMapper.js');
    const { validateAdvisoryCsv } = await import('../scripts/validate_advisory_csv.mjs');

    const csvAt = (hoursOld) => {
      const stamp = new Date(NOW - hoursOld * 3_600_000).toISOString();
      const lines = [ADVISORY_CSV_COLUMNS.join(',')];
      for (const district of DISTRICT_REGISTRY) {
        for (const horizon of ['7_days', '15_days']) {
          lines.push([
            district.district_name, district.division, district.latitude, district.longitude,
            horizon, 'Flood', 0.88, 0.72, 0.75, 0.7, 0.74, 'false', 'WARNING',
            '2026-10-05', stamp, 32.5, 24.1, 45.2, 18.5, 0.88, 0.08, 0.04,
          ].join(','));
        }
      }
      return lines.join('\n');
    };

    const freshCsv = csvAt(4);
    const staleCsv = csvAt(DEFAULT_MAX_AGE_HOURS + 4);
    const generatedAt = (csvText) => inspectCsv(csvText).generatedAt;

    expect(publicationAge(generatedAt(freshCsv), NOW)).toBeLessThanOrEqual(DEFAULT_MAX_AGE_HOURS);
    expect(publicationAge(generatedAt(staleCsv), NOW)).toBeGreaterThan(DEFAULT_MAX_AGE_HOURS);

    const fresh = validateAdvisoryCsv(freshCsv, { currentTime: new Date(NOW) });
    expect(fresh.valid).toBe(true);
    expect(fresh.summary.ageHours).toBeLessThanOrEqual(DEFAULT_MAX_AGE_HOURS);

    const stale = validateAdvisoryCsv(staleCsv, { currentTime: new Date(NOW) });
    expect(stale.valid).toBe(false);
    expect(stale.errors.join('\n')).toContain('STALE_DATA');
    expect(stale.summary.ageHours).toBeGreaterThan(DEFAULT_MAX_AGE_HOURS);
  });
});

describe('parseArgs', () => {
  it('reads values and bare flags', () => {
    expect(parseArgs(['--out', '/tmp/x', '--force', '--quiet'])).toEqual({
      out: '/tmp/x', force: true, quiet: true,
    });
  });

  it('does not swallow the next flag as a value', () => {
    expect(parseArgs(['--out', '--force'])).toEqual({ out: true, force: true });
  });
});
