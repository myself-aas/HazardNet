// Define shared types here
export interface PredictionRequest {
  // Example payload structure
  features: number[];
}

export interface PredictionResponse {
  hazard: string;
  severity: number;
}

// Re-export core forecast types and enums (TASK-004)
export {
  type ForecastRow,
  type AdvisoryTier,
  type HazardClass,
  ADVISORY_TIERS,
  HAZARD_CLASSES,
} from '../lib/forecasts';
