# Firebase + trained-model rollout

This is a deployment checklist, not a claim that production has been changed.

## 1. Install and verify

Node **22.12+**, npm. From repository root:

```sh
npm ci
npm run lint
npm run lint:eslint
npm test -- --runInBand --coverage
npm run build
npm run check:bundle
```

`npm run test:rules` requires Java 21. `npm run test:e2e` requires Playwright Chromium and a separately running built frontend. CI has both setup steps. Native TFJS is no longer installed; JS TFJS performs normalization and LiteRT performs trained inference.

## 2. Trusted Firebase configuration

Set these in **server/CI secret settings**, not browser env or chat:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: a least-privilege service account JSON credential, or use Application Default Credentials on managed infrastructure.
- `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_ID`: intended project and named database. Browser `VITE_FIREBASE_PROJECT_ID`/`VITE_FIREBASE_FIRESTORE_DATABASE_ID` must agree.
- `BACKEND_API_KEY`: privileged forecast-ingest/push-broadcast HTTP key.
- `FRONTEND_ORIGIN`: production browser origin allowlist; `NODE_ENV=production`.

GitHub forecast jobs require the service account secret and project/database repository variables. They fail early without credentials. `firebase-verify.yml` is a **read-only manual check**, not a rules deployment.

For admin moderation, assign Firebase Auth custom claim `admin: true` using a trusted Admin SDK operator. Never trust a profile's editable `role` field. Reauthenticate/refresh ID tokens after claim changes.

## 3. Privacy migration and rules

1. Back up Firestore and record project/database IDs. Schedule a coordinated rollout; old frontend builds query the formerly public `profiles` collection.
2. Run dry-run `node scripts/migrate-firebase-privacy.mjs`. It prints counts, not user data. Review the public field list in `profilePrivacy.ts` before publication.
3. Apply deliberately: `FIREBASE_PRIVACY_MIGRATION=RUN node scripts/migrate-firebase-privacy.mjs`. This backfills public demographic projections and removes legacy `author_email` from blog documents. It does not delete private source profiles or connector configs.
4. Run the emulator authorization suite; deploy `firestore.rules` to the **correct named database**, not accidentally `(default)`. In the Firebase console/CLI explicitly confirm the target database and the rules release. `firebase.json` now names the canonical database and includes `firestore.indexes.json`; update that configuration deliberately if deploying another environment. The emulator test uses `(default)` only as an isolated test environment.
5. Deploy the frontend and server. Existing visitors should refresh; cached old clients will correctly lose access to private profile queries.
6. Verify with two real test accounts: one cannot read/edit the other's connector, private profile, draft, or assessment. Anonymous users can read public projections and published articles. Authors can publish their own work; custom-claim admins can moderate.
7. Existing articles without a valid `author_id` need an operator-assigned verified author UID before author editing; do not derive permissions from the editable author-email column.

**Connector finding:** Slack, Discord and Zapier webhook URLs are credentials. Generic stored config can also contain user-entered secrets. No live credential inventory was performed. If broad rules were deployed previously, review access logs and rotate affected webhooks/tokens through each provider. Owner-only Firestore is access control, not an application-level vault; shared-team/service-side connector dispatch needs a separate secret-management design.

## 4. Run the real model service

Python 3.11 recommended; model weights are server-owned. Install separately:

```sh
python3 -m venv .venv
.venv/bin/pip install -r model_service/requirements.txt
# Set MODEL_SERVICE_API_KEY securely in the process environment first.
.venv/bin/uvicorn model_service.app:app --host 0.0.0.0 --port 8000 --limit-concurrency 8
```

Host this service behind HTTPS and an ingress/body-size/concurrency limit. It has no public model upload or docs endpoint. Configure the **same secret** on Node and Python, plus Node `MODEL_SERVICE_URL` pointing to the service's base URL. Keep the endpoint server-only; the browser calls `/api/predict`, never the service or sandbox localhost.

The Node API normalizes and validates input, sends exactly 2,457,600 bytes of float32 data, applies a 45s upstream deadline, checks the checked-in model's SHA-256, and rejects failed/wrong-model responses. Python uses a lock around the shared TFLite interpreter. Run `python -m pytest model_service -q` with pytest/httpx installed to smoke-test the real artifact. Synthetic zero tensors in tests verify runtime contracts, **not scientific accuracy**.

## 5. Deploy either frontend/API topology

- **Self-host:** `npm run build && npm start` uses Express :3001 (override `PORT`) and serves frontend build. Development frontend uses Vite :3000 and proxies to :3001.
- **Vercel:** root npm build → `dist`; dedicated forecast functions plus `api/[...path].js` for shared Express routes. Configure Firebase, model-service, CORS, AI and VAPID env values in Vercel. Normalization uses portable JS TFJS; the native package is retired. Model inference remains in the external Python service.
- Verify `/health`, `/api/v1/forecasts/bulk?horizon=7_days`, `/api/chat/query`, `/api/agent/advisory`, `/api/advisory`, `/api/predict`, `/api/push/vapid-key`, `/api/conversions` on both deployments with each endpoint's expected method/payload. Expect validation/auth errors for invalid input, not SPA HTML/404.
- Vercel request/duration limits still apply. TIFF decoding is browser-side; binary tensors fit the request budget. CSV uploads above the deployment limit must use the trusted CLI or smaller JSON chunks; no advertised 10MB Express limit overrides Vercel's gateway.
- Push subscriptions now persist in private Firestore. Current broadcast is bounded to 5,000 entries and ten simultaneous sends; large sends may exceed serverless duration. Use a durable background queue/worker for production-scale fanout (not implemented in this pass).
- Forecast replacements are replayable bounded upserts followed by stale-row deletion, not globally atomic snapshot swaps. A failure preserves old rows but may leave partial new data until replay. Scheduled writers share a branch-scoped concurrency group; direct API/concurrent cross-branch writes need operational serialization.

## 6. Remaining environment checks

No production deployment, credential/rule change, external message, or scheduled job was triggered during this audit. Confirm live Firestore indexes, auth providers/domains, RTDB rules, metrics collector/alert routing, Vercel bundle/body/time limits, actual representative TIFF inference, and Kaggle provenance/freshness before announcing all features operational.

## Email-link registration

Enable Firebase Email/Password **and email-link sign-in**, authorize each deployed domain, and configure email templates/link handling for `/auth/callback`. Signup now calls `sendSignInLinkToEmail`; callback redeems `signInWithEmailLink` and asks for the email when opening on another device. Delivery/configuration errors are surfaced, not presented as success. Social OAuth providers must also be enabled/configured individually; unsupported OIDC/custom providers still need a verified Firebase provider-ID mapping before claiming them operational.
