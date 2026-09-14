# Technology Stack

> Updated 2026-09-14 after owner decisions and remediation. [ADR 0009](../adr/0009-firebase-model-and-deployment-contract.md) is canonical. [Audit results and limits](../audits/2026-09-14-firebase-remediation.md); [rollout checklist](../ops/firebase-model-rollout.md). Source review is not production certification.

## 1) Runtime Summary
| Area | Current contract | Evidence |
|---|---|---|
| Languages | TS/TSX browser, JS ESM server/jobs, Python model/pipeline | `frontend/src/`, `backend/`, `model_service/` |
| Node/npm | Node >=22.12, npm workspace (`frontend`), root package-lock; Bun lock retired | Both package manifests, `package-lock.json` |
| Build | Vite React/Tailwind; root copy-dist step | `frontend/vite.config.ts`, `scripts/copy-dist.mjs` |
| Python | CI 3.11; pinned LiteRT/FastAPI model dependencies, separate pipeline requirements | `.github/workflows/ci.yml`, `model_service/requirements.txt`, `scripts/requirements-pipeline.txt` |

## 2) Production Frameworks and Dependencies
Manifest constraints: React/react-dom 18.3.1; React Router ^6.24, TanStack Query ^5, Firebase ^12.17, Leaflet ^1.9.4, geotiff ^2.1.3, Tailwind ^4.3.3, MUI ^6, Recharts ^2.9; Express ^4.18.2, Firebase Admin ^14.4, TFJS ^4.12, Google GenAI ^2.15, web-push ^3.6.7, prom-client ^15.1.3, Helmet ^8.1, Zod ^3.23 (`package.json`, `frontend/package.json`). Exact JS resolution is in the lockfile.

`tfjs-node` was removed to retire vulnerable native install tooling; portable TFJS handles normalization and **trained inference uses LiteRT**. Python pins: ai-edge-litert 2.2.0, FastAPI 0.141.1, NumPy 2.4.6, Uvicorn 0.53.0. Supabase runtime packages removed. Full dependency inventory is in the manifests/requirements, not historical README badges.

## 3) Development Toolchain
TypeScript strict, ESLint 9, Prettier 3, Jest 29 with Babel-Jest/jsdom 30, Testing Library, Supertest, Playwright, pytest, Firebase CLI/rules-unit-testing, Java 21 emulator in CI. Versions/configuration: manifests, `jest.config.cjs`, `playwright.config.ts`, `.github/workflows/ci.yml`.

## 4) Key Commands
```sh
npm ci
npm start                        # API/built SPA :3001, PORT override
npm --prefix frontend run dev    # Vite :3000, proxy API to :3001
npm run build
npm run lint                     # TypeScript
npm run lint:eslint
npm test -- --runInBand --coverage
npm run test:rules               # Java 21 required
npm run test:e2e                 # separately start preview + install Chromium
npm run check:bundle
```

## 5) Environment and Config
`.env.example` enumerates server/browser variables. Server Firebase uses `FIREBASE_SERVICE_ACCOUNT_JSON` or ADC, `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_ID`. Browser uses `VITE_FIREBASE_*`. No server secret may use VITE prefix. Model inference needs `MODEL_SERVICE_URL` + matching server-only API key on Node/Python. Ingest/broadcast need BACKEND_API_KEY; production CORS needs FRONTEND_ORIGIN. AI/VAPID configuration is feature-dependent.

Vercel builds root dist; native TFJS is no longer a dependency. No supported Docker Compose file exists. Historical DATABASE_URL/FORECAST_STORE declarations do not enable Supabase. [TODO] Deployed settings, model-service hosting require rollout verification.

## 6) Evidence
- `package.json`, `frontend/package.json`, `package-lock.json`, `.env.example`
- `model_service/requirements.txt`, `scripts/requirements-pipeline.txt`
- `frontend/vite.config.ts`, `vercel.json`, `.github/workflows/ci.yml`
