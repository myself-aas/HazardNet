# The HazardNet alert engine (Phase 4)

Status: **implemented, tested, not yet deployed with real thresholds.** The engine
turns the forecast rows the pipeline already produces into alerts with a level
(PRODUCT_SPEC §1.3), a lifecycle (DRAFT → PENDING_REVIEW → PUBLISHED, §1.6) and
delivery to SMS/Telegram subscribers. This document is the operational reference:
what the levels mean, what happens when, what a duty officer sees, how to run it,
and which parts are deliberately inert until the owner sets them.

---

## 1. What exists, in one picture

```
forecast rows (Firestore `forecasts`)
        │  scripts/auto_forecast.py → publish → /api/v1/forecasts/update
        ▼
  assessBatch()                         backend/alerts/assess.js      §1.3
        │  level, reasons, blockers, evidence trail, freshness
        ▼
  alert document per issue              backend/alerts/store.js       Firestore `alerts`
        │  key = district + horizon + hazard + target_date (+ prediction_date)
        ├── ≤ WATCH  ──▶ PUBLISHED   (automatic, §1.6 rule 1)
        └── > WATCH  ──▶ PENDING_REVIEW ──▶ duty officer ──▶ PUBLISHED | REJECTED
        ▼
  notifyAlert()                         backend/alerts/notify.js      SMS + Telegram
        │  subscribers from `alertSubscriptions`
        ▼
  GET /api/v1/alerts  ·  /evidence-card  ·  /export.csv          routes/alerts.js
        │  (also as Vercel functions under api/v1/alerts/)
        ▼
  Phase 5 UI (not built yet)  ·  report export (CSV/HTML now, PDF in Phase 5)
```

## 2. Warning levels (§1.3)

| Level | Reached when | Auto-publishable |
| ----- | ------------ | ---------------- |
| `NO_ALERT` | nothing below crossed | yes (but stored, never published) |
| `WATCH` | calibrated probability ≥ `watch_probability`, **or** severity index ≥ `watch_severity`, **or** model/physics divergence > `divergence_watch`, **or** an official bulletin at 0.3–1.0 | **yes** |
| `WARNING` | calibrated probability ≥ `warning_probability` **and** both evidence tracks agree | no — a named duty officer must approve |
| `SEVERE` | `WARNING`-level evidence plus duty-officer review, **or** an official BMD/FFWC bulletin at maximum severity | no |

Two behaviours are worth stating plainly, because they are the safety properties the
deployment plan's first project-killer is about:

1. **Nothing above `WATCH` is auto-published.** `canAutoPublish()` checks the level
   against `max_auto_publish_level`, the transition to `PUBLISHED` refuses anything
   above it, and the run reports those rows as `pending_review`. There is no flag
   that turns this off short of editing the policy constant.
2. **`WARNING` is unreachable while the score is uncalibrated.** Every row today
   ships `confidence_kind: model_softmax_top_class` (no calibration map is fitted —
   see `docs/mlops/CALIBRATION.md`), so §1.3's "calibrated probability ≥ warning
   threshold" cannot be satisfied. The engine records that as a blocker
   (`warning_requires_calibration`) and stops at `WATCH`. A deployment that
   consciously accepts an uncalibrated warning can set
   `ALERT_ALLOW_UNCALIBRATED_WARNING=true`; the policy endpoint then says so in
   `calibration.note`, so the decision stays visible.

`SEVERE` has one non-model path on purpose: an official BMD/FFWC bulletin at maximum
severity is itself the evidence, which is why a bulletin can raise an alert without a
calibrated model score.

## 3. The lifecycle (§1.6)

```
DRAFT ──auto-publish (≤ WATCH)────────────────────────────▶ PUBLISHED
  │                                                              ▲
  ├──submit-for-review (> WATCH)──▶ PENDING_REVIEW ─approve──────┘
  │                                     │
  │                                     └──reject (reason required)──▶ REJECTED
  └── a newer issue for the same key ──▶ SUPERSEDED  (never deleted)

PUBLISHED ── re-scored above WATCH on the same issue ──▶ PENDING_REVIEW (escalate)
```

* **One document per issue.** The id is
  `<target_date>__<horizon>__<district>__<hazard>__p<prediction_date>`, e.g.
  `2026-10-01__15_days__61__flash-flood__p2026-09-16`. Re-forecasting the same target
  on a later day creates a new issue and marks the previous one `SUPERSEDED`; the
  history of the superseded issue (including any rejection) stays on its own document,
  which is what makes rejections usable as evaluation labels.
* **Re-scoring the same issue in place.** If a same-day re-run changes the level, the
  record is updated and an event is appended. If the new level is above the ceiling,
  the document is pulled back to `PENDING_REVIEW` (`escalate`) — a WATCH that was
  auto-published and later turns into a WARNING does not stay live unattended.
* **Rejections carry a reason**, are stored as an eval label
  (`rejections[].label`) and are returned by the API. There is no delete path: the
  store exposes `putDocument`/`getDocument`/`listDocuments` and nothing else.
* **Publication requirements are enforced at write time.** A published alert must
  carry reviewer identity, timestamp, model version, data cutoff and the evidence
  snapshot; if a row cannot supply them (e.g. the pre-Phase-2 committed snapshot has
  no `model_version`), the attempt fails, an event `publication_blocked` is appended
  with the reason, and the run counts it under `persisted.blocked`. It does not
  silently publish an untraceable alert, and it does not silently drop it either.

## 4. What a duty officer sees

`GET /api/v1/alerts/{id}/evidence-card` returns the artefact the review is based on
(`?format=markdown` and `?format=card` for the printable rendering):

* the level **and the rule that produced it**, plus every rule that matched but was
  blocked (e.g. "score 0.97 ≥ 0.65 but confidence_kind is model_softmax_top_class and
  no calibration map is fitted");
* the evidence trail: model severity, confidence and its kind, the independent physics
  severity, the divergence and its source, and the official-bulletin state;
* a confidence statement that never calls an uncalibrated score a probability;
* freshness: prediction date, data cutoff and its age against the 48 h SLO;
* provenance: model version, dataset version, pipeline version, run id, policy version;
* review history, and the §1.7 disclaimer.

## 5. Delivery (SMS / Telegram)

* Subscribers live in Firestore `alertSubscriptions`:
  `{ channel: 'sms'|'telegram', destination, district_id|pcode|district_name, all_districts,
  hazards: [], min_level: 'WATCH', language: 'en'|'bn', active: true }`.
  A subscriber is matched on district **and** hazard **and** minimum level.
* Only `PUBLISHED` alerts are dispatched — an unreviewed WARNING cannot leak through
  the notification path.
* Messages are rendered in English and Bengali with the level, hazard, district, lead
  time, the confidence statement, the freshness line and the §1.7 disclaimer.
* **Honest transport reporting.** With no credentials configured, a send returns
  `{ok: false, degraded: true, sent: false}` with the reason, and the run summary
  counts it under `degraded` — nothing is ever reported as sent that was not sent. The
  SMS gateway is chosen by `SMS_PROVIDER` (`bulksmsbd` | `greenweb` | `none`) and
  `SMS_DRY_RUN=true` previews the exact request (with credentials redacted) without
  sending.
* **Cost is visible.** SMS is metered per segment: a Bengali message is UCS-2 (70
  characters per segment) rather than GSM-7 (160), and the digest reports
  `sms_encoding` / `sms_segments`. `SMS_MAX_PER_RUN` caps how many are attempted per
  run; the overflow is counted as `over_budget`, not silently dropped.

## 6. Endpoints

| Method & path | Who | What |
| ------------- | --- | ---- |
| `GET /api/v1/alerts/policy` | public | thresholds in force, the auto-publish ceiling, the calibration caveat, transport status, disclaimer |
| `GET /api/v1/alerts` | public | **published** alerts only; `?state=`, `?level=`, `?horizon=`, `?district_id=`, `?limit=` |
| `GET /api/v1/alerts?state=PENDING_REVIEW` | duty officer / pipeline key | the review queue, with blockers |
| `GET /api/v1/alerts/{id}` | published: public; otherwise privileged | one alert with its history |
| `GET /api/v1/alerts/{id}/evidence-card` | as above | the §1.6 review artefact (`format=markdown|card`) |
| `GET /api/v1/alerts/export.csv` | published: public | CSV export with the §1.7 disclaimer column |
| `POST /api/v1/alerts/preview` | pipeline key | score rows (body `{rows:[…]}` or the stored ones) without writing |
| `POST /api/v1/alerts/run` | pipeline key | the scheduled pass: assess → persist → auto-publish → notify |
| `POST /api/v1/alerts/{id}/review` | duty officer, or the key with `reviewer` | `approve` / `reject` / `submit-for-review` / `supersede` |
| `GET /api/v1/alerts/transports` | pipeline key | what is configured, without credentials |

Rate limits: 60 req/min/IP for reads, 12 req/min/IP for state changes and runs.
Vercel functions with the same contract live in `api/v1/alerts/` (list, policy,
evidence-card, review, run).

**Who counts as a duty officer?** A Firebase ID token whose claims say
`role`/`userRole` admin or duty_officer, or an id/email listed in
`ALERT_DUTY_OFFICERS`. A signed-in stranger is a reader, not a reviewer. The
serverless/headless path uses `BACKEND_API_KEY` **plus** a named reviewer in the body
(`{"reviewer": {"id": "…", "email": "…"}}`), and the stored identity records
`verified_via: "api-key"`; an unattributed approval is refused with 422.

## 7. Running it

Scheduled: `.github/workflows/daily_forecast.yml` calls the engine after the forecast
is published when `HAZARDNET_API_KEY` (secret) and `BACKEND_API_URL` (repo variable)
are set; otherwise the step logs a notice and skips, so a deployment without the
backend is not a red build. §1.3 asks for twice-daily cadence — set the cron or a
second schedule once the backend is live.

Manually:

```bash
# dry run: score the stored rows, write nothing
curl -s -X POST "$BACKEND_API_URL/api/v1/alerts/preview" \
  -H "Authorization: Bearer $HAZARDNET_API_KEY" -H 'Content-Type: application/json' \
  -d '{}' | jq '.batch.counts, .batch.saturation'
# the real pass
curl -s -X POST "$BACKEND_API_URL/api/v1/alerts/run" \
  -H "Authorization: Bearer $HAZARDNET_API_KEY" -H 'Content-Type: application/json' \
  -d '{"notify": true}' | jq '.persisted, .run_state'
```

## 8. Environment

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `ALERT_WATCH_PROBABILITY` / `ALERT_WARNING_PROBABILITY` | 0.40 / 0.65 | §1.3 probability thresholds |
| `ALERT_WATCH_SEVERITY` | 0.55 | the severity band that also reaches WATCH |
| `ALERT_DIVERGENCE_WATCH` | 0.30 | §1.3 divergence rule |
| `ALERT_AGREEMENT_EPSILON` | 0.10 | informational tolerance for `\|\|model − physics\|\|` |
| `ALERT_ALLOW_UNCALIBRATED_WARNING` | unset (blocked) | allow WARNING without a calibration map — a product decision, recorded on the policy endpoint |
| `ALERT_MAX_AUTO_PUBLISH_LEVEL` | `WATCH` | §1.6 ceiling; raising it weakens the HITL guarantee |
| `ALERT_MAX_PREDICTION_AGE_HOURS` | 48 | freshness SLO used in the assessment |
| `ALERT_AUTO_PUBLISH` | `true` | set `false` to keep everything in DRAFT (e.g. before launch) |
| `ALERT_AUTO_PUBLISH_MINUTES` | 720 | re-publication window per run |
| `ALERT_NOTIFY_TIMEOUT_MS` | 10000 | a slow SMS/gateway leg is abandoned, never blocking the run |
| `ALERT_DUTY_OFFICERS` | unset | comma-separated uids/emails allowed to approve or reject |
| `ALERT_NOTIFY_TIMEOUT_MS`, `SMS_PROVIDER`, `SMS_SENDER_ID`, `SMS_DRY_RUN`, `SMS_MAX_PER_RUN`, `BULKSMSBD_API_KEY`, `GREENWEB_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID` | see above | delivery |
| `BACKEND_API_KEY` | unset → 503 | pipeline key for run/review/transports (fail-closed) |

## 9. What is deliberately not here

* **No UI.** The alert surfaces are API-only; the map, the alert panel and the
  methodology page are Phase 5. The evidence card's HTML rendering is the print source
  the Phase 5 PDF export will use.
* **No fitted calibration.** The alert engine consumes `confidence_kind`; it does not
  manufacture calibration. Until a map is fitted (Phase 3's calibration command,
  blocked on the event archive), `WARNING` stays unreachable from model evidence and
  the policy endpoint says so.
* **No thresholds tuned on outcomes.** The defaults are conservative placeholders;
  the owner sets the real ones against a hindcast (Phase 9) — see
  `docs/ops/owner-actions.md` Action 5.
* **No live PostGIS/SMS/Telegram verification in this repository.** The Postgres
  backend is not reachable in the development sandbox and no gateway credentials
  exist; the tests cover the contracts, the transports report `degraded` by design,
  and the first real send is an owner action with the dry run as its rehearsal.
