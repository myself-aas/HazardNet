# Concerns

## Security
* No authentication or authorization on API endpoints.
* CORS is enabled but not restricted.

## Performance
* ML inference may be CPU‑intensive; no batching or async queue.
* No caching of prediction results.

## Scalability
* Single‑process Node.js server; no clustering.
* No database; data is static.

## Maintainability
* Mixing JavaScript and TypeScript across the repo.
* Lack of linting and formatting tooling.

## CI/CD
* No CI workflow defined.
* No Dockerfile or container configuration.

## Documentation
* Minimal inline comments; documentation lives only in `docs/`.

## Evidence
* `backend/server.js` – lack of auth
* `backend/routes/*.js` – no auth middleware
* `package.json` – no CI scripts
* `frontend/package.json` – no Dockerfile