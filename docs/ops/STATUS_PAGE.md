# The public status page (`/status`)

**What it is:** a page that states what the deployment's own committed artifacts say about the
freshness, coverage and provenance of the data it ships — and what the last scheduled
site-health probe found on the live surface. It exists because the alternative is a user (or a
reviewer, or a duty officer) having to guess whether the numbers in front of them are current.

**Route:** `/status` · **Panel:** `frontend/src/components/status/FreshnessPanel.tsx` ·
**Client:** `frontend/src/lib/freshness.ts` · **Artifact:**
`frontend/public/data/freshness.json` · **Producer:**
`scripts/build_freshness_artifact.mjs` · **Copy:** the `/status` entry in
`frontend/src/content/site-routes.json` (shared with the prerenderer).

---

## 1. The data path

```
backend/data/forecasts/manifest.json ─┐
frontend/public/data/forecasts-latest.json ─┤
frontend/public/data/alerts-latest.json ────┼─→ scripts/build_freshness_artifact.mjs
data/site-health/latest.json ───────────────┘        │
                                                     ▼
                                    frontend/public/data/freshness.json  (schema hazardnet-freshness/v1)
                                                     │
                        ┌────────────────────────────┴───────────────────────────┐
                        ▼                                                        ▼
        prerender.mjs renders it into dist/status/index.html        FreshnessPanel.tsx fetches it at runtime
        (crawlers/no-JS/first paint see real figures)               (same numbers, same file)
```

The artifact is rebuilt:

* by `daily_forecast.yml` and `weekly_forecast.yml`, in the same commit as the data it
  describes;
* by `site-health.yml`, after it writes a new probe result;
* by hand, when either of those has not run: `node scripts/build_freshness_artifact.mjs`.

`node scripts/build_freshness_artifact.mjs --check` fails when the committed artifact no longer
matches the committed inputs. It is deliberately blind to the clock: it compares the
time-independent projection (schema, coverage, model provenance, source identities and
timestamps), because a gate that fails merely because a day passed gets switched off.

## 2. What each state means

| State | Meaning |
| ----- | ------- |
| **Within SLO** | the source is present and its age is inside its SLO: 192 h forecast data (`monitoring/alerts.yml`), 48 h alert snapshot (`lib/alerts.ts` `freshnessOf`), 2 h probe result (four missed 30-minute runs) |
| **Past SLO** | present but older than its SLO; the age and the SLO are both printed so the gap can be read |
| **Checks failing** | the last probe run reported at least one failed check; the checks table names them |
| **No data** | the artifact the source describes is not present in this deployment |
| **Unknown** | the artifact could not be read, or it lacks the timestamp an age would need |

`No data` and `Unknown` are distinct on purpose: one says the file is missing, the other says we
cannot tell. An unknown age is rendered `—`, never `0 h`.

## 3. What the page deliberately does not claim

* **Not an uptime report.** No uptime history is kept and no percentage is computed.
* **Not a live probe.** Freshness describes committed files. The live surface is the probe row.
* **No districts named that the run did not name.** If the coverage stamp does not list the
  missing districts, the page says the run did not report them.
* **No model version that does not exist.** While the pipeline stamps none, the provenance row
  reads *Not stamped* and the §1.6 publication gate stays closed above `WATCH`.
* **English only, on purpose.** Every value on the page is an artifact key or a file path, both
  English; the bilingual surface in this product is the alert UI a duty officer reads in the
  field (`docs/frontend/ALERT_UI.md`).

## 4. If something looks wrong

| Symptom | First check |
| ------- | ----------- |
| A source is **Past SLO** | the pipeline workflow runs for that source; `git log --oneline -- frontend/public/data/forecasts-latest.json` |
| The probe row is **Unknown** | no result has been committed: run or dispatch `site-health.yml` (owner Action 9 for the write permission) |
| The probe row is **Checks failing** | the checks table names the failed checks; today that is the deployment-root problem (owner Action 7) |
| The panel says the artifact **could not be loaded** | `frontend/public/data/freshness.json` is missing from the build output; `node scripts/build_freshness_artifact.mjs` then rebuild |
| `--check` fails in CI | a data commit moved without regenerating the artifact; run the builder and commit the result |

## 5. Pins (do not weaken)

* `frontend/src/lib/freshness.ts` refuses any payload whose `schema` is not
  `hazardnet-freshness/v1`, and downgrades unknown state strings to `unknown`.
* The artifact never carries a `model_version` the snapshot does not have (`--check` and
  `test_status_surface.py` both fail if it does).
* `/status` is indexable (`robots: index,follow`) and listed in the sitemap; its `sitemap`
  entry must be `{ "changefreq": …, "priority": … }` because the prerenderer calls
  `.toFixed(1)` on the priority — a bare `true` crashed the build once.
* `data/site-health/latest.json` is never edited by hand (`data/site-health/README.md`).
