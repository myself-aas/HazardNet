#!/usr/bin/env node
/**
 * Build the public daily report page and the report archive index.
 *
 * Inputs:
 *   --snapshot   frontend/public/data/daily-advisories-v1.json (whitelisted public snapshot)
 *   --audit      optional HazardNet_Audit_Report.md fetched from the Kaggle dataset
 *   --out-dir    frontend/public/reports
 *
 * Outputs:
 *   <out-dir>/<YYYY-MM-DD>.md   comprehensive daily report in the site's MDX-style
 *                               template (markdown + {{chart:…}} / {{table:…}} / :::callout
 *                               directives rendered by frontend ReportTemplate)
 *   <out-dir>/archive.json      index of all published daily reports, newest first
 *
 * The Kaggle audit report is short-form; this script expands it into a complete,
 * step-by-step technical report and interpolates real-time values from the snapshot.
 * Raw CSV inputs are never copied into the public tree.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_SNAPSHOT = resolve(ROOT, 'frontend/public/data/daily-advisories-v1.json');
const DEFAULT_OUT = resolve(ROOT, 'frontend/public/reports');
const ARCHIVE_CAP = 120;

export const TIER_ORDER = ['EMERGENCY', 'WARNING', 'WATCH', 'ADVISORY', 'NORMAL'];

function argValue(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

export function parseSnapshot(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || !data.run || !Array.isArray(data.advisories) || data.advisories.length === 0) {
    throw new Error('Snapshot must carry run metadata and a non-empty advisories array');
  }
  return data;
}

export function summarizeAdvisories(advisories) {
  const tierCounts = {};
  const hazardCounts = {};
  const divisionSeverity = {};
  let severitySum = 0;
  let maxSeverity = 0;
  let maxRow = null;
  for (const row of advisories) {
    const tier = String(row.tier || 'UNKNOWN').toUpperCase();
    tierCounts[tier] = (tierCounts[tier] || 0) + 1;
    const hazard = String(row.hazard || 'Unknown');
    hazardCounts[hazard] = (hazardCounts[hazard] || 0) + 1;
    const division = String(row.division || 'Unknown');
    const score = Number(row.severityScore);
    if (!divisionSeverity[division]) divisionSeverity[division] = { sum: 0, count: 0, max: 0 };
    if (Number.isFinite(score)) {
      divisionSeverity[division].sum += score;
      divisionSeverity[division].count += 1;
      divisionSeverity[division].max = Math.max(divisionSeverity[division].max, score);
      severitySum += score;
      if (score > maxSeverity) { maxSeverity = score; maxRow = row; }
    }
  }
  const bySeverity = [...advisories]
    .sort((a, b) => (Number(b.severityScore) || 0) - (Number(a.severityScore) || 0))
    .slice(0, 15);
  return { tierCounts, hazardCounts, divisionSeverity, meanSeverity: severitySum / advisories.length, maxSeverity, maxRow, bySeverity };
}

function mdTable(headers, rows) {
  const head = `| ${headers.join(' |')} |`;
  const sep = `| ${headers.map(() => '---').join(' |')} |`;
  return [head, sep, ...rows.map((r) => `| ${r.join(' |')} |`)].join('\n');
}

/**
 * Expand the short Kaggle audit report into the full report document.
 * Real-time values come from the snapshot; the audit text is preserved verbatim
 * in the appendix so the published page always contains the dataset's own words.
 */
export function renderReport({ snapshot, auditMarkdown, generatedBy }) {
  const { run, coverage, advisories } = snapshot;
  const stats = summarizeAdvisories(advisories);
  const reportDate = String(run.generatedAt || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new Error('Run generatedAt must carry a YYYY-MM-DD date');

  const tierRows = TIER_ORDER
    .filter((t) => stats.tierCounts[t])
    .map((t) => [t, String(stats.tierCounts[t]), `${((stats.tierCounts[t] / advisories.length) * 100).toFixed(1)}%`]);
  const hazardRows = Object.entries(stats.hazardCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([h, c]) => [h, String(c)]);
  const divisionRows = Object.entries(stats.divisionSeverity)
    .map(([d, v]) => [d, String(v.count), (v.sum / Math.max(v.count, 1)).toFixed(2), v.max.toFixed(2)])
    .sort((a, b) => Number(b[2]) - Number(a[2]));
  const topRows = stats.bySeverity.map((r) => [
    String(r.district), String(r.division), String(r.hazard),
    String(r.targetDate), String(r.tier), Number(r.severityScore).toFixed(2),
  ]);

  const auditSection = auditMarkdown && auditMarkdown.trim()
    ? `\n## Appendix — dataset audit report (verbatim)\n\nThe following is the short-form \`HazardNet_Audit_Report.md\` shipped inside the Kaggle dataset, reproduced verbatim:\n\n${auditMarkdown.trim()}\n`
    : '\n## Appendix — dataset audit report\n\nNo `HazardNet_Audit_Report.md` accompanied this dataset version; the report above is derived entirely from the validated public snapshot.\n';

  return `# HazardNet Daily Report: ${reportDate}

:::info Published automatically by the \`public_daily_advisories.yml\` pipeline from Kaggle dataset version ${run.sourceDatasetVersion ?? 'unknown'} (run \`${run.id}\`, model \`${run.modelVersion}\`). Every figure below is computed from the published snapshot at build time, not typed by hand.
:::

## 1. Executive summary

- **Coverage:** ${coverage.districts} districts × ${coverage.forecastDays} forecast days = ${coverage.publishedRows} published advisory rows.
- **Generated at:** ${run.generatedAt} (data cutoff ${run.dataCutoff}; snapshot expires ${run.expiresAt}).
- **Mean severity score:** ${stats.meanSeverity.toFixed(2)}; highest single advisory: ${stats.maxRow ? `**${stats.maxRow.district}** (${stats.maxRow.hazard}, ${stats.maxRow.targetDate}, ${stats.maxRow.tier}, ${Number(stats.maxRow.severityScore).toFixed(2)})` : 'n/a'}.
- **Input integrity:** SHA-256 \`${run.inputSha256}\`.

{{chart:tier-distribution}}

## 2. Advisory tier distribution

${mdTable(['Tier', 'Rows', 'Share'], tierRows)}

## 3. Hazard mix

{{chart:hazard-distribution}}

${mdTable(['Hazard', 'Rows'], hazardRows)}

## 4. Severity by division

{{chart:severity-by-division}}

${mdTable(['Division', 'Rows', 'Mean severity', 'Peak severity'], divisionRows)}

## 5. Highest-severity advisories

{{table:top-advisories}}

${mdTable(['District', 'Division', 'Hazard', 'Target date', 'Tier', 'Severity'], topRows)}

## 6. Method, step by step

1. **Source:** the pipeline polls the Kaggle dataset \`ashifahmedshuvo/hazardnet-weekly-forecasts\` and accepts only a version whose status is *Ready*.
2. **Pin:** the CSV \`hazardnet_advisories_latest.csv\` is downloaded pinned to that dataset version; its SHA-256 is recorded as \`${run.inputSha256}\`.
3. **Validate:** a strict CSV reader rejects duplicate headers and ragged rows; run metadata is verified against the CSV or the companion \`.run.json\`, and any run that would roll back model time or data cutoff is refused.
4. **Project:** only whitelisted fields (district, division, hazard, tier, severity, target date, action ids, bounded weather values) enter the public snapshot; raw technical files stay outside the repository.
5. **Publish:** the snapshot is committed to \`frontend/public/data/daily-advisories-v1.json\` and this report is regenerated with the values you see above.

## 7. How to read these numbers

Severity scores are model outputs for the stated target date, not observed impacts. A WATCH row is a heads-up, not an emergency; always follow official Bangladesh Meteorological Department and disaster-management bulletins.

:::warning This report refreshes automatically when a new Ready Kaggle dataset version publishes. If the pipeline fails verification, the previous report stays live — check the date in the heading before acting on it.
:::
${auditSection}
---
*Generated by ${generatedBy}*
`;
}

export function buildArchiveEntry({ snapshot, file }) {
  const { run, coverage, advisories } = snapshot;
  const stats = summarizeAdvisories(advisories);
  const reportDate = String(run.generatedAt || '').slice(0, 10);
  const top = stats.bySeverity[0];
  return {
    date: reportDate,
    file,
    runId: run.id,
    generatedAt: run.generatedAt,
    datasetVersion: run.sourceDatasetVersion ?? null,
    modelVersion: run.modelVersion,
    rows: advisories.length,
    districts: coverage.districts,
    forecastDays: coverage.forecastDays,
    tiers: stats.tierCounts,
    topAdvisory: top
      ? { district: top.district, hazard: top.hazard, tier: top.tier, severityScore: Number(top.severityScore) }
      : null,
  };
}

export function updateArchive(outDir, entry) {
  const archivePath = join(outDir, 'archive.json');
  let entries = [];
  if (existsSync(archivePath)) {
    try { entries = JSON.parse(readFileSync(archivePath, 'utf8')).entries || []; }
    catch { entries = []; }
  }
  entries = [entry, ...entries.filter((e) => e.date !== entry.date)]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, ARCHIVE_CAP);
  writeFileSync(archivePath, `${JSON.stringify({ schema: 1, entries }, null, 2)}\n`);
  return entries;
}

export function runBuild({ snapshotPath, auditPath, outDir }) {
  const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
  const auditMarkdown = auditPath && existsSync(auditPath) ? readFileSync(auditPath, 'utf8') : '';
  const reportDate = String(snapshot.run.generatedAt).slice(0, 10);
  mkdirSync(outDir, { recursive: true });
  const file = `${reportDate}.md`;
  const markdown = renderReport({
    snapshot,
    auditMarkdown,
    generatedBy: 'scripts/build_daily_report.mjs (public_daily_advisories.yml)',
  });
  writeFileSync(join(outDir, file), markdown);
  const entries = updateArchive(outDir, buildArchiveEntry({ snapshot, file }));
  return { file, archiveEntries: entries.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  try {
    const result = runBuild({
      snapshotPath: resolve(argValue(argv, '--snapshot', DEFAULT_SNAPSHOT)),
      auditPath: argv.includes('--audit') ? resolve(argValue(argv, '--audit', '')) : null,
      outDir: resolve(argValue(argv, '--out-dir', DEFAULT_OUT)),
    });
    console.log(`[daily-report] wrote reports/${result.file} (${result.archiveEntries} archive entries)`);
  } catch (error) {
    console.error(`[daily-report] refused: ${error.message}`);
    process.exitCode = 1;
  }
}
