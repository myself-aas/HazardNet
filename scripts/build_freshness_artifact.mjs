#!/usr/bin/env node
/**
 * The published freshness artifact — `frontend/public/data/freshness.json`.
 *
 * WHY THIS EXISTS (Phase 7)
 * -------------------------
 * The architecture's observability answer (`docs/architecture/TARGET_ARCHITECTURE.md` §6)
 * is a static page built from a committed `data/freshness.json` plus the 30-minute probe
 * workflow. Nothing new always-on, nothing to page a human about — but the *facts* have to
 * be published, in a machine-readable file, next to the data they describe, or the status
 * page is decoration.
 *
 * WHAT IT IS, AND WHAT IT IS NOT
 * ------------------------------
 * This artifact is a **derived statement about committed files**: the ingest manifest, the
 * website snapshot, the alert snapshot, and (when one has been published) the site-health
 * probe result. It is not a live probe and it does not measure anything by itself. Every
 * number in it is copied from an input or computed from two copied numbers; when an input
 * is absent, the source is reported `missing`/`unknown` with a reason rather than guessed.
 *
 * The three rules the builder is held to:
 *   1. **Never invent.** No default ages, no assumed coverage, no placeholder model version.
 *      `model_version: null` stays `null` — the pipeline does not stamp one yet, and the
 *      status page says exactly that.
 *   2. **Say why.** Every non-`fresh` source carries a `reason` string a duty officer can act
 *      on ("no manifest at …", "run is 214.5 h old, SLO 192 h", "last probe failed").
 *   3. **Be deterministic.** Same inputs + same `now` ⇒ byte-identical output, so `--check`
 *      can gate CI on drift between the committed artifact and the committed data.
 *
 * SLOs are the ones the rest of the repository already uses, imported as constants so they
 * cannot be re-typed: 192 h forecast age (`monitoring/alerts.yml`), 48 h alert snapshot age
 * (`frontend/src/lib/alerts.ts` `freshnessOf`), 2 h probe age (four missed 30-minute runs).
 *
 * USAGE
 *   node scripts/build_freshness_artifact.mjs                  # write the artifact
 *   node scripts/build_freshness_artifact.mjs --check          # exit 1 if the committed
 *                                                              # artifact drifted from the
 *                                                              # committed inputs
 *   node scripts/build_freshness_artifact.mjs --now 2026-09-18T00:00:00Z --out /tmp/f.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FRESHNESS_SCHEMA = 'hazardnet-freshness/v1';
export const PROBE_SCHEMA = 'hazardnet-site-probe/v1';

/** Forecast-age SLO in hours — `monitoring/alerts.yml` (one missed daily run + grace). */
export const FORECAST_SLO_HOURS = 192;
/** Alert-snapshot SLO in hours — `frontend/src/lib/alerts.ts` `freshnessOf` default. */
export const ALERTS_SLO_HOURS = 48;
/** Probe-age SLO in hours — the probe runs every 30 min, so 2 h = four missed runs. */
export const PROBE_SLO_HOURS = 2;

/** Severity ranking of the five states; `overall.state` is the worst source state. */
export const STATE_SEVERITY = { fresh: 0, unknown: 1, stale: 2, failing: 3, missing: 4 };

const DEFAULT_PATHS = {
  snapshot: 'frontend/public/data/forecasts-latest.json',
  manifest: 'backend/data/forecasts/manifest.json',
  alerts: 'frontend/public/data/alerts-latest.json',
  probe: 'data/site-health/latest.json',
  out: 'frontend/public/data/freshness.json',
};

/* ────────────────────────────── small helpers ────────────────────────────── */

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function round1(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

/**
 * Age in hours of an ISO-8601 instant, or null when the value is missing/unparseable.
 * Never returns a number for an invalid input — a wrong age on the status page is worse
 * than "unknown".
 */
export function ageHoursFrom(invalid, now = new Date()) {
  if (typeof invalid !== 'string' || invalid.trim() === '') return null;
  const parsed = Date.parse(invalid);
  if (!Number.isFinite(parsed)) return null;
  return (now.getTime() - parsed) / 3_600_000;
}

/**
 * Age in hours of a date-granular `YYYY-MM-DD` field, measured from that day's UTC midnight.
 * Same convention as `backend/metrics.js` `forecastAgeHoursFromPredictionDate`.
 */
export function ageHoursFromPredictionDate(predictionDate, now = new Date()) {
  if (typeof predictionDate !== 'string' || predictionDate.length < 10) return null;
  const parsed = Date.parse(`${predictionDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  return (now.getTime() - parsed) / 3_600_000;
}

/** `fresh` inside the SLO, `stale` outside it, `unknown` when the age itself is unknown. */
export function classify(ageHours, sloHours) {
  if (!Number.isFinite(ageHours)) return 'unknown';
  return ageHours <= sloHours ? 'fresh' : 'stale';
}

/** Read a JSON file without throwing; a parse error is reported like a missing file. */
export function readJsonSafe(filePath) {
  if (!filePath || !existsSync(filePath)) return { value: null, error: 'missing' };
  try {
    return { value: JSON.parse(readFileSync(filePath, 'utf8')), error: null };
  } catch (error) {
    return { value: null, error: `unparseable JSON: ${error.message}` };
  }
}

/* ─────────────────────────────── sources ─────────────────────────────── */

function forecastIngestSource({ manifest, now }) {
  if (!isRecord(manifest)) {
    return {
      id: 'forecast_ingest',
      label: 'Forecast ingest run',
      artifact: DEFAULT_PATHS.manifest,
      state: 'missing',
      reason: 'no readable ingest manifest — the pipeline has not published a run to this checkout',
      generated_at: null,
      prediction_date: null,
      age_hours: null,
      run_age_hours: null,
      slo_hours: FORECAST_SLO_HOURS,
      detail: null,
    };
  }
  const age = ageHoursFromPredictionDate(manifest.prediction_date, now);
  const runAge = ageHoursFrom(manifest.generated_at, now);
  const state = classify(age, FORECAST_SLO_HOURS);
  return {
    id: 'forecast_ingest',
    label: 'Forecast ingest run',
    artifact: DEFAULT_PATHS.manifest,
    state,
    reason:
      state === 'fresh'
        ? null
        : state === 'stale'
          ? `prediction_date ${manifest.prediction_date} is ${round1(age)} h old (SLO ${FORECAST_SLO_HOURS} h)`
          : 'the manifest has no parseable prediction_date',
    generated_at: typeof manifest.generated_at === 'string' ? manifest.generated_at : null,
    prediction_date: typeof manifest.prediction_date === 'string' ? manifest.prediction_date : null,
    age_hours: round1(age),
    run_age_hours: round1(runAge),
    slo_hours: FORECAST_SLO_HOURS,
    detail: {
      source: typeof manifest.source === 'string' ? manifest.source : null,
      row_count: finiteOrNull(manifest.row_count),
      csv_sha256: typeof manifest.csv_sha256 === 'string' ? manifest.csv_sha256 : null,
    },
  };
}

function forecastSnapshotSource({ snapshot, now }) {
  if (!isRecord(snapshot)) {
    return {
      id: 'forecast_snapshot',
      label: 'Website forecast snapshot',
      artifact: DEFAULT_PATHS.snapshot,
      state: 'missing',
      reason: 'no readable website snapshot — the deployable build has no forecast data',
      generated_at: null,
      prediction_date: null,
      age_hours: null,
      run_age_hours: null,
      slo_hours: FORECAST_SLO_HOURS,
      detail: null,
    };
  }
  const age = ageHoursFromPredictionDate(snapshot.prediction_date, now);
  const runAge = ageHoursFrom(snapshot.generated_at, now);
  const state = classify(age, FORECAST_SLO_HOURS);
  return {
    id: 'forecast_snapshot',
    label: 'Website forecast snapshot',
    artifact: DEFAULT_PATHS.snapshot,
    state,
    reason:
      state === 'fresh'
        ? null
        : state === 'stale'
          ? `prediction_date ${snapshot.prediction_date} is ${round1(age)} h old (SLO ${FORECAST_SLO_HOURS} h)`
          : 'the snapshot has no parseable prediction_date',
    generated_at: typeof snapshot.generated_at === 'string' ? snapshot.generated_at : null,
    prediction_date: typeof snapshot.prediction_date === 'string' ? snapshot.prediction_date : null,
    age_hours: round1(age),
    run_age_hours: round1(runAge),
    slo_hours: FORECAST_SLO_HOURS,
    detail: {
      schema: typeof snapshot.schema === 'string' ? snapshot.schema : null,
      source: typeof snapshot.source === 'string' ? snapshot.source : null,
    },
  };
}

function alertEngineSource({ alerts, now }) {
  if (!isRecord(alerts)) {
    return {
      id: 'alert_engine',
      label: 'Alert snapshot',
      artifact: DEFAULT_PATHS.alerts,
      state: 'missing',
      reason: 'no readable alert snapshot — the alert page has only its live API path',
      generated_at: null,
      age_hours: null,
      slo_hours: ALERTS_SLO_HOURS,
      detail: null,
    };
  }
  const age = ageHoursFrom(alerts.generated_at, now);
  const state = classify(age, ALERTS_SLO_HOURS);
  return {
    id: 'alert_engine',
    label: 'Alert snapshot',
    artifact: DEFAULT_PATHS.alerts,
    state,
    reason:
      state === 'fresh'
        ? null
        : state === 'stale'
          ? `the snapshot was built ${round1(age)} h ago (SLO ${ALERTS_SLO_HOURS} h)`
          : 'the snapshot has no parseable generated_at',
    generated_at: typeof alerts.generated_at === 'string' ? alerts.generated_at : null,
    age_hours: round1(age),
    slo_hours: ALERTS_SLO_HOURS,
    detail: {
      schema: typeof alerts.schema === 'string' ? alerts.schema : null,
      policy_version: typeof alerts.policy_version === 'string' ? alerts.policy_version : null,
      assessed: finiteOrNull(alerts.assessed),
      published: Array.isArray(alerts.alerts) ? alerts.alerts.length : null,
      not_published: finiteOrNull(alerts.counts?.not_published),
      dropped_unpublished: finiteOrNull(alerts.counts?.dropped_unpublished),
    },
  };
}

function siteProbeSource({ probe, now }) {
  const base = {
    id: 'site_probe',
    label: 'Site-health probe (every 30 min)',
    artifact: DEFAULT_PATHS.probe,
    generated_at: null,
    age_hours: null,
    slo_hours: PROBE_SLO_HOURS,
    detail: null,
  };
  if (!isRecord(probe)) {
    return {
      ...base,
      state: 'unknown',
      outcome: 'unknown',
      reason:
        'no probe result has been published to this checkout yet — the status page reports ' +
        'the data it can see, and says so instead of assuming the site is healthy',
    };
  }
  const age = ageHoursFrom(probe.ran_at, now);
  const failed = Array.isArray(probe.checks)
    ? probe.checks.filter((check) => isRecord(check) && check.outcome && check.outcome !== 'success')
    : [];
  const outcome = probe.outcome === 'pass' && failed.length === 0 ? 'pass' : 'fail';
  const state = outcome === 'fail' ? 'failing' : classify(age, PROBE_SLO_HOURS);
  const reason =
    outcome === 'fail'
      ? `the last probe run reported ${failed.length} failed check(s): ${failed
          .map((check) => check.id)
          .join(', ')}`
      : state === 'fresh'
        ? null
        : `the last probe result is ${round1(age)} h old (SLO ${PROBE_SLO_HOURS} h)`;
  return {
    ...base,
    state,
    outcome,
    reason,
    generated_at: typeof probe.ran_at === 'string' ? probe.ran_at : null,
    ran_at: typeof probe.ran_at === 'string' ? probe.ran_at : null,
    age_hours: round1(age),
    detail: {
      run_url: typeof probe.run_url === 'string' ? probe.run_url : null,
      site_url: typeof probe.site_url === 'string' ? probe.site_url : null,
      passed: Array.isArray(probe.checks) ? probe.checks.length - failed.length : null,
      failed: Array.isArray(probe.checks) ? failed.length : null,
      checks: Array.isArray(probe.checks)
        ? probe.checks
            .filter(isRecord)
            .map((check) => ({
              id: typeof check.id === 'string' ? check.id : 'unnamed',
              outcome: typeof check.outcome === 'string' ? check.outcome : 'unknown',
              detail: typeof check.detail === 'string' ? check.detail : null,
            }))
        : null,
    },
  };
}

/* ───────────────────────── authority / coverage ───────────────────────── */

/**
 * The model provenance block, copied verbatim from the snapshot's `provenance`.
 * Deliberately never defaulted: `model_version: null` is the honest value while the
 * pipeline does not stamp one, and it is what blocks §1.6 publication.
 */
export function modelBlock(snapshot) {
  const provenance = isRecord(snapshot) && isRecord(snapshot.provenance) ? snapshot.provenance : {};
  const version = typeof provenance.model_version === 'string' ? provenance.model_version : null;
  return {
    model_version: version,
    stamped: version !== null,
    tensor_build_id: typeof provenance.tensor_build_id === 'string' ? provenance.tensor_build_id : null,
    pipeline_version: typeof provenance.pipeline_version === 'string' ? provenance.pipeline_version : null,
    run_id: typeof provenance.run_id === 'string' ? provenance.run_id : null,
    dataset_version: isRecord(snapshot) && typeof snapshot.dataset_version === 'string' ? snapshot.dataset_version : null,
    soil_channels_fabricated:
      isRecord(snapshot) && typeof snapshot.soil_channels_fabricated === 'boolean'
        ? snapshot.soil_channels_fabricated
        : null,
  };
}

/** The coverage stamp, copied from the snapshot — never recomputed from the rows. */
export function coverageBlock(snapshot) {
  const coverage = isRecord(snapshot) && isRecord(snapshot.coverage) ? snapshot.coverage : null;
  if (!coverage) return null;
  return {
    status: typeof coverage.status === 'string' ? coverage.status : null,
    requested_units: finiteOrNull(coverage.requested_units),
    produced_units: finiteOrNull(coverage.produced_units),
    units_per_horizon: isRecord(coverage.units_per_horizon) ? coverage.units_per_horizon : null,
    districts_covered: finiteOrNull(coverage.districts_covered),
    districts_expected: finiteOrNull(coverage.districts_expected),
    missing_district_ids: Array.isArray(coverage.missing_district_ids) ? coverage.missing_district_ids : null,
    missing_district_names: Array.isArray(coverage.missing_district_names) ? coverage.missing_district_names : null,
    horizons: Array.isArray(coverage.horizons) ? coverage.horizons : null,
    skipped: Array.isArray(coverage.skipped) ? coverage.skipped : [],
  };
}

/**
 * Facts a reader of the page must not have to infer. Only statements that are true of the
 * inputs are emitted — no boilerplate, no reassurance.
 */
export function honestyNotes({ sources, coverage, model, alerts }) {
  const notes = [];
  const byId = Object.fromEntries(sources.map((source) => [source.id, source]));

  if (model.model_version === null) {
    notes.push(
      'model_version is null: the ingest pipeline does not stamp one yet, so nothing can be ' +
        'auto-published above WATCH and the alert engine records publication_blocked instead of ' +
        'issuing an alert (PRODUCT_SPEC §1.6).',
    );
  }
  if (coverage && coverage.status && coverage.status !== 'complete') {
    notes.push(
      `the forecast run reports coverage status "${coverage.status}": ` +
        `${coverage.districts_covered ?? 'unknown'} of ${coverage.districts_expected ?? 'unknown'} ` +
        'districts have a row for at least one horizon.',
    );
  }
  if (coverage && coverage.missing_district_ids === null) {
    notes.push(
      'the run did not report which districts are missing, so this page cannot name them — ' +
        'absent is reported as absent, not as "none".',
    );
  }
  if (isRecord(alerts) && Number.isFinite(alerts.counts?.not_published) && alerts.counts.not_published > 0) {
    notes.push(
      `${alerts.counts.not_published} assessed district/horizon rows produced no published alert ` +
        '(§1.6 requires a model version the pipeline does not stamp yet); the batch reports them as ' +
        'not_published rather than dropping them silently.',
    );
  }
  if (byId.site_probe?.state === 'unknown') {
    notes.push(
      'no site-health probe result is committed here, so the live-surface checks are unknown ' +
        'on this page — check the Site Health Probe workflow for the current run.',
    );
  }
  if (byId.site_probe?.state === 'failing') {
    notes.push(
      'the most recent site-health probe failed: the deployed surface is not currently ' +
        'satisfying its own checks (see the probe run for which ones).',
    );
  }
  for (const source of sources) {
    if (source.state === 'missing' && source.id !== 'site_probe') {
      notes.push(`missing input: ${source.artifact} (${source.reason}).`);
    }
  }
  if (sources.some((source) => source.id.startsWith('forecast') && source.prediction_date)) {
    notes.push(
      'forecast ages are measured from the date-granular prediction_date (UTC midnight), so they ' +
        'carry up to ±24 h of granularity.',
    );
  }
  return notes;
}

/* ────────────────────────────── the artifact ────────────────────────────── */

export function buildFreshnessArtifact({
  now = new Date(),
  snapshot = null,
  manifest = null,
  alerts = null,
  probe = null,
  generatedBy = 'scripts/build_freshness_artifact.mjs',
} = {}) {
  const sources = [
    forecastIngestSource({ manifest, now }),
    forecastSnapshotSource({ snapshot, now }),
    alertEngineSource({ alerts, now }),
    siteProbeSource({ probe, now }),
  ];
  const coverage = coverageBlock(snapshot);
  const model = modelBlock(snapshot);

  const worst = sources.reduce(
    (acc, source) => (STATE_SEVERITY[source.state] > STATE_SEVERITY[acc] ? source.state : acc),
    'fresh',
  );
  const counts = { fresh: 0, stale: 0, failing: 0, missing: 0, unknown: 0 };
  for (const source of sources) counts[source.state] += 1;

  return {
    schema: FRESHNESS_SCHEMA,
    built_at: now.toISOString(),
    generated_by: generatedBy,
    what_this_is:
      'A derived statement about the committed data artifacts this deployment ships. It is not a ' +
      'live probe and it does not measure the running services — the site-health probe result it ' +
      'carries is whatever the last scheduled run published.',
    overall: {
      state: worst,
      counts,
      not_fresh: sources.filter((source) => source.state !== 'fresh').map((source) => source.id),
    },
    sources,
    coverage,
    model,
    honesty: honestyNotes({ sources, coverage, model, alerts }),
    inputs: {
      forecast_snapshot: {
        path: DEFAULT_PATHS.snapshot,
        generated_at: isRecord(snapshot) && typeof snapshot.generated_at === 'string' ? snapshot.generated_at : null,
      },
      forecast_manifest: {
        path: DEFAULT_PATHS.manifest,
        generated_at: isRecord(manifest) && typeof manifest.generated_at === 'string' ? manifest.generated_at : null,
      },
      alerts_snapshot: {
        path: DEFAULT_PATHS.alerts,
        generated_at: isRecord(alerts) && typeof alerts.generated_at === 'string' ? alerts.generated_at : null,
      },
      site_probe: {
        path: DEFAULT_PATHS.probe,
        ran_at: isRecord(probe) && typeof probe.ran_at === 'string' ? probe.ran_at : null,
      },
    },
  };
}

/**
 * The time-independent projection of an artifact — everything that must not drift between a
 * committed artifact and the committed inputs. Ages and states are excluded on purpose: they
 * are functions of the clock, and a gate that fails because a day passed would be turned off
 * within a week.
 */
export function stableView(artifact) {
  if (!isRecord(artifact)) return null;
  return {
    schema: artifact.schema,
    coverage: artifact.coverage ?? null,
    model: artifact.model ?? null,
    sources: (Array.isArray(artifact.sources) ? artifact.sources : []).map((source) => ({
      id: source.id,
      artifact: source.artifact,
      generated_at: source.generated_at ?? null,
      prediction_date: source.prediction_date ?? null,
      outcome: source.outcome ?? null,
      detail: source.detail ?? null,
    })),
    inputs: artifact.inputs ?? null,
  };
}

/* ──────────────────────────────── the CLI ──────────────────────────────── */

function parseArgs(argv) {
  const args = { check: false, now: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') args.check = true;
    else if (arg === '--now') args.now = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--snapshot') args.snapshot = argv[++i];
    else if (arg === '--manifest') args.manifest = argv[++i];
    else if (arg === '--alerts') args.alerts = argv[++i];
    else if (arg === '--probe') args.probe = argv[++i];
  }
  return args;
}

export function readInputs(paths) {
  const snapshot = readJsonSafe(paths.snapshot);
  const manifest = readJsonSafe(paths.manifest);
  const alerts = readJsonSafe(paths.alerts);
  const probe = readJsonSafe(paths.probe);
  return {
    snapshot: snapshot.value,
    manifest: manifest.value,
    alerts: alerts.value,
    probe: probe.value,
    errors: {
      snapshot: snapshot.error,
      manifest: manifest.error,
      alerts: alerts.error,
      probe: probe.error,
    },
  };
}

function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '..');
  const args = parseArgs(process.argv.slice(2));
  const paths = {
    ...DEFAULT_PATHS,
    snapshot: args.snapshot ?? path.join(repoRoot, DEFAULT_PATHS.snapshot),
    manifest: args.manifest ?? path.join(repoRoot, DEFAULT_PATHS.manifest),
    alerts: args.alerts ?? path.join(repoRoot, DEFAULT_PATHS.alerts),
    probe: args.probe ?? path.join(repoRoot, DEFAULT_PATHS.probe),
    out: args.out ?? path.join(repoRoot, DEFAULT_PATHS.out),
  };
  const now = args.now ? new Date(args.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    console.error(`[freshness] --now is not a date: ${args.now}`);
    process.exit(2);
  }

  const inputs = readInputs(paths);
  const artifact = buildFreshnessArtifact({ now, ...inputs });

  for (const [name, error] of Object.entries(inputs.errors)) {
    if (error) console.warn(`[freshness] input ${name}: ${error}`);
  }

  if (args.check) {
    const existing = readJsonSafe(paths.out);
    if (existing.error) {
      console.error(`[freshness] --check: no readable artifact at ${DEFAULT_PATHS.out} (${existing.error})`);
      process.exit(1);
    }
    const expected = stableView(artifact);
    const actual = stableView(existing.value);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      console.error('[freshness] --check: the committed artifact no longer describes the committed inputs.');
      console.error(`  expected: ${JSON.stringify(expected)}`);
      console.error(`  actual:   ${JSON.stringify(actual)}`);
      console.error('  Re-run `node scripts/build_freshness_artifact.mjs` and commit the result.');
      process.exit(1);
    }
    console.log(`[freshness] --check: artifact matches its inputs (${artifact.overall.state} overall).`);
    return;
  }

  mkdirSync(path.dirname(paths.out), { recursive: true });
  writeFileSync(paths.out, `${JSON.stringify(artifact, null, 2)}\n`);
  const stale = artifact.sources.filter((source) => source.state !== 'fresh').map((source) => `${source.id}=${source.state}`);
  console.log(
    `[freshness] wrote ${path.relative(repoRoot, paths.out)} — overall ${artifact.overall.state}` +
      (stale.length ? ` (${stale.join(', ')})` : ''),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
