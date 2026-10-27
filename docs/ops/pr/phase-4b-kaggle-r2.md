# Scheduled follow-up PR · `feat/kaggle-r2-artifact`

**Dated:** 2026-10-27 (Phase 4). **Status:** scheduled, not started. **Owner action:** Action 24.
**Why a separate PR:** `/api/v1/kaggle` still has a browser caller
(`frontend/src/hooks/useKaggleAdvisories.ts`). Deleting it in Phase 4 would have removed a
real (if currently degrading) data path for the length of a review.

This document is the plan the next PR implements. It is not a claim that the work is done.

## Confirmed V8 incompatibility

Captured from `backend/services/kaggleAdvisoryClient.js`:

```
22:import { inflateRawSync } from 'node:zlib';
23:import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
103:      if (method === 8) return inflateRawSync(data).toString('utf8');
174:    headers.Authorization = `Basic ${auth}`;
```

A Pages Function has no `node:zlib`, no `node:fs`, no filesystem that outlives the request,
and must not hold Kaggle Basic credentials at the edge. A direct port is therefore not
possible; a second implementation of the parser is the drift this sweep exists to remove.

## The shape: pipeline writes, Function reads

```
GitHub Actions (daily_advisory_ingest.yml, has KAGGLE_USERNAME / KAGGLE_KEY)
    │  fetch ZIP → inflateRawSync → parse CSV → validate rows
    ▼
R2 bucket object  advisories/<horizon>/latest.json
    { schema: "hazardnet-kaggle-advisories/v1",
      horizon, generated_at, prediction_date, row_count, rows: [...] }
    │  R2 binding (dashboard, Production only)
    ▼
functions/api/v1/kaggle.ts  GET ?horizon=7_days|15_days
    │  assertAdvisoryRows(artifact) — value assertion, never a bare `rows: []`
    ▼
200 with the Node envelope  |  503 with a named reason when the artifact is hollow
```

- **No credentials at the edge.** Basic auth stays in Actions.
- **No ZIP inflate per request.** The pipeline parses once per day.
- **No per-isolate disk cache.** R2 is the cache, with a CDN `max-age=300` in front.
- **Free tier only.** R2 reads are inside 10M/month; no new npm dependency.
- **`PUSH_TO_API` stays `false`.** The pipeline writes an artifact; the Function is read-only.

## Files the PR will touch

| File | Change |
|---|---|
| `scripts/write_kaggle_artifact.mjs` (new) | Reuse `fetchAdvisoryFile`/parser, write the validated rows to R2 via the Wrangler API or `aws4fetch` if already present; otherwise use `wrangler r2 object put` from the workflow (no new dependency). |
| `.github/workflows/daily_advisory_ingest.yml` | New step after CSV validation, using the existing `KAGGLE_*` + `CF_R2_*` secrets. |
| `functions/api/v1/kaggle.ts` (new) | `onRequestGet` reads the R2 binding, runs `assertAdvisoryRows`, returns the Node envelope or a named 503. |
| `backend/utils/kaggleRows.js` (new, shared) | `assertAdvisoryRows` — one value assertion used by the pipeline writer and the Function. |
| `__tests__/pagesKaggle.test.js` (new) | Provenance fixture captured from the written artifact; one leaf assertion per entity; hollow-artifact 503 case. |
| `docs/ops/route-register.json` | Move `/api/v1/kaggle` and `/api/v1/kaggle/advisories` from dispositions to `edgeRoutes`. |
| `docs/ops/owner-actions.md` | Close Action 24 with the owner's name, date and the verify `curl` output. |

## Exit criteria

1. `curl -sS 'https://www.hazardnet.live/api/v1/kaggle?horizon=7_days' |
   jq '.rows[0] | {prediction_date, severity_score}'` returns two non-null values.
2. Body `generated_at` equals the R2 artifact's; a hollow artifact answers 503 with
   `detail` naming the missing field, never `200 {rows: []}`.
3. `site-health.yml` gains a `kaggle_api` check that requires a numeric leaf, in the same
   value-assertion style as `weather_api`.
4. `__tests__/routeReachability.test.js` still passes with the route moved to `edgeRoutes`.
