# Stack

## Language & Runtime
* **Node.js** (runtime for backend and frontend build scripts)
* **JavaScript** (backend code)
* **TypeScript** (frontend code)

## Frameworks & Libraries
* **Express** – HTTP server for backend API
* **React** – UI library for frontend
* **Vite** – build tool for frontend
* **Redux Toolkit** – state management
* **TanStack Query** – data fetching
* **Leaflet** + **Mapbox GL** – mapping
* **TensorFlow.js** + **TensorFlow.js TFLite** – machine‑learning inference
* **Google GenAI** – generative AI integration
* **Firebase** – backend services (auth, storage, etc.)
* **Prom-client** – Prometheus metrics
* **Lucide‑React** – icon set

## Dependencies
* Backend (`package.json`): `@google/genai`, `@tensorflow/tfjs`, `@tensorflow/tfjs-tflite`, `body-parser`, `cors`, `express`, `firebase`, `leaflet`, `leaflet.heat`, `lucide-react`, `prom-client`, `react-leaflet`, `react-markdown`
* Frontend (`frontend/package.json`): `react`, `react-dom`, `react-router-dom`, `@reduxjs/toolkit`, `react-redux`, `@tanstack/react-query`, `mapbox-gl`, `jest`, `ts-jest`, `@testing-library/react`, `@testing-library/jest-dom`, `@types/jest`, `@mapbox/mapbox-gl-geocoder`, `geotiff`, `@tensorflow/tfjs`, `@tensorflow/tfjs-backend-wasm`, `@tensorflow/tfjs-converter`, `@mui/material`, `@emotion/react`, `@emotion/styled`, `recharts`

## Dev Dependencies
* Backend: `@babel/core`, `@babel/preset-env`, `@babel/preset-react`, `@babel/preset-typescript`, `@tailwindcss/vite`, `jest`, `ts-jest`, `typescript`
* Frontend: `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`, `@types/react-router-dom`, `@types/mapbox-gl`

## Evidence
* Root `package.json` – dependencies and workspaces
* `frontend/package.json` – frontend dependencies
* `backend/server.js` – imports of Express, TensorFlow, Firebase
* `frontend/src` – TypeScript usage