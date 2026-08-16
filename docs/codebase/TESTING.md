# Testing

## Backend
* **Jest** is used for unit and integration tests.
* Test files are located alongside source files (e.g., `backend/routes/__tests__/advisory.test.js`).
* Mocking is performed with `jest.mock` for external services.

## Frontend
* **Jest** + **React Testing Library**.
* Tests reside in `frontend/src/__tests__`.
* Snapshot tests for components.

## CI
* No CI configuration present; future work to add GitHub Actions.

## Evidence
* `jest.config.js` – Jest configuration
* `jest.setup.ts` – global test setup
* `backend/server.js` – imports of Jest for test environment
* `frontend/package.json` – test script