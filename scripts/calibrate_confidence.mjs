#!/usr/bin/env node
/**
 * calibrate_confidence.mjs — Isotonic Probability Calibration & Backtest CLI (Phase 3)
 *
 * Implements the `hazardnet-calibration/v1` tooling for fitting, validating, and
 * applying monotonic PAVA probability calibration maps and computing lead-time
 * backtest skill scores (POD, FAR, CSI, Brier, ECE).
 *
 * Usage:
 *   node scripts/calibrate_confidence.mjs --validate <map.json>
 *   node scripts/calibrate_confidence.mjs --fit <samples.json> --out <map.json> [--fit-period=...] [--fit-source=...]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateCalibrationMap,
  fitIsotonicCalibration,
  evaluateLeadTimeBacktest,
} from '../backend/alerts/calibration.js';

export function parseArgs(argv = []) {
  const out = {
    validate: null,
    fit: null,
    out: null,
    backtest: null,
    threshold: 0.65,
    fitPeriod: '2020-01-01..2026-09-30',
    fittedOn: new Date().toISOString().slice(0, 10),
    fitSource: 'historical-backtest-episodes',
    labelDefinition: 'district_hazard_impact_observed',
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--validate') out.validate = argv[++i] || null;
    else if (arg === '--fit') out.fit = argv[++i] || null;
    else if (arg === '--out') out.out = argv[++i] || null;
    else if (arg === '--backtest') out.backtest = argv[++i] || null;
    else if (arg.startsWith('--threshold=')) out.threshold = Number(arg.split('=')[1]);
    else if (arg.startsWith('--fit-period=')) out.fitPeriod = arg.split('=')[1];
    else if (arg.startsWith('--fitted-on=')) out.fittedOn = arg.split('=')[1];
    else if (arg.startsWith('--fit-source=')) out.fitSource = arg.split('=')[1];
    else if (arg.startsWith('--label-definition=')) out.labelDefinition = arg.split('=')[1];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.validate) {
    const mapPath = resolve(process.cwd(), args.validate);
    if (!existsSync(mapPath)) {
      console.error(`[calibration] Map file not found: ${mapPath}`);
      process.exit(2);
    }
    const mapDoc = JSON.parse(readFileSync(mapPath, 'utf8'));
    const result = validateCalibrationMap(mapDoc);
    if (!result.valid) {
      console.error(`[calibration] INVALID map (${mapPath}): ${result.errors.join('; ')}`);
      process.exit(1);
    }
    console.log(`[calibration] VALID map (${mapPath}): samples=${mapDoc.samples}, brier=${mapDoc.brier}`);
    return;
  }

  if (args.fit) {
    const fitPath = resolve(process.cwd(), args.fit);
    if (!existsSync(fitPath)) {
      console.error(`[calibration] Samples file not found: ${fitPath}`);
      process.exit(2);
    }
    const samples = JSON.parse(readFileSync(fitPath, 'utf8'));
    const fitted = fitIsotonicCalibration(samples, {
      fit_period: args.fitPeriod,
      fitted_on: args.fittedOn,
      fit_source: args.fitSource,
      label_definition: args.labelDefinition,
    });
    if (args.out) {
      const outPath = resolve(process.cwd(), args.out);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, `${JSON.stringify(fitted, null, 2)}\n`, 'utf8');
      console.log(`[calibration] Wrote fitted map to ${outPath} (brier_raw=${fitted.brier_raw} -> brier=${fitted.brier})`);
    } else {
      console.log(JSON.stringify(fitted, null, 2));
    }
    return;
  }

  if (args.backtest) {
    const btPath = resolve(process.cwd(), args.backtest);
    if (!existsSync(btPath)) {
      console.error(`[calibration] Backtest records not found: ${btPath}`);
      process.exit(2);
    }
    const records = JSON.parse(readFileSync(btPath, 'utf8'));
    const report = evaluateLeadTimeBacktest(records, { threshold: args.threshold });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.error('Usage: node scripts/calibrate_confidence.mjs --validate <map.json> | --fit <samples.json> [--out <map.json>] | --backtest <records.json>');
  process.exit(2);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
