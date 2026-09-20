#!/usr/bin/env node
/**
 * CLI runner for ingesting forecast CSV into Firebase Firestore.
 * Usage: node scripts/ingest_forecast_csv.mjs <path-to-csv> [--mode=replace|append] [--strict=true|false]
 */

import fs from 'node:fs';
import path from 'node:path';
import { ingestForecastCsv } from '../backend/utils/csvIngestion.js';

async function main() {
  const args = process.argv.slice(2);
  const csvPath = args.find((a) => !a.startsWith('--'));

  if (!csvPath) {
    console.error('Usage: node scripts/ingest_forecast_csv.mjs <path-to-csv> [--mode=replace|append]');
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), csvPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ Error: CSV file not found at ${resolvedPath}`);
    process.exit(1);
  }

  const modeArg = args.find((a) => a.startsWith('--mode='));
  const mode = modeArg ? modeArg.split('=')[1] : 'replace';

  const strictArg = args.find((a) => a.startsWith('--strict='));
  const strict = strictArg ? strictArg.split('=')[1] !== 'false' : true;

  console.log(`📥 Ingesting forecast CSV: ${resolvedPath} (mode: ${mode}, strict: ${strict})`);

  try {
    const csvContent = fs.readFileSync(resolvedPath, 'utf-8');
    const result = await ingestForecastCsv(csvContent, { mode, strict });

    console.log(`✅ CSV Ingestion Successful!`);
    console.log(`   Total Rows Read: ${result.totalRows}`);
    console.log(`   Valid Rows: ${result.validRows}`);
    console.log(`   Records Written: ${result.written}`);
    console.log(`   Prediction Date: ${result.predictionDate}`);
    console.log(`   Store Backend: ${result.storeMode}`);
    console.log(`   Duration: ${result.durationMs}ms`);

    if (result.validationErrors && result.validationErrors.length > 0) {
      console.warn(`⚠️ ${result.validationErrors.length} validation warning(s):`);
      result.validationErrors.slice(0, 5).forEach((err) => {
        console.warn(`   Row ${err.row}: ${err.error}`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error(`❌ CSV Ingestion Failed: ${err.message}`);
    process.exit(1);
  }
}

main();
