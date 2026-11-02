/* Provenance — required by __tests__/testQuality.test.js; do not remove.
 * # Captured from https://www.hazardnet.live/data/forecasts-latest.json (committed as frontend/public/data/forecasts-latest.json) on 2026-11-02 by `node scripts/capture_edge_fixtures.mjs`.
 * # Shape: object — hazardnet-forecast-snapshot/v2; first 2 rows of 7_days and first 1 of 15_days retained.
 * # To refresh: node scripts/capture_edge_fixtures.mjs (reads the committed artifact after an ingest).
 *
 * Leaf values are real: Bagerhat district_id 40, severity_score 0.6721, advisory_tier WARNING.
 * The full 64-row artifact is read directly by __tests__/routeValueAssertions.test.js.
 */
module.exports = {
  "schema": "hazardnet-forecast-snapshot/v2",
  "generated_at": "2026-11-02T18:16:56.822Z",
  "prediction_date": "2026-11-01",
  "source": "Kaggle_Daily_Advisory (public_daily_advisories.yml, dataset v42)",
  "kernel": "hazardnet/forecast-pipeline",
  "horizons": {
    "7_days": [
      {
        "district_id": 40,
        "district_name": "Bagerhat",
        "horizon": "7_days",
        "hazard_type": "Flash Flood",
        "severity_score": 0.3,
        "confidence": 0.981,
        "target_date": "2026-11-03",
        "prediction_date": "2026-11-01",
        "model_severity": 0.3,
        "model_severity_raw": 0.9996,
        "physics_severity": 0.3,
        "final_severity": 0.3,
        "latitude": 22.6516,
        "longitude": 89.7859,
        "prob_top1": 0.981,
        "prob_top2": 0.0143,
        "prob_top3": 0.0022,
        "temperature_max": 31,
        "temperature_min": 25.8,
        "precipitation_mm": 0.6,
        "wind_max_kmh": 7.3,
        "advisory_tier": "WATCH",
        "division": "Khulna",
        "pcode": "5795",
        "data_source": "Kaggle_Daily_Advisory",
        "model_version": "2.1.9+model.0bb5bdaf1789",
        "confidence_kind": "model_softmax_top_class",
        "physics_override": true,
        "advisory_tier_source": "published",
        "requires_review": false
      },
      {
        "district_id": 64,
        "district_name": "Bandarban",
        "horizon": "7_days",
        "hazard_type": "Tropical Cyclone",
        "severity_score": 0.3,
        "confidence": 0.3422,
        "target_date": "2026-11-03",
        "prediction_date": "2026-11-01",
        "model_severity": 0.3,
        "model_severity_raw": 0.4391,
        "physics_severity": 0.3,
        "final_severity": 0.3,
        "latitude": 21.8311,
        "longitude": 92.3686,
        "prob_top1": 0.3422,
        "prob_top2": 0.3182,
        "prob_top3": 0.3,
        "temperature_max": 29.2,
        "temperature_min": 22.2,
        "precipitation_mm": 0,
        "wind_max_kmh": 10.3,
        "advisory_tier": "WATCH",
        "division": "Chittagong",
        "pcode": "5767",
        "data_source": "Kaggle_Daily_Advisory",
        "model_version": "2.1.9+model.0bb5bdaf1789",
        "confidence_kind": "model_softmax_top_class",
        "physics_override": true,
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
        "severity_score": 0.3,
        "confidence": 0.981,
        "target_date": "2026-11-03",
        "prediction_date": "2026-11-01",
        "model_severity": 0.3,
        "model_severity_raw": 0.9996,
        "physics_severity": 0.3,
        "final_severity": 0.3,
        "latitude": 22.6516,
        "longitude": 89.7859,
        "prob_top1": 0.981,
        "prob_top2": 0.0143,
        "prob_top3": 0.0022,
        "temperature_max": 31,
        "temperature_min": 25.8,
        "precipitation_mm": 0.6,
        "wind_max_kmh": 7.3,
        "advisory_tier": "WATCH",
        "division": "Khulna",
        "pcode": "5795",
        "data_source": "Kaggle_Daily_Advisory",
        "model_version": "2.1.9+model.0bb5bdaf1789",
        "confidence_kind": "model_softmax_top_class",
        "physics_override": true,
        "advisory_tier_source": "published",
        "requires_review": false
      }
    ]
  }
};
