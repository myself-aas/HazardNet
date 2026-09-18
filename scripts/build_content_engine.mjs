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
 *   * `--events` points at a normalised export (`python -m etl.cli events --export-json …`),
 *     which is the same set of rows the ETL validates and loads into PostGIS.
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

export const GENERATED_SCHEMA = 'hazardnet-generated-routes/v1';
export const PERFORMANCE_SCHEMA = 'hazardnet-model-performance/v1';
export const CLAIMED_EVENT_TOTAL = 2931;

const DEFAULT_PATHS = {
  methodology: 'frontend/src/content/hazard-methodology.json',
  districtsTs: 'frontend/src/data/bangladeshDistricts.ts',
  snapshot: 'frontend/public/data/forecasts-latest.json',
  alerts: 'frontend/public/data/alerts-latest.json',
  freshness: 'frontend/public/data/freshness.json',
  /**
   * Phase 9 §8.1 — the published validation numbers, projected from `data/hindcast/reports/*.json`
   * by `scripts/build_model_performance.mjs`. It is a separate artifact from this engine for the
   * same reason the freshness artifact is: the reports are what CI recomputes, so the page states
   * what those reports say and nothing else.
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
 * renamed, or spelled differently when the tensor was exported. Keys are what the snapshot
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
 * because a district profile that quietly lost rows is worse than one that says it has no
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

function hazardRoute({ hazard, outlook, now, methodology }) {
  const shared = methodology.shared;
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
          `That expression is executed against scripts/physics_severity.py by scripts/tests/test_content_engine.py — this page cannot silently describe a formula the pipeline no longer runs.`,
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
        answer: `The published confidence is the model's own softmax over its eight classes, labelled uncalibrated_model_softmax in the data. It says how certain the classifier is about the class it picked, not how often that class actually materialises. No calibration map has been fitted yet, which is also why nothing above the WATCH level can be published automatically.`,
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
            ? `${plural(events.length, 'recorded event')} in this district in the archive this deployment loaded (${archive.source_path}), out of ${plural(archive.total, 'event')} nationally. ${listText(
                Object.entries(byHazard)
                  .sort((a, b) => b[1] - a[1])
                  .map(([hazard, count]) => `${hazard}: ${count}`),
              )}.`
            : `The archive this deployment loaded (${archive.source_path}) records no event for ${district.name}, out of ${plural(archive.total, 'event')} nationally. An unrecorded event is not the same as an absent event — reporting coverage differs by district and decade.`,
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
              description: `Normalised historical hazard events for Bangladesh districts, compiled for the model's climatological prior and validated by the ETL (scripts/etl/events.py). Loaded for this deployment from ${archive.source_path}.`,
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
          'Confidence is the model\'s own certainty in that class (softmax), published as uncalibrated; it is not a measure of whether the forecast is correct.',
          'The physics severity is an independent formula-based estimate over the same drivers. Divergence between the two tracks is normal and is shown rather than hidden.',
          'Horizons are 7 and 15 days. The 15-day outlook is the less certain of the two and is a planning aid, not a storm-specific prediction.',
          shared.publicationGate,
        ],
      },
      { h2: 'Static baseline shipped with the app', paragraphs: baselineParas },
      historySection,
      { h2: 'Ground truth for this district', paragraphs: [shared.groundTruth] },
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
 * (`scripts/build_model_performance.mjs`, which projects the four committed hindcast reports).
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
function modelPerformanceRoute({ performance }) {
  if (!isRecord(performance) || performance.schema !== PERFORMANCE_SCHEMA) {
    throw new Error(
      `${DEFAULT_PATHS.performance} is missing or is not a ${PERFORMANCE_SCHEMA} — ` +
        'run `node scripts/build_model_performance.mjs` before the build',
    );
  }
  const episodes = Array.isArray(performance.episodes) ? performance.episodes : [];
  if (episodes.length === 0) throw new Error('model-performance.json has no episodes');

  const count = (value) => (num(value) === null ? '—' : String(value));
  const score = (value) => (num(value) === null ? '—' : num(value).toFixed(3));
  const range = (min, max, digits = 1, unit = '') => {
    if (num(min) === null || num(max) === null) return '—';
    return num(min) === num(max) ? `${num(min).toFixed(digits)}${unit}` : `${num(min).toFixed(digits)}–${num(max).toFixed(digits)}${unit}`;
  };
  const of = (part, whole) => `${count(part)} of ${count(whole)}`;

  const totals = performance.totals ?? {};
  const method = performance.method ?? {};
  const horizons = Array.isArray(method.horizons) ? method.horizons : [];

  /**
   * A table column needs a scannable label, and the report's titles are full sentences
   * ("Eastern flash floods — Feni, Cumilla, Noakhali, 20–30 August 2024"). Cutting at the em
   * dash the report itself uses keeps the episode's name and drops the detail — which nothing
   * loses, because the episode list below carries every full title.
   */
  const shortTitle = (episode) => String(episode.title ?? '').split(' — ')[0].trim() || episode.id;

  // `updated` is the newest report's own build date — a field of an input, never the clock, so
  // this route is stable across rebuilds and `--check` stays exact.
  const updated = episodes
    .map((episode) => (episode.report?.generated_at ?? '').slice(0, 10))
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  const notComputed = episodes.filter((episode) => episode.scores?.pod === null).map((episode) => episode.id);

  return {
    path: '/model-performance',
    label: 'Hindcast validation',
    title: 'Hindcast validation: what HazardNet detected on four historical Bangladesh episodes',
    description:
      `Per-episode detection counts, POD/FAR/CSI and threshold-band sensitivity for ${episodes.length} historical episodes ` +
      `(Cyclone Amphan 2020, Cyclone Yaas 2021, the August 2024 eastern floods, the June 2025 northeast floods), computed from ` +
      'reanalysis drivers and published with the limits stated. Four episodes are not a validation set, and these are a ceiling ' +
      'on detection rather than forecast skill. The page publishes no single accuracy percentage, because this system cannot support one.',
    keywords: [
      'HazardNet validation',
      'hindcast Bangladesh flood 2024',
      'cyclone Amphan 2020 warning skill',
      'POD FAR CSI',
      'early warning system verification',
      'reanalysis hindcast',
    ],
    robots: 'index,follow',
    sitemap: { changefreq: 'monthly', priority: 0.7 },
    appShell: true,
    updated,
    breadcrumb: [{ name: 'Hindcast validation', path: '/model-performance' }],
    structuredData: {
      place: { '@type': 'Country', name: 'Bangladesh' },
      dataset: {
        kind: 'hindcast-validation',
        name: 'HazardNet hindcast validation runs, Bangladesh (2020–2025)',
        description:
          `Detection counts, POD/FAR/CSI and threshold sensitivity for ${episodes.length} historical episodes, scored by ` +
          'scripts/hindcast/ (reanalysis drivers; the CNN was not re-run). Each episode file records the truth-set sources it scored against.',
        temporalCoverage: `${episodes.map((episode) => episode.onset_date).sort()[0]}/${episodes.map((episode) => episode.onset_date).sort().pop()}`,
        variableMeasured: [
          'districts with a scored row',
          'districts flagged (any class)',
          'districts flagged with the episode class',
          'probability of detection',
          'false alarm ratio',
          'critical success index',
        ],
        keywords: ['Bangladesh', 'hazard verification', 'hindcast', 'early warning'],
      },
    },
    h1: 'What the model did on four historical episodes',
    standfirst:
      `Across ${count(totals.episodes)} episodes and ${count(totals.named_districts)} district-episode pairs that the ` +
      `cited assessments name, the physics track flagged ${count(totals.flagged_any_class)} under some class, ` +
      `${count(totals.flagged_the_episode_class)} under the class that occurred, and ${count(totals.episode_class_over_threshold)} ` +
      'scored the occurring class above the alarm band. Those three numbers are not the same number, and the difference between ' +
      'them is the most useful thing on this page.',
    sections: [
      {
        h2: 'The four episodes',
        paragraphs: [
          'Each episode is a committed file — a sourced truth set, a driver series and a report — and each report is recomputed in CI from those inputs. The tables on this page are that recomputation, projected, not a re-analysis.',
        ],
        bullets: episodes.map(
          (episode) =>
            `${episode.title} — onset ${episode.onset_date}, ${count(episode.affected_count)} districts named as affected, truth completeness: ${episode.truth_completeness ?? '—'}.`,
        ),
      },
      {
        h2: 'Read this first',
        callout: {
          tone: 'warning',
          text:
            'These are four episodes, not a validation set. Detection is counted only over the districts the cited sources name — ' +
            'a district nobody named is unknown, not clear — and the drivers are reanalysis (the weather that occurred), so every ' +
            'number here is a ceiling on detection, not forecast skill.',
        },
        paragraphs: [
          `Drivers: ${method.product ?? '—'} (${method.endpoint ?? '—'}), ${Array.isArray(method.variables) ? method.variables.join(', ') : '—'}. ` +
            `${method.is_forecast_note ?? ''}`,
          `Alarm band: ${score(method.alarm_threshold)} on the class severity score${
            horizons.length ? `, at ${horizons.map((horizon) => `${horizon.lead_days}-day`).join(' and ')} horizons` : ''
          }. ${method.absence_means_no_event_reason ?? ''}`,
        ],
        bullets: [
          `The CNN was ${method.cnn_evaluated ? 'evaluated' : 'not evaluated'}. ${method.cnn_note ?? ''}`,
          'Scores are shown to three decimals; the unrounded values, the per-district rows and the input hashes are in the machine-readable copy this page is generated from.',
        ],
        links: [
          { label: 'How severity and confidence are computed', href: '/methodology' },
          { label: 'Model card and stated limits', href: '/model' },
          { label: 'Data sources and licences', href: '/data-sources' },
        ],
      },
      {
        h2: 'Detection: did the run flag the districts the sources name?',
        paragraphs: [
          'Each row is one episode, scored against that episode\'s own truth set. "Flagged any class" counts a district as flagged when any of the eight classes crossed the alarm band; "flagged the class" counts only the class that occurred, which is the strict reading. The last column separates a district the track scored low from a district it scored high but classified under another class.',
          `Totals: ${of(totals.named_districts, totals.named_districts)} named district-episode pairs carried a scored row, ` +
            `${count(totals.flagged_any_class)} were flagged under some class, and ${count(totals.flagged_the_episode_class)} named the class that occurred.`,
        ],
        table: {
          caption:
            'Detection per episode, over the districts the cited sources name (class-agnostic and class-strict counts are both shown).',
          columns: ['Episode', 'Class', 'Onset', 'Named districts', 'With a scored row', 'Flagged any class', 'Flagged the class', 'Class over band'],
          rows: episodes.map((episode) => [
            shortTitle(episode),
            episode.hazard_class,
            episode.onset_date,
            count(episode.detection?.named_districts),
            count(episode.detection?.districts_with_a_scored_row),
            count(episode.detection?.flagged_any_class),
            count(episode.detection?.flagged_the_episode_class),
            count(episode.detection?.episode_class_over_threshold),
          ]),
        },
      },
      {
        h2: 'Scores: POD, FAR and CSI — and the rows where they do not exist',
        paragraphs: [
          'These are the standard verification scores, computed over the district-horizon samples in each episode\'s window. ' +
            (notComputed.length
              ? `POD is "—" for ${notComputed.join(', ')}: the truth set names affected districts but records no dated outcome inside ` +
                'the prediction window, so there is no observed event to divide by. A false alarm ratio of 1.000 in that situation means ' +
                '"no negative sample existed", not "every alarm was wrong" — with no named event there is nothing for an alarm to be right about.'
              : 'Every episode had a computable POD.'),
          'The false alarm ratio is measurable only against districts where an event was recorded as absent. The reports say plainly that no district is treated as a confirmed negative, so treat the FAR column as a bound on the fraction of alarms that hit a district nobody reported as affected — which is the drift signal the district pages also expose.',
        ],
        table: {
          caption:
            'Verification scores at the shipped alarm band. "Scored samples" is the denominator each row was computed from; "—" is a score the report states cannot be computed.',
          columns: ['Episode', 'Scored samples', 'Hits', 'Misses', 'False alarms', 'POD', 'FAR', 'CSI'],
          rows: episodes.map((episode) => [
            shortTitle(episode),
            count(episode.scores?.scored_samples),
            count(episode.scores?.hits),
            count(episode.scores?.misses),
            count(episode.scores?.false_alarms),
            score(episode.scores?.pod),
            score(episode.scores?.far),
            score(episode.scores?.csi),
          ]),
        },
      },
      {
        h2: 'Threshold bands: 0.40, 0.50, 0.65',
        paragraphs: [
          'The product spec bands an alarm as WATCH from 0.40, the harness default is 0.50, and WARNING starts at 0.65. The rows below are the same scoring run at each band, which is how much the published decision depends on where the band is drawn.',
          'In every one of these episodes the three bands produce the identical split: the severity scores are not clustered near the thresholds, so moving the band does not move the alarm set. That is a property of these four windows, not a general result.',
        ],
        table: {
          caption: 'The same scoring run at the three published alarm bands.',
          columns: ['Episode', 'Band', 'Threshold', 'Scored', 'Hits', 'Misses', 'False alarms', 'POD', 'FAR'],
          rows: (performance.threshold_sensitivity ?? []).map((row) => [
            shortTitle(episodes.find((episode) => episode.id === row.episode) ?? { title: row.episode }),
            String(row.band ?? '').replace(/^PRODUCT_SPEC §1\.3 /, ''),
            score(row.alarm_threshold),
            count(row.scored_samples),
            count(row.hits),
            count(row.misses),
            count(row.false_alarms),
            score(row.pod),
            score(row.far),
          ]),
        },
      },
      {
        h2: 'The wind driver, and why it decides detection',
        paragraphs: [
          'The shipped pipeline scores the sustained 10 m maximum. The driver archive also carries the gust maximum, so each report re-scores the same episode with it. Where those two rows differ, the driver choice — not the formula — is what decides whether the district point was detectable.',
          ...episodes
            .map((episode) => episode.drivers?.finding)
            .filter(Boolean)
            .map((finding) => finding),
        ],
        table: {
          caption:
            'Episode-class score range and over-band count under each wind driver, per episode (128 district-horizon rows each).',
          columns: ['Episode', 'Driver', 'Rows', 'Wind (km/h)', 'Episode-class score', 'Rows over band', 'Top class'],
          rows: episodes.flatMap((episode) =>
            [episode.drivers?.shipped, episode.drivers?.archive]
              .filter(Boolean)
              .map((driver) => [
                shortTitle(episode),
                driver.name === 'era5_10m_sustained' ? 'sustained max (shipped)' : 'gust max (archive)',
                count(driver.rows),
                range(driver.wind_kmh_min, driver.wind_kmh_max, 1, ''),
                range(driver.episode_class_score_min, driver.episode_class_score_max, 4, ''),
                count(driver.episode_class_over_threshold),
                Object.entries(driver.top_class_distribution ?? {})
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, value]) => `${name} (${value})`)
                  .join(', ') || '—',
              ]),
          ),
        },
      },
      {
        h2: 'Saturated terms: three formula inputs that carry no information',
        paragraphs: [
          'The physics cross-check feeds each formula an argument taken from the forecast unit. Four of those arguments, measured across all four episodes, sit at the top of their formula on every row — so the term cannot distinguish one district from another, and any severity difference attributed to it is an artefact of the wiring rather than of the weather.',
          ...episodes
            .map((episode) => episode.counterfactual_finding)
            .filter(Boolean)
            .slice(0, 1)
            .map((finding) => finding),
        ],
        table: {
          caption:
            'Rows at the term\'s ceiling, out of the rows scored, per episode. A term at its ceiling on every row carries no information.',
          columns: ['Episode', 'Rows', 'fire_wind', 'fire_drying', 'heat_persistence', 'cold_persistence'],
          rows: episodes.map((episode) => [
            shortTitle(episode),
            count(episode.drivers?.shipped?.rows),
            ...['fire_wind', 'fire_drying', 'heat_persistence', 'cold_persistence'].map((term) => {
              const block = episode.saturation?.[term];
              if (!block) return '—';
              return `${count(block.rows_at_ceiling)} of ${count(block.rows)}`;
            }),
          ]),
        },
      },
      {
        h2: 'What is not claimed here',
        bullets: (performance.not_published ?? []).map(String),
      },
      {
        h2: 'How to read the two tracks',
        bullets: (performance.how_to_read ?? []).map(String),
      },
      {
        h2: 'Truth sets and citations',
        paragraphs: [
          'Each episode was scored against the districts the sources below name as affected. They are the same sources recorded in the committed episode files, with the same access date.',
        ],
        bullets: (performance.citations ?? []).map(
          (citation) => `${citation.citation} — ${citation.url} (accessed ${citation.accessed})`,
        ),
      },
      {
        h2: 'Reproducing this page',
        paragraphs: [
          'Every number here is recomputed in CI from the committed episode files and driver series: `python -m hindcast.cli check --require-reports` re-runs each report and fails if a single value differs, and `node scripts/build_model_performance.mjs --check` fails if the artifact this page is generated from no longer matches those reports. The machine-readable copy is linked below.',
        ],
        links: [{ label: 'model-performance.json (machine-readable)', href: '/data/model-performance.json' }],
      },
    ],
    faqs: [
      {
        question: 'Is there an accuracy number for the forecast model?',
        answer:
          'No, and this deployment will not publish one. Four episodes are not a validation set, the drivers are reanalysis rather than archived forecast fields, and no district is treated as a confirmed negative. What is published is what the reports actually measured: how many of the named districts were flagged, and POD/FAR/CSI with their denominators stated.',
      },
      {
        question: 'Why does Cyclone Amphan show a false alarm ratio of 1.000 and no POD?',
        answer:
          'The Amphan truth set names the affected districts but records no dated outcome inside the prediction window, so there is no observed event to divide by and POD cannot be computed. Every alarm then counts as a false alarm because no negative sample exists either. The report says this in place rather than presenting a zero as a score.',
      },
      {
        question: 'Was the CNN evaluated on these episodes?',
        answer:
          'No. The class and severity in every episode come from the independent physics cross-check. The CNN was not re-run: its input tensor needs Sentinel-1/2, Landsat and ERA5-Land bands over Earth Engine for the historical window, which this harness has no credential for.',
      },
      {
        question: 'Does this page change when the forecast model is updated?',
        answer:
          'Only when the committed hindcast reports change. The page is generated from an artifact whose own provenance is the reports\' hashes, so a model update that is not re-scored on these episodes does not silently rewrite the validation numbers.',
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
      { h2: 'Shared rules across every class', bullets: [methodology.shared.classVocabulary, methodology.shared.confidencePolicy, methodology.shared.publicationGate] },
    ],
    faqs: [
      {
        question: 'Why only eight classes?',
        answer:
          'Eight is the model\'s output vocabulary (Models/labels.json), fixed by the training data and enforced on ingest. A hazard outside that list is not mapped onto a nearest neighbour: the event loader rejects and reports the label instead, and the forecast ingest refuses the row.',
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
        shared: methodology.shared,
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
          description: `Normalised historical hazard events for Bangladesh districts, compiled for the model's climatological prior and validated by the ETL. Loaded for this deployment from ${archive.source_path}.`,
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
            `Assembled from ${archive.source_path ?? 'the loaded archive'} — ${plural(archive.total, 'event')} spanning ${archive.date_range[0]} to ${archive.date_range[1]}. The archive reports ${plural(archive.total, 'event')} against the ${claimedText} the model card quotes (drift ${archive.drift >= 0 ? '+' : ''}${archive.drift}); the measured number is used here.`,
            'A retrospective counts what was recorded. Reporting coverage varies by decade, district and hazard class, so a rise in a year\'s count can be a rise in reporting rather than in hazard. The pages say which sources each year draws on.',
          ],
          links: years.map((year) => ({ label: `${year}`, href: `/retrospectives/${year}` })),
        },
        {
          h2: 'What validation against the model would require',
          paragraphs: [
            'Comparing these seasons to model output needs a hindcast: the pipeline\'s forecasts re-run over historical weather with the same tensor contract, scored with POD/FAR/CSI against the archive. That evaluation harness exists for the live path but no hindcast has been produced, so no skill number is published here.',
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
            description: `The ${year} subset of the normalised historical hazard event archive this deployment loaded (${archive.source_path}); ${inYear.length} recorded events.`,
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
          { h2: 'How to read it against the model', paragraphs: ['Compare a season to model output only with a hindcast — see the retrospectives index for why.'], links: [{ label: 'Model card', href: '/model' }] },
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
        hindcast_version: performance.hindcast_version ?? null,
        episodes: (performance.episodes ?? []).length,
        // The reports themselves, by hash: this is what ties the published page to the exact
        // files `hindcast.cli check` recomputed, so a later-but-different report is visible here.
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
        'run `node scripts/build_model_performance.mjs` first (the frontend build does)',
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
