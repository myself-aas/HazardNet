import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADVISORY_CSV_COLUMNS,
  VALID_ADVISORY_TIERS,
  VALID_HORIZONS,
  VALID_HAZARDS,
  lookupDistrict,
} from '../backend/utils/advisoryMapper.js';

export function parseCsv(csvContent) {
  if (!csvContent || typeof csvContent !== 'string') {
    return { headers: [], rows: [] };
  }
  const matrix = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushField = () => {
    row.push(field.trim());
    field = '';
  };
  const pushRow = () => {
    pushField();
    if (!(row.length === 1 && row[0] === '')) {
      matrix.push(row);
    }
    row = [];
  };

  while (i < csvContent.length) {
    const ch = csvContent[i];
    if (inQuotes) {
      if (ch === '"') {
        if (csvContent[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  if (matrix.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = matrix[0];
  const rows = matrix.slice(1).map((parts) =>
    Object.fromEntries(headers.map((h, idx) => [h, parts[idx] ?? ''])),
  );
  return { headers, rows };
}

export function validateAdvisoryCsv(csvContent, options = {}) {
  const current = options.currentTime || options.now || new Date();
  const maxAgeHours = options.maxAgeHours ?? 36;
  const allowStale = options.allowStale ?? false;
  const errors = [];

  if (!csvContent || typeof csvContent !== 'string') {
    return {
      valid: false,
      errors: ['CSV content is empty or invalid'],
      summary: { totalRows: 0, columnsCount: 0, districtCount: 0, isStale: false, ageHours: null },
    };
  }

  const { headers, rows: parsedRows } = parseCsv(csvContent);
  if (headers.length === 0) {
    return {
      valid: false,
      errors: ['CSV content is empty'],
      summary: { totalRows: 0, columnsCount: 0, districtCount: 0, isStale: false, ageHours: null },
    };
  }

  if (headers.length !== ADVISORY_CSV_COLUMNS.length) {
    errors.push(`Invalid column count: expected ${ADVISORY_CSV_COLUMNS.length}, got ${headers.length}`);
  }

  for (const col of ADVISORY_CSV_COLUMNS) {
    if (!headers.includes(col)) {
      errors.push(`Missing required column: "${col}"`);
    }
  }

  if (parsedRows.length !== 128) {
    errors.push(`Invalid row count: expected 128, got ${parsedRows.length}`);
  }

  const districtHorizons = new Map();
  const districts = new Set();
  let newestTimestamp = null;

  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i];

    const districtName = row.district;
    const resolved = lookupDistrict(districtName);
    const canonicalName = resolved ? resolved.district_name : districtName;
    districts.add(canonicalName);

    if (!districtHorizons.has(canonicalName)) {
      districtHorizons.set(canonicalName, new Set());
    }
    districtHorizons.get(canonicalName).add(row.horizon);

    if (row.advisory_tier && !VALID_ADVISORY_TIERS.includes(row.advisory_tier)) {
      errors.push(`Invalid advisory_tier "${row.advisory_tier}" on row ${i + 1}`);
    }

    const hazard = row.hazard === 'Heatwave' ? 'Heat Wave' : row.hazard;
    if (hazard && !VALID_HAZARDS.includes(hazard)) {
      errors.push(`Invalid hazard "${row.hazard}" on row ${i + 1}`);
    }

    if (row.generated_at) {
      const dt = new Date(row.generated_at.includes('T') ? row.generated_at : row.generated_at.replace(' ', 'T') + 'Z');
      if (!isNaN(dt.getTime())) {
        if (!newestTimestamp || dt > newestTimestamp) {
          newestTimestamp = dt;
        }
      }
    }
  }

  for (const [dName, hSet] of districtHorizons.entries()) {
    for (const h of VALID_HORIZONS) {
      if (!hSet.has(h)) {
        errors.push(`District "${dName}" missing complete horizon coverage (lacks ${h})`);
        break;
      }
    }
  }

  let isStale = false;
  let ageHours = null;
  if (newestTimestamp) {
    const ageMs = current.getTime() - newestTimestamp.getTime();
    ageHours = Math.max(0, ageMs / (1000 * 60 * 60));
    if (ageHours > maxAgeHours) {
      isStale = true;
      if (!allowStale) {
        errors.push(`STALE_DATA: Advisory publication is ${ageHours.toFixed(1)} h old, exceeds ${maxAgeHours} h gate`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    summary: {
      totalRows: parsedRows.length,
      columnsCount: headers.length,
      districtCount: districts.size,
      isStale,
      ageHours,
    },
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/validate_advisory_csv.mjs <file_path> [--allow-stale]');
    process.exit(1);
  }

  const allowStale = process.argv.includes('--allow-stale');
  try {
    const content = fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf8');
    const result = validateAdvisoryCsv(content, { allowStale });
    if (!result.valid) {
      console.error('[validate_advisory_csv] Validation failed:');
      result.errors.forEach((e) => console.error('  -', e));
      process.exit(1);
    }
    console.log('[validate_advisory_csv] Validation successful. Summary:', result.summary);
  } catch (err) {
    console.error('[validate_advisory_csv] Fatal error:', err.message);
    process.exit(1);
  }
}
