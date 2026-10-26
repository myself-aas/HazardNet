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
| **Measured 2026-10-26** | Unchanged by the deploy cutover, and still unimplemented: `grep -rn 'setup:emulators\|emulators:exec\|java-version' .github/workflows/` returns **0** matches. The Resident guard it is meant to complement (the shape test in `__tests__/`) is the only thing checking the rules today. Needs the owner's Google Cloud service account either way — CI cannot read Firestore. |

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

## Action 8 · Shared rate-limit counter

| | |
|---|---|
| **Status** | Open |
| **Why** | `backend/middleware/serverlessGuard.js` and `SECURITY.md` are explicit that the buckets are **per instance** (`limit × instances`), so the effective ceiling scales with the number of warm lambdas. |
| **Do** | Move the counters to a shared store (Upstash/Redis or an equivalent) and have `guardRequest` read/write through it. |
| **Verify** | Two concurrent instances share one count — fire 2 × N requests from two hosts and confirm the second batch is throttled at N, not 2N. |
| **Closed by** | — |
| **Measured 2026-10-26 (decision, not an implementation)** | The cutover does not change this, because the API is not on Pages (`docs/ops/deployment.md` §7). When an API host exists, the counter belongs in **one** place the host can reach: a **Durable Object** on Cloudflare Workers if the host is Workers-based (exact counts, no eventual consistency — KV is the wrong primitive here and Upstash is the fallback if Workers Paid is unavailable), otherwise Redis/Upstash over REST next to the Node process. `backend/middleware/serverlessGuard.js:66` is a module-level `Map`, so the change is one function (`bump`) plus a configured client — not a rewrite. **Not implemented in this cutover:** there is no host to point it at, and a client for a store that does not exist is untested code pretending to be a control. |

## Action 9 · Site-health probe cannot publish its result

| | |
|---|---|
| **Status** | Open |
| **Why** | This repository's workflow permissions are read-only, so the step that commits
`data/site-health/latest.json` back to the branch fails with a warning. The result survives in
the run summary and the uploaded artifact, but the committed file goes stale. |
| **Do** | Done in the repository, twice over. (1) `contents: write` is granted **to the `probe` job only** — a file-level grant would hand the same scope to every future job — and the publish step still degrades to a warning plus an artifact if the repository-wide workflow permission is read-only, because a job-level setting cannot override that. (2) The probe commit now carries `[skip ci]`, and `data/site-health/**` is on the Pages build-watch exclude list (`docs/ops/deployment.md` §2): without both, every state change in a monitoring check would redeploy the whole site. **Do not switch this to GitHub Pages** — that would reintroduce a second host, which is the thing the 2026-10-26 cutover removed. |
| **Verify** | One scheduled run on `main`: `data/site-health/latest.json` gains the new `ran_at` with no manual commit, **and** `Workers & Pages → hazardnet → Deployments` shows no new deployment for that commit. |
| **Closed by** | — *(repository side complete; needs one green scheduled run to close)* |
| **Measured 2026-10-26** | The job-level permission and the `[skip ci]` commit are in `.github/workflows/site-health.yml` at this commit. The last committed probe result (`data/site-health/latest.json`, `ran_at 2026-10-26T06:31:52Z`, 7/7 checks passing) predates both, so the *effect* is unverified until the next scheduled run. The status stays Open for that single observation — closing it before the run would be recording an intention as a result. |

## Action 10 · Get profile PII out of the public read path (SEC-14)

| | |
|---|---|
| **Status** | Open — added 2026-10-02 |
| **Why** | `firestore.rules` allowed `get, list: if true` on `profiles`, so an anonymous client could read and enumerate email, phone, WhatsApp, address and pinpoint coordinates for every account. Reads are now opt-in per row and capped at one row per query, but **Firestore cannot hide individual fields in a read**: a public profile still ships its PII. |
| **Do** | (a) Backfill `profile_visibility` on rows that predate the field (default-deny now hides them). (b) Add a `publicProfiles/{uid}` mirror written by the backend holding only the display fields the profile page renders, and point `/u/<username>` at it. (c) Then move `email`, `phone_number`, `whatsapp_number`, `address`, `pinpoint_lat`, `pinpoint_lng` out of the public document entirely. |
| **Verify** | A public profile fetched anonymously contains no contact field; the emulator suite from Action 3 covers it. |
| **Closed by** | — |
| **Measured 2026-10-26** | Unchanged by the cutover. `firestore.rules:34` still documents `publicProfiles` as the *long-term* fix and the mirror does not exist (`grep -rn publicProfiles backend/` → no writer). The `(a)` backfill is an owner-side Firestore write for rows that predate `profile_visibility`; `(b)` and `(c)` are code and are blocked on an API host, because the mirror is written by the backend. |

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

## Action 12 · Decide where analytics events are stored

| | |
|---|---|
| **Status** | Open — added 2026-10-02 |
| **Why** | `POST /api/v1/telemetry` (added with `@hazardnet/analytics`) validates batches and emits them to the platform log, then acknowledges. Nothing persists them. That was deliberate: an unauthenticated endpoint writing to Firestore is a data-integrity, privacy and cost decision, not a technical one. |
| **Do** | Pick a sink (log drain → BigQuery/ClickHouse, or a hosted collector), then either forward the `{"tag":"analytics", …}` log lines or replace the `console.log` in `serverless/v1/telemetry.js` with a write. **Blocked on hosting**: the endpoint is served by `api/`, which has no host today (`docs/ops/deployment.md` §6). The client-side flag is `VITE_ANALYTICS_ENABLED=true` in the Pages build variables. |
| **Verify** | Load the site with the flag on, watch a batch arrive at `/api/v1/telemetry` (204), and see the same event in the sink with the same `session`. |
| **Closed by** | — |
| **Measured 2026-10-26 (decision, not an implementation)** | The sink is still `console.log(JSON.stringify({tag: 'analytics', …}))` (`serverless/v1/telemetry.js:136`) — the transport *is* the log line, and `__tests__/api/telemetry.test.js` pins that. The cutover makes one option concrete and removes another: **Workers Analytics Engine** (`writeDataPoint`) or **Queue → R2 → BigQuery** are the Cloudflare-native sinks, but both require a **Pages Function**, which this deployment deliberately does not have while the API is off Pages (`docs/ops/deployment.md` §3, Action 21). So the sink choice is now downstream of wherever the API ends up, not a standalone decision. `VITE_ANALYTICS_ENABLED` must be set in the Pages **Production** scope only, never Preview. |

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
| **Measured 2026-10-26** | Closer than the title says: `.github/workflows/windows-compile.yml` is already `on: pull_request` with `paths:` limited to `apps/windows/**` and the workflow file itself, and runs on `windows-2022` (line 22) — the compile-only PR job exists. What is missing is the proof, and it cannot be produced here (no Windows runner in this sandbox): break an import in `apps/windows/src` on a throwaway branch, confirm the job goes red, then close with that run's link. |

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
| **Status** | Open — **decision of 2026-10-04 stands and was not revisited: `www` stays canonical, the code does not move to the apex.** The owner has done the DNS half (2026-10-26). The hostname still does not serve the site, because it is not attached to the Pages project. |
| **Why** | 41 tracked files treat `https://www.hazardnet.live` as the canonical origin: the `<link rel="canonical">` tags and structured data (`frontend/src/SEOHead.tsx`), the sitemap and `robots.txt`, `security.txt`'s `Canonical:`, the content engine (`scripts/build_content_engine.mjs`), and a build guard in `frontend/scripts/prerender.mjs` that **fails the build** if the origin is anything else. Meanwhile `www.hazardnet.live` is NXDOMAIN and `hazardnet.live` answers 200 directly from Firebase Hosting (199.36.158.100, `x-fh-requested-host`). So every URL in the deployed sitemap is unreachable, `site-health.yml`'s "Verify every sitemap URL resolves" probe fails on all 85 of them, and Google is being pointed at a host that does not exist. |
| **Do** | **One step left, and it is in the Cloudflare dashboard, not in DNS.** The record is already correct — `www.hazardnet.live CNAME hazardnet.pages.dev`, proxied, in the 2026-10-26 11:17:31 zone export — but the hostname is not a custom domain on the Pages project, so Cloudflare has an origin it cannot route to. **Workers & Pages → hazardnet → Custom domains → Set up a domain → `www.hazardnet.live`**, then let the certificate issue. Do **not** re-create the DNS record and do not point the canonical tags at the apex: 41 tracked files, the sitemap, `robots.txt`, `security.txt` and the prerender build guard all name `www`, and that is the decision of record. While you are in the dashboard: **SSL/TLS → Edge Certificates → Always Use HTTPS on, HSTS on** — Cloudflare ignores the `Strict-Transport-Security` line in `_headers` on some plan tiers. |
| **Verify** | `dig +short www.hazardnet.live` returns the Pages target; `curl -sSI https://www.hazardnet.live/` answers **200** with `server: cloudflare`, a `cf-ray` and the six headers from `_headers`; `curl -sSI https://hazardnet.live/` answers **301** to `https://www.hazardnet.live/`; `https://www.hazardnet.live/sitemap.xml` lists 103 URLs. The `canonical_host` check in `site-health.yml` — added for exactly this — flips green on the next run. |
| **Measured 2026-10-26 (this cutover)** | DNS: both hostnames `CNAME hazardnet.pages.dev`, proxied. Apex: redirects to `www` (requesting the apex resolves to the www URL). `https://www.hazardnet.live/` → **HTTP 522**, "initial connection between Cloudflare's network and the origin web server timed out", Ray `a50a1ae77d27c6e3`. Apex artifacts are healthy meanwhile: `data/freshness.json` `built_at 2026-10-26T06:31:52Z`, 4/4 sources fresh, last probe 7/7 with `security_headers: all 5 headers present`. So the site is up and the hostname every canonical URL points at is not. |
| **Closed by** | — |

## Action 17 · The site has a deploy path; the API has no host

| | |
|---|---|
| **Status** | **Closed for the site (2026-10-26)** — Pages builds `main` on push, owner-run in the sense that nobody needs a token. **Open for the API**: no host runs `backend/` or `api/` today. Supersedes the 2026-10-04 decision that deploys would stay with Vercel. |
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

## Action 21 · Migrate the API surface to Cloudflare, or host it elsewhere (opened 2026-10-26)

| | |
|---|---|
| **Status** | Open — **new workstream, deliberately not part of the Pages cutover.** |
| **Why** | The site is static Pages, so `/api/**` answers 404 (`docs/ops/deployment.md` §7). The front door degrades honestly to the committed snapshots, but anything that needs a live store — ingest push, alert review, telemetry, chat, `/api/metrics` — has no runtime. Two API implementations exist and both are unhosted: `backend/` (Express, 11 routers) and `api/**` (6 Node-function entry points over 20 shared handlers). |
| **Do** | Choose one target, in this order of least surprise: (a) **a container** running `backend/server.js` — zero code change, keeps multer/Firebase/Firestore, and `API_METADATA_URL` points the probes and the frontend at it; (b) **Pages Functions** dispatching into the same `serverless/**` handlers — needs an adapter, a `functions/` tree, and a decision about the header contract in `docs/ops/deployment.md` §3 (a Function makes every request an invocation, and `_headers` does **not** apply to Function responses, so the middleware must set the same six headers and the parity test must cover it); (c) **Workers** with the same handlers, if the store access can be made edge-safe. |
| **Verify** | `curl -sI https://<api-host>/health` answers, `/api/metrics` exposes `hazardnet_forecast_age_hours`, the frontend's live-API panel stops falling back to the snapshot on the front door, and `docs/ops/deployment.md` §7 is rewritten to say where the API runs. |
| **Closed by** | — |
| **Note** | Whichever target is chosen, `api/**` and `backend/**` must not drift apart in the meantime: `__tests__/api/serverlessRouting.test.js` and `__tests__/forecastServe.test.js` exist to keep them sharing one implementation. |

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
