import { parseCsvString, processAndValidateCsvRows } from '../../backend/utils/csvIngestion.js';
import assert from 'node:assert/strict';

async function runTests() {
  console.log('🧪 Testing CSV Ingestion Utility...');

  // Test 1: parseCsvString
  const sampleCsv = `district_id,district_name,horizon,hazard_type,severity_score,confidence,target_date,prediction_date
1,Dhaka,7_days,Flood,0.75,0.92,2026-09-21,2026-09-14
2,Chittagong,15_days,Tropical Cyclone,0.85,0.88,2026-09-29,2026-09-14`;

  const parsedRows = await parseCsvString(sampleCsv);
  assert.equal(parsedRows.length, 2, 'Should parse 2 rows');
  assert.equal(parsedRows[0].district_name, 'Dhaka');
  console.log('  ✅ parseCsvString passed');

  // Test 2: processAndValidateCsvRows
  const { validRows, errors } = processAndValidateCsvRows(parsedRows, { strict: false });
  assert.equal(validRows.length, 2, 'Should validate 2 valid rows');
  assert.equal(errors.length, 0, 'Should have 0 errors');
  assert.equal(validRows[0].district_id, 1);
  assert.equal(validRows[0].severity_score, 0.75);
  console.log('  ✅ processAndValidateCsvRows passed');

  // Test 3: Invalid row handling in processAndValidateCsvRows
  const invalidCsvRows = [
    { district_id: 'bad', district_name: 'Unknown', horizon: '7_days', hazard_type: 'Flood', severity_score: '1.5', confidence: '0.9', target_date: '2026-09-21', prediction_date: '2026-09-14' }
  ];
  assert.throws(() => {
    processAndValidateCsvRows(invalidCsvRows, { strict: true });
  }, /CSV validation failed/, 'Should throw error when strict is true on invalid row');
  console.log('  ✅ processAndValidateCsvRows strict mode error handling passed');

  console.log('🎉 All CSV Ingestion tests passed successfully!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
