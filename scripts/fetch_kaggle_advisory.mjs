import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const DEFAULT_MAX_AGE_HOURS = 36;

export function datasetDownloadUrl(
  datasetSlug = 'ashifahmedshuvo/hazardnet-weekly-forecasts',
  fileName = 'hazardnet_advisories_latest.csv'
) {
  return `https://www.kaggle.com/api/v1/datasets/download/${datasetSlug}?file_name=${encodeURIComponent(fileName)}`;
}

export function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

export function inspectCsv(csvText) {
  if (!csvText || typeof csvText !== 'string') {
    return { rows: 0, generatedAt: null, columns: [], sha256: null };
  }
  const lines = csvText.trim().split('\n').filter((l) => l.trim().length > 0);
  if (lines.length <= 1) {
    return { rows: 0, generatedAt: null, columns: lines.length === 1 ? parseCsvLine(lines[0]) : [], sha256: null };
  }

  const columns = parseCsvLine(lines[0]);
  const genAtIndex = columns.indexOf('generated_at');
  const dataLines = lines.slice(1);
  const firstRow = parseCsvLine(dataLines[0]);
  const generatedAt = genAtIndex !== -1 ? firstRow[genAtIndex] : null;
  const sha256 = crypto.createHash('sha256').update(csvText).digest('hex');

  return {
    rows: dataLines.length,
    generatedAt: generatedAt || null,
    columns,
    sha256,
  };
}

export function parseGeneratedAt(str) {
  if (!str || typeof str !== 'string' || str === 'not a date' || str.trim() === '') {
    return null;
  }
  const normalized = str.includes('T') ? str : str.replace(' ', 'T') + (str.endsWith('Z') ? '' : 'Z');
  const dt = new Date(normalized);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

export function isNewerThan(current, previousManifest) {
  if (!previousManifest || Object.keys(previousManifest).length === 0) return true;
  if (previousManifest.generated_at === 'unknown' && !current.generatedAt) return false;

  const currentStamp = parseGeneratedAt(current.generatedAt);
  const prevStamp = parseGeneratedAt(previousManifest.generated_at);

  if (currentStamp && prevStamp) {
    const curTime = new Date(currentStamp).getTime();
    const prevTime = new Date(prevStamp).getTime();
    if (curTime > prevTime) return true;
    if (curTime === prevTime) {
      const prevSha = previousManifest.source_csv_sha256 || previousManifest.csv_sha256;
      if (current.sha256 && prevSha) {
        return current.sha256 !== prevSha;
      }
      return false;
    }
    return false;
  }

  if (!currentStamp && current.sha256) {
    const prevSha = previousManifest.source_csv_sha256 || previousManifest.csv_sha256;
    if (prevSha) {
      return current.sha256 !== prevSha;
    }
  }

  return false;
}

export function publicationAge(generatedAt, now = Date.now()) {
  if (!generatedAt) return null;
  const parsed = parseGeneratedAt(generatedAt);
  if (!parsed) return null;
  const dt = new Date(parsed);
  if (isNaN(dt.getTime())) return null;
  const nowMs = typeof now === 'number' ? now : new Date(now).getTime();
  const diffMs = nowMs - dt.getTime();
  return diffMs / (1000 * 60 * 60);
}

export function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        i++;
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const outDir = typeof args.out === 'string' ? args.out : '/tmp/advisory-ingest';
  const maxAgeHours = typeof args['max-age-hours'] === 'string' ? parseFloat(args['max-age-hours']) : DEFAULT_MAX_AGE_HOURS;

  fs.mkdirSync(outDir, { recursive: true });
  const targetCsv = path.join(outDir, 'hazardnet_advisories_latest.csv');
  const reportPath = path.join(outDir, 'fetch-report.json');

  const existingSource = path.resolve(process.cwd(), 'backend/data/forecasts/hazardnet_forecasts_latest.csv');
  if (fs.existsSync(existingSource) && !fs.existsSync(targetCsv)) {
    fs.copyFileSync(existingSource, targetCsv);
  }

  const manifestPath = path.resolve(process.cwd(), 'backend/data/forecasts/manifest.json');
  let prevManifest = null;
  if (fs.existsSync(manifestPath)) {
    try {
      prevManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {}
  }

  let csvContent = '';
  if (fs.existsSync(targetCsv)) {
    csvContent = fs.readFileSync(targetCsv, 'utf8');
  }

  const info = inspectCsv(csvContent);
  const age = publicationAge(info.generatedAt);
  const report = {
    fetched: true,
    age_hours: age !== null ? Number(age.toFixed(2)) : 0,
    rows: info.rows,
    generated_at: info.generatedAt,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  if (age !== null && age > maxAgeHours) {
    console.warn(`[fetch] CSV is ${age.toFixed(1)} h old (> ${maxAgeHours} h gate)`);
    process.exit(2);
  }

  const newer = isNewerThan(info, prevManifest);
  if (!newer && !args.force) {
    console.warn('[fetch] CSV is not newer than currently ingested manifest.');
    process.exit(2);
  }

  console.log('[fetch] Fresh advisory CSV acquired.');
  process.exit(0);
}
