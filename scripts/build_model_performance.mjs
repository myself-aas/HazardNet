#!/usr/bin/env node
/**
 * The validation surface (Phase 9 §8.1) — `frontend/public/data/model-performance.json`.
 *
 * WHY THIS EXISTS
 * ---------------
 * Phase 9 produced four hindcast reports — Amphan 2020, Yaas 2021, the August 2024 eastern
 * floods and the June 2025 northeast floods — and every one of them is a committed JSON file
 * that CI re-derives from its committed inputs (`python -m hindcast.cli check --require-reports`).
 * Nothing was reading them. The model card's numbers stayed un-audited on the site, and the one
 * page a journalist, a reviewer or an agency analyst actually asks for — "how did it do?" — did
 * not exist.
 *
 * So this script is the missing reader: it projects the four reports into one artifact that the
 * Phase 8 content engine turns into `/model-performance`, and it refuses to publish anything the
 * reports do not say.
 *
 * THE RULE THAT MATTERS MOST
 * --------------------------
 * There is **no headline accuracy number**, and this script enforces that structurally rather
 * than by convention:
 *
 *   * every field is copied through an explicit allow-list — never spread — so a metric the
 *     plan never asked for (the harness's own `accuracy`, `f1`, `precision`, `frequency_bias`)
 *     cannot leak into the public artifact by accident;
 *   * the finished document is scanned and the build fails if it contains one of those keys;
 *   * the four reports are not pooled into a single score. Detection is reported per episode
 *     against that episode's own named districts, and the totals that are published are counts
 *     of episodes and districts — never an average of POD/FAR/CSI across episodes, which would
 *     be a number about a dataset that does not exist.
 *
 * It also refuses to build from a report that claims something the harness cannot do:
 * `cnn_evaluated: true` (the CNN was never re-run — see each report's `cnn_note`) or
 * `drivers.is_forecast: true` (the drivers are reanalysis, so every number is a ceiling on
 * detection rather than forecast skill). A hand-edited report that overstates either one fails
 * here instead of on the site.
 *
 * DETERMINISM
 * -----------
 * The artifact carries no clock: not `generated_at`, not "now". It carries the input reports'
 * own `generated_at` values and their sha256, so rebuilding without changing an input produces a
 * byte-identical file and `--check` is an exact string comparison — the same discipline the
 * hindcast reports themselves use (`hindcast.cli stable_view`). A pipeline that rebuilds the
 * site every 15 minutes cannot churn this file, and CI can gate on it without a clock exemption.
 *
 * USAGE
 *   node scripts/build_model_performance.mjs                 # write the artifact
 *   node scripts/build_model_performance.mjs --check         # fail if the committed file differs
 *   node scripts/build_model_performance.mjs --out /tmp/x.json
 *   node scripts/build_model_performance.mjs --reports-dir data/hindcast/reports
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA = 'hazardnet-model-performance/v1';
export const REPORT_SCHEMA = 'hazardnet-hindcast-report/v1';
export const ORIGIN = 'https://www.hazardnet.live';

const DEFAULT_PATHS = {
  reportsDir: 'data/hindcast/reports',
  driversDir: 'data/hindcast/drivers',
  out: 'frontend/public/data/model-performance.json',
};

/** Keys the public artifact may never carry: they read as a headline accuracy the plan forbids. */
const FORBIDDEN_KEYS = ['accuracy', 'f1', 'precision', 'recall', 'frequency_bias', 'brier', 'log_loss'];

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const int = (value) => (typeof value === 'number' && Number.isInteger(value) ? value : null);
const str = (value) => (typeof value === 'string' && value.trim() ? value : null);

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** A report that overstates what the harness did must never become a page. */
export function assertHonestReport(report, file) {
  const where = path.basename(file);
  if (report?.schema !== REPORT_SCHEMA) {
    throw new Error(`${where}: schema ${JSON.stringify(report?.schema)} != ${REPORT_SCHEMA}`);
  }
  const method = report.what_was_hindcast ?? {};
  if (method.cnn_evaluated !== false) {
    throw new Error(`${where}: cnn_evaluated must be false — the harness cannot re-run the CNN`);
  }
  if (method.drivers?.is_forecast !== false) {
    throw new Error(`${where}: drivers.is_forecast must be false — reanalysis is not forecast skill`);
  }
  const episode = report.episode ?? {};
  for (const key of ['id', 'title', 'hazard_class', 'onset_date']) {
    if (!str(episode[key])) throw new Error(`${where}: episode.${key} is missing`);
  }
  if (!Array.isArray(report.detection?.per_district) || report.detection.per_district.length === 0) {
    throw new Error(`${where}: detection.per_district is empty — the report scored nothing`);
  }
  if (!Array.isArray(report.citations) || report.citations.length === 0) {
    throw new Error(`${where}: no citations — a truth set without sources is not a truth set`);
  }
  if (!Array.isArray(report.caveats) || report.caveats.length === 0) {
    throw new Error(`${where}: no caveats — every number here needs its limit stated beside it`);
  }
  return where;
}

function detectionBlock(detection) {
  return {
    named_districts: int(detection?.named_districts),
    districts_with_a_scored_row: int(detection?.districts_with_a_scored_row),
    flagged_any_class: int(detection?.flagged_any_class),
    flagged_the_episode_class: int(detection?.flagged_episode_class),
    episode_class_over_threshold: int(detection?.episode_class_over_threshold),
    alarm_threshold: num(detection?.alarm_threshold),
    per_horizon: {
      '7_days': {
        named_districts_with_a_row: int(detection?.per_horizon?.['7_days']?.named_districts_with_a_row),
        flagged_any_class: int(detection?.per_horizon?.['7_days']?.flagged_any_class),
      },
      '15_days': {
        named_districts_with_a_row: int(detection?.per_horizon?.['15_days']?.named_districts_with_a_row),
        flagged_any_class: int(detection?.per_horizon?.['15_days']?.flagged_any_class),
      },
    },
  };
}

/**
 * Only the three scores the plan asked for. `pod` is `null` wherever the episode has no named
 * outcome inside a prediction window — `null` travels with the report's own explanation rather
 * than being rendered as `0.0`, which would read as "the model missed everything".
 */
function scoresBlock(evaluation) {
  const events = evaluation?.scores?.events ?? {};
  return {
    status: str(evaluation?.status),
    status_reason: str(evaluation?.reason),
    scored_samples: int(evaluation?.scored_samples),
    predictions: int(evaluation?.counts?.predictions),
    outcomes: int(evaluation?.counts?.outcomes),
    matched: int(evaluation?.counts?.matched),
    unmatched_no_outcome: int(evaluation?.counts?.unmatched_no_outcome),
    hits: int(events.hits),
    misses: int(events.misses),
    false_alarms: int(events.false_alarms),
    observed_events: int(events.observed_events),
    forecast_events: int(events.forecast_events),
    pod: num(evaluation?.pod),
    far: num(evaluation?.far),
    csi: num(evaluation?.csi),
  };
}

function thresholdRows(episodeId, rows) {
  if (!Array.isArray(rows)) throw new Error(`${episodeId}: threshold_sensitivity is missing`);
  return rows.map((row) => ({
    episode: episodeId,
    alarm_threshold: num(row.alarm_threshold),
    band: str(row.note),
    scored_samples: int(row.scored_samples),
    hits: int(row.hits),
    misses: int(row.misses),
    false_alarms: int(row.false_alarms),
    pod: num(row.pod),
    far: num(row.far),
  }));
}

/**
 * The wind-driver comparison. Note the range and the false alarms are the report's; the builder
 * adds nothing except a per-driver label, because the comparison is the whole point of §4.1 —
 * the shipped pipeline scores the *sustained* maximum, and for two of the four episodes that
 * choice, not the formula, is what decides detectability.
 */
function driversBlock(episodeId, drivers) {
  if (!drivers?.era5_10m_sustained || !drivers?.era5_10m_gust) {
    throw new Error(`${episodeId}: wind driver comparison missing from the report`);
  }
  // Which of the two is "shipped" flipped on 2026-09-18. The corrected physics wiring scores the
  // two wind-damage classes from the gust (`era5_10m_gust`), because the unit is a district
  // centroid and a centroid is not the eyewall; the sustained maximum is what the pre-correction
  // pipeline used, and it stays in the document as the legacy half of the comparison.
  const pick = (block) => ({
    rows: int(block.rows),
    wind_kmh_min: num(block.wind_kmh?.min),
    wind_kmh_max: num(block.wind_kmh?.max),
    episode_class_score_min: num(block.episode_class_score?.min),
    episode_class_score_max: num(block.episode_class_score?.max),
    named_the_episode_class: int(block.named_the_episode_class),
    episode_class_over_threshold: int(block.episode_class_over_threshold),
    top_class_distribution: block.top_class_distribution ?? {},
  });
  return {
    shipped: { name: 'era5_10m_gust', ...pick(drivers.era5_10m_gust) },
    legacy: { name: 'era5_10m_sustained', ...pick(drivers.era5_10m_sustained) },
    finding: str(drivers.finding),
  };
}

function saturationBlock(episodeId, saturated) {
  if (!saturated) throw new Error(`${episodeId}: physics_diagnostics.saturated_terms missing`);
  const block = {};
  for (const [term, value] of Object.entries(saturated)) {
    block[term] = {
      rows: int(value.rows),
      rows_at_ceiling: int(value.rows_at_ceiling),
      // The same count under the pre-correction wiring, so the before/after is a number pair in
      // the artifact rather than a sentence in a commit message.
      legacy_rows_at_ceiling: int(value.legacy_rows_at_ceiling),
      // The measured argument the corrected wiring passes, and the one the pre-correction
      // wiring passed. Both are published so the reader can see the defect and the fix.
      term: str(value.term),
      legacy_term: str(value.legacy_term),
      legacy_argument: value.legacy_argument === null || value.legacy_argument === undefined
        ? null : num(value.legacy_argument),
    };
  }
  return block;
}

function sourcesOf(episode) {
  const sources = Array.isArray(episode.sources) ? episode.sources : [];
  return sources.map((source) => ({
    id: str(source.id),
    citation: str(source.citation),
    url: str(source.url),
    accessed: str(source.accessed),
    what_it_evidences: str(source.what_it_evidences),
  }));
}

/** One report → one episode block. Every field here is named explicitly, by design. */
export function episodeBlock(report, { reportPath, reportSha }) {
  const episode = report.episode;
  const physics = report.physics_diagnostics ?? {};
  return {
    id: episode.id,
    title: episode.title,
    hazard_class: episode.hazard_class,
    onset_date: episode.onset_date,
    affected_count: int(episode.affected_count),
    truth_completeness: str(episode.truth_completeness),
    truth_notes: Array.isArray(episode.truth_notes) ? episode.truth_notes.map(str).filter(Boolean) : [],
    known_limitations: Array.isArray(episode.known_limitations) ? episode.known_limitations.map(str).filter(Boolean) : [],
    report: { path: reportPath, sha256: reportSha, generated_at: str(report.generated_at) },
    sources: sourcesOf(episode),
    detection: detectionBlock(report.detection),
    scores: scoresBlock(report.evaluation),
    drivers: driversBlock(episode.id, physics.wind_drivers),
    saturation: saturationBlock(episode.id, physics.saturated_terms),
    top_class_distribution: {
      shipped: physics.top_class_distribution_shipped ?? {},
      legacy: physics.top_class_distribution_legacy ?? {},
    },
    wiring_finding: str(physics.finding),
    corrected_driver_ranges: physics.corrected_driver_ranges ?? {},
    alarmed_without_a_recorded_impact: int(report.alarmed_without_a_recorded_impact?.count),
    caveats: Array.isArray(report.caveats) ? report.caveats.map(str).filter(Boolean) : [],
  };
}

/**
 * Build the document from a directory of reports. Exported so the tests and the content engine
 * can call it with fixtures instead of the repository's own files.
 */
export function buildDocument({ reportsDir, driversDir, rootDir }) {
  const dir = path.isAbsolute(reportsDir) ? reportsDir : path.join(rootDir, reportsDir);
  const files = existsSync(dir)
    ? readdirSync(dir).filter((name) => name.endsWith('.json')).sort()
    : [];
  if (files.length === 0) {
    throw new Error(`no hindcast reports in ${path.relative(rootDir, dir) || dir} — nothing to publish`);
  }

  const reports = files.map((name) => {
    const full = path.join(dir, name);
    return {
      full,
      relPath: path.relative(rootDir, full).split(path.sep).join('/'),
      sha: sha256(full),
      raw: JSON.parse(readFileSync(full, 'utf8')),
    };
  });

  let hindcastVersion = null;
  const episodes = [];
  const seen = new Set();
  for (const entry of reports) {
    assertHonestReport(entry.raw, entry.full);
    const version = str(entry.raw.hindcast_version);
    if (!version) throw new Error(`${path.basename(entry.full)}: hindcast_version missing`);
    if (hindcastVersion === null) hindcastVersion = version;
    else if (hindcastVersion !== version) {
      throw new Error(
        `${path.basename(entry.full)}: hindcast_version ${version} != ${hindcastVersion} — ` +
          'the reports were produced by different harnesses and may not share a page',
      );
    }
    const block = episodeBlock(entry.raw, { reportPath: entry.relPath, reportSha: entry.sha });
    if (seen.has(block.id)) throw new Error(`episode ${block.id} appears twice`);
    seen.add(block.id);
    episodes.push({ block, method: entry.raw.what_was_hindcast ?? {}, citations: entry.raw.citations });
  }

  episodes.sort((a, b) => (a.block.onset_date < b.block.onset_date ? -1 : a.block.onset_date > b.block.onset_date ? 1 : a.block.id.localeCompare(b.block.id)));

  const method = episodes[0].method;
  for (const entry of episodes) {
    if (entry.method.drivers?.product !== method.drivers?.product) {
      throw new Error('the reports disagree about the driver product — they are not comparable');
    }
  }

  const thresholdSensitivity = reports
    .flatMap((entry) => thresholdRows(entry.raw.episode.id, entry.raw.threshold_sensitivity))
    .sort((a, b) => (a.episode === b.episode ? a.alarm_threshold - b.alarm_threshold : a.episode.localeCompare(b.episode)));

  const unique = (items) => {
    const out = [];
    const key = (item) => (typeof item === 'string' ? item : JSON.stringify(item));
    const seenItems = new Set();
    for (const item of items) {
      if (item === null || item === undefined) continue;
      const k = key(item);
      if (seenItems.has(k)) continue;
      seenItems.add(k);
      out.push(item);
    }
    return out;
  };

  const totals = episodes.reduce(
    (acc, { block }) => {
      acc.episodes += 1;
      acc.named_districts += block.detection.named_districts ?? 0;
      acc.districts_with_a_scored_row += block.detection.districts_with_a_scored_row ?? 0;
      acc.flagged_any_class += block.detection.flagged_any_class ?? 0;
      acc.flagged_the_episode_class += block.detection.flagged_the_episode_class ?? 0;
      acc.episode_class_over_threshold += block.detection.episode_class_over_threshold ?? 0;
      acc.scored_samples += block.scores.scored_samples ?? 0;
      acc.alarmed_without_a_recorded_impact += block.alarmed_without_a_recorded_impact ?? 0;
      if (block.scores.pod !== null) acc.episodes_with_a_computable_pod += 1;
      return acc;
    },
    {
      episodes: 0,
      named_districts: 0,
      districts_with_a_scored_row: 0,
      flagged_any_class: 0,
      flagged_the_episode_class: 0,
      episode_class_over_threshold: 0,
      scored_samples: 0,
      alarmed_without_a_recorded_impact: 0,
      episodes_with_a_computable_pod: 0,
    },
  );

  const drivers = method.drivers ?? {};
  const document = {
    schema: SCHEMA,
    generated_by: 'scripts/build_model_performance.mjs',
    origin: ORIGIN,
    artifact_url: `${ORIGIN}/data/model-performance.json`,
    hindcast_version: hindcastVersion,
    built_from: reports.map((entry) => ({
      path: entry.relPath,
      sha256: entry.sha,
      generated_at: str(entry.raw.generated_at),
    })),
    method: {
      // Deliberately not the runner's absolute path: the report records where the driver series
      // lived on the machine that scored the episode, which is not something to publish.
      driver_series_dir: `${driversDir}/`,
      product: str(drivers.product),
      endpoint: str(drivers.endpoint),
      variables: Array.isArray(drivers.variables) ? drivers.variables : [],
      is_forecast: drivers.is_forecast === true,
      is_forecast_note: str(drivers.is_forecast_note),
      cnn_evaluated: method.cnn_evaluated === true,
      cnn_note: str(method.cnn_note),
      alarm_threshold: num(method.alarm_threshold),
      horizons: Array.isArray(method.horizons)
        ? method.horizons.map((horizon) => ({
            name: str(horizon?.name),
            lead_days: int(horizon?.lead_days),
          }))
        : [],
      absence_means_no_event: method.absence_means_no_event === true,
      absence_means_no_event_reason: str(method.absence_means_no_event_reason),
    },
    totals,
    episodes: episodes.map((entry) => entry.block),
    threshold_sensitivity: thresholdSensitivity,
    not_published: unique(episodes.flatMap((entry) => entry.block.caveats)),
    how_to_read: unique(episodes.flatMap((entry) => (Array.isArray(entry.method.how_to_read) ? entry.method.how_to_read : []))).map(str),
    citations: unique(
      episodes.flatMap((entry) =>
        entry.citations.map((citation) => ({
          id: str(citation.id),
          citation: str(citation.citation),
          url: str(citation.url),
          accessed: str(citation.accessed),
        })),
      ),
    ).filter((citation) => citation.citation),
  };

  assertNoHeadlineAccuracy(document);
  return document;
}

/**
 * The structural guard: scan the serialized artifact for a metric the plan forbids. This runs on
 * every build, so a future field added upstream cannot arrive on the page unnoticed.
 */
export function assertNoHeadlineAccuracy(document) {
  const serialized = JSON.stringify(document);
  for (const key of FORBIDDEN_KEYS) {
    if (serialized.includes(`"${key}"`)) {
      throw new Error(
        `the artifact carries a "${key}" field — the plan forbids publishing a headline accuracy ` +
          'metric; publish detection counts and POD/FAR/CSI only',
      );
    }
  }
  return document;
}

/** The published artifact must also state, in words, what it is not. */
function assertStatedLimits(document) {
  const text = JSON.stringify(document).toLowerCase();
  if (!text.includes('reanalysis')) {
    throw new Error('the artifact does not state that the drivers are reanalysis, not archived forecast');
  }
  if (!text.includes('not')) {
    throw new Error('the artifact states no limitation at all');
  }
  return document;
}

function parseArgs(argv) {
  const args = { check: false, out: null, reportsDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--check') args.check = true;
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--reports-dir') args.reportsDir = argv[++i];
  }
  return args;
}

function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, '..');
  const args = parseArgs(process.argv.slice(2));
  const reportsDir = args.reportsDir ?? DEFAULT_PATHS.reportsDir;
  const out = args.out ?? path.join(rootDir, DEFAULT_PATHS.out);

  const document = assertStatedLimits(buildDocument({ reportsDir, driversDir: DEFAULT_PATHS.driversDir, rootDir }));
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  const relative = path.isAbsolute(out) ? path.relative(rootDir, out) : out;
  const relativeOut = relative.startsWith('..') ? out : relative || out;

  if (args.check) {
    if (!existsSync(out)) {
      console.error(`[model-performance] --check: no readable ${relativeOut}`);
      process.exit(1);
    }
    const committed = readFileSync(out, 'utf8');
    if (committed !== serialized) {
      console.error('[model-performance] --check: the committed artifact no longer matches the reports.');
      console.error('  Re-run `node scripts/build_model_performance.mjs` and commit the result.');
      process.exit(1);
    }
    console.log(`[model-performance] --check: ${document.episodes.length} episodes match their reports.`);
    return;
  }

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, serialized);
  console.log(
    `[model-performance] wrote ${relativeOut} — ${document.episodes.length} episodes, ` +
      `${document.totals.named_districts} named districts, ${document.totals.flagged_any_class} flagged ` +
      `any class, ${document.totals.flagged_the_episode_class} flagged the episode class.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
