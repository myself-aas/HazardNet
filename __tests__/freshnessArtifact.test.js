/**
 * @jest-environment node
 *
 * The freshness artifact (Phase 7) — the file `/status` renders and the probe workflow
 * commits. It is a *published* statement about the data a deployment ships, so the tests
 * here are the publication rules rather than the file I/O:
 *
 *   - a missing or unreadable input is reported as missing/unknown, never as fresh;
 *   - an age is never invented (no NaN, no zero, no "assume today");
 *   - `model_version` is copied, never defaulted — the pipeline does not stamp one yet and
 *     the artifact is the place where that has to stay visible;
 *   - the coverage stamp is copied from the run, not recomputed from rows;
 *   - the time-independent projection (what `--check` gates on) ignores the clock, so the
 *     gate cannot rot into a flaky failure.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  FRESHNESS_SCHEMA,
  buildFreshnessArtifact,
  classify,
  stableView,
} from '../scripts/build_freshness_artifact.mjs';

const NOW = new Date('2026-09-18T12:00:00Z');
const hoursAgo = (hours) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const daysAgo = (days) => new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10);

const snapshot = (over = {}) => ({
  schema: 'hazardnet-forecast-snapshot/v2',
  generated_at: hoursAgo(2),
  prediction_date: daysAgo(1),
  source: 'production run',
  provenance: {
    model_version: null,
    tensor_build_id: null,
    pipeline_version: null,
    run_id: null,
  },
  dataset_version: null,
  soil_channels_fabricated: false,
  coverage: {
    status: 'complete',
    requested_units: 74,
    produced_units: 74,
    units_per_horizon: { '7_days': 25, '15_days': 49 },
    districts_covered: 64,
    districts_expected: 64,
    missing_district_ids: [],
    missing_district_names: [],
    horizons: ['7_days', '15_days'],
    skipped: [],
  },
  ...over,
});

const manifest = (over = {}) => ({
  source: 'github-actions: scripts/auto_forecast.py',
  generated_at: hoursAgo(3),
  prediction_date: daysAgo(1),
  row_count: 74,
  csv_sha256: 'a'.repeat(64),
  ...over,
});

const alerts = (over = {}) => ({
  schema: 'hazardnet-alerts/v1',
  generated_at: hoursAgo(1),
  policy_version: 'alert-policy/1.0.0',
  assessed: 74,
  alerts: [],
  counts: { not_published: 74, dropped_unpublished: 0 },
  ...over,
});

const probe = (over = {}) => ({
  schema: 'hazardnet-site-probe/v1',
  ran_at: hoursAgo(0.5),
  run_url: 'https://github.com/myself-aas/HazardNet/actions/runs/1',
  site_url: 'https://hazardnet.live',
  outcome: 'pass',
  checks: [
    { id: 'homepage', outcome: 'success', detail: null },
    { id: 'security_headers', outcome: 'success', detail: null },
  ],
  ...over,
});

const build = (inputs = {}, now = NOW) =>
  buildFreshnessArtifact({
    now,
    snapshot: snapshot(),
    manifest: manifest(),
    alerts: alerts(),
    probe: probe(),
    ...inputs,
  });

const source = (artifact, id) => artifact.sources.find((entry) => entry.id === id);

describe('classify', () => {
  it('is inclusive at the SLO boundary and unknown for an unknown age', () => {
    expect(classify(192, 192)).toBe('fresh');
    expect(classify(192.1, 192)).toBe('stale');
    expect(classify(null, 192)).toBe('unknown');
    expect(classify(Number.NaN, 192)).toBe('unknown');
  });
});

describe('buildFreshnessArtifact', () => {
  it('states the schema, the producer and the four sources it derives from', () => {
    const artifact = build();
    expect(artifact.schema).toBe(FRESHNESS_SCHEMA);
    expect(artifact.generated_by).toBe('scripts/build_freshness_artifact.mjs');
    expect(artifact.sources.map((entry) => entry.id)).toEqual([
      'forecast_ingest',
      'forecast_snapshot',
      'alert_engine',
      'site_probe',
    ]);
    expect(artifact.overall.state).toBe('fresh');
    expect(artifact.overall.counts.fresh).toBe(4);
    expect(artifact.overall.not_fresh).toEqual([]);
  });

  it('is deterministic for the same inputs and clock', () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it('carries no NaN, null-age pretence or undefined through JSON', () => {
    const artifact = build();
    const roundTripped = JSON.parse(JSON.stringify(artifact));
    expect(roundTripped).toEqual(artifact);
    expect(JSON.stringify(artifact)).not.toMatch(/NaN|undefined/);
    for (const entry of artifact.sources) {
      if (entry.state === 'unknown') expect(entry.age_hours).toBeNull();
    }
  });

  it('crosses to stale past the 192 h forecast SLO', () => {
    const fresh = build({ snapshot: snapshot({ prediction_date: daysAgo(7) }) });
    const stale = build({ snapshot: snapshot({ prediction_date: daysAgo(9) }) });
    expect(source(fresh, 'forecast_snapshot').state).toBe('fresh');
    expect(source(stale, 'forecast_snapshot').state).toBe('stale');
    expect(source(stale, 'forecast_snapshot').reason).toMatch(/SLO 192 h/);
  });

  it('reports a missing input as missing, with the path a reader can check', () => {
    const artifact = build({ snapshot: null, manifest: null });
    expect(source(artifact, 'forecast_snapshot').state).toBe('missing');
    expect(source(artifact, 'forecast_ingest').state).toBe('missing');
    expect(source(artifact, 'forecast_snapshot').artifact).toContain('forecasts-latest.json');
    expect(artifact.overall.state).toBe('missing');
    expect(artifact.honesty.join(' ')).toMatch(/missing input/);
    // A missing snapshot must not fabricate a coverage block either.
    expect(artifact.coverage).toBeNull();
  });

  it('reports an unparseable timestamp as unknown rather than as an age', () => {
    const artifact = build({ alerts: alerts({ generated_at: 'not-a-date' }) });
    const engine = source(artifact, 'alert_engine');
    expect(engine.state).toBe('unknown');
    expect(engine.age_hours).toBeNull();
    expect(engine.reason).toMatch(/no parseable generated_at/);
  });

  it('copies model provenance and explains an unstamped version', () => {
    const unstamped = build();
    expect(unstamped.model.model_version).toBeNull();
    expect(unstamped.model.stamped).toBe(false);
    expect(unstamped.honesty.join(' ')).toMatch(/model_version is null/);

    const stamped = build({
      snapshot: snapshot({
        provenance: { model_version: 'mn-v1-abc', tensor_build_id: 'tb-1', pipeline_version: 'p-9', run_id: 'r-7' },
      }),
    });
    expect(stamped.model.model_version).toBe('mn-v1-abc');
    expect(stamped.model.tensor_build_id).toBe('tb-1');
    expect(stamped.model.stamped).toBe(true);
    expect(stamped.honesty.join(' ')).not.toMatch(/model_version is null/);
  });

  it('copies the coverage stamp instead of recomputing it from rows', () => {
    const artifact = build({
      snapshot: snapshot({
        coverage: {
          status: 'partial',
          produced_units: 74,
          units_per_horizon: { '7_days': 25, '15_days': 49 },
          districts_covered: 60,
          districts_expected: 64,
          missing_district_ids: null,
          missing_district_names: null,
          horizons: ['7_days', '15_days'],
          skipped: [],
        },
      }),
    });
    expect(artifact.coverage.districts_covered).toBe(60);
    expect(artifact.coverage.districts_expected).toBe(64);
    expect(artifact.honesty.join(' ')).toMatch(/coverage status "partial"/);
    expect(artifact.honesty.join(' ')).toMatch(/did not report which districts are missing/);
  });

  it('treats an absent probe result as unknown and says so', () => {
    const artifact = build({ probe: null });
    const probeSource = source(artifact, 'site_probe');
    expect(probeSource.state).toBe('unknown');
    expect(probeSource.outcome).toBe('unknown');
    expect(artifact.overall.state).toBe('unknown');
    expect(artifact.honesty.join(' ')).toMatch(/no site-health probe result/);
  });

  it('reports a failing probe as failing and names the failed checks', () => {
    const artifact = build({
      probe: probe({
        outcome: 'fail',
        checks: [
          { id: 'homepage', outcome: 'success', detail: null },
          { id: 'security_headers', outcome: 'failure', detail: null },
          { id: 'deep_links', outcome: 'failure', detail: null },
        ],
      }),
    });
    const probeSource = source(artifact, 'site_probe');
    expect(probeSource.state).toBe('failing');
    expect(probeSource.reason).toMatch(/security_headers/);
    expect(probeSource.detail.failed).toBe(2);
    expect(probeSource.detail.passed).toBe(1);
    expect(artifact.overall.state).toBe('failing');
    expect(artifact.honesty.join(' ')).toMatch(/most recent site-health probe failed/);
  });

  it('treats a stale probe result as stale rather than as a pass', () => {
    const artifact = build({ probe: probe({ ran_at: hoursAgo(3) }) });
    expect(source(artifact, 'site_probe').state).toBe('stale');
  });

  it('ranks the overall state by severity, not by source order', () => {
    const artifact = build({ probe: probe({ outcome: 'fail', checks: [{ id: 'homepage', outcome: 'failure' }] }) });
    expect(artifact.overall.state).toBe('failing');
    expect(artifact.overall.not_fresh).toEqual(['site_probe']);
  });

  it('notes withheld publication instead of presenting an empty list as reassurance', () => {
    const artifact = build();
    expect(artifact.honesty.join(' ')).toMatch(/74 assessed district\/horizon rows produced no published alert/);
    const published = build({ alerts: alerts({ counts: { not_published: 0, dropped_unpublished: 0 } }) });
    expect(published.honesty.join(' ')).not.toMatch(/produced no published alert/);
  });
});

describe('stableView', () => {
  it('ignores the clock and the derived ages', () => {
    const earlier = build({}, new Date('2026-09-18T00:00:00Z'));
    const later = build({}, new Date('2026-09-19T00:00:00Z'));
    expect(earlier.overall.state).not.toBe(later.overall.state); // the clock does move the ages
    expect(stableView(earlier)).toEqual(stableView(later));
  });

  it('moves when the data an artifact describes changes', () => {
    const before = stableView(build());
    const after = stableView(build({ snapshot: snapshot({ prediction_date: daysAgo(3) }) }));
    expect(after).not.toEqual(before);
    expect(after.sources[1].prediction_date).toBe(daysAgo(3));
  });
});

describe('the CLI', () => {
  const repoRoot = join(__dirname, '..');
  const committed = join(repoRoot, 'frontend', 'public', 'data', 'freshness.json');
  const run = (args) =>
    execFileSync('node', ['scripts/build_freshness_artifact.mjs', ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

  it('writes an artifact and then agrees with itself under --check', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hn-freshness-'));
    const out = join(dir, 'freshness.json');
    run(['--out', out, '--now', NOW.toISOString()]);
    const written = JSON.parse(readFileSync(out, 'utf8'));
    expect(written.schema).toBe(FRESHNESS_SCHEMA);
    expect(written.built_at).toBe(NOW.toISOString());
    // --check against a copy of what we just wrote: no drift.
    run(['--check', '--out', out]);
  });

  it('fails --check when the committed artifact no longer describes the inputs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hn-freshness-drift-'));
    const out = join(dir, 'freshness.json');
    copyFileSync(committed, out);
    const perturbed = JSON.parse(readFileSync(out, 'utf8'));
    perturbed.coverage = { ...(perturbed.coverage ?? {}), districts_covered: 1 };
    writeFileSync(out, `${JSON.stringify(perturbed, null, 2)}\n`);
    expect(() => run(['--check', '--out', out])).toThrow(/Command failed|artifact no longer describes/);
  });

  it('keeps the committed artifact in step with the committed data', () => {
    expect(() => run(['--check'])).not.toThrow();
  });
});
