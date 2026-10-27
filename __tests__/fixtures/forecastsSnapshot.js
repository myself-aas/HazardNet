/* Provenance — required by __tests__/testQuality.test.js; do not remove.
 * # Captured from https://www.hazardnet.live/data/forecasts-latest.json (committed as frontend/public/data/forecasts-latest.json) on 2026-10-27 by `node scripts/capture_edge_fixtures.mjs`.
 * # Shape: object — hazardnet-forecast-snapshot/v2; first 2 rows of 7_days and first 1 of 15_days retained.
 * # To refresh: node scripts/capture_edge_fixtures.mjs (reads the committed artifact after an ingest).
 *
 * Leaf values are real: Bagerhat district_id 40, severity_score 0.6721, advisory_tier WARNING.
 * The full 64-row artifact is read directly by __tests__/routeValueAssertions.test.js.
 */
module.exports = {
  "schema": "hazardnet-forecast-snapshot/v2",
  "generated_at": "2026-10-25T10:49:05.018Z",
  "prediction_date": "2026-10-24",
  "source": "Kaggle 8-hazardnet-advisory (daily ingestion pipeline)",
  "kernel": "hazardnet/forecast-pipeline",
  "horizons": {
    "7_days": [
      {
        "district_id": 40,
        "district_name": "Bagerhat",
        "horizon": "7_days",
        "hazard_type": "Flash Flood",
        "severity_score": 0.6721,
        "confidence": 0.8627,
        "target_date": "2026-10-31",
        "prediction_date": "2026-10-24",
        "model_severity": 0.7154,
        "model_severity_raw": 0.9787,
        "physics_severity": 0.4,
        "final_severity": 0.6721,
        "latitude": 22.3744,
        "longitude": 89.739,
        "prob_top1": 0.8627,
        "prob_top2": 0.0686,
        "prob_top3": 0.0412,
        "temperature_max": 32.9,
        "temperature_min": 23.7,
        "precipitation_mm": 18.3,
        "wind_max_kmh": 11.2,
        "advisory_tier": "WARNING",
        "division": "Khulna",
        "pcode": "5795",
        "data_source": "Kaggle_Daily_Advisory",
        "model_version": "2.1.9+model.0bb5bdaf1789",
        "physics_override": false,
        "advisory_tier_source": "published",
        "requires_review": true
      },
      {
        "district_id": 64,
        "district_name": "Bandarban",
        "horizon": "7_days",
        "hazard_type": "Tropical Cyclone",
        "severity_score": 0.2316,
        "confidence": 0.9556,
        "target_date": "2026-10-31",
        "prediction_date": "2026-10-24",
        "model_severity": 0.2307,
        "model_severity_raw": 0.066,
        "physics_severity": 0.25,
        "final_severity": 0.2316,
        "latitude": 21.8042,
        "longitude": 92.3638,
        "prob_top1": 0.9556,
        "prob_top2": 0.0161,
        "prob_top3": 0.0149,
        "temperature_max": 30.9,
        "temperature_min": 21,
        "precipitation_mm": 20.2,
        "wind_max_kmh": 8.5,
        "advisory_tier": "NORMAL",
        "division": "Chittagong",
        "pcode": "5767",
        "data_source": "Kaggle_Daily_Advisory",
        "model_version": "2.1.9+model.0bb5bdaf1789",
        "physics_override": false,
        "advisory_tier_source": "published",
        "requires_review": false
      }
    ],
    "15_days": [
      {
        "district_id": 40,
        "district_name": "Bagerhat",
        "horizon": "15_days",
        "hazard_type": "Flash Flood",
        "severity_score": 0.6721,
        "confidence": 0.8627,
        "target_date": "2026-11-08",
        "prediction_date": "2026-10-24",
        "model_severity": 0.7154,
        "model_severity_raw": 0.9787,
        "physics_severity": 0.4,
        "final_severity": 0.6721,
        "latitude": 22.3744,
        "longitude": 89.739,
        "prob_top1": 0.8627,
        "prob_top2": 0.0686,
        "prob_top3": 0.0412,
        "temperature_max": 32.9,
        "temperature_min": 21,
        "precipitation_mm": 19.5,
        "wind_max_kmh": 11.2,
        "advisory_tier": "WARNING",
        "division": "Khulna",
        "pcode": "5795",
        "data_source": "Kaggle_Daily_Advisory",
        "model_version": "2.1.9+model.0bb5bdaf1789",
        "physics_override": false,
        "advisory_tier_source": "published",
        "requires_review": true
      }
    ]
  }
};
