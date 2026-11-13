/* Provenance — required by __tests__/testQuality.test.js; do not remove.
 * # Captured from https://www.hazardnet.live/data/alerts-latest.json (committed as frontend/public/data/alerts-latest.json) on 2026-11-13 by `node scripts/capture_edge_fixtures.mjs`.
 * # Shape: object — hazardnet-alerts/v1 with the stamped policy block; first 2 PUBLISHED rows retained.
 * # To refresh: node scripts/capture_edge_fixtures.mjs (reads the committed artifact after an alert run).
 *
 * Leaf values are real: Chandpur district_id 60, severity_score 0.7062, state PUBLISHED;
 * policy.thresholds.watch_probability 0.4 and policy_source "builder".
 */
module.exports = {
  "schema": "hazardnet-alerts/v1",
  "generated_at": "2026-11-13T23:30:33.805Z",
  "policy_version": "alert-policy/1.0.0",
  "policy_source": "builder",
  "assessed": 64,
  "policy": {
    "version": "alert-policy/1.0.0",
    "source": "defaults",
    "overridden": [],
    "ignored": [],
    "warnings": [],
    "thresholds": {
      "watch_probability": 0.4,
      "warning_probability": 0.65,
      "watch_severity": 0.4,
      "divergence_watch": 0.3,
      "agreement_epsilon": 0.1
    },
    "human_in_the_loop": {
      "max_auto_publish_level": "WATCH",
      "requires_named_reviewer_above": "WATCH",
      "note": "PRODUCT_SPEC §1.6: the pipeline may publish at or below WATCH automatically; anything above it requires a named duty officer, and the reviewer identity is stored on the alert."
    },
    "calibration": {
      "calibrated_probability_required_for_warning": true,
      "note": "No calibration accuracy is claimed, so WARNING cannot be reached from model evidence alone: rows carry confidence_kind=model_softmax_top_class. WATCH and official-bulletin SEVERE remain available."
    },
    "disclaimer": "HazardNet is a research-based decision-support tool. It is not an official warning service. Always follow instructions from the Bangladesh Meteorological Department, FFWC and your local administration. In an emergency call 999 (national emergency), 1090 (disaster response), or 16123 (agriculture helpline)."
  },
  "transports": {
    "sms": {
      "channel": "sms",
      "provider": "none",
      "configured": false,
      "dry_run": false,
      "sender_id": "HazardNet",
      "max_per_run": 25,
      "base_url": null
    },
    "telegram": {
      "channel": "telegram",
      "configured": false
    }
  },
  "disclaimer": "HazardNet is a research-based decision-support tool. It is not an official warning service. Always follow instructions from the Bangladesh Meteorological Department, FFWC and your local administration. In an emergency call 999 (national emergency), 1090 (disaster response), or 16123 (agriculture helpline).",
  "alerts": [
    {
      "status": "assessed",
      "kind": "alert_assessment",
      "policy_version": "alert-policy/1.0.0",
      "level": "WATCH",
      "level_rank": 1,
      "district_id": 60,
      "district_name": "Chandpur",
      "division": "Chittagong",
      "pcode": "5769",
      "horizon": "15_days",
      "hazard_type": "Flash Flood",
      "target_date": "2026-11-20",
      "prediction_date": "2026-11-13",
      "lead_time_days": 7,
      "severity_score": 0.9,
      "confidence": 0.6798,
      "confidence_kind": "model_softmax_top_class",
      "reasons": [
        {
          "rule": "watch_softmax_proxy",
          "detail": "uncalibrated softmax 0.6798 ≥ watch threshold 0.4 — treated as a WATCH proxy, not as a calibrated probability",
          "track": "model"
        },
        {
          "rule": "watch_severity_band",
          "detail": "severity index 0.9 ≥ watch band 0.4",
          "track": "model"
        }
      ],
      "blockers": [
        {
          "rule": "warning_requires_calibration",
          "detail": "score 0.6798 ≥ warning threshold 0.65 but confidence_kind is model_softmax_top_class and no calibration accuracy is claimed",
          "track": "model"
        }
      ],
      "evidence": {
        "model": {
          "hazard_type": "Flash Flood",
          "severity": 0.9,
          "model_severity": 0.9,
          "confidence": 0.6798,
          "confidence_kind": "model_softmax_top_class",
          "confidence_published": "uncalibrated_model_softmax",
          "band": "high"
        },
        "physics": {
          "physics_severity": 0.9,
          "physics_agreement": "high",
          "divergence": 0,
          "divergence_source": "abs(model_severity - physics_severity)",
          "note": null
        },
        "official": {
          "bulletin_score": null,
          "source": null
        },
        "line": [
          "Chandpur · Flash Flood · 15_days",
          "lead time 7 d (target 2026-11-20)",
          "uncalibrated score 0.6798 (model_softmax_top_class)",
          "independent physics severity 0.9 (divergence 0)"
        ]
      },
      "freshness": {
        "prediction_date": "2026-11-13",
        "data_cutoff": "2026-11-13T22:56:08.230Z",
        "data_cutoff_source": "row.created_at",
        "age_hours": 0.57,
        "slo_hours": 48,
        "within_slo": true,
        "stale_soon": false
      },
      "provenance": {
        "model_version": "2.1.9+model.0bb5bdaf1789",
        "dataset_version": null,
        "pipeline_version": null,
        "run_id": null
      },
      "auto_publishable": true,
      "requires_human_review": false,
      "review_rule": "§1.6: WATCH may be published automatically",
      "disclaimer": "HazardNet is a research-based decision-support tool. It is not an official warning service. Always follow instructions from the Bangladesh Meteorological Department, FFWC and your local administration. In an emergency call 999 (national emergency), 1090 (disaster response), or 16123 (agriculture helpline).",
      "id": "2026-11-20__15_days__60__flash-flood__p2026-11-13",
      "state": "PUBLISHED"
    },
    {
      "status": "assessed",
      "kind": "alert_assessment",
      "policy_version": "alert-policy/1.0.0",
      "level": "WATCH",
      "level_rank": 1,
      "district_id": 45,
      "district_name": "Chuadanga",
      "division": "Khulna",
      "pcode": "5796",
      "horizon": "15_days",
      "hazard_type": "Flash Flood",
      "target_date": "2026-11-21",
      "prediction_date": "2026-11-13",
      "lead_time_days": 8,
      "severity_score": 0.9,
      "confidence": 0.6944,
      "confidence_kind": "model_softmax_top_class",
      "reasons": [
        {
          "rule": "watch_softmax_proxy",
          "detail": "uncalibrated softmax 0.6944 ≥ watch threshold 0.4 — treated as a WATCH proxy, not as a calibrated probability",
          "track": "model"
        },
        {
          "rule": "watch_severity_band",
          "detail": "severity index 0.9 ≥ watch band 0.4",
          "track": "model"
        }
      ],
      "blockers": [
        {
          "rule": "warning_requires_calibration",
          "detail": "score 0.6944 ≥ warning threshold 0.65 but confidence_kind is model_softmax_top_class and no calibration accuracy is claimed",
          "track": "model"
        }
      ],
      "evidence": {
        "model": {
          "hazard_type": "Flash Flood",
          "severity": 0.9,
          "model_severity": 0.9,
          "confidence": 0.6944,
          "confidence_kind": "model_softmax_top_class",
          "confidence_published": "uncalibrated_model_softmax",
          "band": "high"
        },
        "physics": {
          "physics_severity": 0.9,
          "physics_agreement": "high",
          "divergence": 0,
          "divergence_source": "abs(model_severity - physics_severity)",
          "note": null
        },
        "official": {
          "bulletin_score": null,
          "source": null
        },
        "line": [
          "Chuadanga · Flash Flood · 15_days",
          "lead time 8 d (target 2026-11-21)",
          "uncalibrated score 0.6944 (model_softmax_top_class)",
          "independent physics severity 0.9 (divergence 0)"
        ]
      },
      "freshness": {
        "prediction_date": "2026-11-13",
        "data_cutoff": "2026-11-13T22:56:08.230Z",
        "data_cutoff_source": "row.created_at",
        "age_hours": 0.57,
        "slo_hours": 48,
        "within_slo": true,
        "stale_soon": false
      },
      "provenance": {
        "model_version": "2.1.9+model.0bb5bdaf1789",
        "dataset_version": null,
        "pipeline_version": null,
        "run_id": null
      },
      "auto_publishable": true,
      "requires_human_review": false,
      "review_rule": "§1.6: WATCH may be published automatically",
      "disclaimer": "HazardNet is a research-based decision-support tool. It is not an official warning service. Always follow instructions from the Bangladesh Meteorological Department, FFWC and your local administration. In an emergency call 999 (national emergency), 1090 (disaster response), or 16123 (agriculture helpline).",
      "id": "2026-11-21__15_days__45__flash-flood__p2026-11-13",
      "state": "PUBLISHED"
    }
  ]
};
