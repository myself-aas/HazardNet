# OAuth Protected Resource Metadata (RFC 9728)

**Status: implemented in this branch; the Pages Function is not deployed or externally scanned.**
The canonical resource is `https://www.hazardnet.live`. `https://hazardnet.live` is the apex
alias and redirects to the canonical host.

## Issuer decision

The owner chose on **2026-11-06** to keep the existing Firebase OIDC issuer:

```
https://securetoken.google.com/hazardnet-aas48424
```

**Access is explicitly out of scope.** The originating requirement named Cloudflare Access as
the authorization server. Asked for the real team domain and application AUD, the owner
answered **"No cloudflare, only firebase"** (2026-11-06). That is a recorded waiver of the
Access line, not an omission: Firebase is the single advertised issuer.

The website origin is the protected resource, not an authorization server. No Access team
domain or issuer is guessed, because RFC 9728 requires `authorization_servers` to name issuers
that exist and whose tokens this resource actually accepts. Publishing an Access issuer while
Firebase verifies the tokens would advertise credentials the resource rejects.

Revisiting Access later is an owner architecture decision with two coupled parts: provision
the Access application (and decide which hostnames/paths it protects — Access in front of the
whole hostname would put the public hazard outlook behind a login), then change token
validation and this document together.

## What ships

- `GET /.well-known/oauth-protected-resource` returns HTTP 200,
  `Content-Type: application/json; charset=utf-8`, and the RFC 9728 document below.
- `functions/.well-known/oauth-protected-resource.ts` serves it on the Cloudflare Pages
  Workers runtime. `frontend/public/_routes.json` no longer excludes this one path from
  Functions; the other published `.well-known` assets remain explicitly excluded so they do
  not spend Function invocations.
- `backend/security/oauthProtectedResource.js` is the platform-neutral source shared by the
  Function and Express. The extensionless file in `frontend/public/.well-known/` is an
  identical fail-open/local-development fallback, pinned by a parity test.
- `HEAD` returns the same headers without a body. Writes return 405 with `Allow: GET, HEAD`.
  The document is public and CORS-readable; fetching it never requires or forwards credentials.
- Pages and Express middleware add this discovery hint to a 401 that has no more specific
  challenge:

  ```
  WWW-Authenticate: Bearer resource_metadata="https://www.hazardnet.live/.well-known/oauth-protected-resource"
  ```

  A route-specific challenge is preserved. Successful responses keep proactive discovery in
  `Link`, not `WWW-Authenticate`. The hint does not authenticate a request, change a role check,
  or make a public endpoint protected.

```json
{
  "resource": "https://www.hazardnet.live",
  "authorization_servers": [
    "https://securetoken.google.com/hazardnet-aas48424"
  ],
  "scopes_supported": [
    "openid", "email", "profile",
    "read:forecasts", "read:alerts", "read:weather", "read:historical",
    "read:predictions", "write:forecasts", "write:push", "chat", "grounding"
  ],
  "bearer_methods_supported": ["header"],
  "resource_documentation": "https://www.hazardnet.live/docs",
  "resource_policy_uri": "https://www.hazardnet.live/terms",
  "resource_tos_uri": "https://www.hazardnet.live/terms"
}
```

`scopes_supported` describes the published API vocabulary; it does not turn Firebase ID
tokens into OAuth access tokens with newly enforced scopes. Existing Firebase, duty-officer
and server-to-server API-key checks remain authoritative. `/auth.md` describes those flows.
The site-scoped `/.well-known/oauth-authorization-server` Auth.md descriptor is not listed as
an issuer in PRM.

## Local verification

```bash
npm run lint
npm run lint:eslint
npx jest --ci --runInBand --silent
npx wrangler pages functions build --outdir /tmp/hazardnet-oauth-functions \
  --compatibility-date=2026-11-06
npm run build
```

The Jest suite exercises the actual Pages handler and middleware, the actual Express app,
method handling, static fallback parity, `_routes.json` reachability, skill digests and a real
existing 401. The Wrangler build must compile the dotted `.well-known` route; a TypeScript
check alone does not prove Pages file-based routing.

For a local Pages smoke test after the build:

```bash
npx wrangler pages dev frontend/dist --port=3002 --ip=0.0.0.0 \
  --compatibility-date=2026-11-06
curl -sS -D - http://127.0.0.1:3002/.well-known/oauth-protected-resource
```

## Owner verification after deployment — Action 26

The scan is automated in the existing **Site Health Probe** workflow (`.github/workflows/site-health.yml`,
`agent-readiness` job). It is dispatch-only and read-only: it POSTs the scan, prints
`checks.discovery.oauthProtectedResource.status`, uploads the raw response, and fails the run
unless that value is literally `pass`. An unreachable scanner or a missing field is reported
as **inconclusive**, never as a pass.

```bash
# Scan only — skips the probe job, so no probe-record commit is published.
gh workflow run site-health.yml --ref <branch> -f scan_only=true
gh run watch
```

`scripts/scan_agent_readiness.mjs` is the same check for any machine that can reach the
scanner (`node scripts/scan_agent_readiness.mjs --url https://hazardnet.live`), and
`--from-file <response.json>` re-reads a saved response without a network call.

Manual equivalent, from a network that can reach both hosts:

```bash
curl -sS -D - https://hazardnet.live/.well-known/oauth-protected-resource
# Expect the apex redirect, then fetch the canonical URL below.
curl -sS -D - https://www.hazardnet.live/.well-known/oauth-protected-resource
# Expect 200 application/json, resource=https://www.hazardnet.live,
# authorization_servers=[https://securetoken.google.com/hazardnet-aas48424].

curl -sS -X POST https://isitagentready.com/api/scan \
  -H 'Content-Type: application/json' \
  --data '{"url":"https://hazardnet.live"}' \
  | jq '.checks.discovery.oauthProtectedResource.status'
# Required result: "pass"
```

Record the deployment ID, date, direct response and scanner result in Action 26 and the route
register before marking publication complete. Keep Pages runtime **fail open** so the identical
static document remains available if the Function allowance is exhausted.

## Verification record (2026-11-06, branch-local)

- `npx jest --ci --runInBand --silent`: **217 suites, 2338 tests passed** (includes
  `__tests__/agentReadinessScan.test.js`, which spawns the scan script against a real local
  HTTP server and asserts the POST method, content type, body and every exit path).
- `node scripts/check-workflows.mjs`: passed — `site-health.yml` parses with 2 jobs and no
  `secrets` context in any `if:`. `bash scripts/check-secrets.sh`: passed.
- `npm run lint` (TypeScript): passed.
- `npm run lint:eslint`: passed the repository gate (0 errors, 581 warnings; budget 685).
  The changed/new edge files and their suites were also linted with `--max-warnings 0`.
- `npm run build`: passed (172 prerendered routes, 108 Markdown files, site-health publish).
- `npx wrangler pages functions build --outdir /tmp/hazardnet-oauth-functions
  --compatibility-date=2026-11-06`: `Compiled Worker successfully`; the emitted router
  contains `routePath: "/.well-known/oauth-protected-resource"`.
- Local Pages runtime smoke (`npx wrangler pages dev frontend/dist --port=3002
  --ip=0.0.0.0 --compatibility-date=2026-11-06`): GET returned 200 JSON with the canonical
  resource/issuer/scopes and CSP/HSTS/Link/CORS headers; HEAD returned 200 with an empty
  body; POST returned 405 with `Allow: GET, HEAD` and `{"error":"method not allowed"}`.
  Assertion marker: `LOCAL_PAGES_PRM_PASS`. The preview was stopped and the generated
  `.wrangler` cache removed after the smoke.
- The new `WWW-Authenticate` header write is dispositioned in
  `docs/ops/cache-write-register.json` as a Headers mutation, not a cache write.
- Design/source, design, audit, protocol, path and claim gates passed. The aggregate
  `check:device` gate still stops at the pre-existing raw-hex token findings; the individual
  prose/icons/events/important/contrast/contrast-css/svg-tokens/craft gates passed, and
  `check:residue` still reports the pre-existing undefined-token residue. No unrelated UI
  token debt was changed by this work.

The external `POST https://isitagentready.com/api/scan` cannot be reached from the build
sandbox (`SSL_ERROR_SYSCALL`); a GET to the same path answers
`{"error":"Method not allowed. Use POST."}`, which confirms the host but is not a scan.
The POST therefore runs on a GitHub runner via the `agent-readiness` job. Its verdict is
recorded below when the run lands — until then no scanner pass is claimed. The previously
observed live document was the static Firebase-issuer metadata, not evidence that this new
Function is deployed. Owner Action 26 remains open.

### Scanner run record

| Date (UTC) | Run | Scanned URL | `checks.discovery.oauthProtectedResource.status` | Outcome |
|---|---|---|---|---|
| _pending_ | _dispatched from this branch_ | `https://hazardnet.live` | _not yet observed_ | inconclusive until the run reports |
