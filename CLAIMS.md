# HazardNet Public Claims Registry

Version: 1.0.0
Updated: 2026-09-29
Compliance: PRD REQ-005, TRD §10

This document serves as the authoritative, audit-enforced registry of all public headline metrics, numeric performance figures, and scientific verification claims made across HazardNet public surfaces (landing page, documentation, API responses, and promotional metadata).

Per **PRD REQ-005** and **TRD §10**, every public quantitative claim MUST be registered here with its stated methodological limitations. CI fails the build if any numeric performance or verification claim appears in public files without a matching registry entry.

---

## 1. Registry of Public Claims & Methodological Limitations

| Claim ID | Metric / Claim | Canonical Value | Scope / Surface | Methodological Limitations & Verification Boundaries |
| :--- | :--- | :--- | :--- | :--- |
| **CLM-001** | District Coverage | 64 | Nationwide Map & API | Covers all 64 official administrative districts of Bangladesh per BBS 2022 census; spatial boundaries follow Survey of Bangladesh and FAO GAUL 2015. Excludes non-recognized enclave boundaries. |
| **CLM-002** | Administrative Divisions | 8 | Spatial Hierarchy | Covers the 8 administrative divisions (Barisal, Chattogram, Dhaka, Khulna, Mymensingh, Rajshahi, Rangpur, Sylhet). Sub-district (Upazila) boundaries are not modeled in v4. |
| **CLM-003** | Climatic Hazard Classes | 8 | Classification Engine | Evaluates 8 distinct hazard classes: Cold Wave, Drought, Fire, Flash Flood, Flood, Heat Wave, Severe Local Storm, and Tropical Cyclone. Compound simultaneous hazards are categorized by dominant triggering physical driver. |
| **CLM-004** | Forecast Horizons | 2 | Advisory Pipeline | Standardized into 7_days (tactical agrometeorological outlook) and 15_days (strategic planning horizon). Numerical weather prediction (NWP) boundary dispersion grows non-linearly beyond day 7. |
| **CLM-005** | Daily Ingestion Row Count | 128 | Pipeline CSV Schema | Fixed product of 64 districts × 2 horizons = 128 rows per daily run. Ingestion fails-fast if row count deviates or any district is omitted. |
| **CLM-006** | Historical Disaster Events | 3,062 | Historical Archive & Catalog | 3,062 verified clean disaster event records from `BGD_climatic_hazards_dataset_2000_2026.csv`. Harmonized across EM-DAT, DDM, and BMD; observational density before 2005 has higher reporting variance. |
| **CLM-007** | Multilateral Master Events | 70 | GLIDE Event Dossiers | 70 major disaster events documented in `HazardNet_Master_Dataset_Final.csv` with official GLIDE codes (`^[A-Z]{2}-\d{4}-\d{6}-BGD$`) and multilateral situation links. Restricted to major events tracked by international agencies. |
| **CLM-008** | Historical Chronological Span | 26 (2000–2026) | Trend Analysis | 26-year temporal trajectory spanning calendar years 2000 through 2026. Satellite remote-sensing baselines (MODIS/Landsat) vary in revisit cadence across the timeline. |
| **CLM-009** | Advisory Tiers | 4 | Alert Hierarchy | 4 discrete operational tiers: SEVERE (#DC2626), WARNING (#D97706), WATCH (#CA8A04), and NORMAL (#16A34A). Reflects meteorological impact probability and physical severity, not civil defense evacuation orders. |
| **CLM-010** | Data Staleness Guard | 36 hours | Freshness Monitor | Automated advisory records older than 36 hours trigger operational staleness banners and Slack alerts. System relies on NTP-synchronized UTC timestamps. |
| **CLM-011** | Public API p95 Latency | < 300 ms | API Contract (§6.1, §9.1) | Measured under 500 concurrent public readers on warm cache / CDN-edge or regional Firestore. Excludes client cellular last-mile wireless latency. |
| **CLM-012** | Mobile LCP on 3G | < 2.5 s | Landing Performance (§9.1) | Largest Contentful Paint target evaluated on simulated throttled 3G profile (400ms RTT, 1.6 Mbps download) excluding dynamic vector map tile payloads. |
| **CLM-013** | Accessibility Score | ≥ 95 | WCAG 2.2 AA (§13) | Lighthouse automated accessibility score evaluated on primary public views. Excludes third-party raster map tile contrast limitations. |
| **CLM-014** | Out-of-Distribution Threshold | 0.40 | Confidence Guardrail | Confidence scores < 0.40 prevent single-hazard classification assertions and display uncertainty advisories. Heuristic threshold; does not guarantee detection of all unmodeled atmospheric anomalies. |
| **CLM-015** | Mobile Model Size Budget | ≤ 100 MB | Edge AI Engine | Target compressed on-device model payload. Serverless cloud pipeline utilizes full FP32 multi-head fusion weights. |
| **CLM-016** | Edge Inference Latency | ≤ 80 ms | Client Runtime | Target latency on mobile-class quad-core CPU (ARM Cortex-A55 reference). Cloud serving uses batched inference. |

---

## 2. Enforcement Protocol

1. **Pre-commit & CI Gate**: `scripts/verify_claims.mjs` scans all public files (README, docs, frontend copy) for numeric performance claims.
2. **Missing Claims**: Any unregistered metric or numerical statement immediately halts the build with exit code 1.
3. **Modification**: Any change to headline performance figures requires updating this registry alongside methodological limitation documentation and PR review.
