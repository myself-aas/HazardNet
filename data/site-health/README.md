# `data/site-health/` — the probe's landing zone

One file lives here: **`latest.json`**, the machine-readable result of the most recent
*Site Health Probe* run (`.github/workflows/site-health.yml`).

| | |
|---|---|
| Writer | the probe workflow, on the default branch, on every scheduled run (every 30 min) and on `workflow_dispatch` |
| Schema | `hazardnet-site-probe/v1` — `ran_at`, `run_url`, `site_url`, `outcome` (`pass`/`fail`), `checks[]` (`id`, `outcome`, `detail`) |
| Committed? | **Yes** — the derived freshness artifact quotes it and the public `/status` page renders it |
| Hand-editable? | **No.** It is a record of what a probe run actually observed. Editing it by hand would make the status page state something no run measured — the exact failure the page exists to expose |

The checks it records are the ones a visitor depends on: the homepage, the deep links, the
security headers, the sitemap (every listed URL must resolve), the forecast data path, and the
status page plus its artifact. A check that did not run is recorded as a non-`success` outcome
and counts as a failure: "we did not check" is not "it passed".

When the repository's workflow permissions are read-only, the workflow still writes this file
and uploads it as a run artifact, but cannot commit it; the publish step degrades to a warning
and says so (`docs/ops/owner-actions.md`, Action 9).

Regenerate the derived artifact after a new result lands:

```bash
node scripts/build_freshness_artifact.mjs      # rewrites frontend/public/data/freshness.json
node scripts/build_freshness_artifact.mjs --check   # verifies it still describes its inputs
```
