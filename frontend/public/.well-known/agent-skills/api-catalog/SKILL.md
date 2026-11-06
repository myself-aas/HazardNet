---
name: api-catalog
description: Publish an API catalog per RFC 9727 for automated API discovery.
---

# Implement API Catalog

Publish an API catalog for automated discovery per [RFC 9727](https://www.rfc-editor.org/rfc/rfc9727).

## Requirements

- Serve `/.well-known/api-catalog` with `Content-Type: application/linkset+json` and HTTP 200
- Include a `linkset` array with entries for each API
- Each entry needs an `anchor` URL and link relations: `service-desc` (OpenAPI spec), `service-doc` (docs), and optionally `status` (health endpoint)
- See [RFC 9727 Appendix A](https://www.rfc-editor.org/rfc/rfc9727#appendix-A) for examples

## Implementation

This site serves the API catalog at `/.well-known/api-catalog` with:

- **Content-Type:** `application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"`
- **10 API entries** covering forecasts, alerts, weather, MCP, chat, grounding, predict, push, conversions, and live-voice
- REST entries include `service-desc` (OpenAPI), `service-doc` and `status`; the `/mcp` entry describes itself with the MCP server card and has no REST health claim
- An OpenAPI 3.1.0 specification is published at `/api/openapi.yaml`
- A `Link` header with `rel="api-catalog"` is added to all responses for discovery

## Validate

```
POST https://isitagentready.com/api/scan
Content-Type: application/json

{"url": "https://YOUR-SITE.com"}
```

Check that `checks.discovery.apiCatalog.status` is `"pass"`.
