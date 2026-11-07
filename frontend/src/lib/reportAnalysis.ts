import type { DailyAdvisory, DailySnapshot } from './reports';

export interface CategoryCount {
  name: string;
  count: number;
  share: number;
}

export interface SeveritySummary {
  rowCount: number;
  validCount: number;
  missingCount: number;
  mean: number | null;
  median: number | null;
  populationStdDev: number | null;
  min: number | null;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  max: number | null;
  range: number | null;
  coefficientOfVariation: number | null;
  skewness: number | null;
  mode: number | null;
  modeCount: number;
  distinctValues: number;
  tukeyOutlierCount: number | null;
}

export interface DivisionSummary {
  name: string;
  rows: number;
  validScores: number;
  districts: number;
  mean: number | null;
  median: number | null;
  populationStdDev: number | null;
  min: number | null;
  max: number | null;
}

export interface DateSummary {
  targetDate: string;
  rows: number;
  validScores: number;
  mean: number | null;
  median: number | null;
  populationStdDev: number | null;
  min: number | null;
  max: number | null;
}

export interface CoverageSummary {
  publishedRows: number;
  declaredRows: number | null;
  rowsMatch: boolean | null;
  districtsObserved: number;
  districtsDeclared: number | null;
  districtsMatch: boolean | null;
  targetDatesObserved: number;
  forecastDaysDeclared: number | null;
  forecastDaysMatch: boolean | null;
  districtDatePairsObserved: number;
  districtDatePairsExpected: number | null;
  districtDatePairCoveragePercent: number | null;
  duplicateDistrictHazardDateRows: number;
  missingByField: Array<{ field: string; count: number }>;
  scoresOutsideZeroToOne: number;
}

export interface ForecastTrend {
  slopePerDay: number | null;
  correlation: number | null;
  points: number;
}

export interface ReportAnalysis {
  rowCount: number;
  severity: SeveritySummary;
  tiers: CategoryCount[];
  hazards: CategoryCount[];
  divisions: DivisionSummary[];
  dates: DateSummary[];
  hazardsByDivision: string[];
  divisionHazardRows: Array<Record<string, string | number>>;
  severityHistogram: CategoryCount[];
  trend: ForecastTrend;
  coverage: CoverageSummary;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const cleanText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const scoreOf = (row: DailyAdvisory): number | null =>
  isFiniteNumber(row.severityScore) ? row.severityScore : null;

function quantile(sorted: number[], probability: number): number | null {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const fraction = position - lowerIndex;
  return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * fraction;
}

function median(sorted: number[]): number | null {
  return quantile(sorted, 0.5);
}

function summarizeSeverity(rows: DailyAdvisory[]): SeveritySummary {
  const scores = rows.map(scoreOf).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const validCount = scores.length;
  const mean = validCount > 0 ? scores.reduce((sum, value) => sum + value, 0) / validCount : null;
  const q1 = quantile(scores, 0.25);
  const q3 = quantile(scores, 0.75);
  const iqr = q1 !== null && q3 !== null ? q3 - q1 : null;
  let populationStdDev: number | null = null;
  let skewness: number | null = null;
  let coefficientOfVariation: number | null = null;

  if (mean !== null) {
    const secondMoment = scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / validCount;
    const rawStdDev = Math.sqrt(secondMoment);
    populationStdDev = rawStdDev < 1e-12 ? 0 : rawStdDev;
    if (populationStdDev > 0) {
      const thirdMoment = scores.reduce((sum, value) => sum + (value - mean) ** 3, 0) / validCount;
      skewness = thirdMoment / populationStdDev ** 3;
    }
    if (mean !== 0) coefficientOfVariation = (populationStdDev / Math.abs(mean)) * 100;
  }

  const modes = new Map<number, number>();
  for (const value of scores) modes.set(value, (modes.get(value) ?? 0) + 1);
  const modeEntry = [...modes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  const min = scores[0] ?? null;
  const max = scores.at(-1) ?? null;
  const tukeyOutlierCount = q1 !== null && q3 !== null && iqr !== null
    ? scores.filter((value) => value < q1 - 1.5 * iqr || value > q3 + 1.5 * iqr).length
    : null;

  return {
    rowCount: rows.length,
    validCount,
    missingCount: rows.length - validCount,
    mean,
    median: median(scores),
    populationStdDev,
    min,
    q1,
    q3,
    iqr,
    max,
    range: min !== null && max !== null ? max - min : null,
    coefficientOfVariation,
    skewness,
    mode: modeEntry?.[0] ?? null,
    modeCount: modeEntry?.[1] ?? 0,
    distinctValues: modes.size,
    tukeyOutlierCount,
  };
}

function countCategories(rows: DailyAdvisory[], getValue: (row: DailyAdvisory) => string | null): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = getValue(row) ?? 'Not recorded';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, share: rows.length > 0 ? count / rows.length : 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function buildDivisions(rows: DailyAdvisory[]): DivisionSummary[] {
  const groups = new Map<string, DailyAdvisory[]>();
  for (const row of rows) {
    const name = cleanText(row.division) ?? 'Not recorded';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(row);
  }
  return [...groups.entries()]
    .map(([name, group]) => {
      const summary = summarizeSeverity(group);
      return {
        name,
        rows: group.length,
        validScores: summary.validCount,
        districts: new Set(group.map((row) => cleanText(row.district)).filter((value): value is string => value !== null)).size,
        mean: summary.mean,
        median: summary.median,
        populationStdDev: summary.populationStdDev,
        min: summary.min,
        max: summary.max,
      };
    })
    .sort((a, b) => (b.mean ?? -Infinity) - (a.mean ?? -Infinity) || a.name.localeCompare(b.name));
}

function buildDateSummaries(rows: DailyAdvisory[]): DateSummary[] {
  const groups = new Map<string, DailyAdvisory[]>();
  for (const row of rows) {
    const targetDate = cleanText(row.targetDate);
    if (!targetDate) continue;
    if (!groups.has(targetDate)) groups.set(targetDate, []);
    groups.get(targetDate)!.push(row);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([targetDate, group]) => {
      const summary = summarizeSeverity(group);
      return {
        targetDate,
        rows: group.length,
        validScores: summary.validCount,
        mean: summary.mean,
        median: summary.median,
        populationStdDev: summary.populationStdDev,
        min: summary.min,
        max: summary.max,
      };
    });
}

function summarizeTrend(dates: DateSummary[]): ForecastTrend {
  const points = dates
    .filter((point) => point.mean !== null)
    .map((point) => ({ x: Date.parse(`${point.targetDate}T00:00:00Z`), y: point.mean as number }))
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
  const slopePerDay = xSquares > 0 ? covariance / xSquares : null;
  const correlation = xSquares > 0 && ySquares > 1e-24
    ? covariance / Math.sqrt(xSquares * ySquares)
    : null;
  return { slopePerDay, correlation, points: points.length };
}

function buildHistogram(rows: DailyAdvisory[]): CategoryCount[] {
  const labels = [
    'Below 0',
    ...Array.from({ length: 10 }, (_, index) => {
      const lower = (index / 10).toFixed(1);
      const upper = ((index + 1) / 10).toFixed(1);
      return `${lower}–${upper}`;
    }),
    'Above 1',
  ];
  const counts = labels.map(() => 0);
  for (const row of rows) {
    const score = scoreOf(row);
    if (score === null) continue;
    const index = score < 0 ? 0 : score > 1 ? labels.length - 1 : Math.min(9, Math.floor(score * 10)) + 1;
    counts[index] += 1;
  }
  const validCount = counts.reduce((sum, count) => sum + count, 0);
  return labels.map((name, index) => ({
    name,
    count: counts[index],
    share: validCount > 0 ? counts[index] / validCount : 0,
  }));
}

function buildHazardsByDivision(rows: DailyAdvisory[], hazards: CategoryCount[]) {
  const divisions = [...new Set(rows.map((row) => cleanText(row.division) ?? 'Not recorded'))]
    .sort((a, b) => a.localeCompare(b));
  const byDivisionHazard = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const division = cleanText(row.division) ?? 'Not recorded';
    const hazard = cleanText(row.hazard) ?? 'Not recorded';
    if (!byDivisionHazard.has(division)) byDivisionHazard.set(division, new Map());
    const group = byDivisionHazard.get(division)!;
    group.set(hazard, (group.get(hazard) ?? 0) + 1);
  }
  const divisionHazardRows = divisions.map((division) => {
    const row: Record<string, string | number> = { division };
    let total = 0;
    for (const hazard of hazards) {
      const count = byDivisionHazard.get(division)?.get(hazard.name) ?? 0;
      row[hazard.name] = count;
      total += count;
    }
    row.total = total;
    return row;
  });
  return { hazardsByDivision: hazards.map((hazard) => hazard.name), divisionHazardRows };
}

function summarizeCoverage(snapshot: DailySnapshot, rows: DailyAdvisory[]): CoverageSummary {
  const districts = new Set<string>();
  const dates = new Set<string>();
  const districtDatePairs = new Set<string>();
  const duplicateCounts = new Map<string, number>();
  const missingByField = [
    { field: 'District', count: 0 },
    { field: 'Division', count: 0 },
    { field: 'Hazard', count: 0 },
    { field: 'Target date', count: 0 },
    { field: 'Advisory tier', count: 0 },
    { field: 'Severity score', count: 0 },
  ];
  let scoresOutsideZeroToOne = 0;

  for (const row of rows) {
    const district = cleanText(row.district);
    const division = cleanText(row.division);
    const hazard = cleanText(row.hazard);
    const targetDate = cleanText(row.targetDate);
    if (!district) missingByField[0].count += 1;
    if (!division) missingByField[1].count += 1;
    if (!hazard) missingByField[2].count += 1;
    if (!targetDate) missingByField[3].count += 1;
    if (!cleanText(row.tier)) missingByField[4].count += 1;
    if (scoreOf(row) === null) missingByField[5].count += 1;
    if (district) districts.add(district);
    if (targetDate) dates.add(targetDate);
    if (district && targetDate) districtDatePairs.add(`${district.toLocaleLowerCase()}\u0000${targetDate}`);
    if (district && hazard && targetDate) {
      const key = `${district.toLocaleLowerCase()}\u0000${hazard.toLocaleLowerCase()}\u0000${targetDate}`;
      duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
    }
    const score = scoreOf(row);
    if (score !== null && (score < 0 || score > 1)) scoresOutsideZeroToOne += 1;
  }

  const duplicateDistrictHazardDateRows = [...duplicateCounts.values()]
    .reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const districtsDeclared = isFiniteNumber(snapshot.coverage?.districts) ? snapshot.coverage.districts : null;
  const forecastDaysDeclared = isFiniteNumber(snapshot.coverage?.forecastDays) ? snapshot.coverage.forecastDays : null;
  const declaredRows = isFiniteNumber(snapshot.coverage?.publishedRows) ? snapshot.coverage.publishedRows : null;
  const districtDatePairsExpected = districtsDeclared !== null && forecastDaysDeclared !== null
    && districtsDeclared > 0 && forecastDaysDeclared > 0
    ? districtsDeclared * forecastDaysDeclared
    : null;

  return {
    publishedRows: rows.length,
    declaredRows,
    rowsMatch: declaredRows === null ? null : rows.length === declaredRows,
    districtsObserved: districts.size,
    districtsDeclared,
    districtsMatch: districtsDeclared === null ? null : districts.size === districtsDeclared,
    targetDatesObserved: dates.size,
    forecastDaysDeclared,
    forecastDaysMatch: forecastDaysDeclared === null ? null : dates.size === forecastDaysDeclared,
    districtDatePairsObserved: districtDatePairs.size,
    districtDatePairsExpected,
    districtDatePairCoveragePercent: districtDatePairsExpected
      ? (districtDatePairs.size / districtDatePairsExpected) * 100
      : null,
    duplicateDistrictHazardDateRows,
    missingByField,
    scoresOutsideZeroToOne,
  };
}

export function analyzeDailySnapshot(snapshot: DailySnapshot): ReportAnalysis {
  const rows = Array.isArray(snapshot?.advisories) ? snapshot.advisories : [];
  const tiers = countCategories(rows, (row) => cleanText(row.tier)?.toUpperCase() ?? null);
  const hazards = countCategories(rows, (row) => cleanText(row.hazard));
  const dates = buildDateSummaries(rows);
  const { hazardsByDivision, divisionHazardRows } = buildHazardsByDivision(rows, hazards);

  return {
    rowCount: rows.length,
    severity: summarizeSeverity(rows),
    tiers,
    hazards,
    divisions: buildDivisions(rows),
    dates,
    hazardsByDivision,
    divisionHazardRows,
    severityHistogram: buildHistogram(rows),
    trend: summarizeTrend(dates),
    coverage: summarizeCoverage(snapshot, rows),
  };
}
