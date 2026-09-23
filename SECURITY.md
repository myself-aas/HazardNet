# Security policy

HazardNet issues hazard alerts for Bangladesh districts, so a security failure here is
not only a data problem: a forged or suppressed alert is a safety problem. Reports are
read, and this page states what is in scope, how to report it, and what the project
promises in return.

## Reporting a vulnerability

**Do not open a public issue for a vulnerability.** Use either channel:

| Channel | Address |
| ------- | ------- |
| GitHub private advisory | <https://github.com/myself-aas/HazardNet/security/advisories/new> |
| Email | <mailto:shuvoasifahmed@gmail.com> |

The same two addresses are published at
<https://www.hazardnet.live/.well-known/security.txt> (RFC 9116) so a researcher who only
knows the domain can still find them.

Please include: what you did, what happened, what you expected, the affected URL or
endpoint, and whether the issue is already public. A proof-of-concept (with the
alert-suppressing step left out) is welcome.

## What to expect

| Stage | Target |
| ----- | ------ |
| Acknowledgement | 3 working days |
| Initial assessment (severity, scope, whether it is exploitable) | 10 working days |
| Fix or mitigation for high/critical issues | 30 days |
| Credit | On request, in the release notes for the fix |

This is a small, volunteer-run project, not a company with a 24×7 security team — if a
deadline above is going to slip, you will be told rather than ignored.

**Safe harbour.** Good-faith research against the public deployment is welcome, provided
you do not degrade the service (no volumetric load, no destructive writes), do not access
other people's data, and give the project the acknowledgement window above before
publishing. Testing against your *own* account and the public read-only endpoints is
always fine.

## Scope

**In scope**

- The public deployment (`hazardnet.live`, `www.hazardnet.live`) and its API handlers
  under `/api/**`.
- The alert surface: who may publish, approve, read or export alerts and under which
  state (PRODUCT_SPEC §1.6 — only a *named* duty officer may approve).
- Authentication/authorisation: Firebase token handling, the `BACKEND_API_KEY`
  privileged path, Firestore rules, and the `profiles`/`connectors`/`assessments`/
  `alerts` collections.
- Data integrity of the hazard products: a way to make the site show a severity,
  probability or alert state that the pipeline did not produce.
- Credential handling: anything that leaks a key, or a path that makes a committed
  template carry a live value (`scripts/check-secrets.sh` is the gate for that).

**Out of scope**

- Findings that require a compromised device or an already-valid privileged credential.
- Missing best-practice headers on a path that serves no content, self-XSS, tab-nabbing,
  clickjacking on pages with no state-changing action, and reports produced by a scanner
  without a demonstrated impact.
- The known, documented gaps: alert thresholds are uncalibrated placeholders until the
  Phase 9 validation (`docs/codebase/CONCERNS.md` §3), SMS/Telegram delivery is configured
  but has no live subscribers yet, and the PostGIS event store is not deployed. Those are
  project-status issues, not vulnerabilities — they are described in the repo, and a
  report repeating them adds nothing.
- Third-party services (Vercel, Firebase, weather service, processing) — report those
  upstream.

The open items above are tracked with owners and reproduction steps in
`docs/ops/owner-actions.md` (credential rotation, the deployment root, rules validation, the
probe's publish permission). Please read that file before reporting a known gap: it is the
project's own list of what is not finished.

## How the project protects the deployment

Recorded here so a reporter can check whether a control is deliberate before testing it:

- **Security headers** — one canonical CSP (`backend/security/csp.js`) applied by both
  `vercel.json` configs and by helmet in the self-hosted deployment; HSTS with
  `includeSubDomains; preload`; `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy`, COOP.
- **Rate limiting** — per-instance buckets on every serverless handler
  (`backend/middleware/serverlessGuard.js`, since the Express limiters do not run on
  Vercel) plus the Express limiters for the self-hosted deployment. Pipeline endpoints allow
  12/min anonymously and 120/min once the correct `BACKEND_API_KEY` is presented, so a
  chunked backfill is not rationed like a prober. A shared counter is an open item (owner
  Action 8); the current guarantee is honest about being per-instance.
- **Access control** — alerts are readable only in the PUBLISHED state;
  approve/reject requires duty-officer standing (`ALERT_DUTY_OFFICERS`, an admin/
  duty_officer token claim, or `BACKEND_API_KEY`, which fails closed when unset).
  Firestore rules deny by default.
- **Supply chain** — `scripts/npm-audit-ci.mjs` fails closed on any high/critical advisory
  that is not an explicitly accepted, expiring exception (`audit-exceptions.json`);
  Dependabot keeps the Actions runtime current (npm is deliberately covered by the audit
  gate rather than a second, noisier PR stream).
- **Secrets** — no credential belongs in a tracked file; `scripts/check-secrets.sh` runs
  in CI and is itself regression-tested
  (`scripts/tests/test_secret_scan.py`), after the 2026-09-18 audit found the gate was
  blind to `.env.example` (<docs/audits/2026-09-18-secret-scan-false-negative.md>).
- **Observability of the above** (Phase 7) — `/status` publishes what the deployment's own
  committed artifacts say about the freshness, coverage and provenance of the data it ships
  (`frontend/public/data/freshness.json`, built by `scripts/build_freshness_artifact.mjs`),
  together with the last site-health probe result (`data/site-health/latest.json`, published
  by `.github/workflows/site-health.yml` every 30 minutes). It is a statement about committed
  files, not a live probe, and it says so on the page; the probe row is the live-surface
  signal. Operator guide: `docs/ops/STATUS_PAGE.md`.

## Disclosure

Once a fix is released the project publishes a short note — what was wrong, what changed,
and what a reader should check — in the release's commit message and, for anything
user-visible, in `docs/PRODUCT_SPEC.md`'s changelog. Reporters who want credit are named
with their permission.
