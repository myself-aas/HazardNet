# Phase 4 — Backend and alert engine

**Status: implemented, tested, and deliberately inert above `WATCH`.** This phase
closes the other half of the first project-killer ("uncalibrated confidence +
auto-publish"): the pipeline can now publish what it has earned the right to publish,
and it is structurally unable to publish anything more serious than a `WATCH` without a
named human being on the record.

Phase 4 of the deployment plan asks for the v1 endpoints, the
`DRAFT → PENDING_REVIEW → PUBLISHED` gate, human-in-the-loop review at the API level,
SMS/Telegram delivery and report export. This report covers all five, the twelve
defects found while wiring them, what the engine actually does on today's real data,
and what remains open.

---

## 1. Scope and the constraints that shaped it

Three constraints were decided before any code was written, because each one changes
the design rather than the implementation:

1. **PRODUCT_SPEC is the contract, including its silences.** §1.3 defines the levels in
   *probability* terms; §3 says a probability claim may only be made when a calibration
   artefact exists; and no calibration map is fitted (Phase 3 is blocked on the event
   archive). A literal implementation would therefore have to either fake a
   probability or ignore §3. The engine does neither: it implements the ladder, and
   reports the missing rung as a *blocker* on every alert.
2. **Firestore is the store.** No Postgres, no new dependency: the alert documents live
   beside the forecasts, in a collection the existing `firestore.rules` already denies
   by default (server-side access via the Admin SDK).
3. **An unverifiable surface must not claim success.** There are no SMS/Telegram
   credentials and no deployed backend in this environment, so every transport reports
   `degraded`/`dry_run`/`sent: false` truthfully, and the tests assert those states
   rather than mocking a delivery.

## 2. What shipped

| Area | Files | Lines |
| ---- | ----- | ----- |
| Policy in force (§1.3, §1.6) | `backend/alerts/policy.js` | 189 |
| Assessment (levels, evidence trail) | `backend/alerts/assess.js` | 537 |
| Store (issue documents, event log) | `backend/alerts/store.js` | 226 |
| Lifecycle state machine + §1.6 guards | `backend/alerts/lifecycle.js` | 349 |
| Orchestration (run, persist, review, notify) | `backend/alerts/service.js` | 607 |
| Channel digests (EN/BN, SMS-aware) | `backend/alerts/digest.js` | 225 |
| Fan-out to subscribers | `backend/alerts/notify.js` | 195 |
| Evidence card, CSV, run report | `backend/alerts/report.js` | 298 |
| Transports | `backend/alerts/channels/{sms,telegram}.js` | 354 |
| Access control shared by Express and Vercel | `backend/utils/alertAuth.js` | 42 |
| HTTP API | `backend/routes/alerts.js` | 379 |
| Vercel functions | `api/v1/alerts/{index,policy,evidence-card,review,run}.js` | 256 |
| Tests | `__tests__/alerts/*.test.js` (8 suites) + `__tests__/api/alerts.test.js` | 2 141 |
| Documentation | `docs/alerts/ALERT_ENGINE.md` | 213 |

Modified: `backend/server.js` (mount + limiter), `backend/middleware/rateLimit.js`
(two alert buckets), `backend/middleware/firebaseAuth.js` (token verification extracted
and bounded), `.github/workflows/daily_forecast.yml` (alert step + summary).

## 3. Step by step

### 3.1 Policy as data (`policy.js`)

Everything the engine decides comes from one object, so a threshold change is a
reviewable configuration change and every alert records the `policy_version` that
produced it. Two properties are encoded as data rather than prose:

* `max_auto_publish_level: 'WATCH'` — §1.6's rule, enforced by the store.
* `calibrated_probability_required_for_warning: true` — the honest reading of §1.3
  given that no map is fitted. `ALERT_ALLOW_UNCALIBRATED_WARNING=true` lifts it, and
  the policy endpoint then states that a deployment chose to.

The §1.7 disclaimer is a constant, and a test compares it against the §1.7 block in
`docs/PRODUCT_SPEC.md` with the markdown stripped, so the two cannot drift.

### 3.2 Assessment (`assess.js`)

`assessRow(row, {policy, now})` is pure — a function of the row, the policy and the
clock — which is what lets the §1.3 table be pinned exactly. It returns the level, the
rules that fired, the rules that were **blocked**, an evidence trail (model severity,
confidence and its `confidence_kind`, independent physics severity, divergence and its
source, official bulletin), a confidence statement, freshness against the 48 h SLO and
provenance.

Two deliberate readings of the spec:

* **Divergence** uses the row's own `track_divergence` when present, otherwise
  `|model_severity − physics_severity|`, but only when *both* tracks exist — a missing
  physics score is absence of evidence, not disagreement, and is labelled `unknown`.
* **Agreement** for the WARNING rule is absolute agreement between the two tracks, not
  the `physics_agreement` flag: that flag is computed against the *top* hazard class
  and reads `false` whenever physics most-highly ranks a different class, which on a
  degenerate model is nearly always and says nothing about "both tracks agree".

`assessBatch` adds level counts, per-hazard counts and a `saturation` block: when a
quarter or more of the assessed rows sit at the maximum severity it says so, quoting
MODEL_CARD §6.1, instead of quietly turning a degenerate model into 64 simultaneous
warnings.

### 3.3 Documents, keys and issues (`store.js`)

The key is `district + horizon + hazard + target_date`; the **document id adds the
prediction date**, so an alert is one *issue*:

```
2026-10-01__15_days__61__flash-flood__p2026-09-16
```

This matters for two of the plan's requirements at once. §1.6 wants reviewer identity,
timestamps and reasons stored; the evaluation work (Phase 9, POD/FAR) wants rejections
as labels. Both are destroyed by last-write-wins, so the store keeps an append-only
`events` array per issue, a `rejections` array carrying the label, and no delete path
at all — a wrong alert is superseded or rejected, never erased.

### 3.4 The lifecycle (`lifecycle.js`)

Seven transitions, each with a guard, all of them testable without a database:

| Transition | From → To | Guard |
| ---------- | --------- | ----- |
| `create` | ∅ → DRAFT | — (assessment written) |
| `auto-publish` | DRAFT → PUBLISHED | **level ≤ `max_auto_publish_level`** |
| `submit-for-review` | DRAFT, REJECTED → PENDING_REVIEW | a named actor |
| `approve` | PENDING_REVIEW → PUBLISHED | named actor **and** an evidence snapshot |
| `reject` | DRAFT, PENDING_REVIEW → REJECTED | named actor **and** a substantive reason |
| `escalate` | DRAFT, PENDING_REVIEW, PUBLISHED → PENDING_REVIEW | the new level is above the ceiling, with a reason |
| `supersede` | any live state → SUPERSEDED | a reason naming the replacement |

`toPublishRecord()` refuses to build a published record unless reviewer identity,
timestamp, model version, data cutoff and the evidence snapshot are all present —
the §1.6 list, checked in one place instead of by each caller.

### 3.5 Orchestration (`service.js`)

`runAlertEngine()` assesses the stored rows and persists them with these behaviours:

* **Idempotent per issue.** A cron that fires twice with the same forecast creates
  nothing new and reports `unchanged`.
* **Escalation revokes automatic publication.** If the same issue is re-scored above
  the ceiling, the document moves to `PENDING_REVIEW` with a reason.
* **A newer issue supersedes the older one**, which keeps its own history.
* **Unpublishable rows are recorded, not dropped.** On the committed snapshot today,
  publication fails because the rows carry no `model_version`; the failure is written
  as a `publication_blocked` event with the §1.6 reason and counted in the run summary.
* **Auto-publication has a window** (`ALERT_AUTO_PUBLISH_MINUTES`, default 720) so a
  manual re-run cannot spam a subscriber list; held rows stay DRAFT and are reported.
* **Notifications cannot hang the run**: the fan-out is bounded by
  `ALERT_NOTIFY_TIMEOUT_MS` and a timeout is reported as a timed-out leg, because the
  alert is already stored by then.

`reviewAlert({id, action, user, reason, authVia})` is the HITL entry point. Approve and
reject both require duty-officer standing; the API-key path must name the human it acts
for and is stored as `verified_via: 'api-key'`.

### 3.6 Channels (`digest.js`, `channels/*`)

The digest carries the §1.3 content (level, hazard, district, lead time, confidence
statement, freshness) and the §1.7 disclaimer in English and Bengali, rendered per
channel. Three details are deliberate: an uncalibrated score is called a *score*,
never a probability; the SMS form uses a short disclaimer that still contains every
§1.7 element (a test fails if one goes missing); and Bengali is reported as UCS-2 with
its real segment count, because 70 characters per segment is the true cost.

`sendSms` refuses any text that does not carry the disclaimer, so a future caller
cannot bypass §1.7 by rendering its own message. Both transports redact credentials
from every returned URL, treat an unconfigured deployment as `degraded` (never as
sent), and return failures instead of throwing.

### 3.7 HTTP surface and access control

Ten endpoints (see `docs/alerts/ALERT_ENGINE.md` §6) behind three access classes:
anonymous (published alerts, policy, evidence card of a published alert, CSV export),
signed-in (no additional read rights — a stranger is not a reviewer), and
duty-officer/pipeline (the queue, the run, the review, transport status). Rate limits:
60/min reads, 12/min state changes. The Vercel functions share
`backend/utils/alertAuth.js` with the Express router, so the two deployments cannot
serve different policies.

### 3.8 Wiring

`backend/server.js` mounts `/api/v1/alerts` with identity attached but never required.
`.github/workflows/daily_forecast.yml` calls `POST /api/v1/alerts/run` after the
forecast is published, uploads the run report as an artefact, echoes the level counts
into the job summary, and **skips with a notice** when `HAZARDNET_API_KEY` /
`BACKEND_API_URL` are not configured — a deployment without a backend stays green
rather than failing for the wrong reason.

## 4. Verification

All figures measured on this tree.

| Check | Result |
| ----- | ------ |
| `jest` (full) | **54 suites, 581 tests pass** — 136 of them new in this phase |
| `pytest scripts/tests` | 422 pass (unchanged; no Python touched) |
| `tsc --noEmit` | clean |
| `npm run build` | green |
| Workflows | 11 YAML files parse; action pins unchanged |
| Offline rehearsal | `/tmp/alert_demo.mjs` against the committed snapshot — see below |

### 4.1 The engine on today's real data

Against `frontend/public/data/forecasts-latest.json` (74 rows, 60 districts,
generated 2026-09-17):

```
logs assessed: 74 of 74, skipped 0
levels:        {"NO_ALERT":0,"WATCH":74,"WARNING":0,"SEVERE":0}
7_days:        {"NO_ALERT":0,"WATCH":25,"WARNING":0,"SEVERE":0}
15_days:       {"NO_ALERT":0,"WATCH":49,"WARNING":0,"SEVERE":0}
reasons:       watch_severity_band ×74, watch_divergence ×25
blockers:      warning_requires_calibration ×74
saturation:    25 rows at maximum severity (33.8 %) → degeneracy note
provenance:    0 rows carry confidence_kind / model_version / dataset_version
hazards:       Flash Flood, Tropical Cyclone only
```

That is the honest headline of this phase: **the engine can currently produce exactly
one level.** Every row lands on `WATCH` through the severity band, every row is
blocked from `WARNING` because the score is an uncalibrated softmax, and the alert
distribution simply mirrors the model's degeneracy (MODEL_CARD §6.1). Three
consequences, all of them reported rather than hidden:

* The `saturation` note fires, so no reader mistakes 74 identical WATCHes for 74
  independent judgements.
* A persist pass over the same rows writes 74 documents, **publishes 0**, and records
  `blocked: 74` with the reason *"§1.6 requires model version before an alert is
  published"* — the committed snapshot predates Phase 2 provenance stamping, and an
  alert that cannot name its model version is not publishable.
* Re-running the same pass with simulated Phase-2 provenance stamps (labelled as
  simulated in the rehearsal script) publishes all 74 as `WATCH`, which is the release
  path once the pipeline's stamped rows are what the store serves.

Sample rendering for the most severe row (Sunamganj, Flash Flood, 15-day):

```
[WATCH] HazardNet — Flash Flood risk in Sunamganj horizon 15 days · 15-day ·
target 1 October 2026 model score 1.00 (uncalibrated), independent physics 0.75;
data 42 h old HazardNet is a research tool, not an official warning service. …
```

and the same alert in Bengali — `মডেল স্কোর ১.০০ (ক্রমাঙ্কিত সম্ভাবনা নয়)` — costs 5
SMS segments against 2 for the English form, a cost the digest reports.

### 4.2 The §1.6 gate, demonstrated

The API suite walks the full path through the real Express app: a WARNING is created
in `PENDING_REVIEW` (never published), an unattributed approval is refused with 422, a
reasonless rejection is refused with 422, a duty officer's approval lands in
`PUBLISHED` with reviewer identity, model version, data cutoff and the evidence
snapshot on the record, and the rejection's reason comes back as a label. The store
double is the only thing standing in for Firestore.

## 5. Defects found and fixed while building this

Twelve, all of them found by the tests or by the real-data rehearsal rather than
reasoned about in advance:

1. **The digest mutated a frozen table** (`HAZARD_LABELS['Storm Surge'] = …`) — a
   module-load crash; the correct Bengali is now in the literal.
2. **§1.7's long disclaimer spells out "Bangladesh Meteorological Department"**, not
   `BMD`, so the completeness check rejected its own canonical text. Both forms are now
   accepted, and the short SMS form still must carry an agency name.
3. **`previewAssessments` was `async`**, so the preview endpoint serialised a Promise to
   `{}`. Caught by an assertion that the batch really is a batch.
4. **Same-key re-forecast overwrote the previous issue**: the id did not include the
   prediction date, so a new issue replaced the old document and destroyed the review
   history the eval labels depend on. Ids now include the issue date and the previous
   one is superseded.
5. **Nothing counted as "published" for Telegram** — the transport returned `ok` but no
   `sent`, so the fan-out under-counted deliveries.
6. **Level changes on the same issue were mishandled**: a lower score silently
   overwrote a higher one, and an escalation could leave a stale publication live. Now
   the change is recorded, and escalation pulls the document back to review.
7. **`toPublishRecord` failing left an unexplained DRAFT.** The reason is now an event
   and a run counter, which is how the rehearsal above found the missing model version.
8. **A hanging notification leg hung the run** (the subscription read went to an
   unreachable Firestore in the sandbox). The fan-out is now bounded and reports the
   timeout.
9. **Token verification was attempted for anything after `Bearer`**, including API
   keys, causing outbound calls to the identity provider on pipeline requests. It is
   now shape-checked (JWT) and bounded in time.
10. **Auth ran before method validation**, turning an unknown action into a misleading
    422; the action is validated first.
11. **`listAlerts` returned history, not the live view** — alerts are keyed per target
    date, so the public list now filters by the 48 h freshness SLO by default.
12. **The rate limiter is shared per IP**, which the test suite discovered the hard way
    (429s after a dozen runs); the suite resets the bucket per test, and the limits are
    documented rather than tuned.
13. **The engine spoke the wrong hazard vocabulary.** `HAZARD_CLASSES` was hardcoded to
    the frontend's *display* set (Storm Surge, River Erosion, Landslide, Heatwave) rather
    than the model's label set (`Models/labels.json` / `VALID_HAZARDS`: Cold Wave, Drought,
    Fire, Flash Flood, Flood, Heat Wave, Severe Local Storm, Tropical Cyclone). Had it
    shipped, every Cold Wave, Fire, Heat Wave and Severe Local Storm row would have been
    skipped — no alert, only a `skipped` count — while three classes that can never appear
    in a row were advertised, and Bengali digests fell back to English names for the four
    affected hazards. Found on 2026-09-18 while reviewing the owner's uploaded pipeline dump
    (`docs/audits/2026-09-18-pipeline-dump-review.md`), whose class list is the model's.
    Fixed by deriving the list from `VALID_HAZARDS` and pinning it to `Models/labels.json`
    in two tests; every fixture in this phase used Flood/Flash Flood, which is why nothing
    caught it.

## 6. Acceptance criteria (§1.3 / §1.6 / §1.7)

| Requirement | Status | Evidence |
| ----------- | ------ | -------- |
| §1.3 level ladder implemented as written | ✅ | `assess.js` + 16 tests over the table |
| §1.3 divergence > 0.30 rule | ✅ | `watch_divergence`, row value preferred over computed |
| §1.3 "nothing is auto-published above WATCH" | ✅ | `canAutoPublish` + transition guard + store test; run reports `pending_review` |
| §1.3 every alert carries hazard, lead time, confidence statement, evidence, freshness, model version, official links | ⚠️ mostly | all present; `model_version`/`dataset_version` are `null` for pre-Phase-2 rows, and publication is **blocked** rather than degraded when they are missing. Official-source links are carried when a bulletin is attached; the ETL's bulletin feed is Phase 2 work that is not yet deployed |
| §1.6 WATCH-equivalent may auto-publish | ✅ | `persistAssessment`, `canAutoPublish` |
| §1.6 > WATCH requires a named duty officer | ✅ | 403 without standing; 422 without an attested name on the key path |
| §1.6 rejections recorded with a reason | ✅ | `rejections[].label`, API-exposed |
| §1.6 published alert stores reviewer identity, timestamp, model version, data cutoff, evidence snapshot | ✅ | `toPublishRecord`, asserted field by field |
| §1.7 disclaimer on every public surface incl. SMS and exports | ✅ | policy constant + digest + CSV column + evidence card; tests on each |
| Phase 4: v1 endpoints | ✅ | 10 endpoints, Express + 5 Vercel functions |
| Phase 4: SMS/Telegram | ✅ implemented, ⚠️ unverified end to end | transports, redaction, dry run, budget; no gateway credentials exist here, so the first send is an owner action |
| Phase 4: report export | ✅ CSV + printable evidence card, PDF deferred | the PDF path is the existing `frontend/src/utils/pdfExport.ts` and belongs with the Phase 5 UI |

## 7. What this phase does not close

* **Thresholds are placeholders.** They are conservative defaults, not values fitted on
  outcomes; on today's data they put every row in the same bucket. Real thresholds are
  owner Action 5 and depend on Phase 9's hindcast.
* **`WARNING` from model evidence remains unreachable** until a calibration map is
  fitted, which is blocked on the event archive (Phase 3's open item). The engine says
  this on every alert instead of guessing.
* **No subscribers exist.** No alert has been delivered to anyone: the fan-out reports
  `matched: 0` in the rehearsal and the run summary counts it as such.
* **No UI, no map, no alert panel** — Phase 5. The API and the printable card are the
  inputs that phase needs.
* **The Postgres/PostGIS event store is not deployed**, so the official-bulletin path
  inside the engine is exercised only with rows that already carry a `bulletin_score`.
* **`.env.example` still contains live-looking secrets** (pre-existing, Action 1 of the
  owner runbook). The new alert variables are documented with empty values; the
  rotation remains a Phase 6 blocker.

## 8. Owner actions opened by this phase

See `docs/ops/owner-actions.md` Action 5:

1. decide the §1.3 thresholds against a hindcast, or accept the defaults and record it;
2. name the duty officers (`ALERT_DUTY_OFFICERS`, or Firebase claims);
3. decide the channel mix and create the gateway credentials (`SMS_PROVIDER` +
   key, `TELEGRAM_BOT_TOKEN` + chat id) and the sender id;
4. create the subscriber collection and the first subscribers;
5. set `BACKEND_API_URL` (variable) and `HAZARDNET_API_KEY` (secret) so the daily
   workflow actually runs the engine;
6. decide whether `ALERT_AUTO_PUBLISH` stays on before the soft launch, given that the
   current output is a single level for every row.
