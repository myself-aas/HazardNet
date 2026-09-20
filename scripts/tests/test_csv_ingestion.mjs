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

  // Test 4: the Phase 2 physics + provenance columns survive the ingest
  // boundary (backend/utils/forecastRow.js), which is where the CSV becomes the
  // JSON the stores and the API see.
  const { parseCsvForecastRow } = await import('../../backend/utils/forecastRow.js');
  const phase2Row = {
    district_id: '5', district_name: 'Bogra', division: 'Rajshahi', pcode: '5750',
    horizon: '15_days', hazard_type: 'Flash Flood',
    model_severity: '0.98', physics_severity: '0.31', confidence: '0.99',
    target_date: '2026-10-01', prediction_date: '2026-09-16',
    physics_top_hazard: 'Tropical Cyclone', physics_top_severity: '0.72',
    physics_agreement: 'False', track_divergence: '0.67',
    physics_flash_flood: '0.31', physics_tropical_cyclone: '0.72',
    model_version: '2.1.9+model.d7b1a5b48aa6', tensor_build_id: 'd7b1a5b48aa6',
    pipeline_version: 'auto_forecast/2.0.0', run_id: '20260917T000000Z-deadbeef',
    confidence_kind: 'model_softmax_top_class', soil_channels_fabricated: 'True',
    temperature_max: '34', precipitation_mm: '11.7',
  };
  const phase2 = parseCsvForecastRow(phase2Row, 1);
  assert.equal(phase2.ok, true, 'Phase 2 row should parse');
  const value = phase2.value;
  assert.equal(value.physics_top_hazard, 'Tropical Cyclone', 'physics track pick must survive');
  assert.equal(value.physics_agreement, false, "'False' must become a boolean");
  assert.equal(value.track_divergence, 0.67, 'divergence must survive as a number');
  assert.equal(value.physics_scores.physics_tropical_cyclone, 0.72, 'per-class scores must survive');
  assert.equal(value.model_version, '2.1.9+model.d7b1a5b48aa6', 'model provenance must survive');
  assert.equal(value.confidence_kind, 'model_softmax_top_class', 'confidence_kind must survive');
  assert.equal(value.soil_channels_fabricated, true, 'input-integrity flag must survive');
  console.log('  ✅ Phase 2 physics/provenance columns passed');

  // ...and a row from the older pipeline (no physics/provenance columns at all)
  // must still parse: the fields are optional, and their absence is data.
  const legacy = parseCsvForecastRow({
    // Only the columns the pre-2026-09-17 generator wrote.
    district_id: '6', district_name: 'Bogra', division: 'Rajshahi', pcode: '5750',
    horizon: '15_days', hazard_type: 'Flash Flood',
    model_severity: '0.98', physics_severity: '0.31', confidence: '0.99',
    target_date: '2026-10-01', prediction_date: '2026-09-16',
    temperature_max: '34', precipitation_mm: '11.7',
  }, 2);
  assert.equal(legacy.ok, true, 'legacy row must still parse');
  for (const key of ['physics_top_hazard', 'physics_agreement', 'track_divergence', 'physics_scores', 'model_version']) {
    assert.equal(key in legacy.value, false, `${key} must be absent, not invented, for a legacy row`);
  }
  console.log('  ✅ legacy rows parse without invented physics/provenance fields');

  console.log('🎉 All CSV Ingestion tests passed successfully!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
