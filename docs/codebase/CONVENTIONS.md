# Conventions

## Coding Style
* **JavaScript**: CommonJS modules, `require`/`module.exports`.
* **TypeScript**: `export`/`import` syntax, strict type checking.
* **File Naming**: PascalCase for React components, camelCase for functions and variables.
* **Directory Structure**: Feature‑centric inside `frontend/src`.
* **Linting**: Not configured; future work to add ESLint.

## API Design
* Base path: `/api/*`.
* JSON payloads only.
* Status codes: `200` for success, `400` for validation errors, `500` for server errors.

## Testing
* **Jest** is used for both backend and frontend.
* Test files mirror source structure (e.g., `backend/routes/__tests__/advisory.test.js`).

## Documentation
* Markdown files in `docs/`.
* Code comments are minimal; rely on README and docs.

## Build & Run
* `npm run dev` – runs both backend and frontend concurrently.
* `npm run build` – builds frontend and copies to `backend/public`.

## Evidence
* `backend/server.js` – route definitions
* `frontend/package.json` – scripts
* `package.json` – workspaces and scripts
* `frontend/src/App.tsx` – component naming