# HazardNet

Multi-hazard classification and agricultural decision support for Bangladesh.
React/TypeScript + Leaflet frontend, Firebase Auth/Firestore, Express and Vercel
APIs, and an authenticated Python LiteRT service running the checked-in FP32 model.

> **Current architecture:** [ADR 0009](docs/adr/0009-firebase-model-and-deployment-contract.md).
> Firebase supersedes the older Supabase ADRs. Browser model inference, Mapbox,
> Docker Compose quick-start and sub-100ms/offline prediction claims in historical
> materials are not the current implementation.

## Start here

- [Codebase architecture](docs/codebase/ARCHITECTURE.md)
- [Directory map](docs/codebase/STRUCTURE.md)
- [Audit and remaining work](docs/audits/2026-09-14-firebase-remediation.md)
- [Deployment/privacy/model rollout](docs/ops/firebase-model-rollout.md)
- [Testing](docs/codebase/TESTING.md)

## What the application does

- Displays Bangladesh district hazard maps and ingested forecast bulletins with
  model/physics severity fields, historical exports and freshness metadata.
- Uses **7/15-day** archive/API horizons in the current validators. Forecast
  production uses one verified three-hour Actions pipeline; duplicate hourly,
  weekly and manual writers are retired. No scheduled job commits data or creates releases. The external Kaggle notebook's
  scientific outputs require separate validation.
- Runs **real uploaded tensor/TIFF data** through the checked-in trained FP32
  TFLite model via the model service. No fabricated prediction on errors.
- Provides authenticated profiles, assessment storage, author-owned blog
  publishing, advisory/chat routes and web push. Connector configuration is
  owner-private; catalog entries are not a guarantee of implemented external
  delivery integrations.
- Caches selected frontend/map resources and can fall back to a committed
  forecast snapshot. **Offline cached access is not offline model inference.**

Eight classes: Cold Wave, Drought, Fire, Flash Flood, Flood, Heat Wave,
Severe Local Storm, Tropical Cyclone (`Models/labels.json`).

## Local development

Node **22.12+**, npm; Python 3.11 recommended for the model service.

```sh
npm ci
cp .env.example .env
# Configure Firebase/Admin credentials privately; see the rollout runbook.

# Terminal 1: API, http://localhost:3001
npm start

# Terminal 2: Vite, http://localhost:3000, same-origin API proxy
npm --prefix frontend run dev
```

For the built single-server app: `npm run build && npm start`.
Override backend `PORT` and Vite's server-only `API_PROXY_TARGET` together if
needed. Never put service account or model-service credentials in `VITE_*` vars.

### Trained model service

```sh
python3 -m venv .venv
.venv/bin/pip install -r model_service/requirements.txt
# Set MODEL_SERVICE_API_KEY securely in this process environment.
.venv/bin/uvicorn model_service.app:app --host 0.0.0.0 --port 8000 --limit-concurrency 8
```

Configure Node `MODEL_SERVICE_URL` (local base URL or production HTTPS URL) and
matching `MODEL_SERVICE_API_KEY`. The browser sends uploads to `/api/predict`.
If the service is unavailable/unconfigured, prediction fails explicitly.

### Accepted data

- JSON tensor: **614,400 finite numeric raw values**, flat/nested, NCDHW
  `[1,15,10,64,64]` order.
- TIFF (`.tif`, `.tiff`, `.geotiff`): **10 chronological images**, each 64×64
  and 15 bands in `Models/preprocessing_config.json` order. Nodata/wrong shapes
  are rejected. Files are decoded locally and sent as little-endian float32.
- The model artifact is **server-managed** (`Models/hazardnet_fp32.tflite`),
  not an arbitrary uploaded executable. Supporting user-supplied weight files
  requires a separate approval/versioning/security contract.

## Deployment

Both Vercel and self-hosted Express expose the feature API. Vercel uses dedicated
forecast functions plus `api/[...path].js` for the shared Express runtime. Both
connect to Firebase and the same authenticated model-service contract. Set
`FRONTEND_ORIGIN`, Firebase server credentials, model-service credentials,
optional AI-provider keys and VAPID settings on each deployment.

**Important:** deploy Firestore rules and perform the profile/public-article
privacy migration with the [rollout checklist](docs/ops/firebase-model-rollout.md).
Existing public profile lookups require a projection backfill. Rules tests and
live environment verification must precede production claims. Neither this
README nor passing unit tests certify a live deployment.

## Quality checks

```sh
npm run lint                 # strict TypeScript
npm run lint:eslint
npm test -- --runInBand --coverage
npm run test:rules           # Java 21 + Firestore emulator
npm run build
npm run check:bundle
npm run check:rag-freshness
npm run check:env
python -m pytest scripts/tests model_service -q # Python test deps required
npx playwright install chromium
# Start built frontend preview separately, then:
E2E_BASE_URL=http://localhost:4173 npm run test:e2e
```

Pipeline Python requirements: `scripts/requirements-pipeline.txt`. Model tests
also need pytest and httpx. Scientific accuracy requires representative labeled
inputs; synthetic smoke tests only check executable contracts.

## Contributing and license

Discuss significant architectural changes in an issue, update the relevant ADR,
add regression tests, and submit a pull request with test evidence and known
limits. Keep datasets/generated artifacts/secrets out of Git unless explicitly
required by existing data workflows. Licensed under [MIT](LICENSE); external
model training data and boundary datasets retain their own terms.

### Verified three-hour forecasts

The new pipeline pulls approved private Kaggle notebook source, triggers a **new
version**, waits up to 90 minutes (usual runtime may be 25–30 minutes), verifies
its run marker, hash, SI units and all 128 rows, then publishes one atomic Firebase
serving snapshot. Express and Vercel read the same snapshot. The user dashboard
selects the primary district (falling back to district) from the Firebase profile.

**Activation is gated:** configure the protected `forecast-production` environment,
correct/review the notebook units, approve its source SHA, and merge through PR
review. The supplied legacy notebook/CSV must not be marked SI without correcting
the calculation inputs. See [setup, data contract and recovery](docs/ops/three-hour-kaggle-forecasts.md).
