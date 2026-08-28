# Concerns

> **Status update 2026-08-28:** this document is superseded by the full audit —
> see [`docs/audits/2026-08-28-full-stack-audit.md`](../audits/2026-08-28-full-stack-audit.md)
> for the evidence-backed findings catalog and the P0–P2 remediation roadmap.
> P0 and P1 are **executed**; P2 is in progress. Current status of the items
> originally listed here:

## Security
* ~~No authentication or authorization on API endpoints.~~
  → P0/P1: rate limiting on all routes; API-key auth (timing-safe, fail-closed)
  on ingest/push/forecasts. AI routes remain keyless-but-rate-limited by design
  pending Supabase JWT verification (P2 remainder — see audit SEC-01).
* ~~CORS is enabled but not restricted.~~
  → P0: `FRONTEND_ORIGIN` allowlist (legacy-permissive until configured).

## Performance
* ~~ML inference may be CPU-intensive; no batching or async queue.~~
  → P1: benchmarked (`scripts/bench-predict.mjs`, p50 ≈ 6.7 s on the browser
  TFJS build). P2: native `tfjs-node` loader wired (`backend/tfjs.js`) —
  install `@tensorflow/tfjs-node` in production to activate; re-benchmark.
  **New (P2):** a real normalization broadcast bug was found and fixed
  (audit ML-04) — predictions were computing corrupted channel features.
* No caching of prediction results. → still open (low priority).

## Scalability
* Single-process Node.js server; no clustering. → accepted for current scale (ADR 0003).
* ~~No database; data is static.~~ → outdated: Supabase + Firestore + RTDB in
  play; consolidation tracked in ADR 0002.

## Maintainability
* ~~Mixing JavaScript and TypeScript across the repo.~~ → intentional split
  (frontend TS, backend JS); type-checking gates the TS side in CI.
* ~~Lack of linting and formatting tooling.~~ → P1: ESLint 9 + Prettier;
  572-problem legacy baseline burning down.

## CI/CD
* ~~No CI workflow defined.~~ → P0: `ci.yml` added (pending the GitHub App
  `workflows` permission to push; file is ready in the repo tree).
* ~~No Dockerfile or container configuration.~~ → accepted: Vercel is the
  deploy target (ADR 0003); containerization unnecessary for now.

## Documentation
* ~~Minimal inline comments; documentation lives only in `docs/`.~~
  → ADRs 0001–0003 added; design system documented; audit trail maintained.
