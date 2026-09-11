-- scripts/db/001_init_forecasts.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS forecasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    district_id INT NOT NULL,
    district_name VARCHAR(100) NOT NULL,
    horizon VARCHAR(20) NOT NULL CHECK (horizon IN ('10_days', '20_days', '30_days')),
    hazard_type VARCHAR(50) NOT NULL,
    confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    severity_score FLOAT NOT NULL CHECK (severity_score >= 0 AND severity_score <= 1),
    target_date DATE NOT NULL,
    prediction_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(district_id, horizon, target_date)
);

-- Index for fast Mapbox GL / Leaflet bulk queries
CREATE INDEX IF NOT EXISTS idx_forecasts_horizon_date ON forecasts(horizon, prediction_date DESC);
-- Index for district-specific frontend queries
CREATE INDEX IF NOT EXISTS idx_forecasts_district ON forecasts(district_id, horizon, target_date DESC);
