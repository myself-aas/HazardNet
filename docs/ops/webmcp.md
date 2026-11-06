# WebMCP activation and verification

**Status: implemented in this branch; not deployed or activated.** The production host is
`https://www.hazardnet.live`. The Cloudflare dashboard toggle is owner state, not a repository
setting. Follows [Cloudflare's WebMCP developer-preview guide](https://blog.cloudflare.com/webmcp/).

## What ships

- `POST /mcp`: stateless JSON-RPC Streamable HTTP, shared by `functions/mcp.ts` (Pages) and
  `backend/mcp/nodeAdapter.js` (local Node). Supports MCP revisions `2025-11-25`,
  `2025-06-18` and `2025-03-26`; returns JSON, not SSE. GET/DELETE return 405. No sessions,
  batching, resources, prompts, writes or credentials are advertised.
- Eight read-only tools: `get_hazard_forecast`, `list_forecasts`, `get_weather`, `list_alerts`,
  `get_historical_events`, `get_district_info`, `get_site_status`, `get_hazard_info`.
  Descriptors and handlers live once in `backend/mcp/tools.js`.
- Native browser registration in `frontend/src/lib/webmcp.ts`: discovers the eight tools via
  `tools/list`, registers same-origin proxies, and adds `search-district` plus
  `navigate-to-page` (ten browser capabilities). Unsupported browsers do no network work.
  When Cloudflare's `mcp-server-client` pack already owns `/mcp`, the native client leaves
  its proxies to the managed bridge and keeps the two browser-only tools.
- Discovery: `/.well-known/mcp/server-card.json`, the MCP entry in
  `/.well-known/ai-catalog.json`, and the `/mcp` anchor in `/.well-known/api-catalog`.

Every hazard result carries the BMD/FFWC/999 boundary. Confidence is an uncalibrated model
softmax, not a probability of harm. Empty or missing data is not an all-clear. Alerts expose
only `PUBLISHED` rows through the shared public projection. Asset reads use a fixed public
allowlist and never forward cookies or authorization headers. `get_weather` uses caller-supplied
coordinates, never device geolocation. Navigation accepts only same-origin paths published in
`sitemap.xml`.

## Owner steps

1. Merge this branch through the normal review process and let the existing Pages pipeline
   deploy `dist` plus `functions/`. Do not add a second host or paid runtime.
2. In Cloudflare Dashboard, open **Agent Readiness > WebMCP** for the `hazardnet.live` zone.
   Enable WebMCP and select **Site MCP Server** (`mcp-server-client`). Content Credentials is
   optional and independent. The bridge's MCP URL must be the same-origin `/mcp`.
3. Keep Pages runtime **fail open** and the existing build watch paths including `backend/**`
   and `functions/**`. `_routes.json` must continue to include `/*` and must not exclude `/mcp`.
4. Verify the deployed endpoint before enabling traffic-dependent checks:

   ```bash
   curl -sS https://www.hazardnet.live/ | grep webmcp
   # Expect the edge-injected script with data-packs containing mcp-server-client
   # and data-mcp-url="/mcp". The repository does not contain this injected tag.

   curl -sS https://www.hazardnet.live/mcp \
     -H 'Content-Type: application/json' -H 'Accept: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
   # Expect eight tools and no execute functions in the JSON.

   curl -sS https://www.hazardnet.live/mcp \
     -H 'Content-Type: application/json' -H 'Accept: application/json' \
     -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_district_info","arguments":{"district":"Dhaka"}}}'
   # Expect canonical district identity, source and disclaimer; isError false.
   ```

5. Point Cloudflare BrowserRun (or a WebMCP-capable browser agent) at the canonical URL.
   Confirm tool discovery and a Dhaka outlook call. Record the deployment ID, date and actual
   result in `route-register.json` / Action 25 before marking activation complete.

The managed toggle alone injects the bridge; it does not create the origin's MCP endpoint.
This branch supplies that endpoint. Native registration also works after deployment without
the toggle in browsers that expose `document.modelContext`; the managed bridge is the path
described by the Cloudflare preview.

## Local verification

```bash
npm run lint
npx jest --runInBand __tests__/webmcpServer.test.js frontend/src/lib/__tests__/webmcp.test.ts \
  __tests__/aiCatalog.test.js __tests__/securityHeadersParity.test.js __tests__/routeReachability.test.js
npm run build
npm run check:device
npm run check:design:source
npm run check:design
npm run audit:pages
npm run protocol:check
```

For a live local smoke test, run `PORT=3001 node backend/server.js` and the frontend dev server
on port 3000. Vite proxies `/mcp` to Node. The Node adapter prefers `frontend/dist` and falls
back to `frontend/public`; run the build first when checking generated hazard Markdown.

## Limits and abuse controls

The request body cap is 16 KiB, including chunked bodies. Browser cross-origin calls are
rejected; non-browser clients may omit `Origin`. Node applies the existing 120 requests/minute
API limiter. Pages does not run Express middleware: the zone's existing free-tier edge rule
and request budget remain the abuse control (Action 8); no paid counter is introduced.
`get_site_status` reads the freshness artifact and explicitly does not claim live service health.
MCP `2026-07-28` is not advertised or implemented.

## Verification record (2026-11-05, local)

The full Jest suite, TypeScript lint, production build, source/build design detectors,
document audit, protocol check, public-path check and claims check passed. The aggregate
`check:device` gate still fails on pre-existing findings outside this change: raw hex literals
in `ChatBot.tsx` / `handoff-beam*` and four undefined `--ap-sev-medium` reads in
`DivisionDetailPage.tsx`. The remaining device subchecks (prose, icons, events summary,
`!important`, contrast, CSS contrast, SVG tokens and craft floor) passed. No visual UI was
changed and no baseline was rewritten. Production deployment and the Cloudflare toggle remain
open under Action 25.
