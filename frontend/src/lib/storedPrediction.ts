export interface StoredPrediction {
  prediction: {
    hazard: string;
    confidence: number;
    confidence_kind: string;
    severity_score: number;
  };
  provenance: {
    district_name: string | null;
    prediction_date: string | null;
    target_date: string | null;
    horizon: string | null;
  };
  inference: { served_from: string; model_version: string | null; latency_ms: null };
}

export async function fetchStoredPrediction(districtId: string, horizon = '7_days'): Promise<StoredPrediction> {
  const response = await fetch('/api/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ districtId, horizon }),
  });
  if (!response.ok) throw new Error('Stored forecast unavailable for this district and horizon.');
  const data = await response.json();
  if (
    data?.inference?.served_from !== 'stored-forecast' ||
    !data.provenance ||
    typeof data.prediction?.hazard !== 'string' ||
    !Number.isFinite(data.prediction?.severity_score) ||
    !Number.isFinite(data.prediction?.confidence) ||
    data.prediction.severity_score < 0 ||
    data.prediction.severity_score > 1 ||
    data.prediction.confidence < 0 ||
    data.prediction.confidence > 1
  ) {
    throw new Error('Invalid stored forecast response.');
  }
  return data;
}
