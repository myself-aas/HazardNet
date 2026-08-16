CREATE TABLE IF NOT EXISTS forecasts (
    id              SERIAL PRIMARY KEY,
    district_id     INTEGER NOT NULL,
    district_name   VARCHAR(100) NOT NULL,
    horizon         VARCHAR(20) NOT NULL CHECK (horizon IN ('7_days', '15_days')),
    hazard_type     VARCHAR(50) NOT NULL,
    severity_score  FLOAT NOT NULL CHECK (severity_score >= 0 AND severity_score <= 1),
    confidence      FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    target_date     DATE NOT NULL,
    prediction_date DATE NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups by district + horizon
CREATE INDEX IF NOT EXISTS idx_forecasts_district_horizon 
    ON forecasts(district_id, horizon, prediction_date DESC);

-- Index for bulk queries (Mapbox heatmap)
CREATE INDEX IF NOT EXISTS idx_forecasts_horizon_date 
    ON forecasts(horizon, prediction_date DESC);

-- Unique constraint to prevent duplicate entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_forecasts_unique 
    ON forecasts(district_id, horizon, prediction_date);