/**
 * @jest-environment node
 *
 * The alert snapshot builder (Phase 5): the artefact that lets the alert page render
 * when the live API is unreachable.
 *
 * The builder is the last gate before an alert becomes a public, cacheable file, so the
 * tests here are the public-safety rules rather than the file I/O:
 *   - a non-PUBLISHED row must never reach the snapshot;
 *   - the §1.7 disclaimer must be present on every row, and stamped on when the engine
 *     omitted it;
 *   - an empty run must not silently replace a good snapshot.
 */

import { ALERT_DISCLAIMER, ALERTS_SNAPSHOT_SCHEMA, buildSnapshot, countByLevel, extractAlertRows } from '../scripts/build_alert_snapshot.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const row = (over = {}) => ({
  id: 'a-1',
  state: 'PUBLISHED',
  level: 'WATCH',
  district_name: 'Sunamganj',
  hazard_type: 'Flash Flood',
  disclaimer: ALERT_DISCLAIMER,
  ...over,
});

describe('buildSnapshot', () => {
  it('keeps only PUBLISHED rows and counts what it dropped', () => {
    const snapshot = buildSnapshot({
      generated_at: '2026-09-18T06:00:00Z',
      assessed: 3,
      alerts: [row(), row({ id: 'a-2', state: 'DRAFT' }), row({ id: 'a-3', state: 'PENDING_REVIEW' })],
    });
    expect(snapshot.schema).toBe(ALERTS_SNAPSHOT_SCHEMA);
    expect(snapshot.alerts.map((alert) => alert.id)).toEqual(['a-1']);
    expect(snapshot.counts.dropped_unpublished).toBe(2);
    expect(snapshot.assessed).toBe(3);
  });

  it('stamps the canonical §1.7 text on a row that has none', () => {
    const snapshot = buildSnapshot({ alerts: [row({ disclaimer: null })] });
    expect(snapshot.alerts[0].disclaimer).toBe(ALERT_DISCLAIMER);
  });

  it('does not overwrite a disclaimer the engine supplied', () => {
    const snapshot = buildSnapshot({ alerts: [row({ disclaimer: 'Engine wording.' })] });
    expect(snapshot.alerts[0].disclaimer).toBe('Engine wording.');
  });

  it('carries the policy through and falls back to the canonical disclaimer', () => {
    const withPolicy = buildSnapshot({ policy: { version: 'alert-policy/1.0.0', disclaimer: 'Policy wording.' } });
    expect(withPolicy.policy.version).toBe('alert-policy/1.0.0');
    expect(withPolicy.disclaimer).toBe('Policy wording.');
    expect(buildSnapshot({}).disclaimer).toBe(ALERT_DISCLAIMER);
  });

  it('accepts a bare array as the engine output', () => {
    expect(buildSnapshot([row()]).alerts).toHaveLength(1);
    expect(buildSnapshot(null).alerts).toEqual([]);
  });

  it('never invents a generated_at', () => {
    const snapshot = buildSnapshot({ alerts: [] }, { generatedAt: '2026-09-18T00:00:00.000Z' });
    expect(snapshot.generated_at).toBe('2026-09-18T00:00:00.000Z');
    expect(buildSnapshot({ generated_at: '2026-09-17T20:00:00Z', alerts: [] }).generated_at)
      .toBe('2026-09-17T20:00:00Z');
  });
});

describe('countByLevel', () => {
  it('counts the four levels and ignores anything unknown', () => {
    expect(countByLevel([
      row({ level: 'WATCH' }), row({ level: 'SEVERE' }), row({ level: 'NOPE' }), null,
    ])).toEqual({ NO_ALERT: 0, WATCH: 1, WARNING: 0, SEVERE: 1 });
  });
});

const run = (args) => execFileSync('node', ['scripts/build_alert_snapshot.mjs', ...args], {
  encoding: 'utf8', stdio: 'pipe',
});

describe('the CLI', () => {

  it('writes the snapshot from a fixture and reports what it did', () => {
    const dir = mkdtempSync(join(tmpdir(), 'alert-snapshot-'));
    const out = join(dir, 'alerts-latest.json');
    const log = run([
      '--in', 'scripts/tests/fixtures/alerts/alert-run.sample.json', '--out', out,
    ]);
    const snapshot = JSON.parse(readFileSync(out, 'utf8'));
    expect(log).toMatch(/2 published alert\(s\)/);
    expect(snapshot.alerts).toHaveLength(2);
    expect(snapshot.counts.dropped_unpublished).toBe(1);
    expect(snapshot.alerts.every((alert) => alert.disclaimer)).toBe(true);
  });

  it('refuses to replace a non-empty snapshot with an empty run', () => {
    const dir = mkdtempSync(join(tmpdir(), 'alert-snapshot-'));
    const out = join(dir, 'alerts-latest.json');
    run(['--in', 'scripts/tests/fixtures/alerts/alert-run.sample.json', '--out', out]);
    expect(() => run(['--in', 'scripts/tests/fixtures/alerts/empty-run.sample.json', '--out', out]))
      .toThrow();
    // The good snapshot is still there, unchanged.
    expect(JSON.parse(readFileSync(out, 'utf8')).alerts).toHaveLength(2);
  });

  it('accepts an empty result when the caller says it is deliberate', () => {
    const dir = mkdtempSync(join(tmpdir(), 'alert-snapshot-'));
    const out = join(dir, 'alerts-latest.json');
    run(['--in', 'scripts/tests/fixtures/alerts/alert-run.sample.json', '--out', out]);
    run(['--in', 'scripts/tests/fixtures/alerts/empty-run.sample.json', '--out', out, '--allow-empty']);
    expect(JSON.parse(readFileSync(out, 'utf8')).alerts).toEqual([]);
  });

  it('requires an input instead of inventing an empty snapshot', () => {
    expect(() => run([])).toThrow();
  });

  it('fails loudly on a missing input file', () => {
    expect(() => run(['--in', '/tmp/definitely-not-here.json'])).toThrow();
  });

  it('keeps a row from reaching the file without a disclaimer', () => {
    const dir = mkdtempSync(join(tmpdir(), 'alert-snapshot-'));
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ alerts: [row({ disclaimer: '   ' })] }));
    // Blank is treated as missing, so the row is stamped — never published bare.
    const out = join(dir, 'out.json');
    run(['--in', bad, '--out', out]);
    expect(JSON.parse(readFileSync(out, 'utf8')).alerts[0].disclaimer).toBe(ALERT_DISCLAIMER);
  });
});

describe('which payload shapes the builder accepts', () => {
  // The three producers do not share a shape, and the first CI wiring silently shipped
  // the wrong one: the workflow posted `{notify: true}` to /api/v1/alerts/run, the route
  // strips `batch.alerts` unless `include_alerts` is set, and the builder — which only
  // understood `alerts[]` — wrote an empty snapshot every night and called it "no alerts".
  const draft = (id) => ({ id, state: 'DRAFT', level: 'WATCH', district_name: 'Sunamganj' });
  const runReport = (over = {}) => ({
    ok: true,
    ran_at: '2026-09-18T06:00:00Z',
    policy_version: 'alert-policy/1.0.0',
    rows: 3,
    batch: { alerts: [draft('a-1'), draft('a-2'), draft('a-3')], assessed: 3 },
    persisted: { created: 3, published: 1, pending_review: 0, held: 0, blocked: 2 },
    published_alerts: [row({ id: 'a-1' })],
    ...over,
  });

  it('prefers published_alerts — the only key that means "already published"', () => {
    const extracted = extractAlertRows(runReport());
    expect(extracted.shape).toBe('published_alerts');
    const snapshot = buildSnapshot(runReport());
    expect(snapshot.alerts.map((alert) => alert.id)).toEqual(['a-1']);
    // `dropped_unpublished` stays list-local (nothing in the published list was dropped);
    // the run's own account of what it could not publish is the separate tally below.
    expect(snapshot.counts.dropped_unpublished).toBe(0);
    expect(snapshot.counts.not_published).toBe(2);
    expect(snapshot.assessed).toBe(3);
  });

  it('takes an empty published list at its word — a run that published nothing is empty', () => {
    // The DRAFT rows in `batch.alerts` are *not* resurrected: a pre-persistence
    // assessment is not an approval.
    const report = runReport({ published_alerts: [] });
    expect(extractAlertRows(report).shape).toBe('published_alerts');
    const snapshot = buildSnapshot(report);
    expect(snapshot.alerts).toEqual([]);
    expect(snapshot.counts.dropped_unpublished).toBe(0);
    expect(snapshot.counts.not_published).toBe(2); // the engine's blocked tally, not a guess
    expect(snapshot.assessed).toBe(3); // from `rows`, since the run report has no `assessed`
  });

  it('falls back to batch.alerts for a run report that carries no published list', () => {
    // An older engine build (or a report trimmed downstream) still gets its published
    // rows read — and every row that is not PUBLISHED is dropped and counted.
    const { published_alerts: _omitted, ...legacy } = runReport();
    expect(extractAlertRows(legacy).shape).toBe('batch.alerts');
    const snapshot = buildSnapshot(legacy);
    expect(snapshot.alerts).toEqual([]);
    // With no published list to trust, the DRAFT batch rows are drops — and they are
    // counted, never silently absorbed.
    expect(snapshot.counts.dropped_unpublished).toBe(3);
    expect(snapshot.counts.not_published).toBe(2); // still the engine's own tally
  });

  it('carries no not_published tally for a payload that cannot know it', () => {
    const snapshot = buildSnapshot({ alerts: [row()] });
    expect(snapshot.counts).not.toHaveProperty('not_published');
  });

  it('does not report the list endpoint count as "rows assessed"', () => {
    // `count` is how many rows the endpoint returned, not how many the run looked at.
    const snapshot = buildSnapshot({ count: 1, alerts: [row()] });
    expect(snapshot.assessed).toBeNull();
  });

  it('still reads the public list endpoint shape', () => {
    const snapshot = buildSnapshot({ generated_at: '2026-09-18T06:00:00Z', alerts: [row()] });
    expect(snapshot.alerts).toHaveLength(1);
  });

  it('returns null for a payload with no recognisable list', () => {
    expect(extractAlertRows({ ok: true, rows: 74 })).toBeNull();
    expect(extractAlertRows({ batch: { alerts_omitted: 74 } })).toBeNull();
    expect(extractAlertRows('not json')).toBeNull();
    expect(extractAlertRows(null)).toBeNull();
  });

  it('exits 2 and writes nothing when the payload is unreadable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'alert-snapshot-'));
    const unreadable = join(dir, 'stripped.json');
    // Exactly what the route returns when `include_alerts` is not set.
    writeFileSync(unreadable, JSON.stringify({
      ok: true, rows: 74, persisted: { published: 0 }, batch: { alerts_omitted: 74 },
    }));
    const out = join(dir, 'out.json');
    let failure = null;
    try {
      run(['--in', unreadable, '--out', out]);
    } catch (error) {
      failure = error;
    }
    // Assert the *specific* refusal: a bare `toThrow()` also passes on a typo in this test.
    expect(failure).not.toBeNull();
    expect(failure.status).toBe(2);
    expect(String(failure.stderr)).toMatch(/unrecognised alert payload/);
    expect(existsSync(out)).toBe(false);
  });
});
