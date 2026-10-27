# Owner actions

**Status: unassigned.** No individual owns this file yet — it is referenced from
`backend/alerts/policy.js`, `backend/middleware/serverlessGuard.js`, `SECURITY.md`,
`.github/workflows/site-health.yml`, `data/site-health/README.md`, `frontend/scripts/prerender.mjs`
and `e2e/full-app-qa.spec.ts`, but it was never committed, so the actions it pointed at were
untraceable. This file was reconstructed on **2026-10-02** from those references; the IDs below
are the ones the code cites (`Action 5`, `Action 8`, `Action 9`, `§2a-bis`), and every entry that
could not be recovered from a citation is marked *not reconstructed* rather than invented.

**Owning it means:** you can reach the Cloudflare account (Pages project + DNS), the
Firebase project, the GitHub repository settings and the provider consoles. Nothing here can
be closed from a pull request.

**2026-10-26 — the deploy target changed.** Cloudflare Pages is the sole frontend deploy
target; the Vercel project, both `vercel.json` files, its deploy steps and its three secret
names are gone, and the Firebase Hosting block was retired the same day. The dated decision is
recorded under **§ Decision log** at the bottom of this file. Actions that were waiting on
"deploy something from CI" are re-measured against the new target rather than closed on the old
one.

**2026-10-26 — cost is now a decision input, not a line item.** The project runs on free tiers
only; **no paid dependency may be introduced without a funding decision**, and the constraint is
recorded as a control in **§ Cost constraints** below so the next reader does not re-propose what
was withdrawn. Two recommendations in this file were withdrawn the same day for cost: Action 8's
Durable Objects / Upstash counter (→ the free plan's single edge rate-limiting rule) and Action
12's log drain into BigQuery/ClickHouse (→ Workers Analytics Engine). Both are rewritten in place
with the withdrawal recorded, not deleted.

**How to close an action:** do the work, flip `Status` to `Closed`, add the date and your name on
the `Closed by` line, and — if code or a workflow pointed at it — remove or update that comment in
the same change. An action nobody can be paged for is a note, not a control.

---

## §1 · Credential rotation — Action 1

| | |
|---|---|
| **Status** | Open — no rotation has ever been recorded |
| **Why** | `BACKEND_API_KEY`, the Gemini/Groq/OpenRouter/HuggingFace keys and the VAPID pair are long-lived. `docs/ENVIRONMENT_SECRETS.md` lists them but documents no cadence, and the secrets-audit workflow is dispatch-only, so nothing ever forces a rotation. |
| **Do** | Follow `docs/ops/secret-rotation.md` (the runbook written for this action). |
| **Verify** | `verify-secrets.yml` (dispatch) passes after the rotation, and the run is linked in the table at the bottom of that runbook. |
| **Closed by** | — |

## §2 · Deployment root — Action 2

| | |
|---|---|
| **Status** | **Closed 2026-10-26** — the hosting configs are gone; the deployment is described in one place. |
| **Why** | The hosting project built from one directory while the configuration that declared the rewrites lived in another, so the rewrites never applied. Two `vercel.json` files disagreed about the repository root, and neither was read by the host that answered the domain. |
| **Do** | Done: both `vercel.json` files and the rest of the Vercel configuration were deleted, and the Cloudflare Pages project is configured as **root directory = repository root, build = `npm run build`, output = `dist`** — recorded in `docs/ops/deployment.md` §2 with the reason for each value. A deep link is a prerendered file, so no rewrite config is needed at all. |
| **Verify** | `curl -sSI https://hazardnet.live/district/dhaka` answers `200 text/html` with the prerendered body, and the same request for a path that has never existed answers **404** with the noindex shell. |
| **Closed by** | 2026-10-26 — configuration deleted; see `docs/ops/deployment.md`. |

### §2a-bis · The live API surface and the prerender step

The sub-case that `site-health.yml`, `e2e/full-app-qa.spec.ts` and
`frontend/scripts/prerender.mjs` all warn about. Two of the three symptoms are now settled by
the deployment shape rather than by configuration:

1. **Deep links 404** — the prerender step runs as part of `npm run build`, and Pages serves the
   resulting file per route. No rewrite config participates, so there is nothing left to
   misconfigure.
2. **`GET /api/v1/forecasts/bulk` returns 404** — **expected.** The public deployment is static
   (`docs/ops/deployment.md` §6): no API runs there, ADR 0008 makes the committed snapshot the
   delivery path, and the client falls back to it. A 404 here is not a defect until an API is
   hosted; a **500** still is.
3. **The probe result cannot be published** — see Action 9.

Set the repository variable `API_METADATA_URL` only if an API is hosted somewhere other than the
site origin; while none is, leave it unset and read the 404 as the documented answer.

## Action 3 · Validate `firestore.rules` against the emulator

| | |
|---|---|
| **Status** | Open |
| **Why** | `__tests__/firestoreRules.test.js` pins the *shape* of the rules file because the behavioural pass needs `@firebase/rules-unit-testing` plus the emulator JAR (Java), which is not installed in CI. Nothing has ever executed a rule. |
| **Do** | Install Java + the Firebase emulator, then run the behavioural suite: owner read/write allowed, anonymous read denied on a private profile, anonymous `list` without `limit(1)` denied, over-size and wrong-owned writes denied. |
| **Verify** | Every assertion passes against the emulator, and the shape test is kept as the CI-resident guard. |
| **Closed by** | — |
| **Measured 2026-10-26 (cost)** | The repository half is done and is now a **cost control**, not only a loop guard: the probe commit carries `[skip ci]` (Pages honours `[CI Skip]` / `[Skip CI]` / `[CF-Pages-Skip]`, case-insensitive) and `data/site-health/**` is excluded from the build watch paths. The measurement that made it urgent: **75 of the 195 non-merge commits to `main` in the previous 30 days were probe commits**, 52 of them in October, against a 500-build monthly Pages allowance. The status stays Open for one scheduled run — only the dashboard can show a *Deploy skipped* entry. |
| **Measured 2026-10-26** | Unchanged by the deploy cutover, and still unimplemented: `grep -rn 'setup:emulators\|emulators:exec\|java-version' .github/workflows/` returns **0** matches. The Resident guard it is meant to complement (the shape test in `__tests__/`) is the only thing checking the rules today. Needs the owner's Google Cloud service account either way — CI cannot read Firestore. **Cost 2026-10-26:** the Java install plus emulator JAR download is cheap on Actions minutes because the repository is **public** (`isPrivate: false`, read from the GitHub API on 2026-10-26), where Actions minutes are unlimited. On a private repo this job is an ongoing minute cost — which is now a funding question, not a scheduling one (§ Cost constraints). |

## Action 4 · *not reconstructed*

No citation in the tree identifies this action. If you have the original file, restore the entry.

*Searched `git log --all -S "Action 4"` and the reflog on 2026-10-26; no citation found — the
string only ever appears in this file, already marked not reconstructed (`f28f854`, `d2fd9d9`).*

## Action 5 · Alert thresholds are placeholders

| | |
|---|---|
| **Status** | Open — **blocks external alerting** |
| **Why** | `backend/alerts/policy.js` records that `model_severity` saturates near 1.0, so nearly every district lands at `WATCH`. The thresholds are placeholders pending the Phase 9 validation. |
| **Do** | Run the Phase 9 validation over a season of ground truth, then set the `WATCH` / `WARNING` / `SEVERE` cut-offs and the hazard-specific overrides in `policy.js`. |
| **Verify** | A replay (`__tests__/alertReplay.test.js`) produces a tier distribution that is not ~100 % `WATCH`, and the new numbers are recorded here. |
| **Closed by** | — |
| **Measured 2026-10-26** | Unchanged by the cutover, and the symptom is visible in the published artifact: `/data/alerts-latest.json` (`generated_at 2026-10-25T19:21:16Z`) carries `counts {WATCH: 106}` against 128 assessed and `warning_requires_calibration` as the blocker — i.e. still ~83 % of rows at the lowest tier, with `confidence_kind: null` for every row. Implementing this needs a season of ground truth, which is not in this repository; nothing here can substitute for it. |

## Action 6c · Bangla copy native-speaker review

| | |
|---|---|
| **Status** | **Closed 2026-09-19** for the FrontDoor / i18n surface (`frontend/src/lib/i18n.ts`, `frontend/src/hooks/usePageSeo.ts`, `frontend/src/pages/FrontDoor.tsx`) |
| **Closed by** | Project owner, review recorded as `approved-native-speaker` in the same-day commit |

Reopen this action (as a new ID) for any Bangla surface added after that date.

## Action 6d · Bangla copy review for the appearance control

| | |
|---|---|
| **Status** | **Open** — three new Bangla strings ship with `frontend/src/components/ThemeToggle.tsx` (`common.appearance`, `common.themeSystem`, `common.themeLight`, `common.themeDark` in `frontend/src/lib/i18n.ts`) |
| **Why** | Action 6c closed on 2026-09-19 for the then-current surface and instructs a new ID for anything added later. This is that addition (2026-10-04), so it ships as transliterations (`অ্যাপিয়ারেন্স`, `সিস্টেম`, `লাইট`, `ডার্ক`) matching how the operating systems name the same settings, pending review. |
| **Verify** | A native speaker confirms or replaces the four strings in `frontend/src/lib/i18n.ts`; `__tests__/phaseBFrontend.test.js` keeps EN/BN parity either way. |

## Action 7 · *not reconstructed*

No citation in the tree identifies this action.

*Searched `git log --all -S "Action 7"` and the reflog on 2026-10-26; no citation found — the
string only ever appears in this file, already marked not reconstructed (`f28f854`, `d2fd9d9`).*

## Action 8 · Rate-limit the API at the edge, not per instance

| | |
|---|---|
| **Status** | Open — **rewritten 2026-10-26 to a free-tier plan; the paid plan was withdrawn.** |
| **Why** | `backend/middleware/serverlessGuard.js` and `SECURITY.md` are explicit that the buckets are **per instance** (`limit × instances`), so the effective ceiling scales with the number of warm lambdas. `backend/middleware/serverlessGuard.js:66` is a module-level `Map`, so the ceiling is *unbounded* under scale rather than merely loose — it was never a real limit, just a per-isolate one. |
| **Do** | **One edge rule, not a shared store.** (1) Cloudflare → Security → WAF → **Rate limiting rules**: create the free plan's **single** rule against the most-trodden path — `/api/v1/telemetry` first, since it is unauthenticated and writes a log line per batch — with a generous threshold. (2) Keep `serverlessGuard.js` exactly as it is as the per-isolate second layer: it costs nothing and still stops a single hot isolate. (3) If the account has **SQLite-backed Durable Objects on the free plan**, use one for exact global counting instead — that is the correct tool and it costs nothing; if the dashboard does not offer it, take the edge rule and do not pay. |
| **Verify** | Fire 2 × N requests from two hosts and confirm the second batch throttles at N, not 2N. |
| **Closed by** | — |
| **Cost — why the plan changed** | The original text said "Upstash/Redis or an equivalent", i.e. a paid dependency. Withdrawn 2026-10-26: an edge rule is a **real global** limit for the one path that needs it at $0, which is strictly better than today for that path and no worse for the rest. Free plan specifics that constrain the rule: **one rule only**, **`Path` is the only available expression field**, counting characteristics **IP only**, counting period **10 s only**, mitigation timeout **10 s only**, action = *perform during mitigation period* (no throttle-above-rate). The 10 s window is why the rule guards a write endpoint rather than a read: it caps a burst, it does not meter a steady drip. |
| **Measured 2026-10-26 (later)** | **Partially unblocked:** `/api/*` now exists on the site (`/api/v1/forecasts/{bulk,metadata}`, `/api/v1/alerts`, `/api/v1/alerts/policy`), so the rule has a host to point at. It still should not be created for any of them: all four are read-only, snapshot-backed, ~2 ms, and cacheable (60 s / 300 s), and the one abusive path (`/api/v1/telemetry`) does not exist yet. Create the rule when telemetry ports — it is the single free-plan rule, and spending it on a public JSON read would waste it. Note the consequence of that: **the four edge routes have no per-instance guard** (`guardRequest` takes Node `req`/`res` and cannot run in a Worker), so the edge rule is their only abuse control when it arrives. |

## Action 9 · Site-health probe cannot publish its result

| | |
|---|---|
| **Status** | Open — **repository side complete again as of Phase 5 (2026-10-27); still needs one observed scheduled run.** The newest committed record (`ran_at 2026-10-27T14:43:47Z`, 8 checks) predates the `weather_api`/`alerts_api` steps added by #107, so the record proves the publish path has not been exercised since those checks landed. |
| **Why** | This repository's workflow permissions are read-only, so the step that commits
`data/site-health/latest.json` back to the branch fails with a warning. The result survives in
the run summary and the uploaded artifact, but the committed file goes stale. |
| **Do** | Done in the repository, twice over. (1) `contents: write` is granted **to the `probe` job only** — a file-level grant would hand the same scope to every future job — and the publish step still degrades to a warning plus an artifact if the repository-wide workflow permission is read-only, because a job-level setting cannot override that. (2) The probe commit now carries `[skip ci]`, and `data/site-health/**` is on the Pages build-watch exclude list (`docs/ops/deployment.md` §2): without both, every state change in a monitoring check would redeploy the whole site. **Do not switch this to GitHub Pages** — that would reintroduce a second host, which is the thing the 2026-10-26 cutover removed. |
| **Verify** | One scheduled run on `main`: `data/site-health/latest.json` gains the new `ran_at` with no manual commit, **and** `Workers & Pages → hazardnet → Deployments` shows no new deployment for that commit. |
| **Closed by** | — *(repository side complete; needs one green scheduled run to close)* |
| **Measured 2026-10-26** | The job-level permission and the `[skip ci]` commit are in `.github/workflows/site-health.yml` at this commit. The last committed probe result (`data/site-health/latest.json`, `ran_at 2026-10-26T06:31:52Z`, 7/7 checks passing) predates both, so the *effect* is unverified until the next scheduled run. The status stays Open for that single observation — closing it before the run would be recording an intention as a result. |
| **Phase 5, 2026-10-27 — what changed** | (1) The aggregate check now runs **before** the publish step with `continue-on-error: true`; the commit and verify steps are `if: always()` and a final gate keeps the run red. A broken site can no longer lose its record. (2) `workflow_dispatch` gained `site_url` + `expect` (`healthy`/`broken`), publishes to `HEAD:${GITHUB_REF_NAME}` (never `main` from a dispatch), and **forces** a commit on dispatch — the old state-change guard meant a healthy dispatch wrote nothing. (3) The record now carries `weather_api.detail` (the named missing field), a new `runtime_paths` check (`scripts/probe_runtime_paths.mjs`, 8 sibling scenarios) and is verified by `scripts/verify_site_health_record.mjs` against the freshness artifact and the run summary. (4) `scripts/copy-dist.mjs` publishes the canonical record to `/data/site-health/latest.json` at the next ordinary build; the probe's own `[skip ci]` commit still triggers no build. (5) `__tests__/siteHealthRecord.test.js` (16 tests) pins the step order, the job-scoped permission, `[skip ci]`, the watch-path exclusion and the value assertions. A dispatch was **attempted from this sandbox on 2026-10-27 and refused**: `gh workflow run site-health.yml --ref arena/02ded3da-hazardnet -f site_url=https://hazardnet.live -f expect=healthy` → `HTTP 403: Resource not accessible by integration` (exit 1), and `gh api repos/.../actions/permissions` → the same 403, while `gh run list` succeeds. The token can read runs but cannot dispatch or read the repository-wide Actions permission setting, so whether the setting is read-only remains an **owner observation**. **Verify (owner):** `gh workflow run site-health.yml --ref <branch> -f site_url=https://hazardnet.live -f expect=healthy`; then `git pull --rebase && jq '.outcome, (.checks[] \| select(.id=="weather_api"))' data/site-health/latest.json`, `gh run download <run-id> -n site-health-result -D /tmp/site-health-result` + `diff`, `curl -s https://www.hazardnet.live/data/site-health/latest.json \| jq .outcome`, and `npx wrangler pages deployment list --project-name=<project>` before and after (must be identical). Full matrix in `docs/ops/pr/phase-5-site-health.md`. |

## Action 10 · Get profile PII out of the public read path (SEC-14)

| | |
|---|---|
| **Status** | Open — added 2026-10-02 |
| **Why** | `firestore.rules` allowed `get, list: if true` on `profiles`, so an anonymous client could read and enumerate email, phone, WhatsApp, address and pinpoint coordinates for every account. Reads are now opt-in per row and capped at one row per query, but **Firestore cannot hide individual fields in a read**: a public profile still ships its PII. |
| **Do** | (a) Backfill `profile_visibility` on rows that predate the field (default-deny now hides them). (b) Add a `publicProfiles/{uid}` mirror written by the backend holding only the display fields the profile page renders, and point `/u/<username>` at it. (c) Then move `email`, `phone_number`, `whatsapp_number`, `address`, `pinpoint_lat`, `pinpoint_lng` out of the public document entirely. |
| **Verify** | A public profile fetched anonymously contains no contact field; the emulator suite from Action 3 covers it. |
| **Closed by** | — |
| **Measured 2026-10-26** | Unchanged by the cutover. `firestore.rules:34` still documents `publicProfiles` as the *long-term* fix and the mirror does not exist (`grep -rn publicProfiles backend/` → no writer). The `(a)` backfill is an owner-side Firestore write for rows that predate `profile_visibility`; `(b)` and `(c)` are code and are blocked on an API host, because the mirror is written by the backend. **This is now a cost control as well as a privacy fix:** Firestore Spark allows 50k reads/day, and the current public page reads the *fat* profile document per visit. The mirror is a small document holding only the rendered display fields, so the same page costs fewer bytes and burns the read budget more slowly. Do it for both reasons. |

## Action 11 · Advisory dataset freshness (Kaggle ⇄ pipeline)

| | |
|---|---|
| **Status** | Open — the GitHub download/ingest path is wired on 2026-10-03; the public file itself still needs an on-time daily publication verified. **The notebook has not published since 2026-09-29.** |
| **Why** | The public Kaggle artifact (`ashifahmedshuvo/hazardnet-weekly-forecasts`, `hazardnet_advisories_latest.csv`) last reported `generated_at=2026-09-29 23:29:31` when checked on 2026-10-03, and Kaggle's own dataset metadata (checked 2026-10-04T14:49Z) still says `lastUpdated: 2026-09-29T23:49:50Z`, version 10, "Expected update frequency: daily". The 36 h freshness guard in `scripts/validate_advisory_csv.mjs` correctly rejects older runs. The owner has confirmed the Kaggle notebook is scheduled daily; the public copy must reflect that run. |
| **Do** | The GitHub side now runs daily at `05:30 UTC`: `.github/workflows/daily_advisory_ingest.yml` downloads the CSV from the exact public dataset URL (raw CSV or ZIP), retries while a run is finishing, skips an unchanged file, and calls `scripts/process_advisory_ingest.mjs` only for a newer source. Verify the Kaggle notebook publishes the completed daily run back into that dataset/file. Optional `KAGGLE_USERNAME` / `KAGGLE_KEY` secrets enable CLI/kernel fallback; the public HTTP download itself requires no credentials. |
| **Verify** | A scheduled Actions run shows a new `generated_at`, passes `node scripts/validate_advisory_csv.mjs /tmp/advisory-ingest/hazardnet_advisories_latest.csv` without `--allow-stale`, commits updated forecast snapshots, and — because the push is the deploy trigger — leaves the Pages build to pick the new artifacts up from `main`. If the file is unchanged — or newer than the last ingest yet past the 36 h gate — the fetch step reports it (`age_hours`, `stale` in `fetch-report.json`), the run goes red with `::error::Scheduled Kaggle advisory publication is unchanged or past the 36 h ingest gate`, and the fetch report is attached. |
| **Closed by** | — |
| **Measured 2026-10-26 (deploy path)** | The success path now ends at the Pages deploy hook instead of `npx vercel deploy --prod`; nothing else about the pipeline changed. The *content* half is still the notebook's: the committed manifest reports `prediction_date 2026-10-24` with `run_age_hours 32`, so the 36 h gate is met by the last run but the dataset has not published past 2026-09-29 in Kaggle's own metadata. Re-run `node scripts/validate_advisory_csv.mjs /tmp/advisory-ingest/hazardnet_advisories_latest.csv` (no `--allow-stale`) against the next publication before closing; do not close on this repository's copy alone. |

**Measured 2026-10-04** (the day this file was last touched): the 05:30 UTC runs on
2026-10-02, 2026-10-03 and 2026-10-04 all failed. Until this change the failure landed in
*"Validate Advisory CSV & Execute Ingestion"* with `STALE_DATA` while the fetch step above it
reported success, so the four downstream steps — pipeline tests, the artifact commit and the
deploy trigger — were skipped and the red looked like an ingest bug. The fetch now applies the
same 36 h gate and fails at its own step with the publication age. Nothing downstream of that
step can go green until the notebook publishes: the site has been serving the 2026-09-24 build
since, and `site-health.yml`'s forecast probe is red because
`frontend/public/data/forecasts-latest.json` still carries `prediction_date: 2026-09-16`.

**Measured 2026-10-05**: the scheduled 12:26 UTC run (commit `2ae5a6cb`) still failed in
*"Validate Advisory CSV & Execute Ingestion"*, not at the fetch step — that commit predates the
fetch-side age gate, which is on `main` from `40d01ef4` (12:35 UTC). So the run carried the
pre-gate shape this file describes: the fetch accepted a publication newer than the committed
2026-09-16 run and the ingest rejected it, skipping the same four downstream steps. The next
scheduled run fails at the fetch step and names the age. The chain itself is healthy — the whole
ingest (validate → map → snapshot → alert replay → alerts snapshot → freshness artifact) was
reproduced locally from a fresh 128-row CSV on 2026-10-05 and exits 0 at every step — so the red
remains the notebook's, not the pipeline's.

## Action 12 · Store analytics events in Workers Analytics Engine

| | |
|---|---|
| **Status** | **Open — repository side complete (Phase 6, 2026-10-27); one dashboard binding and one live SQL query remain.** Added 2026-10-02; paid sink withdrawn 2026-10-26; writer shipped 2026-10-27. It is **not** closed: this sandbox cannot create a Cloudflare binding, set a Pages variable, redeploy, or read the dataset. Closing requires the captured proof at the bottom of this section. |
| **Why** | `POST /api/v1/telemetry` (added with `@hazardnet/analytics`) validates batches and emits them to the platform log, then acknowledges. Nothing persists them. That was deliberate: an unauthenticated endpoint writing to Firestore is a data-integrity, privacy and cost decision, not a technical one. |
| **Do — repository (done)** | `functions/api/v1/telemetry.ts` chooses its sink at runtime. With an `ANALYTICS` binding on a **production host**, each validated event becomes one `writeDataPoint({ blobs: [event, sessionId, JSON.stringify(properties)], doubles: [at], indexes: [sessionId] })`. Without one — or on a Preview host, or when `writeDataPoint` throws — it emits the same bounded JSON log line `serverless/v1/telemetry.js` emits and still answers 204. `backend/utils/telemetryBatch.js` now caps the serialised properties at 8 KiB so the three blobs always fit Cloudflare's 16 KB-per-data-point limit; both runtimes import that rule. `__tests__/pagesTelemetry.test.js`, `__tests__/routeValueAssertions.test.js` and `__tests__/analyticsEngineBinding.test.js` pin both transports, the 250-per-invocation ceiling (batch cap 50), the 96-byte index and the Production-only guard. |
| **Do — owner (the remaining step)** | Cloudflare dashboard → **Workers & Pages → hazardnet → Settings → Bindings → Add → Analytics engine** ([docs](https://developers.cloudflare.com/pages/functions/bindings/#analytics-engine), last updated 2026-06-25). Variable name `ANALYTICS`, dataset `hazardnet_telemetry`. Select the **Production** environment **only** — Pages lets you scope bindings to Production *or* Preview, and a Preview-scoped binding would write unreleased builds into the production dataset. Then **Settings → Variables and Secrets → Add** → `VITE_ANALYTICS_ENABLED` = `true`, again **Production only** (it is a plain build-time variable, not a secret). **Redeploy the Production deployment** — Cloudflare's docs state a binding only takes effect after a redeploy. Do not add a `wrangler.toml` for this: a Git-integrated Pages project reads its bindings from the dashboard, and a committed one would not affect the deployment. |
| **Verify** | 1. `curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' --data '{"sessionId":"action12-probe-20261027","events":[{"event":"page_view","at":1767000000000,"properties":{"route":"/"}}]}' https://www.hazardnet.live/api/v1/telemetry` → **204** (and the same request with no binding would also be 204 — the status alone proves nothing).<br>2. Create a read-only API token: dashboard → **API tokens → Create Custom Token → Account · Account Analytics · Read** ([SQL API auth](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/)). The endpoint is `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/analytics_engine/sql` with `Authorization: Bearer <API_TOKEN>` and the SQL as the request body. Never commit the token.<br>3. `SHOW TABLES` must list `hazardnet_telemetry`; the table is created automatically on the **first write** ([table structure](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/)), so an empty result here means no data point has landed, not that the binding is fine.<br>4. Query the exact session back — `index1` is the session id (also mirrored into `blob2`), `blob1` is the event name, `double1` is the timestamp. `WHERE blob2 = …` also works but scans blobs; the index is the cheap path.<br>5. `wrangler pages deployment tail` must show **no** `ANALYTICS.writeDataPoint failed` warnings and no `non-production host` warnings. A 204 with an empty SQL result means the log sink is still the transport. |
| **Closed by** | — *(needs steps 1–5 captured by an owner; see the Phase 6 row below)* |
| **Cost — why the plan changed** | The original text, "log drain → BigQuery/ClickHouse, or a hosted collector", was a paid dependency plus a second account surface. Withdrawn 2026-10-26. **Workers Free** includes **100,000 data points written/day** and **10,000 read queries/day**; retention is **three months** ([pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing/), [limits](https://developers.cloudflare.com/analytics/analytics-engine/limits/)). Hard per-call limits: 20 blobs, 20 doubles, **one index**, 16 KB of blobs per data point, 96 bytes per index, and 250 `writeDataPoint` calls per invocation. 100k/day is ~10⁴× this site's telemetry volume; 3 months retention is the binding constraint — anything needing longer history must aggregate to R2 before it ages out, which is a decision to make later. |
| **Measured 2026-10-26 (decision, not an implementation)** | The transport was still the log line and `__tests__/api/telemetry.test.js` pinned it — see the rewrite above for why a drain is no longer on the table. `VITE_ANALYTICS_ENABLED` in **Production** scope only: a Preview-scoped flag would collect traffic from unreleased builds into the production dataset. |
| **Shipped 2026-10-27 (writer), open on one dashboard step** | `functions/api/v1/telemetry.ts` now chooses its sink at runtime: with an `ANALYTICS` binding each validated event becomes one `writeDataPoint({ blobs: [event, sessionId, JSON.stringify(properties)], doubles: [at], indexes: [sessionId] })`, and without one it emits exactly the log line `serverless/v1/telemetry.js` emits. `__tests__/pagesTelemetry.test.js` pins both transports, the 250-per-invocation ceiling (the batch cap is 50), and that the index stays inside Analytics Engine's 96-byte limit — which is why the session id is capped at 64 characters. **The repository cannot create the binding:** there is no `wrangler.toml` in this tree (Pages reads its bindings from the dashboard), so the remaining step is owner-side and the endpoint is already correct without it. |
| **Phase 6, 2026-10-27 — what changed and what is still unverified** | **Changed:** (a) the sink is **Production-only at the code level** — `PRODUCTION_HOSTS = {www.hazardnet.live, hazardnet.live}`; a `*.pages.dev` or `localhost` request with a bound `ANALYTICS` takes the log sink and warns, so an accidentally Preview-scoped binding cannot pollute the production dataset; (b) `writeDataPoint` is wrapped in a `try/catch` — a quota or dataset error is logged and the event goes to the log line instead of producing a 500; `env` itself is optional; (c) `backend/utils/telemetryBatch.js` rejects properties whose JSON exceeds 8 KiB, which keeps the three blobs under the 16 KB limit even when a caller uses enormous **keys** (the per-value cap alone could not); (d) `__tests__/analyticsEngineBinding.test.js` asserts the fixture leaves on both transports, the Preview guard, the throwing binding, the oversized-properties refusal and the owner runbook; (e) the SQL verification below is corrected to use `index1` and the real SQL API endpoint, and `docs/codebase/ARCHITECTURE.md` / `INTEGRATIONS.md` no longer claim `serverless/v1/telemetry.js` was deleted (it exists and is imported by the Node suite). **Still unverified:** Cloudflare states an Analytics Engine binding **cannot be used locally**, so the bound path is proven only against a stub; no live `writeDataPoint`, no `SHOW TABLES`, no `VITE_ANALYTICS_ENABLED` setting, and no redeploy can be performed from this sandbox. Action 12 stays **Open**. Exact commands and expected output in `docs/ops/pr/phase-6-analytics-engine.md`. |

## Action 13 · Clear the open handles the React Native suites leave behind

| | |
|---|---|
| **Status** | Open — added 2026-10-02 |
| **Why** | The mobile suites pass (62 tests) but Jest hangs after the last assertion; CI runs them with `--forceExit`, which hides the class of bug instead of fixing it. |
| **Do** | Find the timers/subscriptions the app hooks leave open (`useSavedPlaces` is one) and clear them, then drop `--forceExit` from the `test-mobile` job. |
| **Verify** | `npx jest --config apps/mobile/jest.config.cjs --ci` exits on its own. |
| **Closed by** | — |
| **Measured 2026-10-26** | Unchanged and still open: `.github/workflows/ci.yml:177` still runs `npx jest --config apps/mobile/jest.config.cjs --ci --runInBand --forceExit`. Removing the flag is the closure test — it must exit on its own. Nothing about the cutover touches this. |

## Action 14 · Build the Windows app on pull requests, not only on tags

| | |
|---|---|
| **Status** | Open — added 2026-10-02 |
| **Why** | `apps/windows` has no behavioural test and its MSIX is built only by `app-releases.yml` on a `v*` tag, so a broken Windows build is discovered at release time. |
| **Do** | Add a PR-triggered compile-only job (no packaging) on `windows-2022`, reusing the same `node_modules` hoisting steps. Skip it on docs-only changes. |
| **Verify** | A deliberately broken import in `apps/windows/src` fails the PR job before it reaches a tag. |
| **Closed by** | — |
| **Measured 2026-10-26** | Closer than the title says: `.github/workflows/windows-compile.yml` is already `on: pull_request` with `paths:` limited to `apps/windows/**` and the workflow file itself, and runs on `windows-2022` (line 22) — the compile-only PR job exists. What is missing is the proof, and it cannot be produced here (no Windows runner in this sandbox): break an import in `apps/windows/src` on a throwaway branch, confirm the job goes red, then close with that run's link. **Cost 2026-10-26 — no deferral needed:** the repository is **public** (`isPrivate: false` from the GitHub API), so Actions minutes are unlimited and the `windows-2022` runner's 2× multiplier costs nothing. The defer-to-`workflow_dispatch` option is therefore *not* taken; it becomes the fallback if the repository is ever made private without a funding decision (§ Cost constraints). |

## Action 15 · Implement or delete the declared plugins

| | |
|---|---|
| **Status** | Open — added 2026-10-02 |
| **Why** | `plugins/plugin_manifest.json` listed `01_agent_tools/*.py` and `02_data_ingestion/open_meteo_plugin.py` — none of them exist — and marked the ingestion one enabled. The entries are now `enabled: false` / `status: declared-not-implemented` and `__tests__/pluginManifest.test.js` fails if an enabled entry does not resolve. Only `03_frontend_widgets/ShelterCapacity.tsx` is real, and its shelter numbers are hardcoded (1160/2000). |
| **Do** | Either write the modules the manifest describes, or delete the entries. If the shelter widget is kept, source its occupancy from a real feed instead of literals. |
| **Verify** | `npx jest __tests__/pluginManifest.test.js` passes with every surviving entry implemented. |
| **Closed by** | — |
| **Measured 2026-10-26** | Both halves are resolved in the tree, and this should be closable after one reading. (1) `01_agent_tools/` and `02_data_ingestion/` **do not exist**, so the declared plugins were deleted rather than implemented; `__tests__/pluginManifest.test.js` is the gate that would notice them coming back. (2) There is no `ShelterCapacity` component and no hard-coded `1160/2000` occupancy anywhere: the district brief renders *"Safe shelters — **Not available** — centres and capacity in use"* (`frontend/src/components/district/DistrictBriefBody.tsx:118`), i.e. the fabricated figure was replaced by the four-state honest-absence treatment rather than by a real feed. If that is the intended resolution, close it and say so; if shelter occupancy was meant to become real data, the gap is a data source, not a constant. |

## Action 16 · The canonical host `www.hazardnet.live` does not serve the site

| | |
|---|---|
| **Status** | Open — **recovery externally verified 2026-10-27; formal closure awaits the first green scheduled probe.** The decision of 2026-10-04 stands and was not revisited: `www` stays canonical, the code does not move to the apex. The Pages custom domain has now been attached and `www` serves the deployment (see the 2026-10-27 measurement row below). The Actions probe has not re-run since, so `data/site-health/latest.json` and the `/status` probe table still quote the last red run; this action flips to **Resolved** on the next run whose `canonical_host` and `sitemap` checks both pass and the enforcer exits 0. |
| **Why** | 41 tracked files treat `https://www.hazardnet.live` as the canonical origin: the `<link rel="canonical">` tags and structured data (`frontend/src/SEOHead.tsx`), the sitemap and `robots.txt`, `security.txt`'s `Canonical:`, the content engine (`scripts/build_content_engine.mjs`), and a build guard in `frontend/scripts/prerender.mjs` that **fails the build** if the origin is anything else. Meanwhile `www.hazardnet.live` is NXDOMAIN and `hazardnet.live` answers 200 directly from Firebase Hosting (199.36.158.100, `x-fh-requested-host`). So every URL in the deployed sitemap is unreachable, `site-health.yml`'s "Verify every sitemap URL resolves" probe fails on all 85 of them, and Google is being pointed at a host that does not exist. |
| **Do** | **One step left, and it is in the Cloudflare dashboard, not in DNS.** The record is already correct — `www.hazardnet.live CNAME hazardnet.pages.dev`, proxied, in the 2026-10-26 11:17:31 zone export — but the hostname is not a custom domain on the Pages project, so Cloudflare has an origin it cannot route to. **Workers & Pages → hazardnet → Custom domains → Set up a domain → `www.hazardnet.live`**, then let the certificate issue. Do **not** re-create the DNS record and do not point the canonical tags at the apex: 41 tracked files, the sitemap, `robots.txt`, `security.txt` and the prerender build guard all name `www`, and that is the decision of record. While you are in the dashboard: **SSL/TLS → Edge Certificates → Always Use HTTPS on, HSTS on** — Cloudflare ignores the `Strict-Transport-Security` line in `_headers` on some plan tiers. <br><br>**Scriptable equivalent (no dashboard), using credentials the repo already stores.** `CLOUDFLARE_API_TOKEN` is minted from the *Edit Cloudflare Pages* template, whose scope covers Pages custom domains, alongside `CLOUDFLARE_ACCOUNT_ID` (`docs/ENVIRONMENT_SECRETS.md` §1.1.1). From a shell that has both in the environment: <br>`npx wrangler pages domain add www.hazardnet.live --project-name=hazardnet` <br>then confirm with `npx wrangler pages domain list --project-name=hazardnet` (on an older wrangler, check the verb with `npx wrangler pages domain --help`). The proxied `CNAME` already exists, so this only attaches the hostname to the project and issues the certificate — it must **not** create another DNS record. A `403` means the token is deploy-scoped or lacks zone `DNS:Edit`: do the dashboard step above rather than silently widening the token. **Then re-run the monitor to close this out** — Actions → *Site Health Probe* → *Run workflow* (or wait for the half-hour schedule). The HTTP 522 fails **two** checks, `canonical_host` and `sitemap` (all 103 sitemap URLs are `www`), so this action is Resolved only once both report `success` and the *Enforce aggregate site-health probe outcome* step exits 0. |
| **Verify** | `dig +short www.hazardnet.live` returns the Pages target; `curl -sSI https://www.hazardnet.live/` answers **200** with `server: cloudflare`, a `cf-ray` and the six headers from `_headers`; `curl -sSI https://hazardnet.live/` answers **301** to `https://www.hazardnet.live/`; `https://www.hazardnet.live/sitemap.xml` lists 103 URLs. The `canonical_host` check in `site-health.yml` — added for exactly this — flips green on the next run. |
| **Measured 2026-10-26 (this cutover)** | DNS: both hostnames `CNAME hazardnet.pages.dev`, proxied. Apex: redirects to `www` (requesting the apex resolves to the www URL). `https://www.hazardnet.live/` → **HTTP 522**, "initial connection between Cloudflare's network and the origin web server timed out", Ray `a50a1ae77d27c6e3` — re-checked later the same day, **still 522** (Ray `a50a2c01bab9475a`), so this is a standing condition, not a blip. Apex artifacts are healthy meanwhile: `data/freshness.json` `built_at 2026-10-26T06:31:52Z`, 4/4 sources fresh, last probe 7/7 with `security_headers: all 5 headers present`. So the site is up and the hostname every canonical URL points at is not. |
| **Measured 2026-10-27 (recovery)** | After the Pages custom domain was attached, fetched from outside the Actions network: `https://www.hazardnet.live/` returns the full app shell (HTTP 200, current build — 106 WATCH advisories and the freshness panel), `https://www.hazardnet.live/sitemap.xml` returns the complete `<urlset>` of `www` URLs, and the previously-failing sitemap entries `/status` and `/about` now serve their own pages (200) instead of the Cloudflare 522. The 2026-10-26 origin-timeout is gone; apex and `www` resolve to the same proxied Cloudflare edge addresses. `/status` still shows run `40388413095` (`sitemap` + `canonical_host` failing) only because no probe has re-run since the fix — that is the last *committed* artifact, not a live reading. The integration token in use cannot dispatch or re-run Actions (HTTP 403), so the authoritative close-out is the next scheduled *Site Health Probe* — or **Actions → Site Health Probe → Run workflow** — reporting both checks `success`. |
| **Closed by** | — |

## Action 17 · The site has a deploy path; the API has a host for reads only

| | |
|---|---|
| **Status** | **Closed for the site (2026-10-26)** — Pages builds `main` on push, owner-run in the sense that nobody needs a token. **Partly closed for the API (2026-10-26)**: two read-only endpoints run on Pages Functions (`/api/v1/forecasts/{bulk,metadata}`); the store-backed surface still has no host. Supersedes the 2026-10-04 decision that deploys would stay with Vercel. |
| **Why** | The question this action opened with was "nothing in the repository deploys the frontend". That is now answered by the platform rather than by a workflow: `git push origin main` is the deploy, and `docs/ops/deployment.md` records the project settings, the files the edge reads and the verification commands. The remaining half is the API. Since 2026-10-26 both `hazardnet.live` and `www.hazardnet.live` CNAME to `hazardnet.pages.dev`, which serves static assets only, so every `/api/**` request answers 404 — including the alert and forecast endpoints the front end probes first. The front end falls back to the committed snapshots (ADR 0008) and says so, so the site is correct; any feature that needs a live store is not available. |
| **Do** | Site: nothing. Keep merges to `main` reviewed, because each one ships. API, when you want one: choose a host for `backend/` (a container — `docker compose up` is the tested shape) or for `api/**` (a Node-function host), set the §2.1 variables there, and point `API_METADATA_URL` / `HAZARDNET_API_URL` at it. Do **not** add API secrets to the Pages project: it runs no API and the build log would publish them. |
| **Verify** | Site: `curl -sSI https://www.hazardnet.live/` shows the six headers from `frontend/public/_headers` and `curl -s https://www.hazardnet.live/data/freshness.json` quotes the build the last ingest produced. Deploy trigger: the ingest run's *Trigger Cloudflare Pages Production Deployment* step prints a 2xx and a new deployment appears in the project — see the note below, because the push alone does not do it. API (when hosted): `curl -s https://<api-host>/health` answers, `curl -s https://<api-host>/api/metrics` exposes the freshness gauge, and the site-health metadata probe reports the host instead of the 404 it reads today. |
| **Closed by** | 2026-10-26 — the site half. `docs/ops/deployment.md` is the record. |
| **Measured 2026-10-26 (deploy trigger)** | Both artifact commits in this repository — `daily_advisory_ingest.yml` and `live-wind-update.yml` — carry `[skip ci]`, which Pages honours with the same skip tokens as GitHub. **The push therefore does not rebuild the site**, and relying on it would have shipped a "deploy path" that never fires: the exact shape of the bug this action was opened for. The ingest job now POSTs `CF_PAGES_DEPLOY_HOOK` after a successful artifact commit (3 retries, hard failure on an unset secret or a non-2xx, with the dashboard path in the message). `live-wind-update.yml` is dispatch-only and publishes no site artifact, so it needs no hook. |

## Action 18 · Cloudflare challenges the site-health probe, so every check reads as a site outage

| | |
|---|---|
| **Status** | Open — **blocks the site-health probe from measuring anything** |
| **Why** | Measured 2026-10-09 (evidence: `docs/audits/2026-10-09-cloudflare-403-origin-probe.md`). Every request the probe makes — `/`, `www.hazardnet.live`, `/status`, `/sitemap.xml`, `/data/*`, `/api/*`, and a path that has never existed — returns `HTTP 403` with `server: cloudflare` and **`cf-mitigated: challenge`**, serving Cloudflare's "Just a moment..." interstitial. No origin ever answers. The probe runs from GitHub Actions (datacenter IPs) and cannot execute the JavaScript challenge, so it is being classified as a bot. Because `/data/**` carries `Cache-Control: public, max-age=0, must-revalidate` (`frontend/public/_headers` and `firebase.json`), those paths are always challenged, while paths Cloudflare already had cached can still return 200 — which is why the run at 01:31Z showed a partial green and 05:41Z showed all-red. The site is very likely healthy for real visitors; **the probe is blind, not the site down.** |
| **Do** | The workflow side is implemented: `.github/workflows/site-health.yml` sends `x-hazardnet-probe` on every probe request (via a generated curl config; see the `Configure probe authentication` step), reading the value from the `SITE_PROBE_TOKEN` Actions secret, and records the detector output as `edge_challenged` in `data/site-health/latest.json`. What remains is owner-side, in order: (1) generate a token with `openssl rand -hex 32` (hex only — no quotes or newlines, both would break the header the workflow builds); (2) in Cloudflare (**Security → WAF → Custom rules**), add a rule with expression `(http.request.headers["x-hazardnet-probe"][0] eq "<token>")`, action **Skip** (skip: Bot Management, Managed Challenge / all managed rulesets), placed **above** the bot-management and managed-challenge rules; (3) store the same token as a repository Actions secret named exactly `SITE_PROBE_TOKEN` (**Settings → Secrets and variables → Actions → New repository secret**). Lower-sensitivity alternatives, in order of preference: turn **Under Attack Mode** off and reduce **Bot Fight Mode** to its default; or add the probe's egress ranges to an IP allow list (brittle — Actions ranges move); or point `SITE_URL` at the deployment's own origin URL instead of the Cloudflare-fronted domain. |
| **Verify** | From any shell: `curl -sSI -H "x-hazardnet-probe: <token>" https://hazardnet.live/status` returns `200` with no `cf-mitigated` header, while the same request without the header still returns `403` with `cf-mitigated: challenge` (the rule skips only the probe, it does not open the site). Then trigger `Site Health Probe` via **Run workflow**: the run summary shows `edge challenged: false`, `data/site-health/latest.json` carries `"edge_challenged": false`, and the seven checks report real per-check results instead of a uniform 403. |
| **Closed by** | — |

## Action 19 · Re-enable the Android release and the ops Slack report (retired 2026-10-26)

| | |
|---|---|
| **Status** | Open — both pipelines moved to `.github/workflow-templates/`, inert. Nothing to do until you want either back. |
| **Why** | Two live workflows were failing/no-op for owner-side reasons and could not be fixed from CI: (1) `Android Release (React Native APK & AAB)` (`.github/workflows/android_release.yml`) failed in *Build signed Release APK & AAB via Gradle* on every push to `main` (run 40253981974) while the repository has no `ANDROID_KEYSTORE_*` signing material — and the same build existed a second time as the `android-apk` job of `app-releases.yml`; (2) the ingest job's *Dispatch Operational Monitoring & Slack Alert* step could not deliver, both because `SLACK_WEBHOOK_URL` does not exist and because `scripts/notify_ops.mjs` builds the payload and never POSTs it, so it reported success for nothing. |
| **Do** | Android: create `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`, copy `.github/workflow-templates/hazardnet-mobile-android-release.yml` back to `.github/workflows/`, and watch the Gradle step on a `workflow_dispatch` run before re-enabling its `push` trigger. Slack: add the webhook POST to `scripts/notify_ops.mjs`, copy `.github/workflow-templates/hazardnet-ops-slack-notify.yml` to `.github/workflows/`, add `SLACK_WEBHOOK_URL`, and call it as the last step of the job with `if: always()`. Both files' headers carry the same checklist. |
| **Verify** | Android: a `workflow_dispatch` run produces `HazardNet-mobile-v<version>-android.apk` + `.aab` + `SHA256SUMS.txt` and a GitHub Release. Slack: a deliberately failed run on a scratch branch produces a red *Incident* card in `#hazardnet-ops`, and an unreachable webhook does not fail the pipeline. |
| **Closed by** | — |

## Action 20 · `www` and the apex are different deployments, and only one of them has data

| | |
|---|---|
| **Status** | **Resolved 2026-10-26 by DNS** *(the remaining 522 on `www` is Action 16, not this)* — `www.hazardnet.live` now CNAMEs to `hazardnet.pages.dev` (verified in the zone export, 11:17:31), so both hostnames serve the same static deployment and the second, unwired API is gone. The code half was fixed and shipped in the same change (empty-answer fall-through, `counts` on both alert routes, no invented `generated_at`). One verification remains: the `www` probe below, once the Pages custom domain and certificate finish issuing (it answered Cloudflare **522** immediately after the DNS change, which is the migration, not a defect). |
| **Why** | Measured 2026-10-26 (`docs/audits/2026-10-26-www-front-door-unreadable-alerts.md`): `hazardnet.live` CNAMEs to `hazardnet.pages.dev` (**Cloudflare Pages**, no serverless functions, so the front door falls through to the committed snapshot and renders the 106 published advisories), while `www.hazardnet.live` CNAMEs to `vercel-dns-017.com` (**Vercel**, where `/api/v1/alerts` answers `200 {"count":0,"alerts":[]}` from an alert store with nothing in it). Both serve the same build and byte-identical artifacts; only the API differs. The front door preferred the API's empty ledger, so `www` — the hostname every canonical URL, the sitemap and `security.txt` point at — told readers the alerts artifact could not be read on a deployment that was shipping it. This supersedes the parts of Actions 16 and 17 that assumed a single answering origin. |
| **Do** | Done, both halves. (a) **One hostname, one platform** — `www.hazardnet.live` was pointed at the Cloudflare Pages deployment (`CNAME hazardnet.pages.dev`, proxied), removing the second origin and the second answer; the Vercel project and its configuration were deleted from the repository the same day (`docs/ops/deployment.md` §7). Option (b) — wiring the Vercel alert store — is no longer available and was not taken. The repository side is done too: an API answer with no ledger no longer suppresses the snapshot, `counts` is served by both the serverless and Express alert routes, and `generated_at` is no longer invented from the browser clock. Remaining: confirm the custom domain finished issuing, then read the verify row. |
| **Verify** | `curl -s https://www.hazardnet.live/ \| grep -o 'could not be read'` returns nothing, and the same page shows *“Advisories are active. N district advisories are published at WATCH or above.”* with an `Updated` line whose age is the artifact's (`generated_at 2026-10-25T19:21…` today), not `0 h`. Then `curl -sI https://www.hazardnet.live/api/v1/alerts` should be **404** (there is no API on either host now), and `curl -s https://www.hazardnet.live/data/alerts-latest.json \| head -c 200` should match the apex byte for byte. **`https://www.hazardnet.live` is in `site-health.yml`'s probe set**, so the monitor covers the hostname every canonical URL points at instead of only the apex. |
| **Closed by** | — |

## Action 21 · Bring the API to the same origin with Pages Functions (opened 2026-10-26)

| | |
|---|---|
| **Status** | Open — **seven endpoints shipped**: `forecasts/bulk`, `forecasts/metadata`, `alerts`, `alerts/policy` (2026-10-26), then `weather`, `weather/batch` and `telemetry` (2026-10-27). **Phase 4 (2026-10-27) closed the "Node-only" queue honestly:** `historical` and `metrics` were **deleted**, not left deployed-and-unexercised; `kaggle` is the one route with a live browser caller and has a dated, named follow-up PR (Action 24). The Analytics Engine binding (Action 12) remains owner-side. |
| **Why** | The site is static Pages, so `/api/**` answers 404 (`docs/ops/deployment.md` §7). The front door degrades honestly to the committed snapshots, but anything that needs a live store — ingest push, alert review, telemetry, chat, `/api/metrics` — has no runtime. Two API implementations exist and both are unhosted: `backend/` (Express, 11 routers) and `api/**` (6 Node-function entry points over 20 shared handlers). |
| **Do** | **Pages Functions at `www.hazardnet.live/api/*` — same origin, free tier.** The choice, with the rejected options recorded: <br>**(a) chosen — Pages Functions.** One runtime, one header surface: `functions/_middleware.ts` sets the six headers on every response and imports them from the same module `_headers` is generated from, so `__tests__/securityHeadersParity.test.js` stays a file-parity assertion instead of growing a live-fetch leg. No CORS, no `Vary: Origin`, no preflight, no fourth config. No second deploy target, no second secret set, no second account. <br>**(b) rejected — a standalone Worker on a subdomain.** Same V8 runtime and the same Web-standard port cost, but it is another `wrangler.toml`, another secret set and another thing that can be green while the site is red — plus the header problem returns, because a Worker does not read `_headers`. <br>**(c) rejected — a container** running `backend/server.js`: zero code change and keeps multer/Firebase, but it is a paid runtime with an always-on bill. <br>**Three constraints the port must respect:** <br>1. **`_routes.json` is mandatory**, not optional. The moment a `functions/` tree exists, Pages invokes a Function for *every* request unless `_routes.json` says otherwise — so the file includes `/api/*` and nothing else, and `exclude` stays empty. **Corrected 2026-10-26 while writing it:** `exclude` takes priority over `include`, so the version of this row that read "`exclude` `/*`" would have disabled the Functions entirely — the exact opposite of its intent. Asserted in `securityHeadersParity.test.js` so it cannot come back. <br>2. **Set Runtime → Fail open / closed to "fail open"** on the Pages project, so exhausting the daily Function allowance on Workers Free serves static assets instead of an error page. <br>3. **10 ms CPU per request** is the design constraint and it is the right one: the expensive work already lives in GitHub Actions, and the delivery path is a committed JSON snapshot. The Function surface is *read a snapshot, serve it, maybe proxy a Firestore read* — never model inference. `api/` uses `fs`, `multer` and Node built-ins that do not exist at the edge, so the portable surface only is what ports. |
| **Verify** | `curl -sI https://www.hazardnet.live/api/v1/forecasts/bulk` answers 200 with the same headers the static site sends, `curl -s 'https://www.hazardnet.live/api/v1/weather?lat=23.8&lng=90.4&mini=1'` answers 200 with a `temperature` field, `POST /api/v1/telemetry` answers 204, `_routes.json` keeps a static asset path out of the Function, and `docs/ops/deployment.md` §7 lists every hosted route with its cache policy. **Amended 2026-10-27:** the original verification named `/api/metrics` exposing `hazardnet_forecast_age_hours`; that route is now recorded as Node-only (see the disposition row) and the same number is published at `/data/freshness.json`, so the check moved to the two routes that did port. |
| **Closed by** | — |
| **Shipped 2026-10-26 (alerts, second port)** | `functions/api/v1/alerts/index.ts` and `functions/api/v1/alerts/policy.ts`, plus `backend/alerts/publicView.js` and `backend/utils/alertSnapshotServe.js`. Two things changed shape here: **(a)** the public projection was extracted rather than copied a third time — Express, the Node function and the Function now import one module, retiring the duplication `serverless/v1/alerts/index.js` documented; **(b)** `scripts/build_alert_snapshot.mjs` now **stamps the effective policy and delivery transports** into the artifact, because `/alerts/policy` must report the policy the engine ran under and a Worker has no `process.env` to recompute it from (`policy_source` records whether the run report or the builder wrote it). `alerts/evidence-card`, `alerts/review` and `alerts/run` stay unhosted: store-backed, and the last two are authenticated writes. `site-health.yml` gained an `alerts_api` check that fails on any non-PUBLISHED row and on a snapshot that lost its stamped policy. |
| **Shipped 2026-10-26 (first port)** | `functions/api/v1/forecasts/bulk.ts` and `functions/api/v1/forecasts/metadata.ts`, plus `functions/_middleware.ts`, `frontend/public/_routes.json`, and `backend/utils/forecastSnapshotServe.js` (the envelope builders both routes share). **`metadata` was added to the first port because `site-health.yml` probes it**, not `bulk` — porting `bulk` alone would have left the monitor reading a 404 while the API was "up", which is the half-true state this file exists to prevent. Both are covered by `__tests__/pagesForecasts.test.js`, which runs the Node handlers beside the edge ones and compares the envelope key sets, the row payloads and the cache policy. |
| **Design decision (recorded)** | The edge routes are **snapshot-backed, not Firestore-first** like `serverless/v1/forecasts/*`. A Worker cannot load `firebase-admin`, and a per-request store query would spend Spark's 50k reads/day re-serving bytes already on the CDN — the same budget Action 10 protects. `generated_at` keeps the Node runtime's meaning (response time) so the envelopes stay identical; the data's own age is `prediction_date`/`ingestion_timestamp`, and `/metadata` reports it. |
| **Cost note** | No `/api/*` line exists in `frontend/public/_redirects` to replace — that guard was deliberately never written (`_redirects` says why in its own header), and today `/api/**` falls to `404.html` because no asset matches. So the first port is **additive**: a `functions/` tree and its `_routes.json`, not an edit to a routing rule. |
| **Shipped 2026-10-27 (third port — weather, batch, telemetry)** | `functions/api/v1/weather.ts`, `functions/api/v1/weather/batch.ts` and `functions/api/v1/telemetry.ts`, plus the shared module `backend/utils/telemetryBatch.js` and `__tests__/pagesWeather.test.js` (11 tests) and `__tests__/pagesTelemetry.test.js` (9 tests). **Two rules were de-duplicated rather than re-typed:** the telemetry validator left `serverless/v1/telemetry.js` for a dependency-free module both runtimes import, and the weather routes import `backend/utils/openMeteo.js` unchanged. That import needed one real fix — `__getFetch()` used a literal `import('node-fetch')`, which esbuild inlined into the edge bundle as a 28 KB browser shim; a runtime-assembled specifier (`['node','fetch'].join('-')`) keeps it out (bundle 56 KB, probe: 28 → 24 KB with zero shim code). Bodies are bounded manually where the Node entries declared `bodyParser.sizeLimit` (64 KiB telemetry, 256 KiB batch) because a Pages Function has no parser to do it. Telemetry landed with Action 12's sink: one `writeDataPoint` per event when `env.ANALYTICS` exists, the Node-shaped log line when it does not. |
| **Found live 2026-10-27, fixed in the same pass — batch weather returned ids and nothing else** | The first deployment of the batch route was probed directly on the preview (`…/api/v1/weather/batch?coords=23.8103,90.4125,dhaka\|22.3569,91.7832,chattogram`) and answered `{"count":2,"points":[{"id":"dhaka","_meta":{…}},{"id":"chattogram","_meta":{…}}]}` — **no `current` block, no temperature, no wind**, with `_meta.current_vars: 0` as the only clue. Cause: Open-Meteo answers `latitude=1,2&longitude=3,4` with a **JSON array of per-location objects**, and `_extractPoint` in `backend/utils/openMeteo.js` indexed into it as if it were the nested-array-per-variable form its comment described — so every field came back `undefined`. Two things made it worse than a blank panel: the empty point was written to the module-level 15-minute cache, so a following `mini` request for the same coordinate read the empty point back and the district badges would have had no weather for 15 minutes; and the **Node runtime had the identical bug**, since both import the same function — nothing had exercised it, because `/api/v1/weather/batch` has been a 404 since the cutover. **Fixed in `_extractPoint`** (unwrap the array first, then handle the object shapes) rather than in the route, so both runtimes are fixed at once. **Why the test suite passed anyway, and what changed:** the stub answered *every* request with the single-point object and the batch parity test compared only `count` and `id`s — it would have passed with the payload entirely empty. `__tests__/pagesWeather.test.js` now stubs the array shape for multi-coordinate requests (matching encoded `%2C`, which the first attempt at the stub missed and silently defeated), asserts `temperature_2m` per point, and asserts the cache the batch fills is a *complete* point. 13 tests. **Recorded because it is the general lesson:** a parity test that compares envelopes and ids proves the two runtimes agree, not that either is right — the live probe is what caught it. |
| **Verified live 2026-10-27 (production, `49db5fd` — after the merge)** | The same three probes repeated against `https://www.hazardnet.live` once the merge deployed, i.e. the canonical origin and not a preview: `GET /api/v1/weather/batch?coords=23.8103,90.4125,dhaka\|22.3569,91.7832,chattogram` → **200**, `count: 2`, both points carrying an 11-variable `current` block (Dhaka 31.9 °C / 57 % RH, Chattogram 28.4 °C / 81 % RH); `GET /api/v1/weather?…&mini=1` → **200** with the same bundle shape the client's `frontend/src/lib/weather.ts` parses; `GET /api/v1/telemetry` → **405**. Response *headers* could not be checked from this sandbox — outbound TLS to the site is blocked (`curl` exits 35), so header parity stays pinned by `__tests__/securityHeadersParity.test.js` running the middleware, not by this probe. Body and status are now measured in production rather than asserted in a test. |
| **Verified live 2026-10-27 (preview deployment, `f555f87`)** | Fetched from outside the Actions network against the branch preview (`arena-ed150e18-hazardnet.hazardnet.pages.dev`), which deploys the same `functions/` tree: `GET /api/v1/weather?lat=23.8103&lng=90.4125&mini=1` → **200** with real Open-Meteo data (32 °C, 57 % RH, `current_vars: 11`); `GET /api/v1/weather/batch?coords=…` → **200**, `count: 2`, both points carrying a full `current` block (Dhaka 32 °C, Chattogram 28.5 °C) **after the `_extractPoint` fix and a cache-busted URL** — the pre-fix body was still being served from the edge's own `max-age=900` while I was checking, which is why the first re-probe looked unchanged and the second one (with a unique query string) did not; `GET /api/v1/telemetry` → **405 `{"error":"method not allowed"}`**, i.e. the route exists and only POST is accepted. Not verifiable from here: the 204 write path, because a browser-less GET cannot POST — that one is pinned by `__tests__/pagesTelemetry.test.js` and by the `ANALYTICS` binding step above. |
| **Monitor 2026-10-27 — the probe covers the weather routes, and would have caught the batch defect** | `site-health.yml` gained a `weather_api` check that requests both `/api/v1/weather?…&mini=1` and `/api/v1/weather/batch?coords=…` and requires a **numeric `current.temperature_2m` on every point**, not merely a 200. Both routes are in one step because the defect that shipped was in the batch path alone: it answered 200 with ids and `_meta`, and a single-point check would have called the endpoint healthy — the same blind spot that let it through the test suite. The failure message names the upstream status, because a 5xx here is Open-Meteo failing (the route proxies it and answers 502) while a 404 is this deployment losing the Function; the two have different owners. **The step's own shell was executed**, not just read: it was extracted from the workflow with a YAML parser and run under `bash` against three local mock upstreams — a healthy one (exit **0**, `temperature_2m 31.9 °C, current_vars 11`), the exact payload the deployment returned (`{count: 2, points: [{id, _meta}, …]}` → exit **1**, `count=2 with 0/2 points carrying a numeric current.temperature_2m`), and the scenario that actually happened, a healthy single-point route beside a broken batch route (exit **1**, the batch message). That last case is the one that matters: it is the blind spot that let the defect through the test suite, and it is now the case the check is known to catch. Also fixed while editing: the closing line said *"All 7 site-health probes passed"* while nine were already running, so it now counts the checks in the artifact instead of asserting a number that goes stale every time one is added. |
| **Disposition 2026-10-27 — the queue is closed, three routes stay Node-only** | `metrics`, `kaggle` and `historical` are **not** ported, and the reason each is not ported is a property of the runtime, not a lack of time: <br>**`/api/metrics`** — `prom-client` exposes *the Node process* (heap, event loop, CPU, GC). A Worker isolate has none of those, so a port would publish invented series. The one gauge that survives the move, `hazardnet_forecast_age_hours`, is computed from a Firestore read (`refreshForecastAgeGauge`) and **is already published** as `/data/freshness.json`, which the edge serves as a cached static asset at zero invocation cost. Porting would trade a real number for a fake one. <br>**`/api/v1/kaggle`** — `backend/services/kaggleAdvisoryClient.js` needs Kaggle HTTP Basic credentials, `inflateRawSync` for the dataset ZIP (`node:zlib`), and a cache file that outlives the request (`node:fs`, `node:os`). A Worker has no filesystem and no state between invocations, so the cache — which is what makes the endpoint cheap and polite to Kaggle — would have to become KV, R2 or a per-request refetch. The page already degrades correctly without it: `AdvisoriesPage` renders *"The Kaggle advisory service could not be reached. No value is shown."* and `DistrictDetailPage` refuses to revive stale dates. <br>**`/api/v1/historical`** — `fs.readFileSync` of a 1.5 MB JSON, re-serialised per request: measured **≈ 9 ms** (3.3 ms parse + 5.7 ms stringify) against the **10 ms CPU ceiling**, before any routing overhead. Nothing in the front end calls it, and the identical bytes are already served at `/data/historical/hazard-catalog-index.json` by the CDN. A Function here would be a slower, metered copy of a static file. <br>**Consequence, stated plainly:** the Advisories page shows no Kaggle severity on the edge deployment, `/api/metrics` 404s (no scrapeable host exists anyway — `site-health.yml` is what watches the site), and nothing regresses for `historical` because nothing consumed it. If a later decision needs live Kaggle rows at the edge, the shape is a *fetched, cached artifact* (the pipeline writes it, the Function reads it) — not a Worker reimplementation of the client. |
| **Disposition 2026-10-27 (Phase 4) — historical and metrics deleted, kaggle scheduled** | Verified all three claims for `historical`: (1) `git grep -rn "historical" frontend/src/ e2e/ docs/` finds only static `/data/historical/*.json` reads and old specification prose — **no caller of `/api/v1/historical/*`**; access logs cannot be read from this sandbox, owner command is recorded in `docs/ops/pr/phase-4-disposition.md`. (2) `node scripts/measure_historical_serialise.mjs --iterations 25` measured parse median 2.85 ms + stringify median 5.51 ms = **8.41 ms total, p95 11.44 ms** against the 10 ms budget, on local Node v22 V8; a Pages preview reproduce command is in the PR description and was **not** run here. (3) `https://www.hazardnet.live/data/historical/hazard-catalog-index.json` was fetched live (3,062 rows, 1,520,215 bytes, 190 chunks) and `serverless/v1/historical.js` is a pure re-serialiser of that file. Deleted: `serverless/v1/historical.js`, `serverless/historical.js`, `backend/routes/historical.js`, both dispatcher entries, both Express mounts, the agent-card skill and the API-catalog anchor. `frontend/public/_redirects` carries the **permanent-404 comment** (no rule, because a rule can shadow real assets). For `metrics`: `prom-client` series describe a Node process that does not exist in an isolate; deleted `serverless/metrics.js`, the dispatcher entry, the Express `/metrics` route, the dev proxies and the workflow's `/metrics` curl. The three real gauges (`hazardnet_forecast_age_hours`, alert-snapshot age, probe age) are now published in `/data/freshness.json -> gauges.series[]` by `scripts/build_freshness_artifact.mjs` and asserted by `__tests__/freshnessGauges.test.js`. For `kaggle`: V8 incompatibility confirmed (`Authorization: Basic`, `inflateRawSync` from `node:zlib`, `node:fs` cache outliving the request), and `useKaggleAdvisories.ts` **does** call it — so it is **not deleted**; Action 24 schedules PR `feat/kaggle-r2-artifact` with the pre-computed artifact plan. Rollback for either deletion is route-restore + removing the `_redirects` note; visitor behaviour is unchanged. |
| **Phase 5 site-health verification 2026-10-27** | The monitor for the ported routes is now as shaped as the routes: `site-health.yml` records `weather_api` with a `detail` that names the missing field (`current.temperature_2m`), adds a `runtime_paths` check over 8 sibling scenarios (`ANALYTICS` bound/unbound → 204 + 400 validation, cache hit/miss, mini/full, POST-only telemetry GET 405, GET/POST batch), and verifies the committed record against the run summary, the freshness artifact and the uploaded artifact. The aggregate check moved ahead of the `if: always()` commit so a red site still writes; `/data/site-health/latest.json` becomes a real URL at build time via `scripts/copy-dist.mjs`. `workflow_dispatch` now has `site_url` + `expect` so a healthy run and a broken run can both be exercised without a temporary branch. **Sandbox gap:** dispatching the workflow, listing Pages deployments and reading the Cloudflare dashboard cannot be done here; the commands and expected output are in `docs/ops/deployment.md` §4 and `docs/ops/pr/phase-5-site-health.md`. Action 9 stays Open until an owner observes them. |
| **Phase 3 parity-test hardening 2026-10-27** | The batch test passed over a stub that did not mirror the upstream. Every edge/parity integration test now imports a **committed fixture captured from the real upstream or deployed artifact** (`__tests__/fixtures/*` and `backend/utils/__tests__/fixtures/*`), and every fixture carries the three-line provenance header: capture URL, shape, refresh command. `__tests__/testQuality.test.js` fails if a fixture lacks that header, if a manifest test loses its fixture import, its fixture-sourced leaf assertion, or its cached-equals-returned assertion, or if a `toMatchObject`/`toHaveProperty` test has no fixture leaf. `docs/ops/test-quality-manifest.json` records the audit of all 84 files matched by the grep: nine integration tests pinned, three black-box Playwright specs with no stub, and four Node-only suites with dated dispositions (key-authenticated LLM, Kaggle ZIP/CSV, wind Actions job) — synthetic inputs that are explicitly **not** claimed as upstream mirrors. `pagesWeather`'s cached mini point now asserts `expect(miniBody).toEqual(batchPoint)`; `api/telemetry`'s structural `toMatchObject` is now `toEqual` over fixture leaves. Refresh: `node scripts/capture_edge_fixtures.mjs [--live]` and `node scripts/capture_open_meteo_fixtures.mjs`. |
| **Phase 2 cache discipline 2026-10-27** | `backend/utils/cacheContract.js` now owns verify-then-write for all three read-through caches: `openMeteo.js` (weather points, both runtimes), `markdownNegotiation.js` (documents + explicit `null` negative hits) and `ai_fallback_engine.js` (generated advisories). Every write is preceded by a **value assertion** (`assertComplete`, `assertMarkdownContent`, `assertAdvisory`); a failure does not write and is returned/logged with the named missing fields. Every read re-runs the same assertion; a failure deletes the entry and is a miss that re-fetches. `__tests__/cacheContract.test.js` pre-seeds the exact `{id, _meta}` hollow point from the 2026-10-27 outage into the real module cache and proves read-guard → re-fetch → guarded write → complete second read. `docs/ops/cache-write-register.json` lists **all 16 write sites** found by the grep; the six cache writes are guarded, the other nine (rate-limit counters, stores, gauges, signature expiry, route table) carry dated reasons why they are not read-through value caches. A static test fails on any new unregistered write line. No new dependency: hand-written checks instead of importing `zod` into the edge bundle (§ Cost constraints). |
| **Disposition 2026-10-27 (Phase 1) — no route is left known-unexercised** | `docs/ops/route-register.json` is the dated register of every `/api/**` path: seven edge routes with their live first-call evidence and value-assertion test, **22 browser-called Node-only paths** with a dated reason and a verify command, and every remaining `backend/routes/` / `serverless/` / `api/` registration (historical, review, exports, metrics, ingest writes) recorded as Node-only by decision. `__tests__/routeReachability.test.js` fails if a path in `frontend/src` is neither a `functions/api/` file nor on the disposition list, if a disposition has no date, if one goes stale after a port, or if an edge route has no value-assertion test. `__tests__/routeValueAssertions.test.js` invokes all seven Functions over captured upstream/artifact fixtures and asserts one leaf value per entity. Live GETs on 2026-10-27 (bodies in `docs/ops/pr/phase-1-route-sweep.md`): `/api/v1/forecasts/metadata` → `prediction_date 2026-10-24, row_count 128`; `/api/v1/forecasts/bulk?horizon=7_days` → `count 64`, Bagerhat `severity_score 0.6721`; `/api/v1/alerts?limit=1` → Chandpur Flash Flood, `severity_score 0.7062`, `state PUBLISHED`; `/api/v1/alerts/policy` → `watch_probability 0.4`, `policy_source builder`; `/api/v1/weather?…&mini=1` → `31.1 °C`; `/api/v1/weather/batch?coords=…` with `|` → `count 2`, `31.0/27.7 °C`; `/api/v1/telemetry` GET → `405`. **A live POST to telemetry is still outstanding** (this sandbox cannot POST); exact curl and expected 204 are in Action 12. Two query divergences found by exercising the routes were fixed at the source, not at the call sites: `lon` (400 before) and `;` (single point before) now parse in `backend/utils/weatherQuery.js`, imported by all three runtimes. `docs/ops/deployment.md` §7 carries the same correction. |
| **Phase 0 shape audit 2026-10-27 (after #107)** | `docs/ops/pr/phase-0-shape-audit.md` tables **every export** of `backend/utils/openMeteo.js` against the query shape it actually uses. The Open-Meteo docs say "Multiple coordinates can be comma separated … To return data for multiple locations the JSON output changes to a list of structures"; a real single-coordinate call answers one object and a real two-coordinate call answers a two-element array of complete objects (both captured verbatim into committed fixtures). The old `_extractPoint` mixed shape detection with mapping, believed the comment's imaginary "nested form", and read `generationtime_ms` / `current_units` / `hourly_units` / `daily_units` differently on the two paths. Now `_normalisePoint(raw)` returns **one internal contract** (an array of per-location records) and both `fetchWeather`/`fetchCurrentWeather` and `fetchCurrentWeatherBatch` call it; `_extractPoint(record)` is pure mapping with no shape branching, and blocks are never indexed into scalars. Comments in the module header, the batch JSDoc, `functions/api/v1/weather.ts` and `pagesWeather.test.js` now describe the two real shapes. `backend/utils/__tests__/openMeteo.test.js` pins object + array fixtures (10 tests). No call site was forked: the Node and Pages runtimes still import the same file. |
| **Note** | Whichever target is chosen, `api/**` and `backend/**` must not drift apart: `__tests__/api/serverlessRouting.test.js` and `__tests__/forecastServe.test.js` exist to keep them sharing one implementation. `PUSH_TO_API` stays `false` — writing ingest output through a metered Function for no user-visible gain is the opposite of the cost constraint. |

## Action 22 · Retire the Firebase Hosting site, not just its config (opened 2026-10-26)

| | |
|---|---|
| **Status** | Open — **a stale build is still publicly served.** |
| **Why** | The `hosting` block was deleted from `firebase.json` on 2026-10-26, but deleting a config does not take a deployment down. Measured the same day: `https://hazardnet-aas48424.web.app/data/freshness.json` returns `built_at 2026-09-24T20:35:20Z` — a **month-old** build with `0` published alerts against `74` assessed, `overall.state: "failing"` and all seven probe checks failing. That is the project's own `.web.app` hostname: public, indexable, and telling anyone who finds it that HazardNet's data is a month stale. |
| **Do** | In the Firebase console: **Hosting → the site → ⋯ → Disable** (or `firebase hosting:disable --project hazardnet-aas48424`). Keep the project itself — Auth, Firestore and FCM all live there — and keep `firestore.rules`. Then delete the `hosting-site=hazardnet-aas48424` TXT record from the Cloudflare zone, which currently advertises the origin. |
| **Verify** | `curl -sSI https://hazardnet-aas48424.web.app/` returns 404 or a Firebase "site not found" page, and no `x-fh-requested-host` header appears in any probe result. |
| **Closed by** | — |

---

## Action 23 · The Vercel GitHub App is still attached to this repository (opened 2026-10-26)

| | |
|---|---|
| **Status** | Open — **the last live pointer to Vercel, and it is in GitHub, not in the tree.** |
| **Why** | Deleting the configs removed every Vercel reference from the repository, but not the **repository integration**. Measured on PR #100 (`gh api repos/…/commits/9f34595/check-runs`): the check runs include `Vercel Preview Comments` from the `vercel` app, and the PR check list carries a `Vercel` deployment check pointing at `https://vercel.com/aas-core/hazardnet/…`. So every push to this repository still builds and serves a **Vercel preview deployment** of a project the repository no longer configures — a second origin serving a second build, which is the exact class of divergence the 2026-10-26 cutover exists to end. Once `vercel.json` is gone the preview builds either fall back to Vercel's own defaults (a build of a monorepo it no longer understands) or fail; either way the check sits on every PR. |
| **Do** | (1) In Vercel: **project → Settings → Git → Disconnect** the repository (or delete the project `aas-core/hazardnet` outright — nothing in this repository reads it any more). (2) In GitHub: **Settings → Integrations → GitHub Apps → Vercel → Configure → uninstall** for this repository only. If the `Vercel` check is a required status check on `main`, remove it there too, or every PR stays blocked on a check that no longer has anything to run. |
| **Verify** | A new push to any branch produces **no** `Vercel` or `Vercel Preview Comments` check run (`gh api repos/myself-aas/HazardNet/commits/<sha>/check-runs --jq '.check_runs[].name'`), and the Vercel dashboard lists no project pointing at this repository. |
| **Closed by** | — |
| **Why it is not in the code half** | A GitHub App installation is account state. There is no file to delete and no API this repository is authorised to call; recording it here is the only place it can be tracked. |

## Action 24 · Kaggle advisory as a pipeline-written R2 artifact (opened 2026-10-27)

| | |
|---|---|
| **Status** | Open — **scheduled PR `feat/kaggle-r2-artifact`**, dated 2026-10-27. Not started in this session because the browser still calls the route and deleting it without a replacement would remove a real (degrading) data path. |
| **Why** | `frontend/src/hooks/useKaggleAdvisories.ts` calls `/api/v1/kaggle?horizon=…` and `/api/v1/kaggle/advisories`. On Pages both 404, so the Advisories page renders *"The Kaggle advisory service could not be reached. No value is shown."* The Node handler cannot be ported: `backend/services/kaggleAdvisoryClient.js` uses HTTP Basic credentials (`Authorization: Basic`), `inflateRawSync` from `node:zlib`, and a `node:fs` cache that outlives the request — a Worker has none of those. |
| **Do** | Keep the parsing in **GitHub Actions**, where credentials and disk already exist: the daily ingest job writes the parsed, validated advisory rows to an R2 object (`advisories/<horizon>/latest.json`) with `generated_at`, `prediction_date` and a row count; a Pages Function at `functions/api/v1/kaggle.ts` reads that object through an `R2` binding and returns the Node envelope with a value assertion (`assertRows`) before answering 200. No credentials at the edge, no per-request ZIP inflate, no per-isolate cache. Add a provenance fixture captured from the artifact and one leaf-value assertion (the parity-test rule from Phase 3). Free tier: R2 reads are inside the 10M/month allowance; no paid dependency. `PUSH_TO_API` stays `false` — the pipeline writes the artifact, the Function only reads. |
| **Verify** | `curl -sS 'https://www.hazardnet.live/api/v1/kaggle?horizon=7_days' \| jq '.rows[0] \| {prediction_date, severity_score}'` returns two non-null values; the `generated_at` in the body equals the artifact's; a broken/empty artifact makes the Function answer 503 with a named reason rather than `200 {rows: []}`. |
| **Closed by** | — |
| **Why it is a separate PR** | It needs an R2 binding (dashboard) and a workflow secret, i.e. an owner step plus a code step. Bundling it into the deletion PR would leave a browser caller with no route at all for the length of the review. |

## § Cost constraints

**Effective 2026-10-26. Free tier only.** No paid dependency — a service, a plan upgrade, a second
host or a metered runtime — may be introduced without an explicit funding decision recorded here.
This is a **control**, not a note: it exists because two recommendations in this file were written
assuming money, and the next reader would rebuild them otherwise.

### What the architecture costs

Nothing. The expensive compute is in GitHub Actions and the Kaggle notebook; the site is static
HTML on Pages; the API surface is thin reads over a committed snapshot. No part of the design
needs a paid runtime, so no part of it should acquire one by accident.

### The withdrawal record

| Withdrawn 2026-10-26 | Assumed cost | Replaced by | Why the replacement is not a downgrade |
|---|---|---|---|
| Action 8 — Durable Objects / Upstash shared counter | $5/mo + a second account | The free plan's **single** edge rate-limiting rule, with `serverlessGuard.js` kept as the per-isolate layer | The per-isolate buckets were never a ceiling — they are `limit × warm instances`, i.e. unbounded under scale. An edge rule is a **real global** limit for the one path that needs it. |
| Action 12 — log drain → BigQuery/ClickHouse | $ + a warehouse | **Workers Analytics Engine** `writeDataPoint` | 100k data points/day and 3-month retention against a telemetry volume four orders of magnitude smaller. |

### The free allowances that actually bind

Read from Cloudflare's pricing and limits pages on 2026-10-26 where the row is marked **✓**.
The others are as stated in the 2026-10-26 memo and are worth confirming in the dashboard before
anything is designed around them — a wrong allowance is the one kind of error this file cannot
detect.

| Service | Free allowance | The cap that bites |
|---|---|---|
| Pages (static) | unlimited requests and bandwidth, 500 builds/month | **Builds.** Measured 2026-10-26: **75 of the 195 commits to `main` in the previous 30 days were probe commits** (52 in October alone) — ~a tenth of the monthly build allowance spent republishing one monitoring file. The watch-path exclusion and the `[skip ci]` marker in `site-health.yml` are cost controls now, not just anti-loops (`docs/ops/deployment.md` §9). |
| Pages Functions | 100,000 requests/day, **10 ms CPU** per request | CPU. Reads and proxies only — never model inference (Action 21). |
| R2 | 10 GB storage, 1M writes, 10M reads/month, no egress | Nothing near-term. This is why snapshots belong in R2 and not Firestore. |
| KV | 100k reads/day, **1k writes/day** | Writes. Never use KV as a counter. |
| D1 | 5 GB, 5M row reads/day | — |
| Analytics Engine **✓** | 100k data points written/day, 10k read queries/day, 3-month retention, ≤ 250 writes/invocation | Retention: anything needing longer history aggregates to R2 first. |
| Rate limiting rules **✓** | **1 rule**, `Path` field only, IP counting, 10 s counting period, 10 s mitigation | **One rule.** Point it at the most-abused path. |
| Cron Triggers | free | — |
| GitHub Actions | **unlimited on public repos**; private = 2,000 min/month, ×2 Windows, ×10 macOS | Repo visibility. `myself-aas/HazardNet` is **public** (`isPrivate: false`, GitHub API, 2026-10-26), so Action 14's `windows-2022` PR job and Action 3's emulator job cost nothing. Making the repo private turns both into a recurring bill. |
| Firestore Spark | 1 GiB, 50k reads/day, 20k writes/day *(stated 2026-10-26 — confirm the project is on **Spark, not Blaze**)* | Reads. Action 10's `publicProfiles` mirror is a cost control as well as a privacy fix. If the project is on Blaze, set a $0 budget alert with a hard cap. |

### 2026-10-27 · Phase 2 cache guards added no dependency

`backend/utils/cacheContract.js` is hand-written (four small checks) rather than a new
runtime dependency. `zod` is present in `package.json`, but importing it into
`backend/utils/openMeteo.js` would pull a schema library into the Pages Functions bundle
that serves every weather request — against the 10 ms CPU / bundle-size constraint above
for a check that needs four field tests. Cost of the guard: **two object walks per cache
read and one per write, zero bytes on the wire, $0**. No new service, plan or binding.

### How to add a paid dependency, if that day comes

1. Write the funding decision here, dated, with the monthly ceiling and the free alternative that
   was rejected.
2. Only then implement it, and update the action that needs it to name the paid service.
3. If the service is declined, record the decline — an action blocked on a funding decision is
   **blocked**, not abandoned, and must not silently become "not doing this".

---

## § Decision log

Decision records for this file. Superseded decisions are kept, dated, with what replaced them —
a control record that rewrites its own history cannot be audited.

### 2026-10-26 · Cloudflare Pages is the sole frontend deploy target (supersedes 2026-10-04)

**Superseded:** the 2026-10-04 decision *"deploys stay with Vercel and stay owner-run; no CI
deploy job is to be added"* (recorded in Action 17 and in the 2026-10-04 changelog line).

**Decision:** the web app is deployed **only** on Cloudflare Pages, built from `main` at the
repository root, publishing `dist/`. Vercel is not a deploy target in any form: the project, both
`vercel.json` files, `scripts/check-vercel-functions.mjs`, the analytics module and its build
gate, the two workflow deploy steps and the three `VERCEL_*` secret names are deleted.

**Why it changed:** the 2026-10-04 record described a deploy path that did not exist. Measured
that day argument-by-document: the only deploy step anywhere was gated on a `VERCEL_TOKEN` the
repository never held, so it silently deferred to a Git trigger while the domain was answered by
Firebase Hosting. On 2026-10-26 the owner moved both `hazardnet.live` **and**
`www.hazardnet.live` to `hazardnet.pages.dev` and asked for Vercel to be removed entirely. The
registration of a second configuration that no host read was the direct cause of the
2026-10-04 header drift and of the 2026-10-26 `www` false alarm.

**Consequences recorded here:**

- One static-host policy: `frontend/public/_headers`, pinned to `backend/security/csp.js` by
  `__tests__/securityHeadersParity.test.js`. The Firebase Hosting block was retired in the same
  change (Action 22 tracks disabling the site itself).
- The deploy trigger is a Pages deploy hook, not the push: both artifact-commit jobs write
  `[skip ci]`, which Pages honours, so the push alone would not rebuild the site (Action 17).
- The API is **not** on Pages. `/api/**` answers 404 and the client falls back to the committed
  snapshot (ADR 0008) until Action 21 chooses a host.
- `data/site-health/**` is excluded from the build watch paths and the probe commit carries
  `[skip ci]`, so monitoring cannot become a deploy loop (Action 9).

### 2026-10-26 · Free tier only — two cost-driven recommendations withdrawn

**Decision:** the project takes no paid dependency. Cloudflare Pages (static + Functions), R2, KV,
D1, cron triggers, Analytics Engine, the free plan's single rate-limiting rule and GitHub Actions
on a public repository cover the whole architecture at $0. Recorded as **§ Cost constraints**
above, with the allowances and the escape hatch.

**Withdrawn the same day, with why:**

- **Action 8** proposed Durable Objects / Upstash for a shared rate-limit counter. Cost without
  benefit: the per-isolate buckets were never a real ceiling, and one edge rule is a genuinely
  global limit at $0. Rewritten in place; the withdrawal is recorded in the action, not deleted
  from history.
- **Action 12** proposed a log drain into BigQuery/ClickHouse. A warehouse plus a second account
  to answer questions about a dataset that fits in Analytics Engine's daily allowance many times
  over. Rewritten in place.

**Also decided:** Action 21 targets **Pages Functions at the same origin**, not a Worker on a
subdomain and not a container — same port cost, one fewer deploy target, one fewer secret set, and
it eliminates the divergent header surface instead of duplicating it. The free tier and the header
contract point at the same answer, which is why this one is not a compromise.

**Not changed:** `PUSH_TO_API` stays `false`. Writing ingest output through a metered runtime for
no user-visible gain is the exact thing this section forbids.

### 2026-10-27 · Weather and telemetry port; metrics, kaggle and historical are recorded as Node-only

**Decision:** `/api/v1/weather`, `/api/v1/weather/batch` and `/api/v1/telemetry` are served by
Cloudflare Pages Functions. `metrics`, `kaggle` and `historical` are **not** ported, and that is
now the decision, not an open item.

**The shared-rule rule, applied twice.** The telemetry validator moved out of
`serverless/v1/telemetry.js` into `backend/utils/telemetryBatch.js` — dependency-free, no
`process`, no Node built-in — and both runtimes import it, so the 64 KiB cap, the 50-events
batch, the 20-properties limit, the 256-character values and the `/^[a-z0-9_]+$/` event-name
rule exist in one place. The weather routes import `backend/utils/openMeteo.js` unchanged rather
than re-deriving the query the normaliser uses. Neither is a copy; a future change to either
lands on both runtimes in the same commit.

**One bundle-level fix the import exposed.** `openMeteo.__getFetch()` did
`import('node-fetch')`, which looks dynamic but is a literal specifier, so esbuild resolved and
inlined `node-fetch`'s **browser shim** into the edge bundle — 28 KB of a 56 KB build, executing
a browser polyfill on a runtime that already has `fetch`. The specifier is now assembled at
runtime (`['node','fetch'].join('-')`), which esbuild leaves alone; a throwaway probe build
measured 28 KB → 24 KB with no shim code left in the output. The Node path still gets
`node-fetch` when it needs it.

**Bodies are bounded by hand.** The Node entries declared `bodyParser.sizeLimit`; a Pages
Function has no parser, so telemetry checks the raw text against 64 KiB *before* `JSON.parse`
(parsing first would buffer the attack) and the batch route caps at 256 KiB. Both answer 413.

**Why the three are not ported** (full argument in Action 21's disposition row): process metrics
do not exist for an isolate and the one meaningful gauge is already `/data/freshness.json`; the
Kaggle client needs Basic credentials, a ZIP inflate and a disk cache that outlives the request,
none of which a Worker has; and `historical` spends ≈ 9 ms of a 10 ms CPU budget re-serialising
a 1.5 MB file that the CDN already serves as a static asset. Porting any of them would mean
shipping a second implementation whose behaviour differs from the Node handler's — the thing the
parity tests exist to prevent.

**Consequences recorded:**

- The Advisories page shows no Kaggle severity on the edge deployment and says so — *"The Kaggle
  advisory service could not be reached. No value is shown."* That is a real gap, not a hidden
  one; if it needs closing, the shape is a pipeline-written artifact the Function reads.
- `/api/v1/telemetry` is the only writable endpoint, and it is now the intended target of Action
  8's single free edge rule — which remains uncreated, because creating it before there is
  abuse protects nothing.
- The Analytics Engine binding is dashboard-side (no `wrangler.toml` exists). Until it is added
  the route answers 204 and logs; it never fails the beacon.

### 2026-10-26 · The API's read surface moves to Pages Functions, served from the snapshot

**Decision:** `/api/v1/forecasts/bulk` and `/api/v1/forecasts/metadata` are served by Cloudflare
Pages Functions at `www.hazardnet.live` — same origin, free tier — reading the deployed
`/data/forecasts-latest.json` through the `ASSETS` binding. They are **snapshot-backed, not
Firestore-first**, unlike the Node handlers they mirror.

**Why snapshot-backed:** a Worker cannot load `firebase-admin` (`backend/db.js` is gRPC and
native); Spark allows 50k Firestore reads/day, and a per-request store query would spend that
budget re-serving bytes that are already on the CDN; and the client's own fallback reads the same
file, so serving the API from it means the two can never disagree about "the latest forecast".
The measured cost is 0 reads and roughly 2 ms CPU against the 10 ms ceiling.

**Why `metadata` shipped with `bulk`:** `site-health.yml` probes `/api/v1/forecasts/metadata`, not
`bulk`. Porting the one the monitor does not call would have left the API "up" and the probe
warning every run — a half-true state, and exactly the kind this register exists to catch.

**Consequences recorded:**

- `functions/_middleware.ts` carries the seven headers, importing
  `backend/security/httpHeaders.js` — `_headers` does not apply to Function responses, and the
  parity test now asserts the file, the module and the middleware agree by value.
- `frontend/public/_routes.json` scopes invocations to `/api/*`. Without it, a `functions/`
  directory makes every static request an invocation and loses the unlimited static tier.
  **`exclude` was corrected while implementing:** it takes priority over `include`, so the
  earlier plan's `exclude: ["/*"]` would have disabled the Functions entirely.
- Everything else under `/api/**` still answers 404, and the front door still falls back to the
  committed alerts snapshot. The queue is on Action 21.
- `PUSH_TO_API` stays `false`: ingest keeps writing commits, not edge requests.

### 2026-10-26 · The alert list moves to the edge, and the snapshot carries the policy

**Decision:** `/api/v1/alerts` and `/api/v1/alerts/policy` are served by Cloudflare Pages
Functions from the deployed `alerts-latest.json`. The alert list is the front door's live path;
until this change every visitor silently took the snapshot fallback because both routes 404'd.

**The policy is stamped, not recomputed.** `/alerts/policy` exists to say which thresholds the
alerts in force were produced under. A Worker has no `process.env`, and the Cloudflare project's
environment is not the pipeline's, so recomputing there could describe a policy the engine never
used — worse than an error. `scripts/build_alert_snapshot.mjs` therefore stamps the effective
policy and delivery transports from the environment of the ingest job that ran the engine, and
`policy_source` records whether an engine run report supplied its own. A deployment whose
artifact lacks the block answers **503** rather than a default, and the new `alerts_api` probe
fails on it.

**The public projection stopped being duplicated.** It lived in two files by deliberate design
(the second said importing the first would drag Express and multer into a cold start). A third
runtime would have made a redaction rule exist in three places, one on a different runtime and
build. `backend/alerts/publicView.js` is dependency-free and all three import it.

**Not ported, on purpose:** `alerts/evidence-card` (store-backed), `alerts/review` and
`alerts/run` (authenticated writes; a metered runtime is the wrong home for them).

**Recorded consequence:** the edge routes have no per-instance rate guard, because
`guardRequest` is a Node middleware. Their abuse control is Action 8's single edge
rate-limiting rule, which belongs to whichever endpoint turns out to be abused first.

### 2026-10-04 · `https://www.hazardnet.live` remains the canonical origin (unchanged)

**Decision, still in force:** `www` is canonical; the apex redirects to it; the code is not to be
changed to the apex.

**Re-affirmed 2026-10-26:** 41 tracked files, the sitemap (103 URLs), `robots.txt`,
`security.txt` and a build guard in `frontend/scripts/prerender.mjs` all name `www`, and the
apex answers with a redirect. The cutover therefore made `www` answer properly (Action 16 —
one dashboard step outstanding) instead of rewriting the origin. Changing the canonical host
would have been the larger, riskier change and was explicitly not taken.

---

## Change log

| Date | Change |
|---|---|
| 2026-10-02 | File created from the 12 in-tree citations; Actions 10, 11 (later 12–15) added; Action 6c recorded as closed. Owner still unassigned. |
| 2026-10-04 | Action 11 updated with the measured Kaggle publication gap (last update 2026-09-29, version 10); Actions 16 (canonical host) and 17 (deploy path) added after triaging the red site-health and advisory-ingest runs. Owner decisions recorded the same day: `www` stays the canonical host and is to be restored rather than replaced in code; deploys stay with Vercel and stay owner-run. |
| 2026-10-04 | Action 6d opened: the appearance control (`System / Light / Dark`) adds four Bangla strings to `frontend/src/lib/i18n.ts`, which Action 6c's closure note says must be reviewed under a new ID. |
| 2026-10-05 | CI: the one ESLint error on `main` — a literal two-space run inside a regex in `__tests__/darkTheme.test.js` (`no-regex-spaces`) — is fixed; it was failing the `Code Quality & Build` job and, with it, every open PR. The rest of that job (type-check, model handshake, serverless ESM, claims, design gates, build, bundle budget, content index, post-build suites) was re-run locally and is green. `site-health.yml`: a probe that cannot connect now reports `000` instead of `000000` (the `|| echo 000` fallback appended to curl's own `000`, naming a status code that does not exist) and the sitemap probe reports the no-response case as *unreachable* — pass/fail semantics unchanged. Actions 11, 16 and 17 remain owner-side and still red. |
| 2026-10-09 | **Measured, not inferred** (run 37870196679; evidence in `docs/audits/2026-10-09-cloudflare-403-origin-probe.md`): every failing path returns `HTTP 403` with `server: cloudflare` and **`cf-mitigated: challenge`**, body `<title>Just a moment...</title>`. Cloudflare is terminating the request; **no origin ever answers** (no `x-fh-requested-host`, `x-served-by`, `x-vercel-id`, `cf-cache-status` or `age` on any response — including `/`, `www`, and a path that has never existed). A Chrome UA and a plain `curl` UA are challenged identically, so `PROBE_USER_AGENT` (PR #87) could never have helped. The site-health probe runs from a datacenter IP that cannot execute a JavaScript challenge, so **its red state is a false alarm for human-facing availability**. Supersedes the earlier 2026-10-09 line, which inferred a stale deployment from the 403s alone — that inference is withdrawn. Action 18 opened. |
| 2026-10-09 | Action 18, workflow side implemented: `site-health.yml` sends `x-hazardnet-probe` (from the `SITE_PROBE_TOKEN` Actions secret) on every probe request and records `edge_challenged` in `data/site-health/latest.json`, so a blocked probe is distinguishable from a down site in the committed artifact, not just the run summary. What remains is owner-side only: the Cloudflare WAF skip rule and the secret itself (see the updated **Do**/**Verify**). |
| 2026-10-26 | **Retired two live workflows to `.github/workflow-templates/`** (both needed owner-side credentials this repository does not have): the Android release pipeline (`android_release.yml`) and the duplicate `android-apk` job in `app-releases.yml`, plus the ingest job's Slack notify step. `app-releases.yml` now builds Windows only and names its release `v<windows-version>-windows-<sha>`. `scripts/notify_ops.mjs` and its tests stay in the tree. Action 19 opened for re-enabling them. Same pass: `verify-secrets.yml`'s static audit was matching **nothing** (the opener was built as `$` + `{`, and the `EXPECTED` array had lost its opening assignment), and `scripts/verify-actions-secrets.sh` did not parse (`case` branch with no pattern) — all three fixed and the expected set extended to the 19 secrets the remaining workflows actually reference. |
| 2026-10-26 | **Measured the live security headers** (`docs/audits/2026-10-26-live-security-headers.md`): `hazardnet.live` sends `X-Content-Type-Options` + `Referrer-Policy` and **no** HSTS, CSP or `Permissions-Policy`, with no origin fingerprint; the Firebase origin (`hosting-site=hazardnet-aas48424`) is still the 2026-09-24T21:56Z build and also lacks CSP + `Permissions-Policy`; `www` returns Cloudflare's challenge page whose own CSP/`Permissions-Policy` would pass the probe if it ever read them. Action 17 updated with the evidence and the "identify the origin / Transform Rule" path. `site-health.yml` now records which headers are missing in `checks[].detail` and prints the answering host's fingerprint, so this is legible without the step log. |
| 2026-10-26 | **`www` reported the alerts artifact unreadable on a correct deployment** (`docs/audits/2026-10-26-www-front-door-unreadable-alerts.md`): `www` is Vercel (API answers `200` with an empty ledger) while the apex is Cloudflare Pages (no API, so the snapshot loads). Both served the merged build and identical artifacts — nothing was stale. Fixed in code: `loadAlerts` falls through to the snapshot when the live API states no ledger, `generated_at` is no longer set from `fetched_at`, `LiveStatusStrip` takes `readFailed` (loader `source === 'none'`) instead of inferring unreadability from `counts === null`, and both alert routes now serve `counts`. Action 20 opened for the host decision and for probing `www` in `site-health.yml`. |
| 2026-10-26 | **Vercel removed as a deployment target** (owner instruction: *"completely remove everything point to vercel"*). The DNS export for the day shows `hazardnet.live` **and** `www.hazardnet.live` both CNAME to `hazardnet.pages.dev`, so Pages is the only host. Deleted: `vercel.json`, `frontend/vercel.json`, `scripts/check-vercel-functions.mjs`, `frontend/src/lib/vercelAnalytics.ts`, the `check:functions` script and its CI step, the two workflow deploy steps, the three `VERCEL_*` secret names, the `.vercel` ignore entry and `VITE_VERCEL_ANALYTICS`. Behaviour that the deleted configs declared now lives in `frontend/public/_headers` (policy + cache rules), `frontend/public/_redirects` (the one legacy redirect, and deliberately **no** SPA catch-all) and `dist/404.html`; `__tests__/{securityHeadersParity,securityTxt,modelArtifactsNotServed,seoFoundations}.test.js` were re-pointed at those files. Action 2 closed, Action 17 closed for the site and left open for the API, Action 20 resolved by DNS. `docs/ops/deployment.md` is the new single record. |
| 2026-10-26 | **Cloudflare Pages cutover, phase 2** — deploy trigger is now the Pages deploy hook (`CF_PAGES_DEPLOY_HOOK`, retried, fails loudly), documented with its fallback (`wrangler pages deploy`) and its credentials in `docs/ENVIRONMENT_SECRETS.md` §1.1.1 plus two new rotation-register entries. The Firebase Hosting block was retired after measuring that `hazardnet-aas48424.web.app` still serves the **2026-09-24** build; Action 22 opened to disable the site itself. `site-health.yml` now requires the six headers **with their values** (not just presence), warns when the answer is not Cloudflare-fronted and fails if Firebase answers; `contents: write` narrowed to the `probe` job; the probe commit and both artifact commits carry `[skip ci]`, which is why the deploy hook is mandatory. `securityHeadersParity` pins the exact values, the 100-rule/2,000-char parser limits and the absence of a second static-host policy. Actions 3, 5, 8, 10, 11, 12, 13, 14, 15, 16, 17 and 9 carry dated measurements; 4 and 7 record their history search; 21 (API host) opened. |
| 2026-10-26 | **The Vercel GitHub App is still installed on the repository.** `gh api …/check-runs` on PR #100 shows `Vercel Preview Comments` (app `vercel`) and a `Vercel` deployment check pointing at `vercel.com/aas-core/hazardnet`. Removing the configs does not remove an app installation, so every push still produces a preview deployment of a project this repository no longer configures. Action 23 opened; it is an account-level action, not a code change. |
| 2026-10-26 | **Cost became a control.** New § Cost constraints (free tier only; no paid dependency without a funding decision), with the binding allowance for each service and the procedure for adding one. Two cost-driven recommendations withdrawn and rewritten in place: Action 8's Durable Objects/Upstash counter → the free plan's single edge rate-limiting rule (strictly better for the one abusive path, no worse elsewhere); Action 12's BigQuery/ClickHouse drain → Workers Analytics Engine. Action 21 re-targeted to **Pages Functions at the same origin**, with `_routes.json` recorded as mandatory (without it every static request becomes a metered Function invocation), Runtime → Fail open/closed set to *fail open*, and the 10 ms CPU limit stated as the design constraint it is. Repo visibility measured (`isPrivate: false`): Action 14 needs no deferral and Action 3's emulator job is free; both now say what would change if the repo went private. Action 10 gains its cost reason. |
| 2026-10-26 | **First API endpoints on the edge.** `functions/api/v1/forecasts/{bulk,metadata}.ts` + `functions/_middleware.ts` + `frontend/public/_routes.json` + `backend/security/httpHeaders.js` + `backend/utils/forecastSnapshotServe.js`. Two tests hold it: `pagesForecasts` runs the Node handlers beside the edge ones and compares envelope keys, rows and cache policy; `securityHeadersParity` now also asserts the middleware reproduces `_headers` by value, that `_routes.json` cannot exclude the whole site, and that no shared module is parked under `functions/` where it would become a public route. `metadata` came with `bulk` because the probe calls it. Action 21 keeps the remaining queue; Action 17's API half is now partial rather than open. |
| 2026-10-26 | **The alert list is on the edge.** `functions/api/v1/alerts/{index,policy}.ts` + `backend/utils/alertSnapshotServe.js`, and the public projection extracted to `backend/alerts/publicView.js` so three runtimes share one redaction rule instead of three copies. `scripts/build_alert_snapshot.mjs` now stamps the effective policy and delivery transports into the artifact, with `policy_source` recording the writer — the policy endpoint cannot report the thresholds it never had (`policy` was `null` in every committed snapshot until today). `__tests__/pagesAlerts.test.js` runs the Node handler and the edge handler over the same documents and compares ids, order, envelope keys and cache policy; it caught two divergences before merge (`filters.state` echoes what was served, not what was asked for). `site-health.yml` gained an `alerts_api` check: a non-PUBLISHED row is a hard failure, as is a snapshot that lost its stamped policy. Committed artifact regenerated with the stamp (rows and `generated_at` unchanged). |
| 2026-10-27 | **Queued ports finished, and the queue closed.** `weather`, `weather/batch` and `telemetry` now answer on the edge; the telemetry validator moved into `backend/utils/telemetryBatch.js` so both runtimes import one set of input rules, and `openMeteo`'s literal `import('node-fetch')` became a runtime specifier to keep a 28 KB browser shim out of the bundle. `metrics`, `kaggle` and `historical` are recorded as **Node-only** with the runtime property that blocks each (no `process` series; `node:zlib` + `node:fs` cache + Basic credentials; 9 ms of a 10 ms budget for bytes the CDN already serves), instead of being shipped as drifting copies. Action 12's writer landed with its sink selectable at runtime; the `ANALYTICS` binding is a dashboard step and the endpoint is correct without it. **The first live probe of the batch route found a real defect the new tests had missed** — Open-Meteo returns a JSON *array* for N coordinates, `_extractPoint` assumed the nested-object form, so every batch point came back with `_meta` and no weather, and the empty point poisoned the 15-minute cache for `mini` lookups; fixed in the shared normaliser (so the Node twin is fixed too) and the test stub now answers in the shape upstream actually uses. `site-health.yml` gained a `weather_api` check over both weather routes that requires a numeric reading on every point — a 200 alone is what the defect looked like — and its closing summary now counts the checks instead of hard-coding "7". |
| 2026-10-27 | **Phase 0 — shape audit of the shared normaliser** (`docs/ops/pr/phase-0-shape-audit.md`). Read `backend/utils/openMeteo.js` end to end and tabled every export against the query shape it sends and the response shape Open-Meteo documents. Divergences found and fixed in the same commit as their comments: the imaginary "nested object" form is gone; `generationtime_ms`, `*_units`, `location_id` and `timezone_abbreviation` are normalised on both paths; `hourly`/`daily` arrays are never indexed as locations. `_normalisePoint(raw)` now returns one internal contract (per-location records) and both the single and batch paths call it; `_extractPoint(record)` is pure mapping. Two real upstream fixtures with provenance headers (object and array) and 10 shape-contract tests live in `backend/utils/__tests__/`. The comment in `functions/api/v1/weather.ts` and the regression comment in `pagesWeather.test.js` were corrected in the same commit — a comment describing a shape upstream never sends is an instruction to reintroduce the bug. Action 21 carries the audit row. |
| 2026-10-27 | **Phase 1 — latent route sweep** (`docs/ops/pr/phase-1-route-sweep.md`). Every `/api/**` path is now in `docs/ops/route-register.json`: seven Pages Functions with live first-call evidence, 22 browser-called Node-only paths with dated dispositions, and every remaining router registration recorded as Node-only. `__tests__/routeReachability.test.js` enforces the invariant (function file OR dated disposition) and `__tests__/routeValueAssertions.test.js` asserts a fixture leaf value on all seven edge routes. Live GET probes (2026-10-27) of metadata/bulk/alerts/policy/weather/batch/telemetry are recorded verbatim in the PR description. Two latent divergences surfaced and were fixed in one shared parser (`backend/utils/weatherQuery.js`, used by Express, serverless and Pages): `lon=` answered 400 and `;`-separated `coords` produced one point. Action 21 gains the dated disposition row; `docs/ops/deployment.md` §7 documents the query contract. No route remains "known-unexercised": the only unexercised *method* is a live POST to `/api/v1/telemetry`, explicitly owned by Action 12 with a curl. |
| 2026-10-27 | **Phase 2 — verify-then-write for every cache** (`docs/ops/pr/phase-2-cache-contract.md`). New `backend/utils/cacheContract.js` provides `assertComplete`, `assertMarkdownContent`, `assertAdvisory` and `createVerifiedCache`; the three read-through caches (`openMeteo`, markdown negotiation, AI advisory) now use it for both guards. A hollow `{id,_meta}` weather point can no longer be written or served: `__tests__/cacheContract.test.js` seeds it into the real cache and asserts the read guard rejects it, a re-fetch writes a complete point, and the second read returns that point without another upstream call. `docs/ops/cache-write-register.json` tables all 16 grep-matched write sites with guards or dated dispositions, and a static test fails on unregistered sites. Cost constraints record that the checks are hand-written rather than a new `zod` import into the edge bundle; `PUSH_TO_API` stays false. Action 21 carries the discipline row. |
| 2026-10-27 | **Phase 3 — harden the parity test class** (`docs/ops/pr/phase-3-test-quality.md`). Audited all 84 files matched by `git grep -lE "toMatchObject|toHaveProperty|\.count|\.id\b|\.length" __tests__/ e2e/`; nine edge/parity integration tests now use provenance fixtures captured from real upstream/deployed artifacts, assert at least one leaf value per entity sourced from those fixtures, and assert cached-equals-returned where a cache is read. New `__tests__/testQuality.test.js` + `docs/ops/test-quality-manifest.json` make provenance headers and leaf assertions enforceable; JSON fixtures use a `.provenance.md` sidecar. Refresh scripts `scripts/capture_edge_fixtures.mjs` and `scripts/capture_open_meteo_fixtures.mjs`. Four Node-only suites with key-authenticated or synthetic inputs (chatService, Kaggle, wind) carry dated dispositions instead of a false upstream claim. Action 21 carries the row. |
| 2026-10-27 | **Phase 4 — disposal of the three latent routes** (`docs/ops/pr/phase-4-disposition.md`). `historical`: greps show no browser/e2e caller (the client reads `/data/historical/*.json`), a live fetch confirmed the CDN serves the 1.5 MB / 3,062-row catalog, and a local V8 measurement recorded parse 2.85 ms + stringify 5.51 ms (median 8.41 ms total, p95 11.44 ms) against the 10 ms isolate budget — so the route and its alias were deleted, with the permanent-404 comment in `frontend/public/_redirects`. `metrics`: no process series exists in an isolate; deleted both `/metrics` surfaces and published the three real gauges in `/data/freshness.json -> gauges.series[]` (`scripts/build_freshness_artifact.mjs`, asserted by `__tests__/freshnessGauges.test.js`). `kaggle`: V8 incompatibility confirmed (Basic auth, `node:zlib`, `node:fs` cache) **and** a live browser caller found — so it is not deleted; Action 24 opens with the named PR `feat/kaggle-r2-artifact` and the pre-computed artifact plan. Monitoring files, the API catalog, site-routes content, SECURITY.md, dev proxies and the Firebase smoke workflow were updated in the same commit. Nothing is left "dispositioned but still deployed and unexercised". |
| 2026-10-27 | **Phase 5 — verify the site-health record lands** (`docs/ops/pr/phase-5-site-health.md`). The committed record had no `weather_api` check (last publish 14:43Z, 8 checks), the URL `/data/site-health/latest.json` was not served, and the commit step ran before the aggregate check. Workflow: job-scoped `contents: write` retained; aggregate check moved ahead of an `if: always()` commit; `workflow_dispatch` gained `site_url` + `expect=healthy\|broken` and publishes to the dispatched ref with a forced commit; `[skip ci]` and the `data/site-health/**` watch-path exclusion retained. New `scripts/verify_site_health_record.mjs` compares record ↔ freshness artifact ↔ run summary and rejects a hollow failure (`detail: null`); new `scripts/probe_runtime_paths.mjs` runs 8 sibling runtime scenarios with leaf assertions; `scripts/copy-dist.mjs` publishes the record URL at the next ordinary build. `__tests__/siteHealthRecord.test.js` (16 tests) plus provenance fixtures pin the contract. Action 9 gains a measured row and the exact owner verification commands; **no action is closed on unverified evidence**. |
| 2026-10-27 | **Phase 6 — owner binds Analytics Engine** (`docs/ops/pr/phase-6-analytics-engine.md`). The repository side of Action 12 is complete but the action is **still Open**: a Cloudflare binding, a Production-scoped `VITE_ANALYTICS_ENABLED`, a redeploy and a live SQL query cannot be performed from this sandbox. `functions/api/v1/telemetry.ts` now writes `writeDataPoint` only for `www.hazardnet.live` / `hazardnet.live` (a `*.pages.dev` preview with an accidentally shared binding warns and takes the log sink), catches a throwing binding instead of returning a 500, and accepts an `env` that is absent. `backend/utils/telemetryBatch.js` adds an 8 KiB cap on serialised properties so the three blobs stay under Cloudflare's 16 KB-per-data-point limit — long **keys** were the way past the old per-value cap. `__tests__/analyticsEngineBinding.test.js` (12 tests) asserts fixture leaves on both transports, the Preview guard, the throwing binding, the oversized payload and the owner runbook; `__tests__/pagesTelemetry.test.js` now expects fail-open on a broken binding; the Node suite gains the same size case. `scripts/verify_analytics_engine.mjs` proves the owner's `index1` SQL query matches the writer's `blobs`/`doubles`/`indexes`. Action 12's Verify steps, `docs/ENVIRONMENT_SECRETS.md`, `docs/ops/deployment.md` §7, `docs/ops/route-register.json`, and the stale "Node telemetry handler is deleted" claims in `docs/codebase/{ARCHITECTURE,INTEGRATIONS}.md` were corrected. Cloudflare docs confirm free-tier limits (100k writes/day, 10k queries/day, three months), the 16 KB/96-byte/250-write caps, that bindings are environment-scoped and need a redeploy, and that an Analytics Engine binding cannot be used locally. |
