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

import backendForecasts from '../data/backendForecasts.json';

const DISTRICT_ALIASES: Record<string, string> = {
  jessore: 'jashore',
  chittagong: 'chattogram',
  comilla: 'cumilla',
  barishal: 'barisal',
  khagrachari: 'khagrachhari',
  bogura: 'bogra',
  jaipurhat: 'joypurhat',
  netrakona: 'netrokona',
  maulvibazar: 'moulvibazar',
  brahamanbaria: 'brahmanbaria',
  jhalakathi: 'jhalokati',
  nawabganj: 'chapainawabganj',
};

function normalizeKey(value: string | number): string {
  const clean = String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  return DISTRICT_ALIASES[clean] || clean;
}

interface RawForecastRow {
  district_id?: number | string;
  districtId?: number | string;
  district_name?: string;
  districtName?: string;
  division?: string;
  pcode?: string;
  horizon?: string;
  hazard_type?: string;
  hazardType?: string;
  model_severity?: number;
  modelSeverity?: number;
  physics_severity?: number;
  physicsSeverity?: number;
  severity_score?: number;
  severityScore?: number;
  confidence?: number;
  target_date?: string;
  targetDate?: string;
  prediction_date?: string;
  predictionDate?: string;
  data_source?: string;
  dataSource?: string;
}

const typedBackendForecasts = backendForecasts as RawForecastRow[];

export function getStoredForecastFromData(districtId: string, requestedHorizon: string): StoredPrediction {
  const targetKey = normalizeKey(districtId);
  const numeric = /^\d+$/.test(districtId.trim());

  const matchingRows = typedBackendForecasts.filter((row) => {
    const rowDistrictId = row.district_id ?? row.districtId;
    if (numeric && rowDistrictId != null && String(rowDistrictId) === districtId.trim()) {
      return true;
    }
    const rowName = row.district_name ?? row.districtName;
    if (rowName && normalizeKey(rowName) === targetKey) {
      return true;
    }
    if (rowDistrictId != null && normalizeKey(rowDistrictId) === targetKey) {
      return true;
    }
    return false;
  });

  if (matchingRows.length === 0) {
    throw new StoredPredictionError('uncovered', 'No stored forecast for this district and horizon.', 404);
  }

  // Exact horizon match first, sorted by prediction_date descending (newest date first)
  const exactHorizonRows = matchingRows
    .filter((r) => r.horizon === requestedHorizon)
    .sort((a, b) =>
      String(b.prediction_date ?? b.predictionDate ?? '').localeCompare(
        String(a.prediction_date ?? a.predictionDate ?? ''),
      ),
    );

  const selectedRow =
    exactHorizonRows[0] ||
    [...matchingRows].sort((a, b) =>
      String(b.prediction_date ?? b.predictionDate ?? '').localeCompare(
        String(a.prediction_date ?? a.predictionDate ?? ''),
      ),
    )[0];

  const hazard = (selectedRow.hazard_type ?? selectedRow.hazardType ?? 'Unknown').trim();
  const rawSeverity =
    selectedRow.severity_score ??
    selectedRow.severityScore ??
    selectedRow.model_severity ??
    selectedRow.modelSeverity ??
    0;
  const severityScore = Math.max(0, Math.min(1, Number(rawSeverity) || 0));
  const confidence = Math.max(0, Math.min(1, Number(selectedRow.confidence) || 0));
  const districtName = selectedRow.district_name ?? selectedRow.districtName ?? null;
  const district_id =
    selectedRow.district_id != null
      ? String(selectedRow.district_id)
      : selectedRow.districtId != null
        ? String(selectedRow.districtId)
        : null;
  const predictionDate = selectedRow.prediction_date ?? selectedRow.predictionDate ?? null;
  const targetDate = selectedRow.target_date ?? selectedRow.targetDate ?? null;
  const horizon = selectedRow.horizon ?? requestedHorizon;

  return {
    prediction: {
      hazard,
      confidence,
      confidence_kind: 'model_softmax_top_class',
      severity_score: severityScore,
    },
    provenance: {
      district_id,
      district_name: districtName,
      prediction_date: predictionDate,
      target_date: targetDate,
      horizon,
    },
    inference: {
      served_from: 'stored-forecast',
      model_version: null,
      latency_ms: null,
    },
  };
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

  let response: Response | null = null;
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
    return getStoredForecastFromData(districtId, horizon);
  }

  if (response.status === 429) {
    throw new StoredPredictionError('rate-limited', 'The forecast service asked this page to wait before trying again.', 429);
  }

  const contentType = (response.headers && typeof response.headers.get === 'function')
    ? response.headers.get('content-type') || ''
    : '';
  const isHtml = contentType.includes('text/html');

  if (isHtml) {
    return getStoredForecastFromData(districtId, horizon);
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
    return getStoredForecastFromData(districtId, horizon);
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
