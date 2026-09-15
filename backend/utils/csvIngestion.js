/**
 * Server-side CSV Ingestion Utility for HazardNet.
 *
 * Securely parses, validates, and ingests forecasted CSV data (such as output from
 * the Kaggle automation workflow) directly into the Firebase Firestore collection.
 */

import { Readable } from 'node:stream';
import csvParser from 'csv-parser';
import { parseCsvForecastRow } from './forecastRow.js';
import { getForecastStore, getForecastStoreMode } from '../forecastStore.js';
import { logger } from '../../utils/logger.js';

/**
 * Parse raw CSV string content into array of object records.
 *
 * @param {string} csvString - UTF-8 encoded CSV string
 * @returns {Promise<Array<Record<string, string>>>}
 */
export function parseCsvString(csvString) {
  return new Promise((resolve, reject) => {
    if (typeof csvString !== 'string') {
      return reject(new Error('CSV content must be a string'));
    }

    const trimmed = csvString.trim();
    if (!trimmed) {
      return reject(new Error('CSV content is empty'));
    }

    const results = [];
    const stream = Readable.from(trimmed);

    stream
      .pipe(csvParser())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(new Error(`CSV parsing failed: ${err.message}`)));
  });
}

/**
 * Validate and format raw CSV rows using parseCsvForecastRow.
 *
 * @param {Array<Record<string, string>>} rawRows
 * @param {{ strict?: boolean }} options
 * @returns {{ validRows: Array<object>, errors: Array<{ row: number, error: string }> }}
 */
export function processAndValidateCsvRows(rawRows, options = {}) {
  const { strict = true } = options;
  const validRows = [];
  const errors = [];

  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return { validRows, errors: [{ row: 0, error: 'CSV file contains no data rows' }] };
  }

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 1;
    const result = parseCsvForecastRow(rawRows[i], rowNum);
    if (result.ok) {
      validRows.push(result.value);
    } else {
      errors.push({ row: rowNum, error: result.error });
    }
  }

  if (strict && errors.length > 0) {
    const sampleError = errors[0].error;
    throw new Error(`CSV validation failed (${errors.length} errors found). First error: ${sampleError}`);
  }

  return { validRows, errors };
}

/**
 * Main server-side entry point for ingesting CSV forecast data into Firestore.
 *
 * @param {string|Buffer} csvContent - Raw CSV data string or Buffer
 * @param {object} options
 * @param {'replace'|'append'} [options.mode='replace'] - 'replace' deletes previous forecasts for prediction_date first
 * @param {number} [options.batchSize=400] - Batch chunk size for Firestore writes (max 500)
 * @param {boolean} [options.strict=true] - If true, throws error on row validation failures
 * @param {string} [options.predictionDate] - Optional explicit prediction_date override ('YYYY-MM-DD')
 * @returns {Promise<{ success: boolean, totalRows: number, validRows: number, written: number, predictionDate: string, storeMode: string, durationMs: number }>}
 */
export async function ingestForecastCsv(csvContent, options = {}) {
  const startTime = Date.now();
  const {
    mode = 'replace',
    batchSize = 400,
    strict = true,
    predictionDate: explicitPredictionDate
  } = options;

  if (batchSize > 500) {
    throw new Error('batchSize cannot exceed Firestore 500-write limit');
  }

  const rawText = Buffer.isBuffer(csvContent)
    ? csvContent.toString('utf-8')
    : String(csvContent || '');

  logger.info(`Starting CSV ingestion (mode: ${mode}, batchSize: ${batchSize})`);

  // Step 1: Parse CSV structure
  const rawRows = await parseCsvString(rawText);

  // Step 2: Validate and transform rows
  const { validRows, errors } = processAndValidateCsvRows(rawRows, { strict });

  if (validRows.length === 0) {
    throw new Error('No valid forecast rows found in CSV after validation');
  }

  // Determine target prediction_date for replacement / telemetry
  const samplePredictionDate = validRows[0].prediction_date;
  const targetPredictionDate = explicitPredictionDate || samplePredictionDate;

  // Step 3: Write to Firestore via ForecastStore in batches
  const store = getForecastStore();
  const storeMode = getForecastStoreMode();
  let totalWritten = 0;

  if (!['replace', 'append'].includes(mode)) throw new Error('Invalid ingestion mode');
  if (validRows.some((row) => row.prediction_date !== targetPredictionDate)) {
    throw new Error('One prediction_date is required per ingestion');
  }
  // The store owns bounded writes. Passing the whole replacement prevents
  // the first chunk from deleting still-needed rows from later chunks.
  const result = mode === 'replace'
    ? await store.replaceForecastsForPredictionDate(targetPredictionDate, validRows)
    : await store.appendForecasts(validRows);
  totalWritten = result.written;

  const durationMs = Date.now() - startTime;
  logger.info(`CSV ingestion complete: ${totalWritten} records written to ${storeMode} in ${durationMs}ms`);

  return {
    success: true,
    totalRows: rawRows.length,
    validRows: validRows.length,
    written: totalWritten,
    predictionDate: targetPredictionDate,
    storeMode,
    durationMs,
    validationErrors: errors
  };
}
