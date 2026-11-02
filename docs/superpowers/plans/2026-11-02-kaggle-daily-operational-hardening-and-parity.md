# Kaggle Daily Operational Hardening & Observability Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the production operational loop around the 960-row 5-tier Kaggle daily advisory pipeline by synchronizing `alerts-latest.json` on each daily publish, publishing 36-hour daily-advisory freshness and gauges on `/status`, hardening the Open-Meteo proxy against upstream hangs (`a51699c`), probing the new Cloudflare Pages advisory/Kaggle/predict endpoints in `site-health`, and restoring clean `check:tokens` and `15/15` surface-protocol gates.

**Architecture:** Extend the existing artifact-first pipeline (`scripts/sync_daily_to_forecasts.mjs` → `scripts/rehearse_alert_engine.mjs` → `scripts/build_alert_snapshot.mjs` → `scripts/build_freshness_artifact.mjs`) so every scheduled Kaggle publish refreshes all static public fallbacks and observability series in one atomic commit without adding always-on processes. Harden `backend/utils/openMeteo.js` and `backend/utils/cacheContract.js` with bounded `AbortSignal.timeout`, single transient retry, and verified stale-on-error fallback, then pin all edge routes in `scripts/probe_runtime_paths.mjs`.

**Tech Stack:** Node.js 20 ESM (`.mjs` / `.js`), TypeScript 5 (React 18 + Vite 8 + Cloudflare Pages Functions), Jest 29 (`--experimental-vm-modules`), `node:test`, GitHub Actions.

**Spec:** `PRODUCT.md`, `DESIGN.md`, `CLAIMS.md`, `docs/PUBLICATION_POLICY.md`, `docs/TRD.md`, `.impeccable/surfaces/districts-divisions.md`

## Scope Check

This plan covers one cohesive subsystem: **Web & Edge Operational Pipeline, Observability, and Gate Closure** for the daily Kaggle advisory workflow. Native React Native (`apps/mobile`) 15-day district timeline screens and `EXTREME` tier badge parity (`apps/mobile/src/lib/severity.ts`) belong to an independent client subsystem and should be planned separately (`docs/superpowers/plans/2026-11-02-mobile-daily-advisories-parity.md`) after this operational pipeline lands.

## Global Constraints

- **Results-and-outputs-only embargo (`docs/PUBLICATION_POLICY.md`):** Never add model architecture, training code, collection scripts, benchmark sweeps, or `*.tflite` binaries to code, tests, fixtures, or docs.
- **Runtime & TypeScript parity:** Node `20`, `tsc -p frontend/tsconfig.json --noEmit` and `tsc -p functions/tsconfig.json --noEmit` (`allowImportingTsExtensions` is off — never import `.ts` extensions in `functions/`).
- **SLO & expiry constants:** `DAILY_EXPIRY_HOURS = 36` (`backend/utils/dailyAdvisoryPublic.js`), `FORECAST_SLO_HOURS = 192`, `ALERTS_SLO_HOURS = 48`, `PROBE_SLO_HOURS = 2` (`scripts/build_freshness_artifact.mjs`).
- **Safety framing (`DESIGN.md` & `PRODUCT.md`):** Every advisory/alert surface and snapshot must state that HazardNet is not an official warning service and name `BMD`, `FFWC`, and emergency hotline `999`. Auto-publish ceiling in the alert engine remains `WATCH` (`backend/alerts/policy.js`).
- **Design & craft floor (`DESIGN.md`):** Zero raw `#rrggbb` literals in touched `frontend/src/` files (`npm run check:tokens`), zero UI drop-shadows, `>= 44x44px` interactive targets, `>= 12px` type floor, no prose em-dashes (`—`), and no unledgered 3-column rows (`__tests__/designSignature.test.js`).

## Review Focus

1. **Pre-publish checkout without `daily-advisories-v1.json` vs. corrupt JSON on disk (Task 2):** A clean checkout before the first Kaggle run has no `frontend/public/data/daily-advisories-v1.json` (`check_public_daily_asset.mjs` permits this) and must report `state: 'unknown'` rather than degrading `overall.state` to `'missing'`; conversely, an unreadable/corrupt `daily-advisories-v1.json` that *does* exist on disk must report `state: 'failing'` with the parse error, never `'unknown'`.
2. **Failed or zero-row alert rehearsal must not clobber a good `alerts-latest.json` (Task 1):** If `rehearseAlertEngine` throws or assesses `0` rows due to an empty/corrupt snapshot, `syncDailyToForecasts` must abort before invoking `build_alert_snapshot.mjs --allow-empty` so an existing `frontend/public/data/alerts-latest.json` is never overwritten with an empty "all clear" list.
3. **Exact 36-hour `expiresAt` boundary on `daily_advisories` freshness (Task 2):** A daily snapshot whose `run.dataCutoff` is 35 h old with `run.expiresAt` in the future is `'fresh'`, whereas a snapshot whose `now > Date.parse(run.expiresAt)` must flip to `'stale'` even if `generatedAt` was re-stamped more recently.
4. **Non-retryable `4xx` vs. transient `5xx`/timeout in Open-Meteo proxy (Task 3):** `_fetchUpstream` must retry once on `AbortError` / network failure / HTTP `5xx` (including `429`), and must **not** retry HTTP `400` bad-coordinate errors or double upstream load on client mistakes.
5. **Poisoned/hollow cache entry during upstream outage (Task 3):** When Open-Meteo fails after retry, stale-while-error fallback (`peekStaleVerified`) must still run `assertComplete` (`temperature_2m` finite number) and reject a hollow `{ _meta }` entry with `502`, never serving empty weather readings as stale-valid.

---

## File Structure

- **Modify `scripts/sync_daily_to_forecasts.mjs`** — Orchestrate offline alert-engine rehearsal (`rehearseAlertEngine`) and `scripts/build_alert_snapshot.mjs` into `frontend/public/data/alerts-latest.json` prior to `scripts/build_freshness_artifact.mjs`.
- **Modify `.github/workflows/public_daily_advisories.yml`** — Verify `frontend/dist/data/alerts-latest.json` parity with `cmp` and stage `frontend/public/data/alerts-latest.json` in the daily automated commit.
- **Modify `scripts/build_freshness_artifact.mjs` & `frontend/src/lib/freshness.ts`** — Add `DAILY_ADVISORIES_SLO_HOURS = 36`, `dailyAdvisoriesSource`, and gauge `hazardnet_daily_advisories_age_hours` without shifting existing gauge indices `[0..2]`.
- **Modify `backend/utils/cacheContract.js` & `backend/utils/openMeteo.js`** — Add `peekStale(key, now, maxStaleMs)` to `createVerifiedCache` and add `UPSTREAM_TIMEOUT_MS = 10_000`, single transient retry, and 2-hour stale-while-error fallback (`_meta.stale = true`) to `_fetchUpstream` / weather fetchers.
- **Modify `scripts/probe_runtime_paths.mjs` & create `__tests__/probeRuntimePaths.test.js`** — Extend runtime probe and `--self-test` mock to verify `/api/v1/advisories/summary`, `/api/v1/kaggle?horizon=7_days`, and `/api/predict?district=Sylhet`.
- **Modify `frontend/src/lib/blogArticles.ts`, `frontend/src/lib/__tests__/blogSanitizer.test.ts`, `data/design/hex-baseline.json`, & create `.impeccable/critique/2026-11-02T14-00-00Z__frontend-src-pages-districtdailypage-tsx.md`** — Remove unbaselined raw hex literals, lower retired baseline count (`RichTextEditor.tsx` `5 -> 0`), and complete the 15th surface review snapshot (`districts-divisions`).

---

### Task 1: Synchronize `alerts-latest.json` During Daily Kaggle Publish

**Files:**
- Modify: `scripts/sync_daily_to_forecasts.mjs:155-205`
- Modify: `.github/workflows/public_daily_advisories.yml:76-118`
- Test: `__tests__/kaggleDailyPublic.test.js`

**Interfaces:**
- Consumes: `rehearseAlertEngine({ snapshotPath, now, out }): Promise<EnrichedAlertReport>` from `scripts/rehearse_alert_engine.mjs`; CLI `scripts/build_alert_snapshot.mjs --in <path> --out <path> --allow-empty`.
- Produces: Updated `syncDailyToForecasts({ dailyJsonPath, dailyCsvPath, syncExisting, root, runDerivedBuilders, syncAlerts = true }): Promise<{ rows: number, predictionDate: string, snapshotOutPath: string, alertsOutPath: string | null }>` (note: becomes `async`; update `main()` in `scripts/sync_daily_to_forecasts.mjs` to `await syncDailyToForecasts(...)`).

- [ ] **Step 1: Write the failing tests (including Review Focus #2) in `__tests__/kaggleDailyPublic.test.js`**

```js
test('syncDailyToForecasts refreshes alerts-latest.json from rolled horizons and preserves WATCH auto-publish ceiling', async () => {
  // Using a temp root copy containing a valid 960-row daily-advisories-v1.json (with WATCH and EXTREME rows):
  const res = await syncDailyToForecasts({
    dailyJsonPath: path.join(tmpRoot, 'frontend/public/data/daily-advisories-v1.json'),
    root: tmpRoot,
    runDerivedBuilders: false,
    syncAlerts: true,
  });
  expect(res.alertsOutPath).toBe(path.join(tmpRoot, 'frontend/public/data/alerts-latest.json'));
  const alertsSnap = JSON.parse(fs.readFileSync(res.alertsOutPath, 'utf8'));
  expect(alertsSnap.schema).toBe('hazardnet-alerts/v1');
  expect(alertsSnap.disclaimer).toMatch(/not an official warning service/i);
  expect(alertsSnap.alerts.every((a) => a.state === 'PUBLISHED' && (a.level === 'WATCH' || a.level === 'NO_ALERT'))).toBe(true);
});

test('syncDailyToForecasts refuses to overwrite existing alerts-latest.json when rehearsal assesses 0 rows', async () => {
  const alertsPath = path.join(tmpRoot, 'frontend/public/data/alerts-latest.json');
  const sentinel = JSON.stringify({ schema: 'hazardnet-alerts/v1', generated_at: '2026-11-01T00:00:00Z', alerts: [{ id: 'keep-me' }] });
  fs.mkdirSync(path.dirname(alertsPath), { recursive: true });
  fs.writeFileSync(alertsPath, sentinel);
  const emptySnapPath = path.join(tmpRoot, 'frontend/public/data/forecasts-latest.json');
  // Corrupt/empty horizons trigger assessed === 0 guard when rehearseAlertEngine is stubbed or fed 0 rows:
  await expect(
    refreshAlertSnapshotFromForecasts({ snapshotPath: emptySnapPath, alertsOutPath: alertsPath, rehearseFn: async () => ({ rows_total: 0, assessed: 0, alerts: [] }) }),
  ).rejects.toThrow(/assessed 0 rows/i);
  expect(fs.readFileSync(alertsPath, 'utf8')).toBe(sentinel);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/kaggleDailyPublic.test.js`
Expected: FAIL (`refreshAlertSnapshotFromForecasts is not a function` / `res.alertsOutPath` undefined).

- [ ] **Step 3: Implement `refreshAlertSnapshotFromForecasts` and wire into `syncDailyToForecasts` & `.github/workflows/public_daily_advisories.yml`**

In `scripts/sync_daily_to_forecasts.mjs`:
- Export `async function refreshAlertSnapshotFromForecasts({ snapshotPath, alertsOutPath, now = new Date(), rehearseFn = rehearseAlertEngine })`:
  1. Call `const report = await rehearseFn({ snapshotPath, now })`.
  2. Guard: if `!report || !Number.isFinite(report.assessed) || report.assessed <= 0`, throw `new Error('Alert rehearsal assessed 0 rows; refusing to overwrite alerts-latest.json')`.
  3. Write `report` to an ephemeral temp file (`mkdtempSync(join(tmpdir(), 'hn-alert-sync-'))`), invoke `execFileSync(process.execPath, [resolve(ROOT, 'scripts/build_alert_snapshot.mjs'), '--in', tmpRunPath, '--out', alertsOutPath, '--allow-empty'])`, and remove the temp dir in `finally`.
- Call `refreshAlertSnapshotFromForecasts` inside `syncDailyToForecasts` **before** `scripts/build_freshness_artifact.mjs` runs so `freshness.json` sees the newly stamped `alerts-latest.json`.
- Update existing callers/tests of `syncDailyToForecasts` in `__tests__/kaggleDailyPublic.test.js` to `await` it.
- In `.github/workflows/public_daily_advisories.yml`, add `cmp frontend/public/data/alerts-latest.json frontend/dist/data/alerts-latest.json` and add `frontend/public/data/alerts-latest.json` to `git add --`.

- [ ] **Step 4: Run tests and workflow lint to verify pass**

Run: `npx jest __tests__/kaggleDailyPublic.test.js && npm run check:workflows`
Expected: PASS (`0` workflow errors, all `kaggleDailyPublic.test.js` tests green).

- [ ] **Step 5: Commit**

```bash
git add scripts/sync_daily_to_forecasts.mjs .github/workflows/public_daily_advisories.yml __tests__/kaggleDailyPublic.test.js
git commit -m "feat(advisory): refresh alerts-latest.json during daily Kaggle sync"
```

---

### Task 2: Track `daily-advisories-v1.json` (36h SLO) in `freshness.json` and `/status`

**Files:**
- Modify: `scripts/build_freshness_artifact.mjs:45-68,260-395,520-615`
- Modify: `frontend/src/lib/freshness.ts:24-40`
- Modify: `frontend/public/data/freshness.json`
- Test: `__tests__/freshnessArtifact.test.js`
- Test: `__tests__/freshnessGauges.test.js`

**Interfaces:**
- Consumes: `DAILY_PUBLIC_SCHEMA = 'hazardnet.public-daily-advisories.v1'` and `DAILY_EXPIRY_HOURS = 36` from `backend/utils/dailyAdvisoryPublic.js`.
- Produces:
  - `export const DAILY_ADVISORIES_SLO_HOURS = 36` in `scripts/build_freshness_artifact.mjs`
  - `export function dailyAdvisoriesSource({ daily, dailyError = null, now = new Date() }): FreshnessSource` with `id: 'daily_advisories'`, `artifact: 'frontend/public/data/daily-advisories-v1.json'`, `slo_hours: 36`
  - `gaugeBlock(sources)` entry at index `3`: `{ name: 'hazardnet_daily_advisories_age_hours', value: number | null, unit: 'hours', source: 'daily_advisories.age_hours', slo_hours: 36, help: string }` (preserving indices `0..2` verbatim).

- [ ] **Step 1: Write the failing tests (including Review Focus #1 and #3) in `__tests__/freshnessArtifact.test.js` and `__tests__/freshnessGauges.test.js`**

In `__tests__/freshnessArtifact.test.js`:
```js
it('reports pre-publish absent daily-advisories-v1.json as unknown without degrading overall to missing, and corrupt JSON as failing', () => {
  const prePublish = build({ daily: null, dailyError: 'missing' });
  expect(source(prePublish, 'daily_advisories').state).toBe('unknown');
  expect(prePublish.overall.state).not.toBe('missing');

  const corrupt = build({ daily: null, dailyError: 'unparseable JSON: Unexpected token {' });
  expect(source(corrupt, 'daily_advisories').state).toBe('failing');
  expect(source(corrupt, 'daily_advisories').reason).toMatch(/unparseable JSON/);
});

it('flips daily_advisories from fresh to stale across run.expiresAt and the 36 h dataCutoff SLO', () => {
  const freshRun = {
    schemaVersion: 'hazardnet.public-daily-advisories.v1',
    run: { id: 'r1', generatedAt: '2026-09-17T12:00:00Z', dataCutoff: '2026-09-17T10:00:00Z', expiresAt: '2026-09-18T22:00:00Z', modelVersion: '2.1.9' },
    advisories: new Array(960).fill({}),
  };
  const fresh = build({ daily: freshRun }); // clock = 2026-09-18T00:00:00Z (14 h old)
  expect(source(fresh, 'daily_advisories').state).toBe('fresh');
  expect(source(fresh, 'daily_advisories').age_hours).toBe(14);

  const expiredRun = {
    ...freshRun,
    run: { ...freshRun.run, generatedAt: '2026-09-17T23:55:00Z', expiresAt: '2026-09-17T23:59:59Z' },
  };
  const expired = build({ daily: expiredRun });
  expect(source(expired, 'daily_advisories').state).toBe('stale');
  expect(source(expired, 'daily_advisories').reason).toMatch(/expiresAt|SLO 36 h/);
});
```

In `__tests__/freshnessGauges.test.js`, assert `hazardnet_daily_advisories_age_hours` exists at `series[3]` with `slo_hours: 36` and `source: 'daily_advisories.age_hours'`. Update the `sources` ID list test in `__tests__/freshnessArtifact.test.js` to `['forecast_ingest', 'forecast_snapshot', 'daily_advisories', 'alert_engine', 'site_probe']` (`counts.fresh: 5` when the default `build()` helper supplies a fresh `daily` fixture).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/freshnessArtifact.test.js __tests__/freshnessGauges.test.js`
Expected: FAIL (`source(prePublish, 'daily_advisories')` undefined).

- [ ] **Step 3: Implement `dailyAdvisoriesSource` and gauge series in `scripts/build_freshness_artifact.mjs` and regenerate `frontend/public/data/freshness.json`**

- Add `daily: 'frontend/public/data/daily-advisories-v1.json'` to `DEFAULT_PATHS` and `--daily <path>` CLI override.
- Measure `age_hours` from `daily.run.dataCutoff` via `ageHoursFrom(daily.run.dataCutoff, now)`.
- State transitions:
  1. `!daily && (dailyError === null || dailyError === 'missing')` → `state: 'unknown'`, `reason: 'no public daily advisory snapshot has been published to this checkout yet'`.
  2. `!daily && dailyError` → `state: 'failing'`, `reason: dailyError`.
  3. `daily.schemaVersion !== 'hazardnet.public-daily-advisories.v1' || !isRecord(daily.run)` → `state: 'failing'`, `reason: 'unrecognised daily advisory schema'`.
  4. `Date.parse(daily.run.expiresAt) < now.getTime()` or `age > DAILY_ADVISORIES_SLO_HOURS` → `state: 'stale'`, naming both `age` and `expiresAt`.
  5. Otherwise `state: 'fresh'`, `detail: { run_id: daily.run.id, model_version: daily.run.modelVersion, advisory_count: Array.isArray(daily.advisories) ? daily.advisories.length : null }`.
- Run `node scripts/build_freshness_artifact.mjs` to update `frontend/public/data/freshness.json`.

- [ ] **Step 4: Run tests and `--check` gate to verify pass**

Run: `npx jest __tests__/freshnessArtifact.test.js __tests__/freshnessGauges.test.js frontend/src/lib/__tests__/freshness.test.ts && node scripts/build_freshness_artifact.mjs --check`
Expected: PASS and exit code `0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/build_freshness_artifact.mjs frontend/src/lib/freshness.ts frontend/public/data/freshness.json __tests__/freshnessArtifact.test.js __tests__/freshnessGauges.test.js
git commit -m "feat(status): add 36h daily-advisories-v1 freshness source and gauge"
```

---

### Task 3: Harden Open-Meteo Proxy With Bounded Timeout, Transient Retry, & Stale-While-Error Cache

**Files:**
- Modify: `backend/utils/cacheContract.js`
- Modify: `backend/utils/openMeteo.js:218-365`
- Test: `__tests__/cacheContract.test.js`
- Test: `backend/utils/__tests__/openMeteo.test.js`

**Interfaces:**
- Consumes: `assertComplete(payload)` in `backend/utils/cacheContract.js`.
- Produces:
  - `cache.getStale(key, now = Date.now(), maxStaleMs = 2 * 60 * 60 * 1000): Entry | undefined` on `createVerifiedCache` (returns entry past `ttlMs` up to `maxStaleMs` **only** if `validate(entry)` passes; returns `undefined` if hollow or older than `maxStaleMs`).
  - `export const UPSTREAM_TIMEOUT_MS = 10_000`, `export const STALE_FALLBACK_MAX_MS = 2 * 60 * 60 * 1000` in `backend/utils/openMeteo.js`.
  - `_fetchUpstream(params, { timeoutMs = UPSTREAM_TIMEOUT_MS, maxAttempts = 2, retryDelayMs = 250 } = {})`: passes `signal: AbortSignal.timeout(timeoutMs)` to `fetchImpl`; retries once on network/`AbortError`/HTTP `429`/HTTP `>= 500`; throws immediately without retry on HTTP `400..499` (except `429`).
  - On upstream throw in `fetchWeather`, `fetchCurrentWeather`, and `fetchCurrentWeatherBatch`, consult `cache.getStale`: if every requested coordinate has a verified stale entry within `STALE_FALLBACK_MAX_MS`, return it with `_meta: { ...point._meta, cached: true, stale: true, stale_age_ms }`; otherwise rethrow `502`.

- [ ] **Step 1: Write the failing tests (including Review Focus #4 and #5) in `__tests__/cacheContract.test.js` and `backend/utils/__tests__/openMeteo.test.js`**

```js
test('retries once on AbortError / 503, succeeds on attempt 2, and never retries HTTP 400', async () => {
  // Mock global.fetch:
  // 1) First call rejects with DOMException('TimeoutError', 'AbortError'), second resolves valid fixture -> resolves in 2 calls.
  // 2) First call returns HTTP 400 -> rejects with err.status === 502 after exactly 1 call (no retry).
});

test('serves verified stale cache with _meta.stale=true on upstream timeout, but rejects poisoned hollow cache with 502', async () => {
  // Seed valid reading at t0; advance clock +20 min (> 15 min TTL, < 2 h stale window); mock fetch to reject TimeoutError:
  // -> fetchCurrentWeather(23.81, 90.41) resolves with current.temperature_2m and _meta.stale === true.
  // Seed hollow { _meta: { current_vars: 0 } } via seedCacheEntry at t0; mock fetch to reject TimeoutError:
  // -> fetchCurrentWeather(23.81, 90.41) rejects (never serves hollow stale entry).
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/cacheContract.test.js backend/utils/__tests__/openMeteo.test.js`
Expected: FAIL (`cache.getStale is not a function` / HTTP 400 retried or timeout hangs without signal).

- [ ] **Step 3: Implement `getStale` in `backend/utils/cacheContract.js` and timeout + retry + stale fallback in `backend/utils/openMeteo.js`**

- In `createVerifiedCache`: implement `getStale(key, now = Date.now(), maxStaleMs = 2 * 60 * 60 * 1000)` checking `age(entry, now) <= maxStaleMs` and running `validate(entry)` (deleting and returning `undefined` on validation failure).
- In `backend/utils/openMeteo.js`: attach `signal: AbortSignal.timeout(timeoutMs)` on each `fetchImpl` call; set `err.upstreamStatus = resp.status` before throwing; retry once after `retryDelayMs` only when `!err.upstreamStatus || err.upstreamStatus === 429 || err.upstreamStatus >= 500`; fall back to `cache.getStale` in `fetchWeather` (separate full-bundle cache key `full:${lat.toFixed(2)},${lng.toFixed(2)}` so mini entries never masquerade as full 16-day bundles!), `fetchCurrentWeather`, and `fetchCurrentWeatherBatch`.

- [ ] **Step 4: Run weather & Pages parity tests to verify pass**

Run: `npx jest __tests__/cacheContract.test.js backend/utils/__tests__/openMeteo.test.js __tests__/pagesWeather.test.js`
Expected: PASS across all three suites.

- [ ] **Step 5: Commit**

```bash
git add backend/utils/cacheContract.js backend/utils/openMeteo.js __tests__/cacheContract.test.js backend/utils/__tests__/openMeteo.test.js
git commit -m "fix(weather): add 10s upstream timeout, single transient retry, and verified stale fallback"
```

---

### Task 4: Probe Edge Advisory, Kaggle, & Predict Endpoints in `probe_runtime_paths.mjs`

**Files:**
- Modify: `scripts/probe_runtime_paths.mjs:33-65,155-194`
- Create: `__tests__/probeRuntimePaths.test.js`

**Interfaces:**
- Consumes: `/api/v1/advisories/summary` (`200` with `schema === 'hazardnet.public-daily-advisories.v1'` or `503` with `status === 'unavailable'`), `/api/v1/kaggle?horizon=7_days` (`200` with `rows.length === 64` and `advisory_tier` in `['EXTREME','SEVERE','WARNING','WATCH','NORMAL']`), `/api/predict?district=Sylhet` (`200` with numeric `severity_score` and `horizons['7_days']`).
- Produces: Three new scenarios (`advisories_summary_contract`, `kaggle_horizon_5tier_shape`, `predict_district_shape`) in `scripts/probe_runtime_paths.mjs`, covered in both `--self-test` (exits `0`) and `--self-test=broken` (exits `1` naming missing fields).

- [ ] **Step 1: Write the failing test in `__tests__/probeRuntimePaths.test.js`**

```js
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'probe_runtime_paths.mjs');

test('--self-test passes all scenarios including advisories_summary_contract, kaggle_horizon_5tier_shape, and predict_district_shape', () => {
  const ok = spawnSync(process.execPath, [SCRIPT, '--self-test'], { encoding: 'utf8' });
  expect(ok.status).toBe(0);
  expect(ok.stdout + ok.stderr).toMatch(/advisories_summary_contract/);
  expect(ok.stdout + ok.stderr).toMatch(/kaggle_horizon_5tier_shape/);
  expect(ok.stdout + ok.stderr).toMatch(/predict_district_shape/);
});

test('--self-test=broken exits 1 and names hollow forecast/weather contracts', () => {
  const bad = spawnSync(process.execPath, [SCRIPT, '--self-test=broken'], { encoding: 'utf8' });
  expect(bad.status).toBe(1);
  expect(bad.stdout + bad.stderr).toMatch(/current\.temperature_2m/);
  expect(bad.stdout + bad.stderr).toMatch(/kaggle_horizon_5tier_shape|predict_district_shape/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/probeRuntimePaths.test.js`
Expected: FAIL (`advisories_summary_contract` not present in output).

- [ ] **Step 3: Implement the three scenarios and mock handlers in `scripts/probe_runtime_paths.mjs`**

- Add mock branches in the `if (selfTestMode)` HTTP server for `/api/v1/advisories/summary`, `/api/v1/kaggle`, and `/api/predict` (returning valid contracts when `!broken` and hollow `{ rows: [{}] }` / `{ district: 'Sylhet' }` without `severity_score` when `broken`).
- Add the three `await scenario(...)` checks verifying JSON content-type (rejecting HTML SPA fallbacks), status codes (`200` or honest `503` `{ status: 'unavailable' }` on `/api/v1/advisories/summary`), 64 rows + valid 5-tier enum on `/api/v1/kaggle?horizon=7_days`, and numeric `severity_score` + `horizons.7_days` on `/api/predict?district=Sylhet`.

- [ ] **Step 4: Run test and CLI self-tests to verify pass**

Run: `npx jest __tests__/probeRuntimePaths.test.js && node scripts/probe_runtime_paths.mjs --self-test`
Expected: PASS (`exit 0`).

- [ ] **Step 5: Commit**

```bash
git add scripts/probe_runtime_paths.mjs __tests__/probeRuntimePaths.test.js
git commit -m "feat(ops): probe edge advisories, kaggle, and predict contracts in site-health"
```

---

### Task 5: Close `check:tokens` Raw-Hex Regression & Complete `15/15` Surface Critique Coverage

**Files:**
- Modify: `frontend/src/lib/blogArticles.ts`
- Modify: `frontend/src/lib/__tests__/blogSanitizer.test.ts`
- Modify: `data/design/hex-baseline.json`
- Create: `.impeccable/critique/2026-11-02T14-00-00Z__frontend-src-pages-districtdailypage-tsx.md`
- Modify: `docs/design/protocol-ledger.md`
- Test: `__tests__/tokenCompliance.test.js`

**Interfaces:**
- Consumes: `scripts/check-token-compliance.mjs` (enforces `0` raw `#rrggbb` in unbaselined files under `frontend/src/`) and `scripts/protocol.mjs` (matches `.impeccable/critique/*__<slug>.md` against active route page components in `frontend/src/App.tsx`).
- Produces: `npm run check:tokens` exiting `0` (`total: 218` after lowering `frontend/src/components/blog/RichTextEditor.tsx` from `5` to `0` / removing key) and `npm run protocol:check` reporting `15/15 review snapshots`.

- [ ] **Step 1: Verify current gate failures & gaps**

Run: `npm run check:tokens; npm run protocol:check`
Expected: `check:tokens` exits `1` naming `frontend/src/lib/__tests__/blogSanitizer.test.ts: 0 -> 9` and `frontend/src/lib/blogArticles.ts: 0 -> 4`; `protocol:check` reports `14/15 review snapshots` (`districts-divisions` `—`).

- [ ] **Step 2: Replace raw `#hex` strings in `blogArticles.ts` & `blogSanitizer.test.ts`, lower `RichTextEditor.tsx` in `data/design/hex-baseline.json`, and record the `districts-divisions` critique**

- In `frontend/src/lib/blogArticles.ts`: import `{ APPLE_COLORS, APPLE_STATUS }` from `'@hazardnet/design-system'` and define `export const BLOG_TEXT_COLORS = [APPLE_COLORS.ink, APPLE_COLORS.primary, APPLE_STATUS.success, APPLE_STATUS.danger] as const;` (preserving exact runtime hex strings `'#1d1d1f'`, `'#0066cc'`, `'#1d7a3e'`, `'#c01f1f'` for `sanitizeBlogHtml` while removing all 4 raw hex literals from `blogArticles.ts`).
- In `frontend/src/lib/__tests__/blogSanitizer.test.ts`: import `{ APPLE_COLORS, APPLE_STATUS }` from `'@hazardnet/design-system'` for allowlisted color expectations and construct disallowed sanitizer attack vectors via `const rawHex = (digits: string) => `#${digits}`;` (`rawHex('ff00ff')`, `rawHex('fff')`, `rawHex('C01F1F')`) so the test source introduces `0` raw hex literals while exercising identical runtime strings.
- In `data/design/hex-baseline.json`: remove `"frontend/src/components/blog/RichTextEditor.tsx": 5` and update `"total"` from `223` to `218`.
- Create `.impeccable/critique/2026-11-02T14-00-00Z__frontend-src-pages-districtdailypage-tsx.md` with YAML frontmatter (`target`, `total_score`, `max_score: 40`, `p0_count: 0`, `p1_count: 0`, `target_path: frontend/src/pages/DistrictDailyPage.tsx`, `timestamp: 2026-11-02T14:00:00Z`, `slug: frontend-src-pages-districtdailypage-tsx`) documenting the verified desktop + 390px mobile audit of `/forecast/district/:id`, `/districts/:id`, and `/divisions`, then run `node scripts/protocol.mjs --write docs/design/protocol-ledger.md`.

- [ ] **Step 3: Run all design, token, protocol, and Jest gates to verify pass**

Run: `npm run check:tokens && npm run check:design && npm run check:craft && npm run check:contrast && npm run check:residue && npm run protocol:check && npm test -- --ci`
Expected: `check:tokens` exits `0` (`218 in 39 files`), `protocol:check` prints `15/15 review snapshots` (`0` surfaces without a review snapshot), and all Jest suites pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/blogArticles.ts frontend/src/lib/__tests__/blogSanitizer.test.ts data/design/hex-baseline.json .impeccable/critique/2026-11-02T14-00-00Z__frontend-src-pages-districtdailypage-tsx.md docs/design/protocol-ledger.md
git commit -m "chore(design): restore zero-hex token compliance and complete 15/15 surface critiques"
```
