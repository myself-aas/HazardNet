# ADR 0009 — Firebase, trained-model inference, npm, and dual deployment

- **Status:** Accepted (owner decisions, 2026-09-14); production rollout pending.
- **Supersedes:** ADR 0001/0002 backend identity and Supabase cutover decisions. Updates ADR 0003 deployment scope. ADR 0007 FP32/no-INT8 remains applicable.

## Decisions

1. **Firebase is canonical.** Firebase Auth identifies users; Firestore stores domain data. Browser clients use rules-bound SDK access. Trusted backend/CI access uses Firebase Admin, configured with Application Default Credentials or `FIREBASE_SERVICE_ACCOUNT_JSON`, and explicit project/database IDs. Supabase packages and cutover workflow are retired; historical SQL/spatial assets remain archived reference material.
2. **Both self-hosted Express and Vercel support the feature API.** `api/[...path].js` exports the same Express app for routes without dedicated functions. Durable push subscriptions live in Firestore. Browser URLs remain same-origin; Vite proxies to Express :3001. Vercel binary tensor requests are 2,457,600 bytes, below its normal request-size ceiling; larger files are decoded locally first.
3. **The trained model and genuine input data are authoritative.** The checked-in FP32 `Models/hazardnet_fp32.tflite` runs with LiteRT in `model_service/app.py`. Node normalizes raw NCDHW data, sends authenticated binary input, and validates the returned artifact SHA-256 and probability/severity ranges. No fabricated predictions or handwritten hazard-logit fallback. Missing service configuration returns 503.
4. **npm is canonical**, with a committed root `package-lock.json`; Node 22.12+ and Node 22 CI. Native TFJS is retired (including its install-tooling advisories); portable JS handles normalization and LiteRT handles trained inference.
5. **Profiles have public demographic projections and private source documents.** The explicit public list is in `frontend/src/lib/profilePrivacy.ts` and enforced in rules. Contact details, email, full birth date, exact location, income, role and notification preferences stay private. `profile_visibility=private` publishes only the username reservation. New projections are replaced atomically with private profile edits.
6. **Registered users publish/manage their own articles.** Administrators with a trusted Firebase `admin: true` custom claim can moderate all articles. Self-written `role: admin` profile fields or UI email allowlists do not grant datastore privileges. Drafts are private to author/admin; published articles are public. Authentication email is no longer written into new public article documents.
7. **Connector configuration is sensitive.** Slack/Discord/Zapier webhook URLs contain bearer-like secrets. Existing generic `config`/legacy `auth_data` may contain credentials. Owner-only rules are required; never log their values or include them in public profiles. This pass does not assert that live records are secret-free or that external connector dispatch is implemented.

## Input contract and limits

- Tensor JSON: flat or nested numeric array, 614,400 finite float32-compatible raw values in `[1,15,10,64,64]` NCDHW order. Browser converts to little-endian binary.
- TIFF: `.tif`, `.tiff`, `.geotiff` containing **10 chronological images**, each **64×64 and 15 bands**, in `Models/preprocessing_config.json` band order. Nodata, wrong shape, and missing time steps are rejected. No band guessing, resampling, or repetition of a single date.
- Weights remain **server-managed**. Arbitrary model-weight uploads/execution are **not enabled** by this decision; they need an artifact validation/approval/versioning contract first. This is a remaining scope question, not silently treated as complete.
- Existing forecast archive horizons (7/15 days), producer schedule (three hours), hourly refresh and weekly release are unchanged. The owner's model-authority decision did not specify replacement horizons or a new freshness SLA.

## Consequences and rollout

Follow `docs/ops/firebase-model-rollout.md`. Existing profiles need public projection backfill; existing public article documents need removal of `author_email`. Back up first. Do not merely publish new frontend code without deploying rules/credentials/model service. Rules deployment, model service hosting, custom claims, live integrations and Vercel function limits still require environment verification.

Evidence: `backend/admin.js`, `backend/inference.js`, `model_service/app.py`, `frontend/src/lib/tensorUpload.ts`, `frontend/src/lib/profilePrivacy.ts`, `firestore.rules`, `package.json`, `vercel.json`.
