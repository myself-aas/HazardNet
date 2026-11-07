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

function quantile(sorted, probability) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function summarizeScores(values) {
  const scores = values.filter((value) => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
  if (!scores.length) {
    return {
      count: 0, missingCount: values.length, mean: null, median: null, populationStdDev: null,
      min: null, q1: null, q3: null, iqr: null, max: null, range: null,
      coefficientOfVariation: null, skewness: null, mode: null, modeCount: 0,
      distinctValues: 0, tukeyOutlierCount: null,
    };
  }

  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const q1 = quantile(scores, 0.25);
  const q3 = quantile(scores, 0.75);
  const iqr = q3 - q1;
  const variance = scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / scores.length;
  const rawStdDev = Math.sqrt(variance);
  const populationStdDev = rawStdDev < 1e-12 ? 0 : rawStdDev;
  const modes = new Map();
  for (const score of scores) modes.set(score, (modes.get(score) || 0) + 1);
  const [mode, modeCount] = [...modes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  const thirdMoment = populationStdDev > 0
    ? scores.reduce((sum, score) => sum + (score - mean) ** 3, 0) / scores.length
    : null;

  return {
    count: scores.length,
    missingCount: values.length - scores.length,
    mean,
    median: quantile(scores, 0.5),
    populationStdDev,
    min: scores[0],
    q1,
    q3,
    iqr,
    max: scores.at(-1),
    range: scores.at(-1) - scores[0],
    coefficientOfVariation: mean !== 0 ? (populationStdDev / Math.abs(mean)) * 100 : null,
    skewness: thirdMoment === null ? null : thirdMoment / populationStdDev ** 3,
    mode,
    modeCount,
    distinctValues: modes.size,
    tukeyOutlierCount: scores.filter((score) => score < q1 - 1.5 * iqr || score > q3 + 1.5 * iqr).length,
  };
}

export function summarizeForecastTrend(dateSummaries) {
  const points = dateSummaries
    .filter((day) => typeof day.mean === 'number' && Number.isFinite(day.mean))
    .map((day) => ({ x: Date.parse(`${day.targetDate}T00:00:00Z`), y: day.mean }))
    .filter((point) => Number.isFinite(point.x));
  if (points.length < 2) return { slopePerDay: null, correlation: null, points: points.length };

  const origin = points[0].x;
  const xs = points.map((point) => (point.x - origin) / 86_400_000);
  const ys = points.map((point) => point.y);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const covariance = xs.reduce((sum, x, index) => sum + (x - meanX) * (ys[index] - meanY), 0);
  const xSquares = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  const ySquares = ys.reduce((sum, y) => sum + (y - meanY) ** 2, 0);
  return {
    slopePerDay: xSquares > 0 ? covariance / xSquares : null,
    correlation: xSquares > 0 && ySquares > 1e-24 ? covariance / Math.sqrt(xSquares * ySquares) : null,
    points: points.length,
  };
}

export function summarizeAdvisories(advisories, coverage = {}) {
  const tierCounts = {};
  const hazardCounts = {};
  const divisionGroups = new Map();
  const dateGroups = new Map();
  const hazardByDivision = new Map();
  const districtDatePairs = new Set();
  const duplicateCounts = new Map();
  const missingByField = {
    District: 0, Division: 0, Hazard: 0, 'Target date': 0, 'Advisory tier': 0, 'Severity score': 0,
  };
  let maxSeverity = null;
  let maxRow = null;
  let scoresOutsideZeroToOne = 0;

  for (const row of advisories) {
    const district = String(row.district || '').trim();
    const division = String(row.division || '').trim() || 'Not recorded';
    const hazard = String(row.hazard || '').trim() || 'Not recorded';
    const targetDate = String(row.targetDate || '').trim();
    const tier = String(row.tier || '').trim().toUpperCase() || 'NOT RECORDED';
    const score = typeof row.severityScore === 'number' && Number.isFinite(row.severityScore)
      ? row.severityScore
      : null;

    tierCounts[tier] = (tierCounts[tier] || 0) + 1;
    hazardCounts[hazard] = (hazardCounts[hazard] || 0) + 1;
    if (!district) missingByField.District += 1;
    if (!String(row.division || '').trim()) missingByField.Division += 1;
    if (!String(row.hazard || '').trim()) missingByField.Hazard += 1;
    if (!targetDate) missingByField['Target date'] += 1;
    if (!String(row.tier || '').trim()) missingByField['Advisory tier'] += 1;
    if (score === null) missingByField['Severity score'] += 1;

    if (!divisionGroups.has(division)) divisionGroups.set(division, { rows: 0, districts: new Set(), scores: [] });
    const divisionGroup = divisionGroups.get(division);
    divisionGroup.rows += 1;
    if (district) divisionGroup.districts.add(district);
    if (score !== null) divisionGroup.scores.push(score);

    if (targetDate) {
      if (!dateGroups.has(targetDate)) dateGroups.set(targetDate, { rows: 0, scores: [] });
      const dateGroup = dateGroups.get(targetDate);
      dateGroup.rows += 1;
      if (score !== null) dateGroup.scores.push(score);
      if (district) districtDatePairs.add(`${district.toLowerCase()}\u0000${targetDate}`);
    }

    if (district && targetDate) {
      const duplicateKey = `${district.toLowerCase()}\u0000${hazard.toLowerCase()}\u0000${targetDate}`;
      duplicateCounts.set(duplicateKey, (duplicateCounts.get(duplicateKey) || 0) + 1);
    }

    if (!hazardByDivision.has(division)) hazardByDivision.set(division, new Map());
    const divisionHazards = hazardByDivision.get(division);
    divisionHazards.set(hazard, (divisionHazards.get(hazard) || 0) + 1);

    if (score !== null) {
      if (score < 0 || score > 1) scoresOutsideZeroToOne += 1;
      if (maxSeverity === null || score > maxSeverity) { maxSeverity = score; maxRow = row; }
    }
  }

  const severity = summarizeScores(advisories.map((row) => row.severityScore));
  const divisionSeverity = Object.fromEntries([...divisionGroups.entries()].map(([name, group]) => {
    const summary = summarizeScores(group.scores);
    return [name, {
      rows: group.rows,
      districts: group.districts.size,
      count: summary.count,
      sum: summary.mean === null ? 0 : summary.mean * summary.count,
      mean: summary.mean,
      median: summary.median,
      min: summary.min,
      max: summary.max,
      populationStdDev: summary.populationStdDev,
    }];
  }));
  const severityByDate = [...dateGroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([targetDate, group]) => ({ targetDate, rows: group.rows, ...summarizeScores(group.scores) }));
  const forecastTrend = summarizeForecastTrend(severityByDate);
  const hazardsByDivision = Object.entries(hazardCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const divisionHazardRows = [...hazardByDivision.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([division, counts]) => [division, ...hazardsByDivision.map(([hazard]) => counts.get(hazard) || 0), [...counts.values()].reduce((sum, count) => sum + count, 0)]);
  const districtDatePairsExpected = Number.isFinite(coverage.districts) && Number.isFinite(coverage.forecastDays)
    && coverage.districts > 0 && coverage.forecastDays > 0
    ? coverage.districts * coverage.forecastDays
    : null;
  const duplicateDistrictHazardDateRows = [...duplicateCounts.values()]
    .reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const declaredRows = Number.isFinite(coverage.publishedRows) ? coverage.publishedRows : null;
  const districtsObserved = new Set(advisories.map((row) => String(row.district || '').trim()).filter(Boolean)).size;
  const districtsDeclared = Number.isFinite(coverage.districts) ? coverage.districts : null;
  const targetDatesObserved = new Set(advisories.map((row) => String(row.targetDate || '').trim()).filter(Boolean)).size;
  const forecastDaysDeclared = Number.isFinite(coverage.forecastDays) ? coverage.forecastDays : null;
  const dataQuality = {
    rowCount: advisories.length,
    declaredRows,
    rowsMatch: declaredRows === null ? null : advisories.length === declaredRows,
    districtsObserved,
    districtsDeclared,
    districtsMatch: districtsDeclared === null ? null : districtsObserved === districtsDeclared,
    targetDatesObserved,
    forecastDaysDeclared,
    forecastDaysMatch: forecastDaysDeclared === null ? null : targetDatesObserved === forecastDaysDeclared,
    districtDatePairsObserved: districtDatePairs.size,
    districtDatePairsExpected,
    districtDatePairCoveragePercent: districtDatePairsExpected
      ? (districtDatePairs.size / districtDatePairsExpected) * 100
      : null,
    duplicateDistrictHazardDateRows,
    missingByField,
    scoresOutsideZeroToOne,
  };
  const bySeverity = [...advisories]
    .sort((a, b) => {
      const left = typeof a.severityScore === 'number' && Number.isFinite(a.severityScore) ? a.severityScore : -Infinity;
      const right = typeof b.severityScore === 'number' && Number.isFinite(b.severityScore) ? b.severityScore : -Infinity;
      return right - left
        || String(a.targetDate || '').localeCompare(String(b.targetDate || ''))
        || String(a.district || '').localeCompare(String(b.district || ''))
        || String(a.hazard || '').localeCompare(String(b.hazard || ''));
    })
    .slice(0, 15);

  return {
    tierCounts,
    hazardCounts,
    divisionSeverity,
    meanSeverity: severity.mean,
    maxSeverity,
    maxRow,
    bySeverity,
    severity,
    severityByDate,
    forecastTrend,
    hazardsByDivision: hazardsByDivision.map(([name]) => name),
    divisionHazardRows,
    dataQuality,
  };
}

function mdTable(headers, rows) {
  const escapeCell = (value) => String(value ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
  const head = `| ${headers.map(escapeCell).join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  return [head, sep, ...rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`)].join('\n');
}

/**
 * Expand the short Kaggle audit report into the full report document.
 * Real-time values come from the snapshot; the audit text is preserved verbatim
 * in the appendix so the published page always contains the dataset's own words.
 */
function isValidIsoDate(value) {
  if (typeof value !== 'string' || value.length !== 10 || value[4] !== '-' || value[7] !== '-') return false;
  const digits = `${value.slice(0, 4)}${value.slice(5, 7)}${value.slice(8, 10)}`;
  if ([...digits].some((digit) => digit < '0' || digit > '9')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function renderReport({ snapshot, auditMarkdown, generatedBy }) {
  const { run, coverage = {}, advisories = [] } = snapshot;
  const stats = summarizeAdvisories(advisories, coverage);
  const reportDate = String(run.generatedAt || '').slice(0, 10);
  if (!isValidIsoDate(reportDate)) throw new Error('Run generatedAt must carry a valid YYYY-MM-DD calendar date');

  const format = (value, digits = 3) => typeof value === 'number' && Number.isFinite(value)
    ? (Math.abs(value) < 1e-12 ? 0 : value).toFixed(digits)
    : 'Not available';
  const formatCount = (value) => Number.isFinite(value) ? String(value) : 'Not recorded';
  const share = (count) => advisories.length > 0 ? `${((count / advisories.length) * 100).toFixed(1)}%` : 'Not available';
  const check = (actual, declared) => declared === null ? 'Not recorded' : actual === declared ? 'Matches' : 'Mismatch';
  const tierNames = [
    ...TIER_ORDER.filter((tier) => stats.tierCounts[tier]),
    ...Object.keys(stats.tierCounts).filter((tier) => !TIER_ORDER.includes(tier)).sort(),
  ];
  const tierRows = tierNames.map((tier) => [tier, String(stats.tierCounts[tier]), share(stats.tierCounts[tier])]);
  const hazardRows = Object.entries(stats.hazardCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([hazard, count]) => [hazard, String(count), share(count)]);
  const divisionRows = Object.entries(stats.divisionSeverity)
    .sort((a, b) => (b[1].mean ?? -Infinity) - (a[1].mean ?? -Infinity) || a[0].localeCompare(b[0]))
    .map(([division, values]) => [
      division,
      String(values.rows),
      String(values.districts),
      String(values.count),
      format(values.mean),
      format(values.median),
      format(values.populationStdDev),
      format(values.min),
      format(values.max),
    ]);
  const dateRows = stats.severityByDate.map((day) => [
    day.targetDate,
    String(day.rows),
    String(day.count),
    format(day.mean),
    format(day.median),
    format(day.populationStdDev),
    format(day.min),
    format(day.max),
  ]);
  const hazardDivisionRows = stats.divisionHazardRows.map((row) => row.map(String));
  const severity = stats.severity;
  const statisticsRows = [
    ['Published advisory rows', String(advisories.length)],
    ['Valid severity scores', String(severity.count)],
    ['Missing or non-finite severity scores', String(severity.missingCount)],
    ['Mean (μ)', format(severity.mean)],
    ['Median', format(severity.median)],
    ['Population standard deviation (σ)', format(severity.populationStdDev)],
    ['Minimum', format(severity.min)],
    ['First quartile (Q1)', format(severity.q1)],
    ['Third quartile (Q3)', format(severity.q3)],
    ['Interquartile range (Q3 − Q1)', format(severity.iqr)],
    ['Maximum', format(severity.max)],
    ['Range (maximum − minimum)', format(severity.range)],
    ['Coefficient of variation', severity.coefficientOfVariation === null
      ? (severity.mean === 0 ? 'Not defined (mean is zero)' : 'Not available')
      : `${format(severity.coefficientOfVariation, 1)}%`],
    ['Skewness', severity.skewness === null
      ? (severity.count > 0 && severity.populationStdDev === 0 ? 'Not defined (all scores are equal)' : 'Not available')
      : format(severity.skewness)],
    ['Mode (score; count)', severity.mode === null ? 'Not available' : `${format(severity.mode)}; ${severity.modeCount}`],
    ['Distinct score values', String(severity.distinctValues)],
    ['Tukey outliers (1.5 × IQR)', formatCount(severity.tukeyOutlierCount)],
    ['Forecast-horizon slope of daily mean', stats.forecastTrend.slopePerDay === null
      ? 'Not available' : `${format(stats.forecastTrend.slopePerDay, 4)} score/day`],
    ['Pearson r: target date vs daily mean', stats.forecastTrend.correlation === null
      ? 'Not defined (insufficient or no variation)' : format(stats.forecastTrend.correlation)],
    ['Target dates included in trend summary', String(stats.forecastTrend.points)],
  ];
  const qualityRows = [
    ['Snapshot rows / declared rows', `${advisories.length} / ${formatCount(stats.dataQuality.declaredRows)}`],
    ['Published row-count check', check(advisories.length, stats.dataQuality.declaredRows)],
    ['Observed / declared districts', `${stats.dataQuality.districtsObserved} / ${formatCount(stats.dataQuality.districtsDeclared)}`],
    ['District-count check', check(stats.dataQuality.districtsObserved, stats.dataQuality.districtsDeclared)],
    ['Observed / declared target dates', `${stats.dataQuality.targetDatesObserved} / ${formatCount(stats.dataQuality.forecastDaysDeclared)}`],
    ['Forecast-day count check', check(stats.dataQuality.targetDatesObserved, stats.dataQuality.forecastDaysDeclared)],
    ['District–target-date pairs observed / expected', `${stats.dataQuality.districtDatePairsObserved} / ${formatCount(stats.dataQuality.districtDatePairsExpected)}`],
    ['District–target-date pair coverage', stats.dataQuality.districtDatePairCoveragePercent === null
      ? 'Not available' : `${stats.dataQuality.districtDatePairCoveragePercent.toFixed(1)}%`],
    ['Duplicate district–hazard–date rows', String(stats.dataQuality.duplicateDistrictHazardDateRows)],
    ['Severity scores outside [0, 1]', String(stats.dataQuality.scoresOutsideZeroToOne)],
    ...Object.entries(stats.dataQuality.missingByField).map(([field, count]) => [`Rows with missing ${field.toLowerCase()}`, String(count)]),
  ];
  const topRows = stats.bySeverity.map((row) => [
    String(row.district || 'Not recorded'),
    String(row.division || 'Not recorded'),
    String(row.hazard || 'Not recorded'),
    String(row.targetDate || 'Not recorded'),
    String(row.tier || 'Not recorded'),
    format(row.severityScore, 2),
  ]);
  const hazardDivisionHeaders = ['Division', ...stats.hazardsByDivision, 'Total rows'];
  const inputSha256 = String(run.inputSha256 || '').trim() || 'Not recorded';
  const sourceVersion = run.sourceDatasetVersion ?? 'Not recorded';
  const modelVersion = String(run.modelVersion || '').trim() || 'Not recorded';
  const runId = String(run.id || '').trim() || 'Not recorded';
  const meanText = severity.mean === null ? 'Not available' : format(severity.mean, 2);
  const highest = stats.maxSeverity === null ? null : stats.bySeverity[0];
  const highestText = highest
    ? `**${highest.district}** (${highest.hazard}, ${highest.targetDate}, ${highest.tier}, ${format(highest.severityScore, 2)})`
    : 'Not available';

  const auditSection = auditMarkdown && auditMarkdown.trim()
    ? `\n## Appendix — dataset audit report (verbatim)\n\nThe following is the short-form \`HazardNet_Audit_Report.md\` shipped inside the Kaggle dataset, reproduced verbatim:\n\n${auditMarkdown.trim()}\n`
    : '\n## Appendix — dataset audit report\n\nNo `HazardNet_Audit_Report.md` accompanied this dataset version; the report above is derived entirely from the validated public snapshot.\n';

  return `# HazardNet Daily Report: ${reportDate}

:::info Published automatically by the \`public_daily_advisories.yml\` pipeline from Kaggle dataset version ${sourceVersion} (run \`${runId}\`, model \`${modelVersion}\`). Figures and tables are computed from this published snapshot, not typed by hand.
:::

## 1. Executive summary

- **Coverage:** ${formatCount(coverage.districts)} districts × ${formatCount(coverage.forecastDays)} forecast days; ${advisories.length} published advisory rows.
- **Generated at:** ${run.generatedAt || 'Not recorded'} (data cutoff ${run.dataCutoff || 'Not recorded'}; snapshot expires ${run.expiresAt || 'Not recorded'}).
- **Mean severity score:** ${meanText}; a highest-scoring row (ties ordered by target date, district, then hazard): ${highestText}.
- **Input integrity:** SHA-256 \`${inputSha256}\`.

## 2. Coverage and data checks

Counts below compare the published rows with the snapshot's declared coverage. District–target-date pair coverage describes row coverage only; it does not imply that every hazard was assessed for every pair.

${mdTable(['Check', 'Observed value'], qualityRows)}

## 3. Advisory tier distribution

A tier count describes the published advisory labels in this run. It is not an event probability or an official warning.

{{chart:tier-distribution}}

${mdTable(['Tier', 'Rows', 'Share of rows'], tierRows)}

## 4. Hazard mix

Counts are rows grouped by the hazard label in the published snapshot.

{{chart:hazard-distribution}}

${mdTable(['Hazard', 'Rows', 'Share of rows'], hazardRows)}

## 5. Severity by division

Division summaries are descriptive averages of the rows present for each division; row counts differ and are shown alongside each score.

{{chart:severity-by-division}}

${mdTable(['Division', 'Rows', 'Districts', 'Valid scores', 'Mean', 'Median', 'Population SD', 'Minimum', 'Maximum'], divisionRows)}

## 6. Mathematical and statistical analysis

The statistics below describe this published snapshot only. Scores are model outputs, not observed impacts, probabilities or calibrated confidence values.

### Severity-score distribution

The histogram uses equal-width display bins across [0, 1], plus explicit below-zero and above-one bins. These are chart intervals, not advisory thresholds.

{{chart:severity-distribution}}

${mdTable(['Descriptive statistic', 'Value'], statisticsRows)}

### Mean severity by target date

Each point summarizes the valid severity scores for one target date. The line is descriptive of the forecast horizon, not a verified time-series of observed events.

{{chart:severity-by-date}}

${mdTable(['Target date', 'Rows', 'Valid scores', 'Mean', 'Median', 'Population SD', 'Minimum', 'Maximum'], dateRows)}

### Hazard rows by division

This cross-tabulation counts published rows, not hazard occurrence rates or district-level probabilities.

{{chart:hazard-by-division}}

${mdTable(hazardDivisionHeaders, hazardDivisionRows)}

### Highest-severity published rows

Rows are ranked by severity score; ties are ordered by target date, district and hazard. A row is one published district–hazard–target-date advisory, not an independent event.

{{table:top-advisories}}

${mdTable(['District', 'Division', 'Hazard', 'Target date', 'Tier', 'Severity score'], topRows)}

## 7. Method and calculation definitions

1. **Source:** the pipeline polls the Kaggle dataset \`ashifahmedshuvo/hazardnet-weekly-forecasts\` and accepts only a version whose status is *Ready*.
2. **Pin:** the CSV \`hazardnet_advisories_latest.csv\` is downloaded pinned to that dataset version; its SHA-256 is recorded as \`${inputSha256}\`.
3. **Validate:** a strict CSV reader rejects duplicate headers and ragged rows; run metadata is checked against the CSV or companion \`.run.json\`, and a run that would roll back model time or data cutoff is refused.
4. **Project:** only whitelisted public fields enter the snapshot; raw technical files stay outside the repository.
5. **Publish:** the validated snapshot and this report are committed together by the publication workflow.

Calculation notes:

- **Mean:** \`μ = Σxᵢ / n\`, using finite severity scores only; \`n\` is shown separately from published rows.
- **Quartiles and median:** linear interpolation over sorted scores at the 25th, 50th and 75th percentiles.
- **Population standard deviation:** \`σ = √(Σ(xᵢ − μ)² / n)\`; the report describes the complete published snapshot, not a sample estimate.
- **Interquartile range:** \`IQR = Q3 − Q1\`; the Tukey outlier count uses fences \`Q1 − 1.5 × IQR\` and \`Q3 + 1.5 × IQR\`. These are descriptive diagnostics, not hazard or advisory thresholds.
- **Coefficient of variation:** \`100 × σ / |μ|\`; it is undefined when the mean is zero.
- **Skewness:** population third central moment divided by σ³; it is undefined when score variance is zero.
- **Forecast-horizon slope:** ordinary least-squares slope of each target date's mean score against elapsed days, b = Σ((tᵢ − t̄)(ȳᵢ − ȳ̄)) / Σ((tᵢ − t̄)²), in score/day.
- **Pearson r:** correlation between elapsed target-date days and daily mean scores; undefined when either series has zero variation. Neither measure tests forecast skill or statistical significance.
- **Histogram:** fixed 0.1-wide score display intervals, with separate bins for values outside [0, 1].

No p-values, significance claims or confidence intervals are reported: rows share districts and forecast dates, and this snapshot is not an independent observed-outcome validation sample.

## 8. How to read these numbers

Severity scores are model outputs for the stated target date, not observed impacts. A WATCH row is a heads-up, not an emergency. HazardNet is not an official warning service; follow official Bangladesh Meteorological Department (BMD) and Flood Forecasting and Warning Centre (FFWC) bulletins. For emergencies, call 999.

:::warning This report refreshes automatically when a new Ready Kaggle dataset version publishes. If the pipeline fails verification, the previous report stays live — check the date and run metadata above before using it.
:::

## 9. Frequently asked questions

### Does a severity score mean an event will happen?

No. It is a model output for a target date, not an observed impact or a calibrated probability. Read it with the run date, coverage checks and stated limitations.

### Does WATCH mean an official warning?

No. HazardNet is not an official warning service. Official warnings come from BMD and FFWC; call 999 for emergencies.

### Why are descriptive statistics shown without p-values or confidence intervals?

The rows are forecasts from one published run and share districts and target dates. They are not an independent sample of observed outcomes, so inferential statistics would not be justified by this report alone.

### Why do the same districts appear more than once?

A row represents one district, hazard and target date. A district can therefore appear on multiple dates or for multiple hazard labels.

### Which dataset and run produced this report?

Use the report date, run ID, dataset version, generation time and input SHA-256 shown above. The archive lists the other published report dates.

### What should I do if this report is old or incomplete?

Check its date and snapshot expiry, then use the archive for earlier reports. For current official warnings, consult BMD and FFWC; in an emergency, call 999.
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
      ? { district: top.district, hazard: top.hazard, targetDate: top.targetDate, tier: top.tier, severityScore: Number(top.severityScore) }
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
