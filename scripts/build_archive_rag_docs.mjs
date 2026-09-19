#!/usr/bin/env node
/**
 * build_archive_rag_docs.mjs — put the historical archive into the RAG knowledge base.
 *
 * WHY
 * ---
 * The RAG assistant answers district and hazard questions from `references/`, whose
 * documents are institutional protocols (BRRI varieties, DAE SOPs, veterinary
 * emergencies). None of them carry *event history*: asked "how often does Satkhira
 * flood?", the retriever had nothing factual to cite and the model answered from its
 * own priors.
 *
 * This builder turns the validated archive artifact into citable retrieval documents:
 * a national overview, one per hazard class, one per division, and one per district that
 * the archive actually covers. Each document states its own limits, so a retrieved
 * passage cannot be quoted as more than it is.
 *
 * WHAT IT WRITES
 * --------------
 *   · `rag_pipeline/references/08_hazard_archive/*.md` — human-readable reference docs,
 *     which is the format every other knowledge document uses and what
 *     `scripts/check-rag-freshness.mjs` already knows how to watch;
 *   · then it MERGES those into `rag_pipeline/agent_knowledge_base.json`.
 *
 * The merge is additive and idempotent: documents with the `08_hazard_archive` category
 * are replaced wholesale on each run, and every other document — the hand-written
 * institutional ones — is carried through untouched. That is why this builder does not
 * simply re-run `rag_pipeline/build_agent_knowledge_base.js`: that script walks
 * `rag_pipeline/references`, a directory that does not exist here (the corpus lives at
 * the repository root), so running it would replace a curated 40-plus-document knowledge
 * base with an empty one.
 *
 * HONESTY RULES BAKED INTO THE GENERATED TEXT
 * -------------------------------------------
 * A retrieved document is a citable claim, so the same rules as the pages apply:
 *   · the unit is stated (observations vs episodes);
 *   · severity is labelled as the archive's own reported field, never HazardNet's;
 *   · no casualty figure appears at all — the source's affected column was `0.0` on every
 *     row, i.e. not recorded;
 *   · the missing year and the GLIDE/hazard disagreement rate are stated, so the
 *     assistant can qualify its own answer;
 *   · no derived index, weighting, threshold or cluster assignment is written — see
 *     `scripts/check-severity-embargo.mjs`.
 *
 * Usage:
 *   node scripts/build_archive_rag_docs.mjs
 *   node scripts/build_archive_rag_docs.mjs --check     # CI: docs describe the artifact
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const ARTIFACT = 'frontend/public/data/hazard-archive.json';
const DOCS_DIR = 'rag_pipeline/references/08_hazard_archive';
const KB_PATH = 'rag_pipeline/agent_knowledge_base.json';
const CATEGORY = '08_hazard_archive';
const SCHEMA = 'hazardnet-hazard-archive/v1';

const plural = (n, noun, s = 's') => `${n.toLocaleString('en-US')} ${noun}${n === 1 ? '' : s}`;
const pct = (value) => `${(value * 100).toFixed(1)}%`;

/** A slug safe for a filename and a document id. */
const slug = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** The caveat block every generated document ends with. */
function caveats(archive) {
  const q = archive.quality;
  const t = archive.totals;
  return [
    '## Limits of this document',
    '',
    `- **Unit.** Counts are recorded *event-district observations*, not physical events. The archive holds ${plural(t.rows, 'observation')} across ${plural(t.episodes, 'episode')}, because a national event is recorded once per district.`,
    `- **Severity.** Any severity figure here is the archive's own reported \`Severity_Index\` (0–1). It is reproduced as recorded; it is not computed by HazardNet and must not be described as a HazardNet score.`,
    `- **Casualties.** No casualty or affected-population figure is available. The source archive carries none, so none is stated. Do not infer one.`,
    `- **Coverage.** ${q.missing_years.length ? `The archive has no records at all for ${q.missing_years.join(', ')}.` : 'No year inside the range is entirely absent.'} Reporting density changes over time, so a low-count year may reflect reporting rather than hazard.`,
    `- **Classification.** ${q.glide_disagreement_rows.toLocaleString('en-US')} of ${q.glide_checked_rows.toLocaleString('en-US')} rows (${pct(q.glide_disagreement_rate ?? 0)}) carry a GLIDE prefix naming a different hazard class than the archive's own label. Neither is authoritative.`,
    `- **Divisions.** ${q.division_vintage}`,
    '',
    'Source: validated export of the Bangladesh climatic-hazards archive, loaded through `scripts/etl/cli.py events --adapter bgd-climatic-hazards`. Measured quality: `docs/ops/HAZARD_ARCHIVE_QUALITY.md`.',
  ].join('\n');
}

function nationalDoc(archive) {
  const t = archive.totals;
  const hazards = Object.entries(archive.by_hazard).sort((a, b) => b[1] - a[1]);
  const divisions = Object.entries(archive.by_division).sort((a, b) => b[1] - a[1]);
  const years = Object.entries(archive.by_year);
  const peak = years.reduce((best, entry) => (entry[1] > best[1] ? entry : best), years[0]);
  const months = Object.entries(archive.by_month).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return `# Bangladesh historical hazard archive — national overview

Recorded hazards for Bangladesh districts from ${t.year_range?.[0]} to ${t.year_range?.[1]}, from the validated
historical event archive. This is a *record of what was reported*, and it is the citable source for
questions about how often hazards have affected a district or division.

## Headline counts

| Measure | Value |
| --- | --- |
| Recorded event-district observations | ${t.rows.toLocaleString('en-US')} |
| Distinct physical episodes | ${t.episodes.toLocaleString('en-US')} |
| — national episodes (all 64 districts) | ${t.national_episodes.toLocaleString('en-US')} |
| — partial episodes | ${t.partial_episodes.toLocaleString('en-US')} |
| Districts covered | ${t.districts.toLocaleString('en-US')} |
| Divisions covered | ${t.divisions.toLocaleString('en-US')} |
| Hazard classes | ${t.hazards} |
| Drift against the model card's claim of ${archive.provenance.claimed_total} | ${archive.provenance.drift} |

## By hazard class

${hazards.map(([h, n]) => `- **${h}**: ${plural(n, 'observation')}`).join('\n')}

## By division

${divisions.map(([d, n]) => `- **${d}**: ${plural(n, 'observation')}`).join('\n')}

## Temporal pattern

- Highest-count year in the archive: **${peak?.[0]}** with ${plural(peak?.[1] ?? 0, 'observation')}.
- Busiest months by observation count: ${months.map(([m, n]) => `${m} (${n})`).join(', ')}.
- The archive is dominated by monsoon-season flooding; the concentration partly reflects when
  third-party reporting is densest.

## How to use this

Cite the counts above for "how often has X happened" questions, and always state the unit
(observations, not events) and the year range. For a single district or division, prefer the
district and division documents below, which carry the per-class breakdown.

${caveats(archive)}
`;
}

function hazardDoc(archive, hazard) {
  const count = archive.by_hazard[hazard] ?? 0;
  const stats = archive.severity_by_hazard[hazard] ?? {};
  const episodes = archive.episodes.filter((e) => e.hazard_type === hazard);
  const national = episodes.filter((e) => e.national).length;
  const byDivision = {};
  for (const episode of episodes) {
    const key = episode.division ?? 'unspecified';
    byDivision[key] = (byDivision[key] ?? 0) + episode.district_count;
  }
  const ranked = Object.entries(byDivision).sort((a, b) => b[1] - a[1]);
  const reports = archive.quality.glide_disagreements[`${hazard} → `] ?? null;

  return `# ${hazard} — recorded history, Bangladesh

${plural(count, 'recorded event-district observation')} of **${hazard}** appear in the historical archive
(${archive.totals.year_range?.[0]}–${archive.totals.year_range?.[1]}), forming ${plural(episodes.length, 'episode')}
${national ? `of which ${national} covered all 64 districts` : ''}.

## Severity as recorded

| Statistic | Value |
| --- | --- |
| Observations with a severity value | ${stats.n ?? 0} |
| Minimum | ${stats.min ?? '—'} |
| 25th percentile | ${stats.p25 ?? '—'} |
| Median | ${stats.median ?? '—'} |
| 75th percentile | ${stats.p75 ?? '—'} |
| Maximum | ${stats.max ?? '—'} |

These are the archive's own reported \`Severity_Index\` values, reproduced as recorded.

## Where it is recorded

${ranked.length ? ranked.map(([d, n]) => `- **${d}**: ${plural(n, 'observation')}`).join('\n') : '- No division breakdown available.'}

## Most recent recorded episodes

${episodes.slice(-5).reverse().map((e) => `- ${e.start_date} — ${plural(e.district_count, 'district')}${e.glide ? ` (GLIDE ${e.glide})` : ''}`).join('\n') || '- None recorded.'}
${reports ? `\n## Classification note\n\nThe GLIDE registry assigns a different hazard class to some rows the archive labels "${hazard}". This is one of the counted disagreements — see the limits section.` : ''}

${caveats(archive)}
`;
}

function divisionDoc(archive, division) {
  const count = archive.by_division[division] ?? 0;
  // Districts of this division, from the artifact's own district→division map — not
  // from an episode scan, which only sees districts that appear in a GLIDE group.
  const districts = Object.entries(archive.by_district).filter(
    ([district]) => (archive.district_division ?? {})[district] === division,
  );
  const byHazard = {};
  for (const episode of archive.episodes) {
    if (episode.division !== division) continue;
    byHazard[episode.hazard_type] = (byHazard[episode.hazard_type] ?? 0) + episode.district_count;
  }
  const ranked = Object.entries(byHazard).sort((a, b) => b[1] - a[1]);

  return `# ${division} division — recorded hazard history

${plural(count, 'recorded event-district observation')} in **${division}** division appear in the historical
archive (${archive.totals.year_range?.[0]}–${archive.totals.year_range?.[1]}).

## By hazard class

${ranked.length ? ranked.map(([h, n]) => `- **${h}**: ${plural(n, 'observation')}`).join('\n') : '- No class breakdown available.'}

## Districts in this division with the most records

${districts
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([d, n]) => `- **${d}**: ${plural(n, 'observation')}`)
  .join('\n') || '- Not available.'}

${caveats(archive)}
`;
}

function districtDoc(archive, district, division, count, hazardCounts) {
  const ranked = Object.entries(hazardCounts).sort((a, b) => b[1] - a[1]);
  // Division-level episodes that this district was part of: the archive records a
  // national event once per district, so a division episode lists the districts it hit.
  const episodes = archive.episodes
    .filter((e) => e.division === division && e.district_count > 1)
    .slice(-4)
    .reverse();

  return `# ${district} district — recorded hazard history

${plural(count, 'recorded event-district observation')} for **${district}** district
(${division} division) appear in the historical archive
(${archive.totals.year_range?.[0]}–${archive.totals.year_range?.[1]}).

## By hazard class

${ranked.map(([h, n]) => `- **${h}**: ${plural(n, 'observation')}`).join('\n')}

## Recent division-level episodes

${episodes.map((e) => `- ${e.start_date} — ${e.hazard_type}, ${plural(e.district_count, 'district')}`).join('\n') || '- None recorded.'}

Use this for "how often has ${district} flooded / been hit by a cyclone" questions, and state the
unit and year range in the answer.

${caveats(archive)}
`;
}

function main() {
  const check = process.argv.includes('--check');
  const artifactPath = resolve(ROOT, ARTIFACT);

  if (!existsSync(artifactPath)) {
    console.log(`[rag-archive] no artifact at ${ARTIFACT} — no archive documents to build.`);
    return 0;
  }

  const archive = JSON.parse(readFileSync(artifactPath, 'utf8'));
  if (archive.schema !== SCHEMA) {
    console.error(`[rag-archive] FAIL: ${ARTIFACT} has schema ${archive.schema}, expected ${SCHEMA}`);
    return 1;
  }

  // District → division and district → { hazard: count } come from the artifact's own
  // fields. They must NOT be inferred from division-level aggregates: doing that would
  // attribute one district's hazard mix to another, and a retrieval document is a
  // citable claim, so a wrong mix here becomes a wrong answer in the assistant.
  const districtDivision = new Map(Object.entries(archive.district_division ?? {}));
  if (!districtDivision.size) {
    console.error(
      '[rag-archive] FAIL: the artifact has no `district_division` map — regenerate it with a current\n' +
        '            scripts/build_hazard_archive.mjs. Refusing to guess a district\'s division.',
    );
    return 1;
  }

  const docs = [];
  docs.push({ id: 'archive_national_overview', title: 'Bangladesh Historical Hazard Archive - National Overview', content: nationalDoc(archive) });

  for (const hazard of Object.keys(archive.by_hazard)) {
    docs.push({
      id: `archive_hazard_${slug(hazard)}`,
      title: `${hazard} - Recorded History (Archive)`,
      content: hazardDoc(archive, hazard),
    });
  }

  for (const division of Object.keys(archive.by_division)) {
    docs.push({
      id: `archive_division_${slug(division)}`,
      title: `${division} Division - Recorded Hazard History`,
      content: divisionDoc(archive, division),
    });
  }

  for (const [district, count] of Object.entries(archive.by_district)) {
    const division = districtDivision.get(district) ?? 'unspecified';
    const hazardCounts = archive.by_district_hazard?.[district] ?? {};
    const summed = Object.values(hazardCounts).reduce((a, b) => a + b, 0);
    if (summed !== count) {
      // A mismatch means the artifact's own two views of the same district disagree.
      // Publishing either number would be publishing a claim we know is inconsistent.
      console.error(
        `[rag-archive] FAIL: ${district} hazard counts sum to ${summed} but by_district says ${count} — ` +
          'refusing to publish an inconsistent district document.',
      );
      return 1;
    }
    docs.push({
      id: `archive_district_${slug(district)}`,
      title: `${district} District - Recorded Hazard History`,
      content: districtDoc(archive, district, division, count, hazardCounts),
    });
  }

  if (check) {
    const kbFile = resolve(ROOT, KB_PATH);
    if (!existsSync(kbFile)) {
      console.error(`[rag-archive] FAIL: ${KB_PATH} missing.`);
      return 1;
    }
    const kb = JSON.parse(readFileSync(kbFile, 'utf8'));
    const present = new Set((kb.documents ?? []).map((d) => d.id));
    const missing = docs.filter((d) => !present.has(d.id));
    if (missing.length) {
      console.error(`[rag-archive] FAIL: ${missing.length} archive document(s) missing from the knowledge base — run the builder.`);
      return 1;
    }
    console.log(`[rag-archive] PASS: all ${docs.length} archive documents present in the knowledge base.`);
    return 0;
  }

  // ── write the markdown reference docs ──────────────────────────────────────
  const docsDir = resolve(ROOT, DOCS_DIR);
  rmSync(docsDir, { recursive: true, force: true });
  mkdirSync(docsDir, { recursive: true });
  for (const doc of docs) {
    writeFileSync(join(docsDir, `${doc.id}.md`), doc.content);
  }

  // ── merge into the knowledge base, preserving every hand-written document ──
  const kbFile = resolve(ROOT, KB_PATH);
  const kb = existsSync(kbFile)
    ? JSON.parse(readFileSync(kbFile, 'utf8'))
    : { metadata: { version: '2.0', domain: 'Bangladesh Agriculture & Disaster Management', sources: [] }, documents: [] };

  const preserved = (kb.documents ?? []).filter((d) => d.category !== CATEGORY);
  kb.documents = [
    ...preserved,
    ...docs.map((d) => ({ id: d.id, category: CATEGORY, title: d.title, content: d.content })),
  ];
  kb.metadata = {
    ...kb.metadata,
    archive_documents: docs.length,
    archive_generated_at: archive.generated_at,
    archive_note:
      'Documents in category 08_hazard_archive are generated by scripts/build_archive_rag_docs.mjs from ' +
      'the validated hazard-archive artifact. They report the archive\'s own severity field and state ' +
      'their own limits; they contain no derived index.',
  };

  writeFileSync(kbFile, `${JSON.stringify(kb, null, 2)}\n`);
  console.log(
    `[rag-archive] wrote ${docs.length} reference docs to ${DOCS_DIR}/ and merged them into ${KB_PATH}` +
      ` (${preserved.length} existing documents preserved).`,
  );
  return 0;
}

process.exit(main());
