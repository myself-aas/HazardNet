# Owner actions

**Status: unassigned.** No individual owns this file yet — it is referenced from
`backend/alerts/policy.js`, `backend/middleware/serverlessGuard.js`, `SECURITY.md`,
`.github/workflows/site-health.yml`, `data/site-health/README.md`, `frontend/scripts/prerender.mjs`
and `e2e/full-app-qa.spec.ts`, but it was never committed, so the actions it pointed at were
untraceable. This file was reconstructed on **2026-10-02** from those references; the IDs below
are the ones the code cites (`Action 5`, `Action 8`, `Action 9`, `§2a-bis`), and every entry that
could not be recovered from a citation is marked *not reconstructed* rather than invented.

**Owning it means:** you can reach the Vercel project, the Firebase project, the GitHub
repository settings and the provider consoles. Nothing here can be closed from a pull request.

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
| **Status** | Open |
| **Why** | The Vercel project builds from the repository root while the app lives in `frontend/`, so the root `vercel.json` rewrites never applied. |
| **Do** | Set **Vercel → Project → Settings → Root Directory** to `frontend`, or delete the root `vercel.json` so the one in `frontend/` is the only configuration. |
| **Verify** | `GET /` returns the SPA, and a deep link (`/district/dhaka`) returns the prerendered HTML rather than the Vercel 404 page. |
| **Closed by** | — |

### §2a-bis · The live API surface and the prerender step

The sub-case that `site-health.yml` (lines 120 / 244 / 285), `e2e/full-app-qa.spec.ts` (90 / 121)
and `frontend/scripts/prerender.mjs` all warn about. Three separate symptoms, one root cause:

1. **Deep links 404** — the prerender step did not run for the deployed build, so
   `/district/<slug>` and `/u/<username>` have no static HTML.
2. **`GET /api/v1/forecasts/bulk` returns non-200** — while the Root Directory is wrong, the
   `api/` family is not deployed at all. The workflow falls back to probing the committed
   snapshot (`frontend/public/data/forecasts-latest.json`), which *is* the active delivery path
   while `PUSH_TO_API=false`, so this warning is expected in that mode — but it stops being
   expected the moment `PUSH_TO_API=true`.
3. **The probe result cannot be published** — see Action 9.

Set the repository variable `API_METADATA_URL` if the API is served from a host other than the
site origin, so the probe stops guessing.

## Action 3 · Validate `firestore.rules` against the emulator

| | |
|---|---|
| **Status** | Open |
| **Why** | `__tests__/firestoreRules.test.js` pins the *shape* of the rules file because the behavioural pass needs `@firebase/rules-unit-testing` plus the emulator JAR (Java), which is not installed in CI. Nothing has ever executed a rule. |
| **Do** | Install Java + the Firebase emulator, then run the behavioural suite: owner read/write allowed, anonymous read denied on a private profile, anonymous `list` without `limit(1)` denied, over-size and wrong-owned writes denied. |
| **Verify** | Every assertion passes against the emulator, and the shape test is kept as the CI-resident guard. |
| **Closed by** | — |

## Action 4 · *not reconstructed*

No citation in the tree identifies this action. If you have the original file, restore the entry.

## Action 5 · Alert thresholds are placeholders

| | |
|---|---|
| **Status** | Open — **blocks external alerting** |
| **Why** | `backend/alerts/policy.js` records that `model_severity` saturates near 1.0, so nearly every district lands at `WATCH`. The thresholds are placeholders pending the Phase 9 validation. |
| **Do** | Run the Phase 9 validation over a season of ground truth, then set the `WATCH` / `WARNING` / `SEVERE` cut-offs and the hazard-specific overrides in `policy.js`. |
| **Verify** | A replay (`__tests__/alertReplay.test.js`) produces a tier distribution that is not ~100 % `WATCH`, and the new numbers are recorded here. |
| **Closed by** | — |

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

## Action 8 · Shared rate-limit counter

| | |
|---|---|
| **Status** | Open |
| **Why** | `backend/middleware/serverlessGuard.js` and `SECURITY.md` are explicit that the buckets are **per instance** (`limit × instances`), so the effective ceiling scales with the number of warm lambdas. |
| **Do** | Move the counters to a shared store (Upstash/Redis or an equivalent) and have `guardRequest` read/write through it. |
| **Verify** | Two concurrent instances share one count — fire 2 × N requests from two hosts and confirm the second batch is throttled at N, not 2N. |
| **Closed by** | — |

## Action 9 · Site-health probe cannot publish its result

| | |
|---|---|
| **Status** | Open |
| **Why** | This repository's workflow permissions are read-only, so the step that commits
`data/site-health/latest.json` back to the branch fails with a warning. The result survives in
the run summary and the uploaded artifact, but the committed file goes stale. |
| **Do** | Either grant `contents: write` to the workflow (`permissions:` block in
`site-health.yml`) or switch the publish step to a PR / GitHub Pages artifact. |
| **Verify** | `data/site-health/latest.json` updates itself on a scheduled run without a manual commit. |
| **Closed by** | — |

## Action 10 · Get profile PII out of the public read path (SEC-14)

| | |
|---|---|
| **Status** | Open — added 2026-10-02 |
| **Why** | `firestore.rules` allowed `get, list: if true` on `profiles`, so an anonymous client could read and enumerate email, phone, WhatsApp, address and pinpoint coordinates for every account. Reads are now opt-in per row and capped at one row per query, but **Firestore cannot hide individual fields in a read**: a public profile still ships its PII. |
| **Do** | (a) Backfill `profile_visibility` on rows that predate the field (default-deny now hides them). (b) Add a `publicProfiles/{uid}` mirror written by the backend holding only the display fields the profile page renders, and point `/u/<username>` at it. (c) Then move `email`, `phone_number`, `whatsapp_number`, `address`, `pinpoint_lat`, `pinpoint_lng` out of the public document entirely. |
| **Verify** | A public profile fetched anonymously contains no contact field; the emulator suite from Action 3 covers it. |
| **Closed by** | — |

## Action 11 · Advisory dataset freshness (Kaggle ⇄ pipeline)

| | |
|---|---|
| **Status** | Open — the GitHub download/ingest path is wired on 2026-10-03; the public file itself still needs an on-time daily publication verified. **The notebook has not published since 2026-09-29.** |
| **Why** | The public Kaggle artifact (`ashifahmedshuvo/hazardnet-weekly-forecasts`, `hazardnet_advisories_latest.csv`) last reported `generated_at=2026-09-29 23:29:31` when checked on 2026-10-03, and Kaggle's own dataset metadata (checked 2026-10-04T14:49Z) still says `lastUpdated: 2026-09-29T23:49:50Z`, version 10, "Expected update frequency: daily". The 36 h freshness guard in `scripts/validate_advisory_csv.mjs` correctly rejects older runs. The owner has confirmed the Kaggle notebook is scheduled daily; the public copy must reflect that run. |
| **Do** | The GitHub side now runs daily at `05:30 UTC`: `.github/workflows/daily_advisory_ingest.yml` downloads the CSV from the exact public dataset URL (raw CSV or ZIP), retries while a run is finishing, skips an unchanged file, and calls `scripts/process_advisory_ingest.mjs` only for a newer source. Verify the Kaggle notebook publishes the completed daily run back into that dataset/file. Optional `KAGGLE_USERNAME` / `KAGGLE_KEY` secrets enable CLI/kernel fallback; the public HTTP download itself requires no credentials. |
| **Verify** | A scheduled Actions run shows a new `generated_at`, passes `node scripts/validate_advisory_csv.mjs /tmp/advisory-ingest/hazardnet_advisories_latest.csv` without `--allow-stale`, commits updated forecast snapshots, and triggers Vercel only when artifacts changed. If the file is unchanged — or newer than the last ingest yet past the 36 h gate — the fetch step reports it (`age_hours`, `stale` in `fetch-report.json`), the run goes red with `::error::Scheduled Kaggle advisory publication is unchanged or past the 36 h ingest gate`, and the fetch report is attached. |
| **Closed by** | — |

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
| **Do** | Pick a sink (log drain → BigQuery/ClickHouse, or Vercel/Upstash), then either forward the `{"tag":"analytics", …}` log lines or replace the `console.log` in `serverless/v1/telemetry.js` with a write. Turn the tracker on by setting `VITE_ANALYTICS_ENABLED=true` for the Vercel build. |
| **Verify** | Load the site with the flag on, watch a batch arrive at `/api/v1/telemetry` (204), and see the same event in the sink with the same `session`. |
| **Closed by** | — |

## Action 13 · Clear the open handles the React Native suites leave behind

| | |
|---|---|
| **Status** | Open — added 2026-10-02 |
| **Why** | The mobile suites pass (62 tests) but Jest hangs after the last assertion; CI runs them with `--forceExit`, which hides the class of bug instead of fixing it. |
| **Do** | Find the timers/subscriptions the app hooks leave open (`useSavedPlaces` is one) and clear them, then drop `--forceExit` from the `test-mobile` job. |
| **Verify** | `npx jest --config apps/mobile/jest.config.cjs --ci` exits on its own. |
| **Closed by** | — |

## Action 14 · Build the Windows app on pull requests, not only on tags

| | |
|---|---|
| **Status** | Open — added 2026-10-02 |
| **Why** | `apps/windows` has no behavioural test and its MSIX is built only by `app-releases.yml` on a `v*` tag, so a broken Windows build is discovered at release time. |
| **Do** | Add a PR-triggered compile-only job (no packaging) on `windows-2022`, reusing the same `node_modules` hoisting steps. Skip it on docs-only changes. |
| **Verify** | A deliberately broken import in `apps/windows/src` fails the PR job before it reaches a tag. |
| **Closed by** | — |

## Action 15 · Implement or delete the declared plugins

| | |
|---|---|
| **Status** | Open — added 2026-10-02 |
| **Why** | `plugins/plugin_manifest.json` listed `01_agent_tools/*.py` and `02_data_ingestion/open_meteo_plugin.py` — none of them exist — and marked the ingestion one enabled. The entries are now `enabled: false` / `status: declared-not-implemented` and `__tests__/pluginManifest.test.js` fails if an enabled entry does not resolve. Only `03_frontend_widgets/ShelterCapacity.tsx` is real, and its shelter numbers are hardcoded (1160/2000). |
| **Do** | Either write the modules the manifest describes, or delete the entries. If the shelter widget is kept, source its occupancy from a real feed instead of literals. |
| **Verify** | `npx jest __tests__/pluginManifest.test.js` passes with every surviving entry implemented. |
| **Closed by** | — |

## Action 16 · The canonical host `www.hazardnet.live` does not resolve

| | |
|---|---|
| **Status** | Open — **decision made 2026-10-04: `www` stays canonical; the domain is to be restored.** The code is not to be changed to the apex. |
| **Why** | 41 tracked files treat `https://www.hazardnet.live` as the canonical origin: the `<link rel="canonical">` tags and structured data (`frontend/src/SEOHead.tsx`), the sitemap and `robots.txt`, `security.txt`'s `Canonical:`, the content engine (`scripts/build_content_engine.mjs`), and a build guard in `frontend/scripts/prerender.mjs` that **fails the build** if the origin is anything else. Meanwhile `www.hazardnet.live` is NXDOMAIN and `hazardnet.live` answers 200 directly from Firebase Hosting (199.36.158.100, `x-fh-requested-host`). So every URL in the deployed sitemap is unreachable, `site-health.yml`'s "Verify every sitemap URL resolves" probe fails on all 85 of them, and Google is being pointed at a host that does not exist. |
| **Do** | Restore the host the code already declares: add `www.hazardnet.live` as a custom domain on the project that serves the site (Firebase console → Hosting → Add custom domain, or the equivalent on whichever platform owns the domain), add the DNS record it prints, and let the certificate issue. Note this is independent of *where* the build is deployed from — see Action 17 for the deploy path. |
| **Verify** | `getent hosts www.hazardnet.live` resolves, `curl -sSI https://www.hazardnet.live/` answers 200, `https://www.hazardnet.live/sitemap.xml` is reachable, and the site-health sitemap probe flips green on the next scheduled run. |
| **Closed by** | — |

## Action 17 · Nothing in the repository deploys the frontend

| | |
|---|---|
| **Status** | Open — **decision made 2026-10-04: deploys stay with Vercel and stay owner-run.** No CI deploy job is to be added. |
| **Why** | Nothing in the repository ships the frontend automatically: the only deploy step anywhere is `daily_advisory_ingest.yml`'s *"Trigger Vercel Production Deployment"* (`npx vercel deploy --prod`, gated on `committed == 'true'`, so it has not run since the ingest started failing). Meanwhile **the host answering `hazardnet.live` today is Firebase Hosting** (`x-fh-requested-host`, `x-served-by: cache-dub…`, 199.36.158.100) with a build whose `Last-Modified` was **2026-09-24T21:56Z** on 2026-10-04. So a Vercel deploy alone will not change what the domain serves until the domain points at the Vercel project — and the site-health security-header probe reads whatever that host answers. |
| **Do** | Deploy from the owner's Vercel project (`vercel --prod`, or the workflow step with `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`), then confirm the domain resolves to that deployment. The `firebase.json` headers added on 2026-10-04 keep the Firebase path correct for whoever deploys it next; they are inert on Vercel. |
| **Verify** | `curl -sSI https://hazardnet.live/` shows the new build (`last-modified` advances, or `x-vercel-id` appears alongside/instead of `x-fh-requested-host`), `/data/freshness.json` quotes the new build, and the site-health security-header probe passes. |
| **Closed by** | — |

---

## Change log

| Date | Change |
|---|---|
| 2026-10-02 | File created from the 12 in-tree citations; Actions 10, 11 (later 12–15) added; Action 6c recorded as closed. Owner still unassigned. |
| 2026-10-04 | Action 11 updated with the measured Kaggle publication gap (last update 2026-09-29, version 10); Actions 16 (canonical host) and 17 (deploy path) added after triaging the red site-health and advisory-ingest runs. Owner decisions recorded the same day: `www` stays the canonical host and is to be restored rather than replaced in code; deploys stay with Vercel and stay owner-run. |
| 2026-10-04 | Action 6d opened: the appearance control (`System / Light / Dark`) adds four Bangla strings to `frontend/src/lib/i18n.ts`, which Action 6c's closure note says must be reviewed under a new ID. |
| 2026-10-05 | CI: the one ESLint error on `main` — a literal two-space run inside a regex in `__tests__/darkTheme.test.js` (`no-regex-spaces`) — is fixed; it was failing the `Code Quality & Build` job and, with it, every open PR. The rest of that job (type-check, model handshake, serverless ESM, claims, design gates, build, bundle budget, content index, post-build suites) was re-run locally and is green. `site-health.yml`: a probe that cannot connect now reports `000` instead of `000000` (the `|| echo 000` fallback appended to curl's own `000`, naming a status code that does not exist) and the sitemap probe reports the no-response case as *unreachable* — pass/fail semantics unchanged. Actions 11, 16 and 17 remain owner-side and still red. |
