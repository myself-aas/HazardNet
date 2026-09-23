// Define shared types here
export interface PredictionRequest {
  // Example payload structure
  features: number[];
}

export interface PredictionResponse {
  hazard: string;
  severity: number;
}
