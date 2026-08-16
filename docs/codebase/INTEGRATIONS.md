# Integrations

## External Services
* **Firebase** – Authentication, storage, and real‑time database (used in `backend/server.js`).
* **Prometheus** – Metrics exposed via `prom-client` in `backend/metrics.js`.
* **Google GenAI** – Chat and advisory services.
* **Mapbox GL** – Map rendering in the frontend.
* **Leaflet** – Open‑source mapping library.

## Internal Plugins
* `plugins/` contains plugin manifests and scripts for extending functionality.

## ML Model
* TensorFlow Lite model (`Models/hazardnet_fp32.tflite`).
* Inference performed by `backend/inference.js` using `@tensorflow/tfjs-tflite`.

## Retrieval‑Augmented Generation
* `rag_pipeline/` implements a knowledge‑base search and response generation.

## Evidence
* `backend/server.js` – Firebase, Prometheus, GenAI imports
* `frontend/package.json` – Mapbox, Leaflet dependencies
* `Models/hazardnet_fp32.tflite` – ML model
* `rag_pipeline/` – search and skill router