export interface StoredPrediction {
  prediction: {
    hazard: string;
    confidence: number;
    confidence_kind: string;
    severity_score: number;
  };
  provenance: {
    district_id: string | null;
    district_name: string | null;
    prediction_date: string | null;
    target_date: string | null;
    horizon: string | null;
  };
  inference: { served_from: string; model_version: string | null; latency_ms: null };
}

export type ForecastFetchReason = 'offline' | 'rate-limited' | 'server' | 'invalid-data' | 'uncovered';

export class StoredPredictionError extends Error {
  readonly reason: ForecastFetchReason;
  readonly status: number | null;

  constructor(reason: ForecastFetchReason, message: string, status: number | null = null) {
    super(message);
    this.name = 'StoredPredictionError';
    this.reason = reason;
    this.status = status;
  }
}

const isAbortError = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError');

function classifyHttpStatus(status: number): ForecastFetchReason {
  if (status === 404) return 'uncovered';
  if (status === 429) return 'rate-limited';
  if (status === 400 || status === 422) return 'invalid-data';
  return 'server';
}

function isOfflineFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (error instanceof TypeError) return true;
  return false;
}

export async function fetchStoredPrediction(
  districtId: string,
  horizon = '7_days',
  options: { signal?: AbortSignal } = {},
): Promise<StoredPrediction> {
  if (typeof districtId !== 'string' || districtId.trim() === '') {
    throw new StoredPredictionError('invalid-data', 'A district id is required to load a stored forecast.');
  }
  if (horizon !== '7_days' && horizon !== '15_days') {
    throw new StoredPredictionError('invalid-data', 'Horizon must be 7_days or 15_days.');
  }

  let response: Response;
  try {
    response = await fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ districtId: districtId.trim(), horizon }),
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (isOfflineFailure(error)) {
      throw new StoredPredictionError('offline', 'Stored forecast could not be loaded while offline.');
    }
    throw new StoredPredictionError('server', 'Stored forecast unavailable for this district and horizon.');
  }

  if (!response.ok) {
    const reason = classifyHttpStatus(response.status);
    const message =
      reason === 'uncovered'
        ? 'No stored forecast for this district and horizon.'
        : reason === 'rate-limited'
          ? 'The forecast service asked this page to wait before trying again.'
          : 'Stored forecast unavailable for this district and horizon.';
    throw new StoredPredictionError(reason, message, response.status);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new StoredPredictionError('invalid-data', 'Invalid stored forecast response.');
  }

  const envelope = data as {
    inference?: { served_from?: unknown; model_version?: unknown };
    provenance?: Record<string, unknown> | null;
    prediction?: {
      hazard?: unknown;
      confidence?: unknown;
      confidence_kind?: unknown;
      severity_score?: unknown;
    };
  };

  if (
    envelope?.inference?.served_from !== 'stored-forecast' ||
    !envelope.provenance ||
    typeof envelope.prediction?.hazard !== 'string' ||
    !Number.isFinite(envelope.prediction?.severity_score) ||
    !Number.isFinite(envelope.prediction?.confidence) ||
    (envelope.prediction.severity_score as number) < 0 ||
    (envelope.prediction.severity_score as number) > 1 ||
    (envelope.prediction.confidence as number) < 0 ||
    (envelope.prediction.confidence as number) > 1
  ) {
    throw new StoredPredictionError('invalid-data', 'Invalid stored forecast response.');
  }

  const provenance = envelope.provenance;
  return {
    prediction: {
      hazard: envelope.prediction.hazard,
      confidence: envelope.prediction.confidence as number,
      confidence_kind:
        typeof envelope.prediction.confidence_kind === 'string'
          ? envelope.prediction.confidence_kind
          : 'model_softmax_top_class',
      severity_score: envelope.prediction.severity_score as number,
    },
    provenance: {
      district_id: typeof provenance.district_id === 'string' ? provenance.district_id : null,
      district_name: typeof provenance.district_name === 'string' ? provenance.district_name : null,
      prediction_date: typeof provenance.prediction_date === 'string' ? provenance.prediction_date : null,
      target_date: typeof provenance.target_date === 'string' ? provenance.target_date : null,
      horizon: typeof provenance.horizon === 'string' ? provenance.horizon : null,
    },
    inference: {
      served_from: 'stored-forecast',
      model_version: typeof envelope.inference?.model_version === 'string' ? envelope.inference.model_version : null,
      latency_ms: null,
    },
  };
}

/** React Query: retry transient failures only; never retry 404 or invalid input. */
export function shouldRetryStoredPrediction(failureCount: number, error: unknown): boolean {
  if (!(error instanceof StoredPredictionError)) return failureCount < 2;
  if (error.reason === 'uncovered' || error.reason === 'invalid-data' || error.reason === 'offline') {
    return false;
  }
  if (error.reason === 'rate-limited') return failureCount < 1;
  return failureCount < 2;
}
