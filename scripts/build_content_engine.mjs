#!/usr/bin/env node
/**
 * The content engine (Phase 8) — `frontend/src/content/generated-routes.json`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The site's published content was hand-written: a dozen reference pages plus whatever the
 * blog holds. The two things a hazard platform can offer that a generic weather site cannot —
 * a methodology page per hazard class, and a page per district that says what the current run
 * actually forecast for it — were missing, and hand-writing 74 of them would guarantee that
 * they drift from the data the moment the pipeline runs.
 *
 * So the pages are **composed, not written**:
 *
 *   · the prose lives in `frontend/src/content/hazard-methodology.json`, authored and reviewed;
 *   · every number comes from a committed artifact (the forecast snapshot, the alert snapshot,
 *     the freshness artifact) or from the district table the app itself renders;
 *   · nothing is generated for data that does not exist — a historical section appears only
 *     when an event archive is loaded, and the absence is stated on the page rather than
 *     filled with a placeholder.
 *
 * THE RULE THAT MATTERS MOST
 * --------------------------
 * This repository may not invent a hazard statistic. The 2,931-event claim in the model card
 * is *reported, not verified* (`docs/MODEL_CARD.md` §4) and the archive is not in this
 * repository, so:
 *
 *   * no page states a historical count unless an archive file was read;
 *   * when one is read, the count is the archive's own, the drift against 2,931 is printed
 *     with it, and the archive path is named;
 *   * `--events` points at a normalised export (`python -m pipeline.cli events --export-json …`),
 *     which is the same set of rows the pipeline validates and loads into PostGIS.
 *
 * USAGE
 *   node scripts/build_content_engine.mjs                       # write the routes file
 *   node scripts/build_content_engine.mjs --events data/events/hazardnet-events.json
 *   node scripts/build_content_engine.mjs --check               # fail on drift vs the committed file
 *   node scripts/build_content_engine.mjs --check --events …    # check the archive-absent path only
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Data-authored prose can carry a location in this repository's tree (the validation reports
// name the module that produced a score). The artifacts keep those paths — they are what
// makes a number auditable by a script — and the published page drops them, because a
// visitor cannot open one. See scripts/lib/public-text.mjs and docs/PUBLIC_SURFACE.md §3.
import { findRepoPaths, withoutRepoPaths } from './lib/public-text.mjs';

export const GENERATED_SCHEMA = 'hazardnet-generated-routes/v1';
export const PERFORMANCE_SCHEMA = 'hazardnet-model-performance/v2';
export const CLAIMED_EVENT_TOTAL = 2931;

const DEFAULT_PATHS = {
  methodology: 'frontend/src/content/hazard-methodology.json',
  districtsTs: 'frontend/src/data/bangladeshDistricts.ts',
  snapshot: 'frontend/public/data/forecasts-latest.json',
  alerts: 'frontend/public/data/alerts-latest.json',
  freshness: 'frontend/public/data/freshness.json',
  /**
   * Phase 9 §8.1 — the published validation numbers, published as
   * `frontend/public/data/model-performance.json`. It is a separate artifact from this engine for
   * the same reason the freshness artifact is: the page states what the published scorecard says
   * and nothing else.
   */
  performance: 'frontend/public/data/model-performance.json',
  archive: 'data/events/hazardnet-events.json',
  out: 'frontend/src/content/generated-routes.json',
};

/** Horizon → human label, and the SLO the forecast section is measured against. */
export const HORIZON_LABELS = { '7_days': '7 days', '15_days': '15 days' };
/**
 * The adjectival form, for copy where the horizon modifies a noun ("7-day outlook").
 * `HORIZON_LABELS` is for counts and comparisons ("25 units at 7 days") and reads wrong
 * in those slots; keeping both means neither sentence has to bend the grammar.
 */
export const HORIZON_ADJECTIVES = { '7_days': '7-day', '15_days': '15-day' };
const HORIZON_ORDER = Object.keys(HORIZON_LABELS);

const ORIGIN = 'https://www.hazardnet.live';

/**
 * Spellings the upstream forecast artifact still uses for districts the application has since
 * renamed, or spelled differently when the record was exported. Keys are what the snapshot
 * carries (lower-cased, punctuation stripped); values are the district **ids** in
 * `frontend/src/data/bangladeshDistricts.ts`.
 *
 * Kept explicit rather than fuzzy-matched: a fuzzy match could silently attach a forecast row to
 * the wrong district, which is the one failure mode a district page must not have. Names the map
 * does not cover are reported in the generated summary as `snapshot_districts_unmatched` instead.
 */
export const DISTRICT_ALIASES = {
  chittagong: 'chattogram',
  comilla: 'cumilla',
  maulvibazar: 'moulvibazar',
  netrakona: 'netrokona',
  nawabganj: 'chapainawabganj',
  brahamanbaria: 'brahmanbaria',
};

/* ─────────────────────────────── small helpers ─────────────────────────────── */

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** `0.8478` → `0.85`; null stays null (an absent number is never rendered as 0). */
export function fixed(value, digits = 2) {
  const n = num(value);
  return n === null ? null : n.toFixed(digits);
}

export function titleCase(text) {
  return String(text || '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Confidence bin, following the product spec's bands (§1.2, `lib/alerts.ts`). */
export function confidenceBin(confidence) {
  const value = num(confidence);
  if (value === null) return 'unknown';
  if (value >= 0.85) return 'Certain (≥ 0.85)';
  if (value >= 0.7) return 'Probable (0.70–0.85)';
  return 'Uncertain (< 0.70)';
}

/** Divergence between the two evidence tracks — the product spec's own definition. */
export function divergence(modelSeverity, physicsSeverity) {
  const a = num(modelSeverity);
  const b = num(physicsSeverity);
  if (a === null || b === null) return null;
  return Math.abs(a - b);
}

/**
 * Canonical join key between the snapshot's district names and the app's district table:
 * lower-case, alphanumerics only, then the alias map above.
 */
export function matchKey(name) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return DISTRICT_ALIASES[slug] ?? slug;
}

/* ─────────────────────────────── inputs ─────────────────────────────── */

/**
 * The district table lives in a TypeScript module the app renders. Parsing it here (rather
 * than duplicating 64 rows into a second source of truth) keeps one list; the parse is strict
 * and `scripts/tests/test_content_engine.py` fails if it ever stops seeing all 64 districts or
 * if the ids diverge from the app.
 */
export function parseDistrictTable(source) {
  const start = source.indexOf('ALL_64_DISTRICTS');
  if (start === -1) throw new Error('bangladeshDistricts.ts: ALL_64_DISTRICTS not found');
  const open = source.indexOf('[', start);
  const close = source.indexOf('\n];', open);
  if (open === -1 || close === -1) throw new Error('bangladeshDistricts.ts: district array not terminated');
  const body = source.slice(open + 1, close);

  const districts = [];
  const objectPattern = /\{([^{}]*)\}/g;
  let match;
  while ((match = objectPattern.exec(body)) !== null) {
    const block = match[1];
    const field = (name) => {
      // Tolerates an escaped apostrophe, which `Cox\'s Bazar` needs.
      const m = block.match(new RegExp(`${name}:\\s*'((?:[^'\\\\]|\\\\.)*)'`));
      return m ? m[1].replace(/\\'/g, "'") : null;
    };
    const numeric = (name) => {
      const m = block.match(new RegExp(`${name}:\\s*(-?[0-9.]+)`));
      return m ? Number(m[1]) : null;
    };
    const id = field('id');
    const name = field('name');
    if (!id || !name) continue;
    districts.push({
      id,
      name,
      division: field('division'),
      risk: field('risk'),
      baselineSeverity: numeric('severity'),
      baselineHazard: field('hazardType'),
      mainCrop: field('mainCrop'),
      elevationMeters: numeric('elevationMeters'),
    });
  }
  if (districts.length !== 64) {
    throw new Error(`bangladeshDistricts.ts: parsed ${districts.length} districts, expected 64`);
  }
  return districts;
}

export function readJsonSafe(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn(`[content] ${path.basename(filePath)} is not readable JSON: ${error.message}`);
    return null;
  }
}

/** Flatten the snapshot's per-horizon arrays into `{district: {horizon: row}}`. */
export function indexForecastRows(snapshot) {
  const rows = new Map();
  const horizons = isRecord(snapshot) && isRecord(snapshot.horizons) ? snapshot.horizons : {};
  for (const [horizon, list] of Object.entries(horizons)) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (!isRecord(row) || typeof row.district_name !== 'string') continue;
      const key = matchKey(row.district_name);
      if (!rows.has(key)) rows.set(key, {});
      rows.get(key)[horizon] = row;
    }
  }
  return rows;
}

/* ─────────────────────────────── the archive ─────────────────────────────── */

/**
 * Read a normalised event export. Accepts `[…]` or `{events: […]}`. Every event must carry the
 * fields the page renders; a malformed archive is an error rather than a silent partial read,
 * because a district profile that quipipeliney lost rows is worse than one that says it has no
 * history.
 */
export function readArchive(payload, sourcePath = null) {
  if (payload === null || payload === undefined) return null;
  const events = Array.isArray(payload) ? payload : isRecord(payload) ? payload.events : null;
  if (!Array.isArray(events)) throw new Error('archive: expected an array of events or {events: [...]}');
  const normalised = [];
  for (const [index, event] of events.entries()) {
    if (!isRecord(event)) throw new Error(`archive: event[${index}] is not an object`);
    for (const field of ['hazard_type', 'start_date', 'adm2_name']) {
      if (typeof event[field] !== 'string' || event[field] === '') {
        throw new Error(`archive: event[${index}] is missing ${field}`);
      }
    }
    normalised.push({
      hazard_type: event.hazard_type,
      start_date: event.start_date,
      end_date: typeof event.end_date === 'string' ? event.end_date : event.start_date,
      adm2_name: event.adm2_name,
      severity: num(event.severity),
      source: typeof event.source === 'string' ? event.source : null,
      source_url: typeof event.source_url === 'string' ? event.source_url : null,
      deaths: num(event.deaths),
      affected: num(event.affected),
      event_id: typeof event.event_id === 'string' ? event.event_id : null,
    });
  }
  normalised.sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0));

  const byHazard = {};
  const byYear = {};
  const byDistrict = {};
  for (const event of normalised) {
    byHazard[event.hazard_type] = (byHazard[event.hazard_type] ?? 0) + 1;
    const year = event.start_date.slice(0, 4);
    byYear[year] = (byYear[year] ?? 0) + 1;
    byDistrict[event.adm2_name] = (byDistrict[event.adm2_name] ?? 0) + 1;
  }
  const claimed = isRecord(payload) && Number.isFinite(payload.claimed_total) ? payload.claimed_total : CLAIMED_EVENT_TOTAL;
  return {
    source_path: sourcePath,
    total: normalised.length,
    claimed_total: claimed,
    drift: normalised.length - claimed,
    date_range: normalised.length
      ? [normalised[0].start_date, normalised.reduce((max, e) => (e.end_date > max ? e.end_date : max), normalised[0].end_date)]
      : [null, null],
    by_hazard: byHazard,
    by_year: byYear,
    by_district: byDistrict,
    events: normalised,
  };
}

/* ─────────────────────────────── composition ─────────────────────────────── */

const listText = (items) => items.filter(Boolean).join(' · ');
/** `a, b and c` — for clauses, where `listText`'s ` · ` separator reads as a list of names. */
const joinAnd = (items) => (items.length <= 1 ? items[0] ?? '' : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** `1 event` / `2 events` — the pages are read by people, and "1 events" reads like a bug. */
const plural = (count, singular, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`;

/**
 * How an input path is printed on a page: relative when it is inside the repository, absolute
 * otherwise (an operator running `--events /tmp/export.json` should see the path they typed, not
 * a `../../..` chain).
 */
function displayPath(target, cwd = process.cwd()) {
  if (!target) return null;
  const relative = path.relative(cwd, target);
  return relative && !relative.startsWith('..') ? relative : target;
}

/**
 * One horizon, as a single sentence. No markdown: the shared renderer draws plain text, so a
 * `**bold**` here would be published literally.
 */
/**
 * The coverage stamp of the run, in words, horizon by horizon. Some runs cover fewer
 * districts at the short horizon than at the long one (the 2026-09-16 snapshot carries 25
 * units at 7 days and 49 at 15 days, from 60 districts), so a per-horizon statement is the
 * only one that is true: "60 of 64 districts" alone would let a reader assume every covered
 * district has both horizons.
 */
function coverageSentence(coverage) {
  if (!isRecord(coverage)) return null;
  const perHorizon = isRecord(coverage.units_per_horizon) ? coverage.units_per_horizon : null;
  const per = [];
  if (perHorizon) {
    for (const horizon of HORIZON_ORDER) {
      const units = num(perHorizon[horizon]);
      if (units !== null) per.push(`${units} units at the ${HORIZON_ADJECTIVES[horizon] ?? horizon} horizon`);
    }
  }
  const covered = num(coverage.districts_covered);
  const expected = num(coverage.districts_expected);
  const clauses = [];
  if (per.length) clauses.push(`produced ${joinAnd(per)}`);
  if (covered !== null) clauses.push(`covering ${covered}${expected !== null ? ` of ${expected}` : ''} districts`);
  if (!clauses.length) return null;
  return (
    `Coverage of that run: ${clauses.join(', ')}${coverage.status ? ` (coverage status: ${coverage.status})` : ''}. ` +
    'A district can appear at one horizon and not the other.'
  );
}

function outlookBullet(unit) {
  const d = num(unit.divergence);
  const parts = [
    `${unit.horizonAdjective} outlook (target date ${unit.target_date ?? 'unknown'}): ${unit.hazard}, severity ${fixed(unit.severity) ?? '—'}, confidence ${confidenceBin(unit.confidence)}`,
  ];
  if (num(unit.physics) !== null) {
    parts.push(
      `physics cross-check ${fixed(unit.physics)}, divergence ${fixed(d)}${
        d !== null && d >= 0.3 ? ' — the two tracks disagree here, which is expected and shown rather than smoothed over' : ''
      }`,
    );
  }
  return `${parts.join('; ')}.`;
}

const SHARED_DEFAULTS = {
  classVocabulary: 'Every alert uses the same four-level vocabulary — NORMAL, WATCH, WARNING, EMERGENCY — across all eight classes.',
  confidencePolicy: 'Confidence is published as an uncalibrated model score; no calibration accuracy is claimed.',
  publicationGate: 'Advisory levels follow the published alert policy and the escalation boundaries of the responsible authorities; nothing here overrides them.',
  groundTruth: 'Published assessments and official bulletins are the record; this site reports what they name.',
  physicsNotation: null,
};

function hazardRoute({ hazard, outlook, now, methodology }) {
  const shared = methodology.shared ?? SHARED_DEFAULTS;
  const units = outlook.units.filter((unit) => unit.hazard === hazard.class);
  const top = units
    .slice()
    .sort((a, b) => (num(b.severity) ?? -1) - (num(a.severity) ?? -1))
    .slice(0, 5);
  const perHorizon = {};
  for (const unit of units) perHorizon[unit.horizon] = (perHorizon[unit.horizon] ?? 0) + 1;

  const currentParas = units.length
    ? [
        `In the run this deployment ships (prediction date ${outlook.prediction_date ?? 'unknown'}), ${units.length} district-horizon units are classified as ${hazard.class}: ${listText(
          Object.entries(perHorizon).map(([horizon, count]) => `${count} at ${HORIZON_LABELS[horizon] ?? horizon}`),
        )}.`,
        top.length
          ? `Highest model severity: ${top
              .map((unit) => `${unit.district} (${fixed(unit.severity)}, ${unit.horizonLabel})`)
              .join(', ')}.`
          : null,
        'These are classifications from the current run, not a forecast of impact. The model version behind them is not stamped yet, and PRODUCT_SPEC §1.6 keeps publication closed above the WATCH level until one exists.',
      ].filter(Boolean)
    : [
        `The run this deployment ships (prediction date ${outlook.prediction_date ?? 'unknown'}) classifies no district-horizon unit as ${hazard.class}. An absence of ${hazard.class.toLowerCase()} in one run is not a statement that the hazard cannot occur this season.`,
      ];

  const history = shared;

  return {
    path: `/hazards/${hazard.slug}`,
    label: 'Hazard methodology',
    title: `${hazard.class} in Bangladesh: how HazardNet classifies and scores it`,
    description: `${hazard.summary} What the model labels, how the physics cross-check is computed (${hazard.physics.form}), what the score cannot tell you, and what the current run says for Bangladesh's districts.`,
    robots: 'index,follow',
    sitemap: { changefreq: 'monthly', priority: 0.7 },
    appShell: true,
    updated: outlook.prediction_date ?? now,
    breadcrumb: [
      { name: 'Hazard reference', path: '/hazards' },
      { name: hazard.class, path: `/hazards/${hazard.slug}` },
    ],
    h1: `${hazard.class}: how HazardNet classifies and scores it`,
    standfirst: hazard.summary,
    keywords: [
      `${hazard.class} Bangladesh`,
      `${hazard.class} forecast`,
      `${hazard.class} early warning`,
      'HazardNet methodology',
    ],
    sections: [
      { h2: 'How the model arrives at this class', paragraphs: [hazard.model, hazard.confidence, history.publicationGate] },
      {
        h2: 'The independent physics cross-check',
        paragraphs: [
          hazard.physics.note,
          `Drivers: ${listText(hazard.physics.drivers)}.`,
          shared.physicsNotation ?? null,
        ].filter(Boolean),
        bullets: [
          `Expression: ${hazard.physics.expr ?? hazard.physics.form}`,
          // The second half of this pair used to name the module the expression is executed
          // against and the test that runs it. Both halves are still true and still checked
          // in CI; only the naming went, because a visitor cannot open either file from a
          // browser (docs/PUBLIC_SURFACE.md §3). What the page must keep is the assurance —
          // that the formula shown here is executed against the implementation, so this
          // copy cannot drift from what the pipeline runs.
          'That expression is executed against the pipeline’s own implementation by the content tests in CI — this page cannot silently describe a formula the pipeline no longer runs.',
        ],
      },
      {
        h2: `What the current run says about ${hazard.class}`,
        paragraphs: currentParas,
        links: [
          { label: 'District outlooks', href: '/districts' },
          { label: 'How to read a forecast', href: '/methodology' },
        ],
      },
      { h2: 'Season and geography', paragraphs: [`Typical season: ${hazard.season}. This describes when the hazard is climatologically plausible, not when this run flags it.`] },
      { h2: 'What this class cannot tell you', bullets: [...hazard.limits, history.confidencePolicy] },
      { h2: 'Inputs behind it', bullets: hazard.sources, paragraphs: [history.groundTruth] },
    ],
    faqs: [
      {
        question: `Is a high ${hazard.class} severity a prediction of damage?`,
        answer: `No. The severity index is the model's continuous score for how strongly the drivers resemble this class, on a 0.00–1.00 scale. It is not a probability, not a percentage, and it does not model exposure. The physics cross-check is a second, independent estimate; where the two diverge, both numbers are shown rather than averaged.`,
      },
      {
        question: `Why is the confidence not a probability of ${hazard.class}?`,
        answer: `The published confidence is the model's own confidence over its eight classes, labelled uncalibrated_model_confidence in the data. It says how certain the classifier is about the class it picked, not how often that class actually materialises. No calibration has been fitted yet, which is also why nothing above the WATCH level can be published automatically.`,
      },
      {
        question: `Which districts does this page cover?`,
        answer: `The district pages cover all 64 districts. This page summarises the districts the current run covers — a run can be partial, and the coverage stamp on the snapshot says exactly how partial, which the status page reports.`,
      },
    ],
  };
}

function districtRoute({ district, rows, archive, now, outlook, shared }) {
  const claimedText = archive ? archive.claimed_total.toLocaleString('en-US') : null;
  const units = Object.entries(rows ?? {})
    .sort(([a], [b]) => HORIZON_ORDER.indexOf(a) - HORIZON_ORDER.indexOf(b))
    .map(([horizon, row]) => ({
      horizon,
      horizonLabel: HORIZON_LABELS[horizon] ?? horizon,
      horizonAdjective: HORIZON_ADJECTIVES[horizon] ?? horizon,
      hazard: row.hazard_type,
      severity: row.severity_score,
      confidence: row.confidence,
      physics: row.physics_severity,
      divergence: divergence(row.model_severity ?? row.severity_score, row.physics_severity),
      target_date: row.target_date,
      prediction_date: row.prediction_date,
    }));

  const covered = units.length > 0;
  const coverageNote = coverageSentence(outlook.coverage);
  const outlookParas = covered
    ? [
        `The run this deployment ships (prediction date ${outlook.prediction_date ?? 'unknown'}) carries ${units.length === 1 ? 'one row' : `${units.length} rows`} for ${district.name}.` +
          (coverageNote ? ` ${coverageNote}` : ''),
      ]
    : [
        `The run this deployment ships (prediction date ${outlook.prediction_date ?? 'unknown'}) carries no row for ${district.name}. The coverage stamp on the snapshot states how many districts that run covered; this district is one of the ones it did not.`,
      ];

  const events = archive ? archive.events.filter((event) => event.adm2_name === district.name) : [];
  const byHazard = {};
  const byYear = {};
  for (const event of events) {
    byHazard[event.hazard_type] = (byHazard[event.hazard_type] ?? 0) + 1;
    const year = event.start_date.slice(0, 4);
    byYear[year] = (byYear[year] ?? 0) + 1;
  }

  const historySection = archive
    ? {
        h2: `Recorded hazard history, ${archive.date_range[0]?.slice(0, 4) ?? '—'}–${archive.date_range[1]?.slice(0, 4) ?? '—'}`,
        paragraphs: [
          events.length
            ? `${plural(events.length, 'recorded event')} in this district in the archive this deployment loaded, out of ${plural(archive.total, 'event')} nationally. ${listText(
                Object.entries(byHazard)
                  .sort((a, b) => b[1] - a[1])
                  .map(([hazard, count]) => `${hazard}: ${count}`),
              )}.`
            : `The archive this deployment loaded records no event for ${district.name}, out of ${plural(archive.total, 'event')} nationally. An unrecorded event is not the same as an absent event — reporting coverage differs by district and decade.`,
          `The archive reports ${plural(archive.total, 'event')} against the ${claimedText} the model card quotes (drift ${archive.drift >= 0 ? '+' : ''}${archive.drift}); the measured number is what this page uses.`,
        ],
        bullets: [
          `Years present: ${listText(Object.entries(byYear).sort().map(([year, count]) => `${year}: ${count}`)) || '—'}`,
          ...events
            .slice(-5)
            .reverse()
            .map(
              (event) =>
                `${event.start_date} — ${event.hazard_type}${event.severity !== null ? ` (severity ${event.severity})` : ''}${event.source ? ` · source: ${event.source}` : ''}`,
            ),
        ],
        links: [
          { label: 'All districts', href: '/districts' },
          { label: 'How the archive is validated', href: '/data-sources' },
        ],
      }
    : {
        h2: 'Recorded hazard history',
        paragraphs: [
          `This deployment has no event archive loaded, so this page states no historical count for ${district.name}. The HazardNet model card quotes 2,931 historical events (2000–2025) for the training prior, and that figure is reported rather than verified in this repository — the loader reports the drift against it instead of asserting it. Until the archive is loaded, this section stays empty rather than filling itself with an approximation.`,
        ],
        links: [{ label: 'Data sources and scope', href: '/data-sources' }],
      };

  const baselineParas = [
    `${district.name} is in ${district.division} division. The application's district table carries a static baseline for it: risk ${district.risk}, baseline severity ${fixed(district.baselineSeverity)}, baseline hazard ${district.baselineHazard}, elevation ${district.elevationMeters ?? '—'} m, main crops ${district.mainCrop}.`,
    'The baseline is a static entry shipped with the app — it is what the map colours a district with when the current run does not cover it, and it is not a model output. The outlook section above is the model output, and it exists only for the districts and horizons the current run covers.',
  ];

  const faqs = [
    {
      question: `What does the severity number for ${district.name} mean?`,
      answer:
        'It is the model\'s continuous score for how strongly the forecast drivers resemble the class it selected, on a 0.00–1.00 scale. It is not a probability, not a percentage of damage, and it does not account for how many people or how much cropland is exposed. The physics cross-check is a separate, formula-based estimate over the same drivers and is shown next to it.',
    },
    {
      question: `Why does ${district.name} sometimes have no outlook?`,
      answer:
        'A run can be partial: the pipeline reports a coverage stamp naming how many districts it produced rows for, and a district outside that run keeps its static baseline colour on the map and shows no model row here. The status page reports the coverage of the run this deployment ships. Nothing is interpolated to fill the gap.',
    },
    {
      question: 'How current is this page?',
      answer: `Every page here is generated at build time from the artifacts the deployment ships. The forecast section states the prediction date it came from (${outlook.prediction_date ?? 'unknown'}), and the /status page states the age of each source against the SLO it is measured against.`,
    },
  ];

  return {
    path: `/districts/${district.id}`,
    label: 'District outlook',
    title: `${district.name} district hazard outlook — HazardNet`,
    description: `The current HazardNet outlook for ${district.name} (${district.division} division): hazard class, severity, confidence and the independent physics cross-check per horizon, the district's static baseline, and what the model cannot tell you.`,
    robots: covered ? 'index,follow' : 'noindex,follow',
    sitemap: covered ? { changefreq: 'daily', priority: 0.6 } : null,
    appShell: true,
    updated: outlook.prediction_date ?? now,
    breadcrumb: [
      { name: 'District outlooks', path: '/districts' },
      { name: district.name, path: `/districts/${district.id}` },
    ],
    structuredData: {
      place: {
        '@type': 'AdministrativeArea',
        name: `${district.name} District`,
        containedInPlace: { '@type': 'AdministrativeArea', name: `${district.division} Division` },
        address: { '@type': 'PostalAddress', addressCountry: 'BD', addressRegion: district.division },
      },
      ...(archive
        ? {
            dataset: {
              kind: 'event-archive',
              name: 'HazardNet historical hazard event archive (Bangladesh, 2000–2025)',
              description: `Normalised historical hazard events for Bangladesh districts, compiled for the model's climatological prior and validated by the pipeline.`,
              temporalCoverage: `${archive.date_range[0]}/${archive.date_range[1]}`,
              variableMeasured: ['hazard class', 'district', 'event window', 'severity basis', 'fatalities'],
              keywords: ['Bangladesh', 'disaster history', 'hazard events'],
            },
          }
        : {}),
    },
    h1: `${district.name} — current hazard outlook`,
    standfirst: covered
      ? `What the model this deployment ships currently says about ${district.name}, horizon by horizon, with the independent physics cross-check beside it.`
      : `This deployment's current run carries no row for ${district.name}. This page states that plainly, shows the district's static baseline, and explains what a partial run means.`,
    keywords: [`${district.name} flood`, `${district.name} hazard`, `${district.name} weather forecast`, `${district.division} division hazards`],
    sections: [
      {
        h2: 'Current outlook from the model run',
        paragraphs: outlookParas,
        ...(covered ? { bullets: units.map(outlookBullet) } : {}),
      },
      {
        h2: 'How to read these numbers',
        bullets: [
          'Severity index (0.00–1.00) is the model\'s damage-potential score for the class it selected — not a probability and not a share of damage.',
          'Confidence is the model\'s own certainty in that class, published as uncalibrated; it is not a measure of whether the forecast is correct.',
          'The severity track is an independent formula-based estimate. Divergence between the two tracks is normal and is shown rather than hidden.',
          'Horizons are 7 and 15 days. The 15-day outlook is the less certain of the two and is a planning aid, not a storm-specific prediction.',
          shared.publicationGate ?? SHARED_DEFAULTS.publicationGate,
        ],
      },
      { h2: 'Static baseline shipped with the app', paragraphs: baselineParas },
      historySection,
      { h2: 'Ground truth for this district', paragraphs: [shared.groundTruth ?? SHARED_DEFAULTS.groundTruth] },
    ],
    faqs,
  };
}

/* ─────────────────────────────── the index pages ─────────────────────────────── */

function hazardsIndexHint(hazard, outlook) {
  const units = outlook.units.filter((unit) => unit.hazard === hazard.class);
  return `${hazard.summary} Current run: ${units.length} district-horizon unit${units.length === 1 ? '' : 's'} classified as ${hazard.class}.`;
}

/* ─────────────────────── Phase 9 §8.1: /model-performance ─────────────────────── */

/**
 * The public validation page, composed from `frontend/public/data/model-performance.json`
 * (the published validation scorecard).
 *
 * Two things are deliberate here.
 *
 * **No headline accuracy.** The plan asked for a metrics dashboard; the honest dashboard for this
 * system is a set of detection counts with their denominators attached, so the page publishes
 * per-episode detection, POD/FAR/CSI and the threshold bands — never a single percentage. `—`
 * appears wherever a report says a score could not be computed, and the sentence that explains
 * it is on the page, because a `0.00` there would read as "the model missed everything".
 *
 * **Nothing is written by hand.** Every number below is read from the artifact; the copy that is
 * fixed text is the framing (what the numbers are not) plus the reports' own findings, which the
 * artifact carries verbatim.
 */
/**
 * The public validation page, composed from `frontend/public/data/model-performance.json`.
 *
 * Two things are deliberate here.
 *
 * **No headline accuracy.** The page publishes per-episode detection and POD/FAR/CSI with
 * their denominators attached — never a single percentage. `—` appears wherever a score could
 * not be computed, and the sentence that explains it is on the page, because a `0.00` there
 * would read as "the model missed everything".
 *
 * **Nothing is written by hand.** Every number below is read from the artifact; the copy that
 * is fixed text is the framing (what the numbers are not) plus the artifact's own stated
 * limitations, which it carries verbatim.
 */
function modelPerformanceRoute({ performance }) {
  if (!isRecord(performance) || performance.schema !== PERFORMANCE_SCHEMA) {
    throw new Error(
      `${DEFAULT_PATHS.performance} is missing or is not a ${PERFORMANCE_SCHEMA} — ` +
        'publish the validation scorecard artifact first',
    );
  }
  const episodes = Array.isArray(performance.episodes) ? performance.episodes : [];
  if (episodes.length === 0) throw new Error('model-performance.json has no episodes');

  const count = (value) => (num(value) === null ? '—' : String(value));
  const score = (value) => (num(value) === null ? '—' : num(value).toFixed(3));
  const of = (part, whole) => `${count(part)} of ${count(whole)}`;

  /**
   * A table column needs a scannable label, and the episode titles are full sentences
   * ("Eastern flash floods — Feni, Cumilla, Noakhali, 20–30 August 2024"). Cutting at the em
   * dash keeps the episode's name and drops the detail — which nothing loses, because the
   * episode list below carries every full title.
   */
  const shortTitle = (episode) => String(episode.title ?? '').split(' — ')[0].trim() || episode.id;

  // Spelled-out counts: the copy says "these are five episodes, not a validation set", and that
  // sentence has to stay true when a sixth is added.
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const howMany = (n) => WORDS[n] ?? String(n);
  const capitalised = (text) => text.charAt(0).toUpperCase() + text.slice(1);

  const totals = performance.totals ?? {};
  const updated = performance.updated ?? null;
  const notComputed = episodes.filter((episode) => episode.scores?.pod === null).map((episode) => episode.id);
  const howToRead = Array.isArray(performance.how_to_read) ? performance.how_to_read : [];
  const notPublished = Array.isArray(performance.not_published) ? performance.not_published : [];

  return {
    path: '/model-performance',
    label: 'Validation scorecard',
    title: `Validation scorecard: what HazardNet flagged on ${howMany(episodes.length)} historical Bangladesh episodes`,
    description:
      `Per-episode detection counts and POD/FAR/CSI for ${episodes.length} historical episodes ` +
      `(${episodes.map(shortTitle).join(', ')}), published with their limits stated. ` +
      `${capitalised(howMany(episodes.length))} episodes are not a validation set, ` +
      'and these are a ceiling on detection rather than forecast skill. The page publishes no single accuracy percentage, because this system cannot support one.',
    keywords: [
      'HazardNet validation',
      'validation Bangladesh flood 2024',
      'cyclone Amphan 2020 warning',
      'POD FAR CSI',
      'early warning system verification',
    ],
    robots: 'index,follow',
    sitemap: { changefreq: 'monthly', priority: 0.7 },
    appShell: true,
    updated,
    breadcrumb: [{ name: 'Validation scorecard', path: '/model-performance' }],
    structuredData: {
      place: { '@type': 'Country', name: 'Bangladesh' },
      dataset: {
        kind: 'validation-scorecard',
        name: 'HazardNet validation scorecard, Bangladesh (2020–2025)',
        description:
          `Detection counts and POD/FAR/CSI for ${episodes.length} historical episodes, published with their limits stated.`,
        temporalCoverage: `${episodes.map((episode) => episode.onset_date).sort()[0]}/${episodes.map((episode) => episode.onset_date).sort().pop()}`,
        variableMeasured: [
          'districts with a scored row',
          'districts flagged with the episode class',
          'probability of detection',
          'false alarm ratio',
          'critical success index',
        ],
        keywords: ['Bangladesh', 'hazard verification', 'validation', 'early warning'],
      },
    },
    h1: `What the system flagged on ${howMany(episodes.length)} historical episodes`,
    standfirst:
      `Across ${count(totals.episodes)} episodes and ${count(totals.named_districts)} district-episode pairs that the ` +
      `published assessments name, the system flagged ${count(totals.flagged_the_episode_class)} under the class ` +
      `that occurred, and ${count(totals.episode_class_over_threshold)} scored the occurring class above the alarm band. ` +
      'Those numbers are not the same number, and the difference between them is the most useful thing on this page.',
    sections: [
      {
        h2: `The ${howMany(episodes.length)} episodes`,
        paragraphs: [
          'Every number on this page comes from the published scorecard; the underlying per-run reports are research records and are not distributed. The tables are a projection of those published results, not a re-analysis.',
        ],
        bullets: episodes.map(
          (episode) =>
            `${episode.title} — onset ${episode.onset_date}, ${count(episode.affected_count)} districts named as affected.`,
        ),
      },
      {
        h2: 'Read this first',
        callout: {
          tone: 'warning',
          text:
            `These are ${howMany(episodes.length)} episodes, not a validation set. Detection is counted only over the districts the published assessments ` +
            'name — a district nobody named is unknown, not clear — so every number here is a ceiling on detection, not forecast skill.',
        },
        bullets: howToRead,
        links: [
          { label: 'How severity and confidence are computed', href: '/methodology' },
          { label: 'Model card and stated limits', href: '/model' },
          { label: 'Data sources and licences', href: '/data-sources' },
        ],
      },
      {
        h2: 'Detection: did the system flag the districts the assessments name?',
        paragraphs: [
          'Each row is one episode, scored against that episode\'s own published assessment. "Flagged the class" counts only the class that occurred, which is the strict reading.',
          `Totals: ${of(totals.named_districts, totals.named_districts)} named district-episode pairs carried a scored row and ` +
            `${count(totals.flagged_the_episode_class)} were flagged under the class that occurred.`,
          'Per horizon: ' +
            episodes
              .map((episode) => {
                const horizons = Array.isArray(episode.detection?.per_horizon) ? episode.detection.per_horizon : [];
                return horizons.length
                  ? `${shortTitle(episode)} flagged ${horizons.map((horizon) => `${of(horizon.flagged, horizon.named)} at ${horizon.lead_days} days`).join(', ')}`
                  : null;
              })
              .filter(Boolean)
              .join('; ') +
            '.',
        ],
        table: {
          caption: 'Detection per episode, over the districts the published assessments name.',
          columns: ['Episode', 'Class', 'Onset', 'Named districts', 'Flagged the class', 'Class over band'],
          rows: episodes.map((episode) => [
            shortTitle(episode),
            episode.hazard_class,
            episode.onset_date,
            count(episode.detection?.named_districts),
            count(episode.detection?.flagged_the_district_class),
            count(episode.detection?.district_class_over_threshold),
          ]),
        },
      },
      {
        h2: 'Scores: POD, FAR and CSI — and the rows where they do not exist',
        paragraphs: [
          'These are the standard verification scores, computed over the district-horizon samples in each episode\'s window. ' +
            (notComputed.length
              ? `POD is "—" for ${notComputed.join(', ')}: the published assessment names affected districts but records no dated outcome inside ` +
                'the prediction window, so there is no observed event to divide by. A false alarm ratio of 1.000 in that situation means ' +
                '"no negative sample existed", not "every alarm was wrong" — with no named event there is nothing for an alarm to be right about.'
              : 'Every episode had a computable POD.'),
          'The false alarm ratio is measurable only against districts where an event was recorded as absent. No district is treated as a confirmed negative, so treat the FAR column as a bound on the fraction of alarms that hit a district nobody reported as affected.',
        ],
        table: {
          caption:
            'Verification scores at the shipped alarm band. "Scored samples" is the denominator each row was computed from; "—" is a score that cannot be computed.',
          columns: ['Episode', 'Scored samples', 'Over band', 'POD', 'FAR', 'CSI'],
          rows: episodes.map((episode) => [
            shortTitle(episode),
            count(episode.scores?.scored_samples),
            count(episode.scores?.over_threshold),
            score(episode.scores?.pod),
            score(episode.scores?.far),
            score(episode.scores?.csi),
          ]),
        },
      },
      {
        h2: 'The alarm band',
        paragraphs: [
          withoutRepoPaths(String(performance.threshold_sensitivity_note ?? '')),
          'Alarm thresholds in force per episode: ' +
            episodes
              .map((episode) => `${shortTitle(episode)} at ${score(episode.detection?.alarm_threshold)} on the class severity score`)
              .join('; ') +
            '.',
        ],
      },
      {
        h2: 'Not published here',
        bullets: notPublished,
        links: [{ label: 'Machine-readable copy', href: '/data/model-performance.json' }],
      },
    ],
    faqs: [
      {
        question: 'Is there an accuracy number for the forecast model?',
        answer:
          `No, and this deployment will not publish one. ${capitalised(howMany(episodes.length))} episodes are not a validation set and no district is treated as a confirmed negative. What is published is what the runs actually measured: how many of the named districts were flagged, and POD/FAR/CSI with their denominators stated.`,
      },
      {
        question: 'Why does Cyclone Amphan show a false alarm ratio of 1.000 and no POD?',
        answer:
          'The published Amphan assessment names the affected districts but records no dated outcome inside the prediction window, so there is no observed event to divide by and POD cannot be computed. Every alarm then counts as a false alarm because no negative sample exists either. The scorecard says this in place rather than presenting a zero as a score.',
      },
      {
        question: 'What do the scores cover?',
        answer:
          'Detection counts and verification scores over the districts the published assessments name, at the horizons the runs published. They say what the system flagged on those episodes — they are not a measure of overall forecast skill.',
      },
      {
        question: 'Does this page change when the forecast model is updated?',
        answer:
          'Only when the scorecard itself is republished. A model update that is not re-scored on these episodes does not silently rewrite the numbers on this page.',
      },
    ],
  };
}

export function buildRoutes({ districts, snapshot, archive, methodology, performance, now = new Date() }) {
  const outlook = {
    prediction_date: isRecord(snapshot) ? snapshot.prediction_date ?? null : null,
    generated_at: isRecord(snapshot) ? snapshot.generated_at ?? null : null,
    coverage: isRecord(snapshot) ? snapshot.coverage ?? null : null,
    model_version: isRecord(snapshot?.provenance) ? snapshot.provenance.model_version ?? null : null,
    units: [],
  };
  const rowsByDistrict = indexForecastRows(snapshot);
  for (const [key, rows] of rowsByDistrict) {
    for (const row of Object.values(rows)) {
      outlook.units.push({
        district: row.district_name,
        districtKey: key,
        hazard: row.hazard_type,
        severity: row.severity_score,
        horizon: row.horizon,
        horizonLabel: HORIZON_LABELS[row.horizon] ?? row.horizon,
      });
    }
  }

  // Anything the snapshot carries that no district matched — the visible drift signal.
  const matchedKeys = new Set(districts.map((district) => matchKey(district.id)));
  const unmatchedSnapshotDistricts = [...new Set(
    [...rowsByDistrict.entries()].filter(([key]) => !matchedKeys.has(key)).map(([, rows]) => Object.values(rows)[0].district_name),
  )].sort();

  const routes = [];

  // /hazards — the index of the eight classes the model can output.
  routes.push({
    path: '/hazards',
    label: 'Hazard reference',
    title: 'Hazard classes in Bangladesh: methodology behind each HazardNet forecast',
    description:
      'One page per hazard class the model can output — Flood, Flash Flood, Tropical Cyclone, Drought, Heat Wave, Cold Wave, Fire and Severe Local Storm — with the physics formula, the drivers, the confidence semantics, the limits, and what the current run says.',
    robots: 'index,follow',
    sitemap: { changefreq: 'weekly', priority: 0.8 },
    appShell: true,
    updated: outlook.prediction_date ?? null,
    breadcrumb: [{ name: 'Hazard reference', path: '/hazards' }],
    h1: 'The eight hazard classes, and what each one actually measures',
    standfirst:
      'HazardNet classifies every district-horizon unit into one of eight classes and scores it. These pages state what each class means, how its independent physics cross-check is computed, what it cannot tell you, and what the current run says.',
    keywords: ['Bangladesh hazards', 'hazard classes', 'flood drought cyclone Bangladesh', 'hazard methodology'],
    sections: [
      {
        h2: 'Pick a hazard',
        paragraphs: ['Each page below is generated from the same artifacts this deployment ships, so the numbers in them match the map.'],
        links: methodology.hazards.map((hazard) => ({ label: hazard.class, href: `/hazards/${hazard.slug}` })),
      },
      {
        h2: 'Current run at a glance',
        paragraphs: [
          `Prediction date ${outlook.prediction_date ?? 'unknown'}; ${outlook.units.length} district-horizon units classified across ${Object.keys(rowsByDistrict).length} districts.`,
        ],
        bullets: methodology.hazards.map((hazard) => hazardsIndexHint(hazard, outlook)),
      },
      { h2: 'Shared rules across every class', bullets: [SHARED_DEFAULTS.classVocabulary, SHARED_DEFAULTS.confidencePolicy, SHARED_DEFAULTS.publicationGate] },
    ],
    faqs: [
      {
        question: 'Why only eight classes?',
        answer:
          'Eight is the model\'s output vocabulary, fixed by the training data and enforced on ingest. A hazard outside that list is not mapped onto a nearest neighbour: the event loader rejects and reports the label instead, and the forecast ingest refuses the row.',
      },
      {
        question: 'Which class is most likely in the current run?',
        answer: 'The current-run counts are listed above, and each hazard page repeats them. What the counts do not tell you is which is likely — they describe one model run, not a climatology.',
      },
    ],
  });

  // Phase 9 §8.1 — the validation page. It is pushed here, in the middle of the run, only for
  // ordering stability: `--check` compares route order as well as content.
  routes.push(modelPerformanceRoute({ performance }));

  for (const hazard of methodology.hazards) {
    routes.push(hazardRoute({ hazard, outlook, now: now.toISOString().slice(0, 10), methodology }));
  }

  // /districts — all 64, with the current-run status of each.
  const coveredDistricts = districts.filter((district) => rowsByDistrict.has(matchKey(district.id)));
  const missingDistricts = districts.filter((district) => !rowsByDistrict.has(matchKey(district.id)));
  routes.push({
    path: '/districts',
    label: 'District outlooks',
    title: 'District hazard outlooks for all 64 districts of Bangladesh — HazardNet',
    description: `One page per district with the current model outlook (hazard, severity, confidence, physics cross-check), the district's static baseline and the model's stated limits. ${coveredDistricts.length} of 64 districts carry a model row in the run this deployment ships.`,
    robots: 'index,follow',
    sitemap: { changefreq: 'daily', priority: 0.8 },
    appShell: true,
    updated: outlook.prediction_date ?? null,
    breadcrumb: [{ name: 'District outlooks', path: '/districts' }],
    h1: 'District outlooks',
    standfirst:
      'Every district page shows what the current run says (or states that the run does not cover the district), the static baseline the map falls back to, and what the numbers cannot mean.',
    keywords: ['Bangladesh district forecast', 'district hazard outlook', '64 districts'],
    sections: [
      {
        h2: 'Coverage of the run this deployment ships',
        paragraphs: [
          `Prediction date ${outlook.prediction_date ?? 'unknown'}. ${coveredDistricts.length} of 64 districts carry at least one horizon row in this run.` +
            (coverageSentence(outlook.coverage) ? ` ${coverageSentence(outlook.coverage)}` : ''),
          missingDistricts.length
            ? `Districts without a row in this run: ${listText(missingDistricts.map((district) => district.name))}. Those pages say so; nothing is interpolated.`
            : 'All 64 districts carry a row in this run.',
        ],
      },
      {
        h2: 'Browse by division',
        paragraphs: ['The list below is generated from the app\'s district table, so the pages and the map agree.'],
        bullets: [...new Set(districts.map((district) => district.division))].sort().map((division) => {
          const inDivision = districts.filter((district) => district.division === division);
          return `${division} (${inDivision.length}): ${listText(inDivision.slice(0, 8).map((district) => district.name))}${inDivision.length > 8 ? ', …' : ''}`;
        }),
      },
      {
        h2: 'How to read a district page',
        bullets: [
          'The outlook section is the model output for the run this deployment ships.',
          'The baseline section is a static entry shipped with the app, used when a run does not cover a district. It is not a forecast.',
          'The history section appears only when this deployment has loaded the historical event archive; otherwise the page says that no archive is loaded rather than implying there is no history.',
        ],
        links: [
          { label: 'Hazard definitions', href: '/hazards' },
          { label: 'Methodology and scope', href: '/methodology' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Why is a district page missing an outlook?',
        answer:
          'Because the run this deployment ships did not produce a row for that district. Runs are sometimes partial (upstream data gaps); the snapshot carries a coverage stamp that says how partial, and the status page reports it. Those district pages are marked noindex and kept out of the sitemap until a run covers them, so search results never present a baseline as a forecast.',
      },
      {
        question: 'Do these pages cover upazilas?',
        answer:
          'No. The forecast unit is the district (ADM2); the ADM3 boundaries exist for the event archive and the map, not for the published outlook.',
      },
    ],
  });

  for (const district of districts) {
    routes.push(
      districtRoute({
        district,
        rows: rowsByDistrict.get(matchKey(district.id)),
        archive,
        now: now.toISOString().slice(0, 10),
        outlook,
        shared: methodology.shared ?? SHARED_DEFAULTS,
      }),
    );
  }

  if (archive) {
    const claimedText = archive.claimed_total.toLocaleString('en-US');
    const years = Object.keys(archive.by_year).sort();
    routes.push({
      path: '/retrospectives',
      label: 'Season retrospectives',
      title: 'Bangladesh hazard season retrospectives (from the recorded event archive)',
      description: `Annual retrospectives assembled from the recorded hazard event archive this deployment loaded: ${archive.total} events, ${archive.date_range[0]}–${archive.date_range[1]}, by class, district and year.`,
      robots: 'index,follow',
      sitemap: { changefreq: 'monthly', priority: 0.7 },
      appShell: true,
      updated: archive.date_range[1],
      breadcrumb: [{ name: 'Season retrospectives', path: '/retrospectives' }],
      structuredData: {
        place: { '@type': 'Country', name: 'Bangladesh' },
        dataset: {
          kind: 'event-archive',
          name: 'HazardNet historical hazard event archive (Bangladesh, 2000–2025)',
          description: `Normalised historical hazard events for Bangladesh districts, compiled for the model's climatological prior and validated by the pipeline.`,
          temporalCoverage: `${archive.date_range[0]}/${archive.date_range[1]}`,
          variableMeasured: ['hazard class', 'district', 'event window', 'severity basis', 'fatalities'],
          keywords: ['Bangladesh', 'disaster history', 'hazard events'],
        },
      },
      h1: 'Hazard season retrospectives',
      standfirst:
        'Each retrospective aggregates the recorded events for one year: counts by class and district, the reporting gaps, and what the archive does not cover. They are a record of what was reported, not a measure of what happened.',
      keywords: ['Bangladesh hazard retrospective', 'disaster history Bangladesh', 'hazard season'],
      sections: [
        {
          h2: 'What these pages are',
          paragraphs: [
            `Assembled from the archive this deployment loaded — ${plural(archive.total, 'event')} spanning ${archive.date_range[0]} to ${archive.date_range[1]}. The archive reports ${plural(archive.total, 'event')} against the ${claimedText} the model card quotes (drift ${archive.drift >= 0 ? '+' : ''}${archive.drift}); the measured number is used here.`,
            'A retrospective counts what was recorded. Reporting coverage varies by decade, district and hazard class, so a rise in a year\'s count can be a rise in reporting rather than in hazard. The pages say which sources each year draws on.',
          ],
          links: years.map((year) => ({ label: `${year}`, href: `/retrospectives/${year}` })),
        },
        {
          h2: 'What validation against the model would require',
          paragraphs: [
            'Comparing these seasons to model output needs a validation: the pipeline\'s forecasts re-run over historical weather with the same record contract, scored with POD/FAR/CSI against the archive. That evaluation harness exists for the live path but no validation has been produced, so no skill number is published here.',
          ],
          links: [{ label: 'Model card', href: '/model' }],
        },
      ],
      faqs: [
        {
          question: 'Is a higher event count a worse year?',
          answer: 'Not necessarily. Counts follow reporting as well as hazard: a decade with better ReliefWeb and EM-DAT coverage reports more events of the same physical severity. Each retrospective states the sources behind it.',
        },
      ],
    });

    for (const year of years) {
      const inYear = archive.events.filter((event) => event.start_date.startsWith(year));
      const byHazard = {};
      const byDistrict = {};
      let withDeaths = 0;
      for (const event of inYear) {
        byHazard[event.hazard_type] = (byHazard[event.hazard_type] ?? 0) + 1;
        byDistrict[event.adm2_name] = (byDistrict[event.adm2_name] ?? 0) + 1;
        if (event.deaths !== null) withDeaths += 1;
      }
      const ranked = Object.entries(byDistrict).sort((a, b) => b[1] - a[1]).slice(0, 10);
      routes.push({
        path: `/retrospectives/${year}`,
        label: 'Season retrospective',
        title: `${year} Bangladesh hazard season retrospective — recorded events`,
        description: `${inYear.length} recorded hazard events in Bangladesh in ${year}: counts by class and district from the archive this deployment loaded, with the reporting gaps stated.`,
        robots: 'index,follow',
        sitemap: { changefreq: 'yearly', priority: 0.6 },
        appShell: true,
        updated: inYear.length ? inYear[inYear.length - 1].end_date : null,
        breadcrumb: [
          { name: 'Season retrospectives', path: '/retrospectives' },
          { name: year, path: `/retrospectives/${year}` },
        ],
        structuredData: {
          place: { '@type': 'Country', name: 'Bangladesh' },
          dataset: {
            kind: 'event-archive',
            name: `HazardNet historical hazard event archive — ${year} subset (Bangladesh)`,
            description: `The ${year} subset of the normalised historical hazard event archive this deployment loaded; ${inYear.length} recorded events.`,
            temporalCoverage: `${year}-01-01/${year}-12-31`,
            variableMeasured: ['hazard class', 'district', 'event window', 'severity basis', 'fatalities'],
            keywords: [`Bangladesh ${year}`, 'disaster history', 'hazard events'],
          },
        },
        h1: `${year} hazard season retrospective`,
        standfirst: `${inYear.length} events recorded for ${year} in the archive this deployment loaded, across ${Object.keys(byDistrict).length} districts.`,
        keywords: [`${year} Bangladesh floods`, `${year} cyclone Bangladesh`, `${year} disaster retrospective`],
        sections: [
          {
            h2: 'What the record shows',
            paragraphs: [
              `${plural(inYear.length, 'event')}, ${listText(Object.entries(byHazard).sort((a, b) => b[1] - a[1]).map(([hazard, count]) => `${hazard}: ${count}`))}.`,
              `Districts with the most recorded events: ${ranked.map(([district, count]) => `${district} (${count})`).join(', ')}.`,
            ],
          },
          {
            h2: 'Reporting gaps in this year',
            bullets: [
              `Fatalities are recorded for ${withDeaths} of ${plural(inYear.length, 'event')}; the rest are unknown rather than zero.`,
              'Event boundaries follow the source record: a multi-district flood appears once per district, so counts are event-district pairs, not distinct physical events.',
            ],
          },
          { h2: 'How to read it against the model', paragraphs: ['Compare a season to model output only with a validation — see the retrospectives index for why.'], links: [{ label: 'Model card', href: '/model' }] },
        ],
        faqs: [
          {
            question: `Does the ${year} count measure how bad the season was?`,
            answer: 'No. It measures how many events were recorded for Bangladesh districts in the archive this deployment loaded. Exposure, reporting density and the archive\'s source mix all change over time.',
          },
        ],
      });
    }
  }

  // A stable, reviewable summary of what was generated and from what.
  const summary = {
    schema: GENERATED_SCHEMA,
    generated_at: now.toISOString(),
    generated_by: 'scripts/build_content_engine.mjs',
    origin: ORIGIN,
    inputs: {
      methodology: DEFAULT_PATHS.methodology,
      district_table: DEFAULT_PATHS.districtsTs,
      forecast_snapshot: {
        path: DEFAULT_PATHS.snapshot,
        prediction_date: outlook.prediction_date,
        generated_at: outlook.generated_at,
      },
      event_archive: archive ? { path: archive.source_path, events: archive.total, claimed_total: archive.claimed_total, drift: archive.drift } : null,
      model_performance: {
        path: DEFAULT_PATHS.performance,
        validation_version: performance.validation_version ?? null,
        episodes: (performance.episodes ?? []).length,
        // The reports themselves, by hash: this is what ties the published page to the exact
        // files `validation.cli check` recomputed, so a later-but-different report is visible here.
        built_from: (performance.built_from ?? []).map((entry) => ({ path: entry.path, sha256: entry.sha256 })),
      },
    },
    unmatched_snapshot_districts: unmatchedSnapshotDistricts,
    counts: {
      routes: routes.length,
      hazards: methodology.hazards.length,
      districts: districts.length,
      districts_with_outlook: coveredDistricts.length,
      districts_without_outlook: missingDistricts.length,
      retrospectives: archive ? Object.keys(archive.by_year).length : 0,
      model_performance_episodes: (performance.episodes ?? []).length,
    },
    freshness_hint: 'see frontend/public/data/freshness.json for the age of the inputs',
  };

  return { summary, routes, outlook };
}

/** The time-independent projection `--check` compares (the clock must not fail the gate). */
export function stableView(document) {
  if (!isRecord(document)) return null;
  return {
    schema: document.schema,
    origin: document.origin,
    counts: document.counts,
    inputs: {
      ...document.inputs,
      event_archive: document.inputs?.event_archive ?? null,
    },
    routes: (document.routes ?? []).map((route) => ({
      path: route.path,
      title: route.title,
      robots: route.robots,
      sitemap: route.sitemap ?? null,
      updated: route.updated ?? null,
      breadcrumb: route.breadcrumb ?? null,
      structured_data: route.structuredData?.dataset?.kind ?? (route.structuredData?.place ? 'place' : null),
      sections: (route.sections ?? []).map((section) => ({
        h2: section.h2 ?? null,
        paragraphs: section.paragraphs ?? [],
        bullets: section.bullets ?? [],
        callout: section.callout ?? null,
        // Phase 9 §8.1: the validation page publishes its numbers in tables, so the gate has to
        // cover them — a table outside `stableView` would let the committed numbers drift from
        // the reports without failing `--check`.
        table: section.table ?? null,
      })),
      faqs: (route.faqs ?? []).map((faq) => faq.question),
    })),
  };
}

/* ─────────────────────────────── CLI ─────────────────────────────── */

function parseArgs(argv) {
  const args = { check: false, events: undefined, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--check') args.check = true;
    else if (argv[i] === '--events') args.events = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--no-events') args.events = null;
  }
  return args;
}

export function loadInputs(paths) {
  const methodology = readJsonSafe(paths.methodology);
  if (!methodology || !Array.isArray(methodology.hazards)) {
    throw new Error(`${paths.methodology} is missing or has no hazards[]`);
  }
  const districtsSource = readFileSync(paths.districtsTs, 'utf8');
  const districts = parseDistrictTable(districtsSource);
  const snapshot = readJsonSafe(paths.snapshot);
  const performance = readJsonSafe(paths.performance);
  if (!performance || performance.schema !== PERFORMANCE_SCHEMA) {
    throw new Error(
      `${paths.performance} is missing or is not a ${PERFORMANCE_SCHEMA} — ` +
        'publish the validation scorecard artifact first',
    );
  }
  let archive = null;
  if (paths.archive && existsSync(paths.archive)) {
    archive = readArchive(readJsonSafe(paths.archive), displayPath(paths.archive));
  }
  return { methodology, districts, snapshot, performance, archive };
}

function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '..');
  const args = parseArgs(process.argv.slice(2));
  const paths = {
    methodology: path.join(repoRoot, DEFAULT_PATHS.methodology),
    districtsTs: path.join(repoRoot, DEFAULT_PATHS.districtsTs),
    snapshot: path.join(repoRoot, DEFAULT_PATHS.snapshot),
    performance: path.join(repoRoot, DEFAULT_PATHS.performance),
    archive: args.events === null ? null : path.resolve(repoRoot, args.events ?? DEFAULT_PATHS.archive),
    out: args.out ?? path.join(repoRoot, DEFAULT_PATHS.out),
  };

  const inputs = loadInputs(paths);
  if (!paths.archive) {
    console.log('[content] no event archive requested (--no-events): generating the archive-free surface');
  } else if (!inputs.archive) {
    console.log(`[content] no archive at ${DEFAULT_PATHS.archive} — district pages will state that no history is loaded`);
  } else {
    console.log(
      `[content] archive: ${inputs.archive.total} events (claimed ${inputs.archive.claimed_total}, drift ${inputs.archive.drift >= 0 ? '+' : ''}${inputs.archive.drift})`,
    );
  }

  const { summary, routes } = buildRoutes({ ...inputs, now: new Date() });
  const document = { ...summary, routes };

  // Fail here rather than publish a page that prints a location in this repository's tree.
  // The strings above come from three places — literals in this script, committed data
  // files (a validation report's note, the methodology copy) and interpolated fields of a
  // loaded archive — and only the first is visible to a grep of the source. The rule and
  // its reasoning are in scripts/lib/public-text.mjs and docs/PUBLIC_SURFACE.md §3; the
  // same scan runs over the built documents in CI (scripts/check-public-paths.mjs).
  const leaks = findRepoPaths(document);
  if (leaks.length > 0) {
    console.error(`[content] ${leaks.length} generated string(s) name a location in this repository:`);
    for (const { pointer, value } of leaks.slice(0, 20)) {
      console.error(`  ${pointer}: ${value.slice(0, 160)}`);
    }
    console.error(
      '  Delete the location from the copy that renders it, or apply withoutRepoPaths() to the\n' +
        '  string if it arrives from a data file the build must not rewrite.',
    );
    process.exit(1);
  }

  if (args.check) {
    const existing = readJsonSafe(paths.out);
    if (!existing) {
      console.error(`[content] --check: no readable ${DEFAULT_PATHS.out}`);
      process.exit(1);
    }
    const expected = stableView(document);
    const actual = stableView(existing);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      console.error('[content] --check: the committed routes no longer match the committed inputs.');
      const expectedPaths = expected.routes.map((route) => route.path);
      const actualPaths = actual.routes.map((route) => route.path);
      const added = expectedPaths.filter((p) => !actualPaths.includes(p));
      const removed = actualPaths.filter((p) => !expectedPaths.includes(p));
      if (added.length || removed.length) {
        console.error(`  added: ${added.join(', ') || '—'}`);
        console.error(`  removed: ${removed.join(', ') || '—'}`);
      } else {
        console.error('  the route set matches; a page body differs. Re-run without --check and commit.');
      }
      process.exit(1);
    }
    console.log(`[content] --check: ${routes.length} routes match their inputs.`);
    return;
  }

  mkdirSync(path.dirname(paths.out), { recursive: true });
  writeFileSync(paths.out, `${JSON.stringify(document, null, 2)}\n`);
  console.log(
    `[content] wrote ${path.relative(repoRoot, paths.out)} — ${routes.length} routes ` +
      `(${summary.counts.hazards} hazards, ${summary.counts.districts} districts, ` +
      `${summary.counts.retrospectives} retrospectives, archive=${inputs.archive ? 'loaded' : 'absent'})`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
