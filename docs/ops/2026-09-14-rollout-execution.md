# Rollout execution — 2026-09-14

Target checklist: `docs/ops/firebase-model-rollout.md`.
Session branch: `arena/01a0a0a6-hazardnet`.

**Release state: blocked for production; code validation passed.** Local and GitHub release checks executed; no
Firebase database migration, rule deployment, administrator assignment, Vercel
production release, or hosted model-service deployment has been performed.

## Executed checks

| Step | Result |
|---|---|
| Clean `npm ci --no-audit --no-fund` | Passed, normal lifecycle scripts enabled |
| `npm run lint` | Passed |
| `npm run lint:eslint` | 0 errors, 276 warnings |
| `npm test -- --runInBand --coverage` | 46 suites, 432 tests passed |
| `npm run build` | Passed |
| `npm run check:bundle` | Passed; 1128.9 KiB gzip total at this build |
| `npm run check:env` | Passed source/config declaration checks; **not** live credential verification |
| `npm run check:rag-freshness` | Passed |
| `node scripts/npm-audit-ci.mjs` | 0 high/critical, 4 moderate findings; no exceptions |
| Install both Python requirement files + httpx | Passed in isolated `/home/user/.venv` |
| `python -m pytest scripts/tests model_service -q` | 36 passed, two dependency deprecation warnings |
| `npm run test:rules` | Blocked locally by missing Java; **passed in GitHub CI** |
| Browser E2E | Local Chromium download failed; **browser installation and E2E passed in GitHub CI** |
| `firebase projects:list --json` | Authentication failed |
| `vercel whoami` | Logged out; no linked `.vercel/project.json` |
| GitHub authentication | Connected as Arena GitHub integration |
| GitHub secret/variable/deployment/Actions-permission inventory | HTTP 403: resource not accessible by integration |

## Production gates

| Checklist section | Gate / next required action |
|---|---|
| Firebase server config | Authenticate the deployment environment via Firebase/Google provider connection or securely configured ADC/service identity. No usable local credential env/ADC is present. |
| Correct target | Repo declares project `hazardnet-aas48424`, database `ai-studio-hazardnet-55b49dbf-625b-492b-9cff-feabd729e843`; cloud access is needed to verify existence and permissions. |
| Backup and migration | **Not attempted:** cannot inspect/export the database or verify a backup. Take a verified backup before the dry-run and apply migration. |
| Rules/indexes | Java-21 emulator gate passed in CI; deploy only after verifying the named database, backup and migration. Do not substitute public-write rules or the default database. |
| Admin moderation | Requires an explicit approved account/UID list and trusted Admin access; do not promote arbitrary accounts or trust editable profile roles. |
| Vercel | Authenticate/link the existing project/team through provider settings. Do not create an unrelated claimable temporary deployment. |
| Model service | Requires a persistent hosting target and matching server-side `MODEL_SERVICE_API_KEY`/`MODEL_SERVICE_URL`. No hosting target or usable credentials are configured. Sandbox tests are not a hosted deployment. |
| Self-hosted API | Requires the actual host/runtime target, Firebase identity, model endpoint and production env. A sandbox process is not a substitute. |
| Two-account auth/privacy checks | Requires deployed rules plus designated test accounts. Do not create or modify live accounts without the target being verified. |
| Email/OAuth | Configure/verify Firebase providers, authorized domains and actual email delivery with cloud access. |
| Connectors | Live inventory/rotation remains blocked. Do not export user credentials into logs, repository files or chat. |
| Monitoring/Kaggle | Actual provider settings, secrets, quotas and freshness SLA require operator access; no forecast ingest/broadcast workflow was dispatched against production. |

## Security and handoff

Use provider login/connections and secret settings; **do not paste service account
JSON, API keys, tokens, private keys or account passwords into chat**. GitHub's
connection works for ordinary repository operations but its deployment/secret
permissions need attention before those operations can proceed. Reconnect or
adjust the provider integration permissions in Arena as appropriate.

Publishing this branch for CI does not promote it to main or certify production.
The session is fixed to this branch; any production merge/promotion must occur
through the repository's reviewed release process.

## Remote execution evidence

- Application/remediation commit: `10cd58470b9112129b19379368469f15f9132b1a`, committed and pushed only to `arena/01a0a0a6-hazardnet`.
- [GitHub CI run 34872148580](https://github.com/myself-aas/HazardNet/actions/runs/34872148580): **completed successfully**. All eight jobs passed: pipeline scripts, security audit, Firebase access control, actual TFLite contract, backend tests, frontend tests, browser E2E, and code quality/build.
- The existing Vercel Git integration reported **Deployment has completed / success** for that commit: [deployment dashboard](https://vercel.com/aas-core/hazardnet/V2f4nMBR3P1ERLgMwhRToMDTgeMd). This is the branch-associated deployment status, not proof of production promotion, correct credentials, or end-to-end live functionality. The dashboard could not be fetched from the sandbox; no runtime URL/configuration was independently inspected.
- Read-only probes from the sandbox to `https://hazardnet.live/health`, `/api/v1/forecasts/bulk?horizon=7_days`, and `/api/push/vapid-key` failed at TLS transport (curl exit 35, HTTP 000). This is **not evidence that the public site is down**.
- Attempted to dispatch existing `site-health.yml` on the session branch so GitHub could probe the public site. Dispatch was rejected with **HTTP 403 / Resource not accessible by integration**. No job was created.
- Downloading CI job-log archives was blocked by the sandbox's connection to GitHub's log-hosting CDN. Pass/fail conclusions were verified through GitHub's run/job API and completed run watcher, not inferred from missing logs.

The default branch and its old workflow configuration have **not** been changed.
No production credential was obtained or printed. Remaining production steps
require authenticated cloud access and a coordinated migration/release window.

## Review handoff

[Draft PR #21](https://github.com/myself-aas/HazardNet/pull/21) contains the tested
application changes. It is intentionally a draft: merging the new private-profile
rules/frontend without coordinated migration and credentials can interrupt live
users. The latest execution notes are also saved in this workspace; the tested
application revision above is unchanged.
