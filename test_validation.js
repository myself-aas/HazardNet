import { processAndValidateCsvRows } from './backend/utils/csvIngestion.js';
const chunk = [{ district_id: '1', district_name: 'A', horizon: '7_days', hazard_type: 'Fire', confidence: 0.9, severity_score: 0.5, target_date: '2024-01-01', prediction_date: '2024-01-01' }];
console.log(processAndValidateCsvRows(chunk, { strict: false }));
