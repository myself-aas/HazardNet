/**
 * The API's snapshot-backed read path — envelopes built from the committed artifact
 * `frontend/public/data/forecasts-latest.json` (`schema: hazardnet-forecast-snapshot/v2`).
 *
 * WHY THIS EXISTS
 * The Node runtimes (`backend/routes/*` behind Express, `serverless/v1/*` behind `api/`)
 * read Firestore first and fall back to the same committed snapshot. On Cloudflare Pages
 * Functions that fallback *is* the whole story, for three reasons that all point the same
 * way:
 *
 *   1. **No `fs`, no `firebase-admin`.** `backend/db.js` and `backend/forecastStore.js` are
 *      Node modules (gRPC, native deps) and cannot be bundled into a Worker.
 *   2. **Cost.** Firestore's Spark plan allows 50k reads/day. A Function that queries the
 *      store on every map load and every probe spends that budget on data that is already
 *      published as a static asset — the same budget `docs/ops/owner-actions.md` Action 10
 *      exists to protect. Reading the deployed asset costs no reads at all.
 *   3. **Coherence.** The site's primary read path is `/data/*.json` (ADR 0008), and the
 *      client already falls back to that file when the API is unavailable. Serving the API
 *      from the same bytes means the two can never disagree about what "the latest
 *      forecast" is — the failure mode where the API says one thing and the map's fallback
 *      says another cannot occur.
 *
 * The envelopes are deliberately **identical in shape** to the Node handlers'
 * (`serverless/v1/forecasts/{bulk,metadata}.js`), so the client's `parseBulkResponse` and
 * `fetchForecastMetadata` do not branch on which runtime answered. Query validation is not
 * re-implemented here either — the routes call `parseBulkQuery` from `./forecastServe.js`,
 * so an invalid horizon gets the same 400 and the same message on every runtime.
 *
 * KEEP THIS MODULE PLATFORM-NEUTRAL: no node built-ins. It is bundled into a Pages
 * Function; the only host object it touches is the `ASSETS` binding passed in by the caller.
 */

/** The committed snapshot, served as a static asset from the deployment root. */
export const FORECAST_SNAPSHOT_PATH = '/data/forecasts-latest.json';

/** Same default as `metadataDataSource()` in `./forecastServe.js` — one label, two runtimes. */
export const DEFAULT_DATA_SOURCE = 'hazardnet/weekly-forecasts';

/** Provenance of the weekly run, served by `/metadata` on both runtimes. */
export const NOTEBOOK_SOURCE = 'hazardnet/forecast-pipeline';

/**
 * The `data_source` label for a response. On the edge the override is a plain Pages
 * environment variable (`FORECAST_DATASET` in the Production scope), not `process.env`,
 * which does not exist in a Worker. Unset is the supported mode and yields the same
 * default the Node runtime uses.
 */
export function snapshotDataSource(env) {
  const configured = env && typeof env.FORECAST_DATASET === 'string' ? env.FORECAST_DATASET.trim() : '';
  return configured || DEFAULT_DATA_SOURCE;
}

/**
 * Read the snapshot through the Pages `ASSETS` binding.
 *
 * `env.ASSETS.fetch` is the documented way for a Function to read a static asset, and it
 * is not a network hop: Pages serves the asset internally and applies the `_headers` rules
 * to the response (which is why the `/data/*` revalidate rule applies here too). A
 * same-origin `fetch()` would be the wrong call — it re-enters the edge, and if `/data/*`
 * were ever added to the Function routes it would recurse.
 *
 * Returns `{ snapshot }` or `{ error }`. Errors are values rather than exceptions because
 * every caller turns them into a specific HTTP status, and a 503 that names the reason is
 * more useful in a probe log than a generic 500.
 */
export async function loadForecastSnapshot(env, request) {
  const assets = env && env.ASSETS;
  if (!assets || typeof assets.fetch !== 'function') {
    return { error: 'the ASSETS binding is not available to this Function' };
  }

  let response;
  try {
    response = await assets.fetch(
      new Request(new URL(FORECAST_SNAPSHOT_PATH, request.url), {
        headers: { accept: 'application/json' },
      })
    );
  } catch (error) {
    return { error: `the snapshot asset could not be read (${error && error.message ? error.message : 'unknown error'})` };
  }

  if (!response || !response.ok) {
    return { error: `the snapshot asset answered ${response ? response.status : 'no response'}` };
  }

  let snapshot;
  try {
    snapshot = await response.json();
  } catch {
    return { error: 'the snapshot asset is not JSON' };
  }

  if (!snapshot || typeof snapshot !== 'object' || !snapshot.horizons || typeof snapshot.horizons !== 'object') {
    return { error: 'the snapshot asset is not a hazardnet-forecast-snapshot' };
  }

  return { snapshot };
}

/** Rows for one horizon, defensively: a malformed horizon yields an empty list, not a crash. */
export function snapshotRows(snapshot, horizon) {
  const rows = snapshot && snapshot.horizons ? snapshot.horizons[horizon] : undefined;
  return Array.isArray(rows) ? rows : [];
}

/**
 * `GET /api/v1/forecasts/bulk` — the same envelope as the Node handler:
 * `{ horizon, count, generated_at, data_source, forecasts }`.
 *
 * `generated_at` is the response time, matching the Node runtime (whose value is also the
 * response time, including on its snapshot fallback). It is **not** a freshness claim: the
 * data's own dates are `prediction_date` and `target_date` on each row, and `/metadata`
 * exposes `ingestion_timestamp` for anything that needs to age the artifact.
 */
export function bulkEnvelopeFromSnapshot(snapshot, horizon, { dataSource, generatedAt } = {}) {
  const rows = snapshotRows(snapshot, horizon);
  return {
    horizon,
    count: rows.length,
    generated_at: generatedAt || new Date().toISOString(),
    data_source: dataSource || DEFAULT_DATA_SOURCE,
    forecasts: rows,
  };
}

/**
 * `GET /api/v1/forecasts/metadata` — the freshness headline, from the artifact itself.
 *
 * Field-by-field against the Node handler, so the two can be compared without reading both:
 *
 *   - `prediction_date` — the snapshot's own `prediction_date`, falling back to the newest
 *     `prediction_date` across rows (the same rule `fetchSnapshotMetadata` uses client-side).
 *   - `ingestion_timestamp` — the snapshot's `generated_at`: when the artifact was built,
 *     which is the edge equivalent of "when the latest rows landed".
 *   - `row_count` — total rows across horizons, which is what the Node handler's
 *     "rows for the newest prediction_date" query counts, since both horizons share a date.
 *   - `datasets`, `notebook_source`, `data_source` — identical to the Node runtime, with
 *     `datasets` passed in by the route from `metadataDatasets()` rather than copied.
 *   - `generated_at` — response time, as above.
 */
export function metadataEnvelopeFromSnapshot(snapshot, { dataSource, generatedAt, datasets } = {}) {
  const horizonRows = Object.values(snapshot && snapshot.horizons ? snapshot.horizons : {})
    .filter((rows) => Array.isArray(rows));
  const rowCount = horizonRows.reduce((total, rows) => total + rows.length, 0);

  const newestPredictionDate = horizonRows
    .flat()
    .map((row) => (row && typeof row.prediction_date === 'string' ? row.prediction_date : null))
    .filter(Boolean)
    .sort()
    .at(-1) || null;

  const predictionDate = snapshot && typeof snapshot.prediction_date === 'string'
    ? snapshot.prediction_date
    : newestPredictionDate;

  return {
    prediction_date: predictionDate,
    ingestion_timestamp: snapshot && typeof snapshot.generated_at === 'string' ? snapshot.generated_at : null,
    data_source: dataSource || DEFAULT_DATA_SOURCE,
    row_count: rowCount,
    notebook_source: NOTEBOOK_SOURCE,
    datasets: Array.isArray(datasets) ? datasets : [],
    generated_at: generatedAt || new Date().toISOString(),
  };
}
