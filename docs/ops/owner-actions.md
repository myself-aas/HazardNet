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
| **Status** | Open — added 2026-10-02 |
| **Why** | The published Kaggle dataset (`hazardnet_advisories_latest.csv`) was 68.5 h old when checked, past the 36 h `--max-age-hours` guard in `scripts/validate_advisory_csv.mjs`. The validator rejects it (correctly) and the ingest would reject it too. |
| **Do** | Either make `daily_advisory_ingest.yml` publish to Kaggle in the same run that regenerates
the CSV, or relax the guard for the public mirror and record the expected lag in
`docs/PUBLICATION_POLICY.md`. |
| **Verify** | `node scripts/validate_advisory_csv.mjs <csv>` passes without `--allow-stale` on a normal day. |
| **Closed by** | — |

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

---

## Change log

| Date | Change |
|---|---|
| 2026-10-02 | File created from the 12 in-tree citations; Actions 10, 11 (later 12–15) added; Action 6c recorded as closed. Owner still unassigned. |
