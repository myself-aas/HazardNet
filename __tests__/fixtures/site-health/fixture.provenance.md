# Fixture provenance — `site-health/`

| file | source | captured | why |
|---|---|---|---|
| `healthy-record.json` | Hand-assembled from the schema in `.github/workflows/site-health.yml` (`jq -n` block, `hazardnet-site-probe/v1`) and the real committed record `data/site-health/latest.json` @ `2026-10-27T14:43:47Z` (run [40523871728](https://github.com/myself-aas/HazardNet/actions/runs/40523871728), fetched 2026-10-27). The `weather_api` and `runtime_paths` entries are the two checks Phase 5 adds; they were **not** present in the 14:43 record — that absence is the defect being fixed. `main` later published a 10-check record at 19:43:55Z (run [40571687781](https://github.com/myself-aas/HazardNet/actions/runs/40571687781)) containing `weather_api` but still no `runtime_paths`; the fixture intentionally stays on the 14:43 shape plus Phase 5's two checks so it remains deterministic. Values are not claimed as a live observation. | 2026-10-27 | Exercises the verifier's healthy path without depending on a live workflow run. |
| `healthy-freshness.json` | Derived from `healthy-record.json` by `scripts/build_freshness_artifact.mjs`'s `site_probe` shape (`ran_at`, `generated_at`, `outcome`, `state`, `detail.checks`, `detail.failed`). | 2026-10-27 | Parity target for the derived artifact. |
| `healthy-summary.md` | Verbatim format of the workflow's `Publish machine-readable probe result` `$GITHUB_STEP_SUMMARY` writer after Phase 5. | 2026-10-27 | Parity target for the run summary. |

Broken, hollow and mismatched variants are produced **in the test** by mutating these three
fixtures in a temp directory; they are not checked in, so there is only one canonical healthy
shape to keep in sync. The mutation points are named in `__tests__/siteHealthRecord.test.js`.

The runtime sibling scenarios are exercised against a local `node:http` mock in the same test
file; the mock's leaf value `current.temperature_2m = 31.1` comes from the provenance-backed
`backend/utils/__tests__/fixtures/openMeteoSingleObject.js` (captured from
`https://api.open-meteo.com/v1/forecast` on 2026-10-27).
