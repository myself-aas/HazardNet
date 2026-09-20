import type { StoredPrediction } from '../../storedPrediction';

/** Valid stored row fixture. Labelled as a test fixture — not operational data. */
export const VALID_STORED_FORECAST: StoredPrediction = {
  prediction: {
    hazard: 'Flood',
    severity_score: 0.7,
    confidence: 0.9,
    confidence_kind: 'model_softmax_top_class',
  },
  provenance: {
    district_id: 'dhaka',
    district_name: 'Dhaka',
    prediction_date: '2026-09-20',
    target_date: '2026-09-27',
    horizon: '7_days',
  },
  inference: { served_from: 'stored-forecast', model_version: null, latency_ms: null },
};

/** Same envelope with several producer fields absent. */
export const PARTIAL_STORED_FORECAST: StoredPrediction = {
  prediction: {
    hazard: 'Drought',
    severity_score: 0.41,
    confidence: 0.55,
    confidence_kind: 'model_softmax_top_class',
  },
  provenance: {
    district_id: 'rajshahi',
    district_name: 'Rajshahi',
    prediction_date: null,
    target_date: null,
    horizon: '15_days',
  },
  inference: { served_from: 'stored-forecast', model_version: null, latency_ms: null },
};
