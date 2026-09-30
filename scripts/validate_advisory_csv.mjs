#!/usr/bin/env node
/**
 * validate_advisory_csv.mjs — Schema Validation & Staleness Guard Script
 *
 * Implements TASK-003 per PRD §4.1, §4.3 / TRD §4.1, §4.3.
 *
 * Verifies that the raw output `hazardnet_advisories_latest.csv` from Kaggle notebook
 * `8-hazardnet-advisory` conforms to the 22-column specification, contains exactly 128 rows
 * (64 districts × 2 horizons), passes enum domain validation, and is not stale (> 36 hours).
 *
 * Usage:
 *   node scripts/validate_advisory_csv.mjs <path-to-csv> [--max-age-hours=36] [--allow-stale] [--quiet]
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ADVISORY_CSV_COLUMNS,
  VALID_ADVISORY_TIERS,
  VALID_HORIZONS,
  VALID_HAZARDS,
  DISTRICT_REGISTRY,
  normalizeDistrictKey,
  lookupDistrict,
} from '../backend/utils/advisoryMapper.js';

// ─── Minimal RFC4180 CSV parser (handles quotes, CRLF, escaped quotes) ───
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === ',') { pushField(); i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    if (ch === '\n') { pushRow(); i += 1; continue; }
    field += ch; i += 1;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((cells) => !(cells.length === 1 && cells[0].trim() === ''));
}

/**
 * Validate advisory CSV content against schema and staleness constraints.
 *
 * @param {string} csvContent - Raw CSV string
 * @param {object} [options]
 * @param {number} [options.maxAgeHours=36]
 * @param {boolean} [options.allowStale=false]
 * @param {Date} [options.currentTime=new Date()]
 * @returns {{ valid: boolean, errors: string[], summary: object }}
 */
export function validateAdvisoryCsv(csvContent, options = {}) {
  const {
    maxAgeHours = 36,
    allowStale = false,
    currentTime = new Date(),
  } = options;

  const errors = [];
  const parsed = parseCsv(csvContent);

  if (parsed.length === 0) {
    return {
      valid: false,
      errors: ['CSV content is empty or contains no records'],
      summary: { totalRows: 0 },
    };
  }

  const [rawHeaders, ...rawRows] = parsed;
  const headers = rawHeaders.map((h) => h.trim());

  // 1. Validate Column Count and Names
  if (headers.length !== ADVISORY_CSV_COLUMNS.length) {
    errors.push(
      `Invalid column count: expected ${ADVISORY_CSV_COLUMNS.length} columns, found ${headers.length}`
    );
  }

  const missingColumns = ADVISORY_CSV_COLUMNS.filter((col) => !headers.includes(col));
  if (missingColumns.length > 0) {
    errors.push(`Missing required column(s): ${missingColumns.join(', ')}`);
  }

  const extraColumns = headers.filter((col) => !ADVISORY_CSV_COLUMNS.includes(col));
  if (extraColumns.length > 0) {
    errors.push(`Unexpected extra column(s): ${extraColumns.join(', ')}`);
  }

  // 2. Validate Row Count (Exactly 128 rows: 64 districts × 2 horizons)
  if (rawRows.length !== 128) {
    errors.push(`Invalid row count: expected exactly 128 rows, found ${rawRows.length}`);
  }

  const headerIdx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const getCell = (row, col) => (headerIdx[col] !== undefined ? row[headerIdx[col]]?.trim() : undefined);

  // Track districts and horizons
  const districtHorizonMap = new Map();
  for (const district of DISTRICT_REGISTRY) {
    districtHorizonMap.set(normalizeDistrictKey(district.district_name), new Set());
  }

  let latestGeneratedAt = null;

  rawRows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-indexed row number in CSV (1 is header)

    const district = getCell(row, 'district');
    const horizon = getCell(row, 'horizon');
    const hazard = getCell(row, 'hazard');
    const confidence = parseFloat(getCell(row, 'confidence'));
    const finalSeverity = parseFloat(getCell(row, 'final_severity'));
    const advisoryTier = getCell(row, 'advisory_tier')?.toUpperCase();
    const generatedAtStr = getCell(row, 'generated_at');
    const targetDate = getCell(row, 'target_date');

    // District check
    const matchedDistrict = lookupDistrict(district);
    if (!matchedDistrict) {
      errors.push(`Row ${rowNum}: Unrecognized district name "${district}"`);
    } else {
      const key = normalizeDistrictKey(matchedDistrict.district_name);
      if (districtHorizonMap.has(key)) {
        districtHorizonMap.get(key).add(horizon);
      }
    }

    // Horizon check
    if (!VALID_HORIZONS.includes(horizon)) {
      errors.push(`Row ${rowNum}: Invalid horizon "${horizon}". Expected one of: ${VALID_HORIZONS.join(', ')}`);
    }

    // Hazard check
    if (!VALID_HAZARDS.includes(hazard)) {
      errors.push(`Row ${rowNum}: Invalid hazard "${hazard}". Expected one of: ${VALID_HAZARDS.join(', ')}`);
    }

    // Advisory Tier check
    if (!VALID_ADVISORY_TIERS.includes(advisoryTier)) {
      errors.push(`Row ${rowNum}: Invalid advisory_tier "${advisoryTier}". Expected one of: ${VALID_ADVISORY_TIERS.join(', ')}`);
    }

    // Float bounds checks [0, 1]
    for (const floatCol of ['confidence', 'final_severity', 'cnn_severity_raw', 'cnn_severity', 'physics_severity', 'prob_top1', 'prob_top2', 'prob_top3']) {
      const val = getCell(row, floatCol);
      if (val !== undefined && val !== '') {
        const num = parseFloat(val);
        if (isNaN(num) || !Number.isFinite(num) || num < 0 || num > 1) {
          errors.push(`Row ${rowNum}: Field "${floatCol}" must be a float in [0, 1], got "${val}"`);
        }
      }
    }

    // Meteorological floats checks
    for (const weatherCol of ['om_max_temp_c', 'om_min_temp_c', 'om_precip_mm', 'om_wind_kmh']) {
      const val = getCell(row, weatherCol);
      if (val !== undefined && val !== '') {
        const num = parseFloat(val);
        if (isNaN(num) || !Number.isFinite(num)) {
          errors.push(`Row ${rowNum}: Field "${weatherCol}" must be a finite float, got "${val}"`);
        }
      }
    }

    // Target Date check (YYYY-MM-DD)
    if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      errors.push(`Row ${rowNum}: Invalid target_date format "${targetDate}". Expected YYYY-MM-DD`);
    }

    // Generated At check
    if (generatedAtStr) {
      const genDate = new Date(generatedAtStr);
      if (isNaN(genDate.getTime())) {
        errors.push(`Row ${rowNum}: Invalid generated_at timestamp "${generatedAtStr}"`);
      } else {
        if (!latestGeneratedAt || genDate > latestGeneratedAt) {
          latestGeneratedAt = genDate;
        }
      }
    } else {
      errors.push(`Row ${rowNum}: Missing generated_at timestamp`);
    }
  });

  // 3. Verify Every District has Exactly Two Horizons (7_days and 15_days)
  for (const district of DISTRICT_REGISTRY) {
    const key = normalizeDistrictKey(district.district_name);
    const horizons = districtHorizonMap.get(key);
    if (!horizons || horizons.size !== 2 || !horizons.has('7_days') || !horizons.has('15_days')) {
      errors.push(`District "${district.district_name}" missing complete horizon coverage (found: ${horizons ? [...horizons].join(', ') : 'none'})`);
    }
  }

  // 4. Staleness Guard
  let isStale = false;
  let ageHours = null;
  if (latestGeneratedAt) {
    const ageMs = currentTime.getTime() - latestGeneratedAt.getTime();
    ageHours = ageMs / (1000 * 60 * 60);

    if (ageHours > maxAgeHours) {
      isStale = true;
      if (!allowStale) {
        errors.push(
          `STALE_DATA: Dataset timestamp (${latestGeneratedAt.toISOString()}) is ${ageHours.toFixed(1)} hours old (threshold is ${maxAgeHours} hours)`
        );
      }
    }
  }

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    summary: {
      totalRows: rawRows.length,
      columnsCount: headers.length,
      latestGeneratedAt: latestGeneratedAt ? latestGeneratedAt.toISOString() : null,
      ageHours: ageHours !== null ? Number(ageHours.toFixed(2)) : null,
      isStale,
      districtCount: districtHorizonMap.size,
    },
  };
}

// ─── CLI Entry Point ───
export async function runCli() {
  const args = process.argv.slice(2);
  const csvFile = args.find((a) => !a.startsWith('--'));

  if (!csvFile) {
    console.error('Usage: node scripts/validate_advisory_csv.mjs <path-to-csv> [--max-age-hours=36] [--allow-stale] [--quiet]');
    process.exit(1);
  }

  const resolvedPath = resolve(process.cwd(), csvFile);
  if (!existsSync(resolvedPath)) {
    console.error(`❌ Error: File not found at ${resolvedPath}`);
    process.exit(1);
  }

  const maxAgeArg = args.find((a) => a.startsWith('--max-age-hours='));
  const maxAgeHours = maxAgeArg ? parseFloat(maxAgeArg.split('=')[1]) : 36;
  const allowStale = args.includes('--allow-stale');
  const quiet = args.includes('--quiet');

  try {
    const content = readFileSync(resolvedPath, 'utf8');
    const result = validateAdvisoryCsv(content, { maxAgeHours, allowStale });

    if (result.valid) {
      if (!quiet) {
        console.log('✅ Advisory CSV validation passed:');
        console.log(`   Rows: ${result.summary.totalRows}`);
        console.log(`   Columns: ${result.summary.columnsCount}`);
        console.log(`   Districts: ${result.summary.districtCount}`);
        console.log(`   Generated At: ${result.summary.latestGeneratedAt}`);
        console.log(`   Dataset Age: ${result.summary.ageHours} hours`);
      }
      process.exit(0);
    } else {
      console.error(`❌ Advisory CSV validation failed with ${result.errors.length} error(s):`);
      result.errors.slice(0, 20).forEach((err) => console.error(`   - ${err}`));
      if (result.errors.length > 20) {
        console.error(`   ... and ${result.errors.length - 20} more errors.`);
      }
      process.exit(1);
    }
  } catch (err) {
    console.error(`❌ Unexpected validation error: ${err.message}`);
    process.exit(1);
  }
}

// If invoked as CLI script directly
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  runCli();
}
