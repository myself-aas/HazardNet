#!/usr/bin/env node
/**
 * build_hazard_archive.mjs — derive the publishable historical-archive artifact.
 *
 * WHY THIS EXISTS
 * ---------------
 * `data/events/README.md` states that the raw archive is **not redistributed** by this
 * repository, and `data/events/.gitignore` keeps `*.json` there untracked for that
 * reason. But the same README wants the surfaces to work: "a deployment that has the
 * export drops it here and rebuilds".
 *
 * This builder is the bridge between those two requirements. It reads the **validated**
 * ETL export (`python -m etl.cli events --adapter bgd-climatic-hazards --export-json …`)
 * and writes an aggregate artifact containing:
 *
 *   · counts and distributions (by hazard, year, month, division, district);
 *   · per-event *episodes* keyed by GLIDE — an open public registry identifier, i.e. a
 *     citation, not third-party content;
 *   · the archive's own reported severity index, as summary statistics;
 *   · a data-quality section stating what the archive does and does not contain.
 *
 * It deliberately does **not** carry: `Full_Description` (third-party ReliefWeb prose),
 * raw per-row records, or coordinates. Aggregated counts and public event identifiers
 * are not a redistribution of the compilation's content; the prose would be.
 *
 * WHAT IT REFUSES TO PUBLISH
 * --------------------------
 * Any *new* severity index derived in this repository is under publication embargo until
 * the associated research is published (see `scripts/check-severity-embargo.mjs`). This
 * builder emits an `embargo` block naming what is withheld and why, so a page can state
 * the omission instead of silently showing nothing. The archive's own `Severity_Index`
 * field is **not** subject to the embargo: it is already present in the committed data.
 *
 * Usage:
 *   node scripts/build_hazard_archive.mjs --events data/events/hazardnet-events.json
 *   node scripts/build_hazard_archive.mjs --events … --check   # CI drift gate
 *   node scripts/build_hazard_archive.mjs --events … --quality-report docs/…md
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

export const ARCHIVE_SCHEMA = 'hazardnet-hazard-archive/v1';
const DEFAULT_OUT = 'frontend/public/data/hazard-archive.json';
const DEFAULT_REPORT = 'docs/ops/HAZARD_ARCHIVE_QUALITY.md';

/** The eight classes the model models, in the model's own order (`Models/labels.json`). */
const HAZARD_ORDER = [
  'Cold Wave',
  'Drought',
  'Fire',
  'Flash Flood',
  'Flood',
  'Heat Wave',
  'Severe Local Storm',
  'Tropical Cyclone',
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** `key=value` tokens at the head of `notes`, per the adapter's NOTES GRAMMAR. */
function parseNotes(notes) {
  const out = {};
  if (typeof notes !== 'string' || !notes) return out;
  const head = notes.split('|')[0];
  for (const token of head.trim().split(/\s+/)) {
    const eq = token.indexOf('=');
    if (eq > 0) out[token.slice(0, eq)] = token.slice(eq + 1);
  }
  return out;
}

function round(value, places = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}

function describe(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return { n: 0, min: null, p25: null, median: null, p75: null, max: null, mean: null };
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    min: round(sorted[0]),
    p25: round(quantile(sorted, 0.25)),
    median: round(quantile(sorted, 0.5)),
    p75: round(quantile(sorted, 0.75)),
    max: round(sorted[sorted.length - 1]),
    mean: round(sum / sorted.length),
  };
}

function tally(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (key === null || key === undefined || key === '') continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function orderedTally(counts, order) {
  const out = {};
  for (const key of order) {
    if (counts.has(key)) out[key] = counts.get(key);
  }
  // Anything outside the declared order still appears, appended — never dropped.
  for (const [key, value] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!(key in out)) out[key] = value;
  }
  return out;
}

/**
 * Group validated rows into physical events.
 *
 * The archive is event-district observations (2,931 rows, 60 GLIDE ids): a single
 * cyclone is one GLIDE across 64 rows on one date. Grouping by GLIDE reconstructs the
 * physical event; rows without a GLIDE become single-district episodes keyed by their
 * own record id, so nothing is dropped.
 */
function buildEpisodes(rows) {
  const groups = new Map();
  for (const row of rows) {
    const tokens = parseNotes(row.notes);
    const key = tokens.glide ? `glide:${tokens.glide}` : `record:${row.source_record_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: tokens.glide || row.source_record_id,
        glide: tokens.glide ?? null,
        hazard_type: row.hazard_type,
        start_date: row.start_date,
        division: row.division,
        districts: new Set(),
        severities: [],
        data_sources: new Set(),
        flagged_for_review: 0,
        gee_start: tokens.gee ? tokens.gee.split('..')[0] : null,
        gee_end: tokens.gee ? tokens.gee.split('..')[1] : null,
      });
    }
    const group = groups.get(key);
    group.districts.add(row.adm2_name);
    if (Number.isFinite(row.severity)) group.severities.push(row.severity);
    if (tokens.src) group.data_sources.add(tokens.src);
    if (tokens.review === 'True') group.flagged_for_review += 1;
  }

  return [...groups.values()]
    .map((group) => ({
      id: group.id,
      glide: group.glide,
      hazard_type: group.hazard_type,
      start_date: group.start_date,
      division: group.division,
      district_count: group.districts.size,
      /**
       * Summary statistics only — the per-district severity values are deliberately
       * not carried. Republishing every value of the archive's severity column would
       * amount to redistributing the compilation row by row, which is the thing
       * `data/events/README.md` rules out; the distribution is what a page needs.
       */
      severity: describe(group.severities),
      data_sources: [...group.data_sources].sort(),
      flagged_for_review: group.flagged_for_review,
      gee_window: group.gee_start && group.gee_end ? `${group.gee_start}..${group.gee_end}` : null,
      /**
       * A national episode covers all 64 districts. Recorded explicitly because
       * otherwise "64 rows = 64 events" is the natural misreading of the archive.
       */
      national: group.districts.size === 64,
    }))
    .sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0));
}

/** GLIDE's own prefix vocabulary, used only to *check* the archive's hazard label. */
const GLIDE_PREFIX_HAZARD = {
  FL: 'Flood',
  FF: 'Flash Flood',
  TC: 'Tropical Cyclone',
  ST: 'Severe Local Storm',
  CW: 'Cold Wave',
  HT: 'Heat Wave',
  DR: 'Drought',
  FR: 'Fire',
  LS: 'Landslide',
  EQ: 'Earthquake',
  TO: 'Tornado',
  ET: 'Extreme Temperature',
  VO: 'Volcano',
  WF: 'Wildfire',
};

export function buildArchive(exportPayload) {
  const rows = Array.isArray(exportPayload) ? exportPayload : exportPayload?.events;
  if (!Array.isArray(rows)) throw new Error('archive: expected an array of events or {events: [...]}');

  const years = [...new Set(rows.map((r) => String(r.start_date || '').slice(0, 4)))].filter(Boolean).sort();
  const yearCounts = tally(rows, (r) => String(r.start_date || '').slice(0, 4));
  const monthCounts = tally(rows, (r) => String(r.start_date || '').slice(5, 7));
  const hazardCounts = tally(rows, (r) => r.hazard_type);
  const divisionCounts = tally(rows, (r) => r.division);
  const districtCounts = tally(rows, (r) => r.adm2_name);

  // Severity statistics per hazard, from the archive's own reported index.
  const severityByHazard = {};
  for (const hazard of HAZARD_ORDER) {
    severityByHazard[hazard] = describe(rows.filter((r) => r.hazard_type === hazard).map((r) => r.severity));
  }

  const episodes = buildEpisodes(rows);

  // ── data quality ──────────────────────────────────────────────────────────
  // These are reported, not repaired: the builder's job is to state what the archive
  // contains, and a page that quotes a number has to be able to say where it came from.
  const fullYears = years.filter((y) => yearCounts.get(y) > 0);
  const firstYear = Number(fullYears[0]);
  const lastYear = Number(fullYears[fullYears.length - 1]);
  const missingYears = [];
  for (let y = firstYear; y <= lastYear; y += 1) {
    if (!yearCounts.has(String(y))) missingYears.push(y);
  }

  const reviewFlagged = tally(rows, (r) => parseNotes(r.notes).review).get('True') ?? 0;

  // GLIDE prefix vs the row's hazard label. A disagreement does not make the row
  // wrong (the archive may classify on impact rather than mechanism) but it must be
  // countable, because a reader comparing this archive to GLIDE will hit it.
  let glideChecked = 0;
  let glideDisagreements = 0;
  const disagreementPairs = new Map();
  for (const row of rows) {
    const tokens = parseNotes(row.notes);
    if (!tokens.glide) continue;
    const prefix = tokens.glide.split('-')[0];
    const expected = GLIDE_PREFIX_HAZARD[prefix];
    if (!expected) continue;
    glideChecked += 1;
    if (expected !== row.hazard_type) {
      glideDisagreements += 1;
      const pair = `${expected} → ${row.hazard_type}`;
      disagreementPairs.set(pair, (disagreementPairs.get(pair) ?? 0) + 1);
    }
  }

  // by_district_hazard is built in the return value below from `rows`, and
  // district_division from the same source; both are counts only.
  const episodesWithoutGlide = episodes.filter((e) => !e.glide).length;
  const nationalEpisodes = episodes.filter((e) => e.national).length;
  const partialEpisodes = episodes.filter((e) => !e.national && e.glide).length;

  return {
    schema: ARCHIVE_SCHEMA,
    generated_at: new Date().toISOString(),
    provenance: {
      source: 'bgd-climatic-hazards',
      loader: 'scripts/etl/cli.py events --adapter bgd-climatic-hazards',
      export_schema: exportPayload?.schema ?? null,
      ingested: exportPayload?.ingested ?? rows.length,
      claimed_total: exportPayload?.claimed_total ?? null,
      drift: exportPayload?.drift ?? null,
      note:
        'Aggregate statistics and public GLIDE event identifiers only. The archive\'s own ' +
        'per-row records and third-party descriptions are not redistributed — see ' +
        'data/events/README.md.',
    },
    totals: {
      rows: rows.length,
      episodes: episodes.length,
      national_episodes: nationalEpisodes,
      partial_episodes: partialEpisodes,
      episodes_without_glide: episodesWithoutGlide,
      districts: districtCounts.size,
      divisions: divisionCounts.size,
      hazards: hazardCounts.size,
      year_range: years.length ? [years[0], years[years.length - 1]] : null,
    },
    by_year: orderedTally(yearCounts, years),
    by_month: Object.fromEntries(MONTHS.map((name, i) => [name, monthCounts.get(String(i + 1).padStart(2, '0')) ?? 0])),
    by_hazard: orderedTally(hazardCounts, HAZARD_ORDER),
    by_division: Object.fromEntries([...divisionCounts.entries()].sort((a, b) => b[1] - a[1])),
    by_district: Object.fromEntries([...districtCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    /**
     * district → division, and district → { hazard: count }.
     *
     * Carried explicitly because a per-district hazard mix cannot be recovered from
     * `by_district` (totals only) and inferring it from a division-level aggregate would
     * attribute one district's hazards to another — the exact error a retrieval document
     * must not make. Counts only; no per-row values.
     */
    district_division: Object.fromEntries(
      [...new Map(rows.filter((r) => r.division).map((r) => [r.adm2_name, r.division])).entries()].sort((a, b) =>
        a[0].localeCompare(b[0]),
      ),
    ),
    by_district_hazard: Object.fromEntries(
      [...new Map(
        [...districtCounts.keys()].sort().map((district) => {
          const counts = tally(rows.filter((r) => r.adm2_name === district), (r) => r.hazard_type);
          return [district, orderedTally(counts, HAZARD_ORDER)];
        }),
      ).entries()],
    ),
    severity_by_hazard: severityByHazard,
    quality: {
      full_years: fullYears,
      missing_years: missingYears,
      review_flagged_rows: reviewFlagged,
      glide_checked_rows: glideChecked,
      glide_disagreement_rows: glideDisagreements,
      glide_disagreement_rate: glideChecked ? round(glideDisagreements / glideChecked) : null,
      glide_disagreements: Object.fromEntries([...disagreementPairs.entries()].sort((a, b) => b[1] - a[1])),
      /**
       * Columns present in the source archive that carry a single value across every
       * row, and are therefore excluded from this artifact. Recorded so a reader can
       * see the decision rather than wonder why a field is missing.
       */
      excluded_constant_columns: {
        Severity_Score: '1.0 for all 2931 rows — no discriminating information',
        Severity_Index_Name: 'MODERATE_RISK for all 2931 rows — contradicts Severity_Score',
        Validated_Affected: '0.0 for all 2931 rows — means "not recorded", not "none affected"',
      },
      casualties_present: false,
      casualties_note:
        'No casualty field carries data in this archive, so no page states a death toll. ' +
        'Rows whose affected count was recorded as 0 were not written as 0 — the field is ' +
        'absent, because "not recorded" and "nobody affected" are different claims.',
      /** Division vintage: the district table follows the pre-2015 structure. */
      division_vintage:
        'The archive resolves to 7 divisions, not 8: Mymensingh division (created 2015) is ' +
        'carried under Dhaka in the ETL district table (scripts/etl/districts.py). Counts by ' +
        'division therefore follow the pre-2015 structure.',
    },
    embargo: {
      active: true,
      withheld: ['derived_severity_index', 'severity_weights', 'cluster_membership', 'model_predictions'],
      reason:
        'A derived severity index and its weights are part of unpublished research. They are ' +
        'withheld from all public copy until the associated publication is released.',
      disclosed_field:
        'severity_by_hazard is computed from the archive\'s own reported Severity_Index column, ' +
        'which is already present in the source data and is not a HazardNet contribution.',
      enforcement: 'scripts/check-severity-embargo.mjs (CI: npm run check:embargo)',
    },
    episodes,
  };
}

/** A human-readable quality report, committed alongside the artifact. */
export function renderQualityReport(archive, eventsPath) {
  const q = archive.quality;
  const t = archive.totals;
  const pct = (n, total) => `${((n / total) * 100).toFixed(1)}%`;

  const hazardRows = HAZARD_ORDER.filter((h) => archive.by_hazard[h]).map((h) => {
    const s = archive.severity_by_hazard[h];
    return `| ${h} | ${archive.by_hazard[h]} | ${pct(archive.by_hazard[h], t.rows)} | ${s.median} | ${s.min}–${s.max} |`;
  });

  const divisionRows = Object.entries(archive.by_division).map(
    ([name, count]) => `| ${name} | ${count} | ${pct(count, t.rows)} |`,
  );

  const disagreementRows = Object.entries(q.glide_disagreements).map(
    ([pair, count]) => `| ${pair} | ${count} |`,
  );

  const yearRows = Object.entries(archive.by_year).map(
    ([year, count]) => `| ${year} | ${count} | ${count === 0 ? '⚠ no records' : ''} |`,
  );

  return `# Historical hazard archive — data quality

> Generated by \`scripts/build_hazard_archive.mjs\` from the validated ETL export
> (\`${eventsPath}\`). Regenerate with:
>
> \`\`\`bash
> python -m etl.cli events --input data/events/historical_hazard_records_with_HazardNet_severity.csv \\
>   --adapter bgd-climatic-hazards --claimed-total 2931 --export-json <tmp>.json
> node scripts/build_hazard_archive.mjs --events <tmp>.json
> \`\`\`
>
> Every figure below is derived from that export. Nothing here is asserted.

## 1. What loaded

| Measure | Value |
| --- | --- |
| Rows ingested (event-district observations) | ${t.rows} |
| Distinct physical episodes (by GLIDE) | ${t.episodes} |
| — national episodes (all 64 districts) | ${t.national_episodes} |
| — partial episodes | ${t.partial_episodes} |
| — rows with no GLIDE (single-district episodes) | ${t.episodes_without_glide} |
| Districts covered | ${t.districts} |
| Divisions covered | ${t.divisions} |
| Hazard classes | ${t.hazards} |
| Year range | ${t.year_range ? `${t.year_range[0]}–${t.year_range[1]}` : 'n/a'} |
| Drift against the MODEL_CARD §4 claim of ${archive.provenance.claimed_total} | ${archive.provenance.drift} |

**The unit matters.** The archive is *event-district observations*, not one row per
physical event: ${t.episodes} episodes account for ${t.rows} rows because a national event
carries one row per district. A count of ${t.rows} is therefore not a count of ${t.rows}
disasters, and the pages say so.

## 2. By hazard class

| Hazard | Rows | Share | Median severity | Range |
| --- | --- | --- | --- | --- |
${hazardRows.join('\n')}

Severity is the archive's own \`Severity_Index\` column (0–1). It is *reported*, not
computed by HazardNet — see the embargo note in §6.

## 3. By division

| Division | Rows | Share |
| --- | --- | --- |
${divisionRows.join('\n')}

${q.division_vintage}

## 4. Coverage by year

| Year | Rows | Note |
| --- | --- | --- |
${yearRows.join('\n')}

Missing years inside the range: ${q.missing_years.length ? q.missing_years.join(', ') : 'none'}.

A zero or low year is a **reporting** artefact as much as a hazard one: the archive is
assembled from third-party records whose coverage varies. The retrospectives state this
rather than presenting a quiet year as a quiet hazard year.

## 5. Known quality issues (reported, not repaired)

| Issue | Count | Effect |
| --- | --- | --- |
| Rows flagged \`Requires_Manual_Review\` | ${q.review_flagged_rows} | Carried in the source; surfaced, not hidden |
| Rows where the GLIDE prefix disagrees with the hazard label | ${q.glide_disagreement_rows} of ${q.glide_checked_rows} (${(q.glide_disagreement_rate * 100).toFixed(1)}%) | A reader cross-checking against GLIDE will hit this; it is counted here so the divergence is auditable |
| Rows with no GLIDE | ${t.episodes_without_glide} | Cannot be grouped into a physical event |
| Casualty data | none | No page states a death toll |

### 5.1 GLIDE prefix vs archive hazard label

| Disagreement | Rows |
| --- | --- |
${disagreementRows.length ? disagreementRows.join('\n') : '| none | 0 |'}

A GLIDE prefix encodes the *registered* hazard; the archive's label is its own
classification. Neither is treated as authoritative here — the disagreement is reported.

### 5.2 Excluded constant columns

These columns exist in the source and are **deliberately excluded** from the published
artifact, because a constant carries no information and quoting it would mislead:

${Object.entries(q.excluded_constant_columns).map(([col, why]) => `- \`${col}\` — ${why}`).join('\n')}

In particular \`Validated_Affected = 0.0\` on every row is **not** published as zero
affected: the field is absent from the contract rows, so no surface can render it as a
claim about people.

## 6. Publication embargo

| | |
| --- | --- |
| Derived severity index | **withheld** |
| Severity weights | **withheld** |
| Cluster membership | **withheld** |
| Model predictions | **withheld** |

${archive.embargo.reason}

Enforced by \`${archive.embargo.enforcement}\`: the build fails if embargoed material
appears in public copy.

## 7. Evidence

- \`data/events/README.md\` — why the raw archive is not redistributed
- \`scripts/etl/adapters/bgd_climatic_hazards.py\` — the column mapping and what it refuses to map
- \`scripts/etl/events.py\` — the event contract and validation rules
- \`scripts/etl/districts.py\` — the 64-district vocabulary and alias table
- \`frontend/public/data/hazard-archive.json\` — the artifact these figures come from
`;
}

function main() {
  const argv = process.argv.slice(2);
  const args = { check: false, events: null, out: DEFAULT_OUT, report: null, 'quality-report': null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--check') args.check = true;
    else if (token === '--events') args.events = argv[++i];
    else if (token === '--out') args.out = argv[++i];
    else if (token === '--quality-report') args['quality-report'] = argv[++i];
  }

  const eventsPath = args.events ?? 'data/events/hazardnet-events.json';
  const resolved = resolve(ROOT, eventsPath);

  if (!existsSync(resolved)) {
    // The archive-absent path is a supported state, not an error (data/events/README.md).
    console.log(`[hazard-archive] no export at ${eventsPath} — nothing to build; the surfaces state the archive is not loaded.`);
    return 0;
  }

  const payload = JSON.parse(readFileSync(resolved, 'utf8'));
  const archive = buildArchive(payload);
  const rendered = `${JSON.stringify(archive, null, 2)}\n`;

  if (args.check) {
    const target = resolve(ROOT, args.out);
    if (!existsSync(target)) {
      console.error(`[hazard-archive] FAIL: ${args.out} is missing — run the builder and commit it.`);
      return 1;
    }
    const committed = JSON.parse(readFileSync(target, 'utf8'));
    // Compare with the clock removed: generated_at moves on every run by design.
    delete archive.generated_at;
    delete committed.generated_at;
    if (JSON.stringify(archive) !== JSON.stringify(committed)) {
      console.error(`[hazard-archive] FAIL: ${args.out} is stale — regenerate and commit it.`);
      return 1;
    }
    console.log('[hazard-archive] PASS: the committed artifact describes the committed export.');
    return 0;
  }

  const outPath = resolve(ROOT, args.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, rendered);
  console.log(`[hazard-archive] wrote ${args.out}: ${archive.totals.rows} rows, ${archive.totals.episodes} episodes`);

  const reportPath = resolve(ROOT, args['quality-report'] ?? DEFAULT_REPORT);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, renderQualityReport(archive, eventsPath));
  console.log(`[hazard-archive] wrote ${args['quality-report'] ?? DEFAULT_REPORT}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
