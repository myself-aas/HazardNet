# Architecture

## Overview
HazardNet follows a **client‑server** architecture with a **monorepo** layout. The backend exposes a RESTful API built on **Express** that performs machine‑learning inference using **TensorFlow.js TFLite**. The frontend is a **React** single‑page application bundled with **Vite** and written in **TypeScript**.

## Backend
* **Express** handles routing and middleware.
* **Routes** (`backend/routes/*.js`) expose endpoints:
  * `/api/predict` – ML inference
  * `/api/advisory`, `/api/agent`, `/api/chat` – AI‑powered services
  * `/api/labels`, `/api/config`, `/api/districts` – static data
  * `/health`, `/metrics` – health‑check and Prometheus metrics
* **Middleware** (`backend/middleware/validation.js`) validates request payloads.
* **Metrics** (`backend/metrics.js`) uses `prom-client` to expose Prometheus metrics.
* **Inference** (`backend/inference.js`) loads the TFLite model from `Models/` and runs predictions.

## Frontend
* **React** + **TypeScript** for UI.
* **Redux Toolkit** for global state.
* **TanStack Query** for data fetching.
* **Mapbox GL** + **Leaflet** for interactive maps.
* **TensorFlow.js** (WASM backend) for client‑side inference (optional).
* **Google GenAI** integration for chat and advisory features.

## Data Flow
1. User interacts with the UI.
2. Frontend calls `/api/*` endpoints via `fetch`.
3. Backend validates, runs inference, and returns JSON.
4. Frontend renders results.

## Deployment
The repo is intended to be deployed as a **Node.js** application. Static assets from the frontend are served by the Express server when present.

## Evidence
* `backend/server.js` – Express bootstrap
* `frontend/src/App.tsx` – React entry point
* `Models/hazardnet_fp32.tflite` – ML model
* `package.json` – scripts for building and running