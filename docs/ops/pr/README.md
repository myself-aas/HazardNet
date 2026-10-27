# PR descriptions for the post-cutover bug-class sweep

The prompt asks for **one PR per phase** on branches `fix/openmeteo-shape-audit`,
`fix/latent-route-sweep`, `fix/cache-verify-then-write`, `test/parity-value-assertions`,
`chore/disposition-latent-routes`, `ops/site-health-verify` and `chore/action-12-close`.

This Arena session is pinned to **one branch, `arena/02ded3da-hazardnet`**: the environment
forbids creating, switching to or pushing any other branch, because it tracks the session by
that branch name. Seven remote head branches therefore cannot exist here. Nothing is hidden by
that: each phase lands as **one isolated commit** on the session branch, with its own
description document in this directory (the PR body to paste when the phase is split out),
and the whole stack is offered as a single PR from the session branch at the end.

| Phase | Notional branch / commit subject | Description (PR body) |
|---|---|---|
| 0 | `fix/openmeteo-shape-audit` | [phase-0-shape-audit.md](phase-0-shape-audit.md) |
| 1 | `fix/latent-route-sweep` | [phase-1-route-sweep.md](phase-1-route-sweep.md) |
| 2 | `fix/cache-verify-then-write` | [phase-2-cache-contract.md](phase-2-cache-contract.md) |
| 3 | `test/parity-value-assertions` | [phase-3-test-quality.md](phase-3-test-quality.md) |
| 4 | `chore/disposition-latent-routes` | [phase-4-disposition.md](phase-4-disposition.md) · follow-up [phase-4b-kaggle-r2.md](phase-4b-kaggle-r2.md) |
| 5 | `ops/site-health-verify` | [phase-5-site-health.md](phase-5-site-health.md) |
| 6 | `chore/action-12-close` | [phase-6-analytics-engine.md](phase-6-analytics-engine.md) |

Each description contains the phase's table, raw captured command output (not a summary),
the actions it closes, and an explicit list of anything that could **not** be verified from
this sandbox. Each phase's commit includes an edit to `docs/ops/owner-actions.md`.

## What this sandbox can and cannot verify

Outbound network from `bash` is restricted to GitHub, npm and PyPI hosts. Live HTTP calls in
this sweep were made through the separate page-fetch tool, which can read JSON responses but
cannot set headers, POST bodies, or run `curl`, `jq`, `wrangler`, or `gh` Actions runs.
Consequences, recorded rather than papered over:

- **Can** read live GET endpoints and static JSON (`www.hazardnet.live/api/v1/weather`,
  `/data/freshness.json`, Open-Meteo docs and fixtures).
- **Cannot** POST to `/api/v1/telemetry`, dispatch `site-health.yml`, list Pages deployments,
  read Cloudflare Analytics Engine, bind `ANALYTICS`, set `VITE_ANALYTICS_ENABLED`, or read
  access logs / first-live-call timestamps. Phase 5 attempted the dispatch from the `gh`
  CLI on 2026-10-27 and captured `HTTP 403: Resource not accessible by integration` (the
  token can list runs but not create a dispatch or read the Actions permissions setting);
  the raw output is in `docs/ops/pr/phase-5-site-health.md`. Those steps are written as
  owner actions with the exact command and the expected output; their status stays **Open**
  until an owner runs them. No phase claims a closed action on unverified evidence.

Owner actions that need the dashboard are in `docs/ops/owner-actions.md` (Actions 12 and 21,
§ Cost constraints, and the Action 21 route disposition register).

## Owner-action status after all seven phases

| Action | State at the end of Phase 6 | Why |
|---|---|---|
| Action 9 — probe can publish its record | **Open** | Repository and workflow side complete (Phase 5). Needs one observed scheduled run, a `gh workflow run` with `expect=healthy`, the artifact `diff`, the served URL and an unchanged `wrangler pages deployment list`. A dispatch attempted here returned HTTP 403. |
| Action 12 — Analytics Engine | **Open** | Repository side complete (Phase 6): Production-only guard, fail-open 204 on both sinks, shared blob-size rule, dual-binding tests and the corrected SQL runbook. Needs the Production-scoped binding, `VITE_ANALYTICS_ENABLED=true`, a redeploy and a live SQL result. Cloudflare states the binding cannot be used locally. |
| Action 21 — bring the API to the same origin | **Open** | Seven edge routes shipped; Phase 4 deleted the two unexercised ones and scheduled `kaggle`; Phase 5/6 added the monitors and the sink. Closure needs the Action 12 and Action 9 observations. |
| Action 24 — Kaggle R2 artifact | **Open** (opened in Phase 4) | Named follow-up PR `feat/kaggle-r2-artifact`; plan in `phase-4b-kaggle-r2.md`. |

No phase claims a closed action on an intention. The exact commands and expected output for
each are in the corresponding phase description and in `docs/ops/owner-actions.md`.
