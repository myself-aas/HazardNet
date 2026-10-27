# `data/site-health/` — the probe's landing zone

One file lives here: **`latest.json`**, the machine-readable result of the most recent
*Site Health Probe* run (`.github/workflows/site-health.yml`).

| | |
|---|---|
| Writer | the probe workflow, on the ref that was probed, on every scheduled run (every 30 min) and on `workflow_dispatch` (Phase 5: a dispatch on a verification branch writes to that branch, never to `main`) |
| Schema | `hazardnet-site-probe/v1` — `ran_at`, `run_url`, `site_url`, `outcome` (`pass`/`fail`), `checks[]` (`id`, `outcome`, `detail`). A non-`success` check **must** carry a `detail` naming the missing field; `scripts/verify_site_health_record.mjs` rejects one that does not. |
| Committed? | **Yes** — the derived freshness artifact quotes it and the public `/status` page renders it. The commit message carries `[skip ci]`. |
| Served at | `/data/site-health/latest.json` — `scripts/copy-dist.mjs` copies it into the deploy output at the next ordinary build. The probe's own commits deliberately trigger **no** Pages build, so the CDN copy can lag by up to one deploy; the repo file and the run artifact are canonical. |
| Hand-editable? | **No.** It is a record of what a probe run actually observed. Editing it by hand would make the status page state something no run measured — the exact failure the page exists to expose |

The checks it records are the ones a visitor depends on: the homepage, the deep links, the
security headers, the sitemap (every listed URL must resolve), the forecast and alerts data
paths, the weather proxy (single + batch), the runtime sibling paths, and the status page plus
its artifact. `runtime_paths` is the Phase 5 answer to a single-step monitor being a
single-point-of-blindness monitor: `scripts/probe_runtime_paths.mjs` asserts a scenario for
ANALYTICS bound/unbound (204 fail-open + 400 validation), cache hit/miss, mini/full shape,
POST-only vs GET telemetry and GET/POST batch. A check that did not run is recorded as a
non-`success` outcome and counts as a failure: "we did not check" is not "it passed".

**Why this file is here at all.** Before Phase 5 the newest committed record was
`2026-10-27T14:43:47Z` and listed 8 checks — none of them `alerts_api` or `weather_api`,
even though the workflow had gained those steps. `/data/site-health/latest.json` was not a
URL at all: the file lived in the repo root, which Pages does not publish. The publish step
also ran *before* the aggregate check, so a broken site's record was easy to lose. Now the
aggregate check runs first, every publish step has `if: always()`, the record is verified
against the run summary and the derived artifact, and the CDN URL is produced at build time.

When the repository's workflow permissions are read-only, the workflow still writes this file
and uploads it as a run artifact, but cannot commit it; the publish step degrades to a warning
and says so (`docs/ops/owner-actions.md`, Action 9).

Regenerate the derived artifact after a new result lands:

```bash
node scripts/build_freshness_artifact.mjs      # rewrites frontend/public/data/freshness.json
node scripts/build_freshness_artifact.mjs --check   # verifies it still describes its inputs
```
