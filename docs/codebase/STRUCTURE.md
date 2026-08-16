# Structure

## Repository Layout
```
HazardNet
├─ backend/          # Express API server
│  ├─ routes/        # API route handlers
│  ├─ middleware/    # Express middleware (validation, etc.)
│  ├─ metrics.js    # Prometheus metrics
│  ├─ inference.js  # ML inference logic
│  └─ server.js     # Express app bootstrap
├─ frontend/         # React + Vite SPA
│  ├─ public/       # Static assets
│  ├─ src/          # TypeScript source
│  │  ├─ components/
│  │  ├─ context/
│  │  ├─ data/
│  │  ├─ hooks/
│  │  ├─ pages/
│  │  ├─ services/
│  │  ├─ store/
│  │  └─ types/
│  ├─ App.tsx
│  ├─ main.tsx
│  └─ vite-env.d.ts
├─ Models/          # ML model files (tflite, labels, stats)
├─ plugins/          # Plugin manifests and scripts
├─ rag_pipeline/     # Retrieval‑augmented generation pipeline
├─ references/       # Domain reference data
├─ scripts/          # CI/CD and tooling scripts
├─ skills/           # Skill definitions for the agent
├─ assets/           # Documentation assets
├─ package.json      # Root monorepo package
└─ README.md
```

## Key Directories
* **backend/** – API server and inference logic.
* **frontend/** – Client‑side application.
* **Models/** – TensorFlow Lite model and associated metadata.
* **plugins/** – External plugin integration.
* **rag_pipeline/** – Retrieval‑augmented generation components.
* **references/** – Static reference data used by the app.

## File Highlights
* `backend/server.js` – Express bootstrap, route registration, metrics.
* `frontend/src/App.tsx` – Root React component.
* `Models/hazardnet_fp32.tflite` – Core inference model.
* `frontend/package.json` – Frontend dependencies and scripts.
* `package.json` – Root workspace configuration.

## Evidence
* Repository tree (as shown above)
* `backend/server.js` – route definitions
* `frontend/package.json` – build scripts
* `Models/` – model files