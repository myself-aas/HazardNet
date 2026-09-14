# Rollout execution — 2026-09-14

Target checklist: `docs/ops/firebase-model-rollout.md`.
Session branch: `arena/01a0a0a6-hazardnet`.

**Release state: blocked for production.** Local release checks executed; no
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
| `npm run test:rules` | Blocked: Java executable absent; no emulator tests executed |
| `npx playwright install chromium` | Failed: browser CDN download connection failure; browser E2E not executed |
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
| Rules/indexes | Run Java-21 emulator gate, then deploy to verified named database. Do not substitute public-write rules or the default database. |
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
