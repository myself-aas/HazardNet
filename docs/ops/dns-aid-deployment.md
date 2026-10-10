# DNS for AI Discovery (DNS-AID) — Deployment Guide

## Overview

DNS-AID enables AI agents to discover HazardNet's agent endpoints through DNS
using SVCB/HTTPS records under the `_agents` namespace.

## Records to Publish

| Record | Type | Target | ALPN | Description |
|---|---|---|---|---|
| `_index._agents.hazardnet.live` | HTTPS | www.hazardnet.live | `https` | Master agent index |
| `_a2a._agents.hazardnet.live` | HTTPS | www.hazardnet.live | `a2a` | A2A Agent Card |
| `_mcp._agents.hazardnet.live` | HTTPS | www.hazardnet.live | `mcp` | MCP Server Card |
| `_api._agents.hazardnet.live` | HTTPS | www.hazardnet.live | `https` | REST API catalog |
| `_webmcp._agents.hazardnet.live` | HTTPS | www.hazardnet.live | `webmcp` | WebMCP tools |

## Prerequisites

1. Cloudflare account with DNS management for `hazardnet.live`
2. API token with `Zone:DNS:Edit` permission
3. Zone ID for `hazardnet.live`
4. DNSSEC enabled on the zone

## Publishing via Script

```bash
# Dry run — see what would be created
CLOUDFLARE_API_TOKEN=cf_xxx CLOUDFLARE_ZONE_ID=xxx \
  node scripts/publish-dns-aid.mjs --dry-run

# Publish records
CLOUDFLARE_API_TOKEN=cf_xxx CLOUDFLARE_ZONE_ID=xxx \
  node scripts/publish-dns-aid.mjs

# Delete all _agents records
CLOUDFLARE_API_TOKEN=cf_xxx CLOUDFLARE_ZONE_ID=xxx \
  node scripts/publish-dns-aid.mjs --delete
```

## Publishing via Cloudflare Dashboard

1. Log into [Cloudflare](https://dash.cloudflare.com) → hazardnet.live → DNS
2. For each record above, add an **HTTPS** record:
   - **Name**: `_a2a._agents` (etc.)
   - **Target**: `www.hazardnet.live`
   - **Priority**: `1`
   - **ALPN**: `a2a` (etc.)
   - **Port**: `443`
   - **Proxy status**: DNS only (gray cloud) — DNS-AID records must NOT be proxied

## Verification

```bash
# Check via dig
dig +short _a2a._agents.hazardnet.live HTTPS
dig +short _mcp._agents.hazardnet.live HTTPS
dig +short _index._agents.hazardnet.live HTTPS

# Check via DNS-over-HTTPS (Cloudflare)
curl -s "https://cloudflare-dns.com/dns-query?name=_a2a._agents.hazardnet.live&type=HTTPS" \
  -H "Accept: application/dns-json" | python3 -m json.tool

# Check via DNS-over-HTTPS (Google)
curl -s "https://dns.google/resolve?name=_a2a._agents.hazardnet.live&type=HTTPS" | python3 -m json.tool
```

## DNSSEC

Ensure DNSSEC is enabled for `hazardnet.live` so validating resolvers return
authenticated data for the `_agents` subdomain records.

In Cloudflare: DNS → Settings → DNSSEC → Enable

## Zone File

The complete zone file with all record definitions (including experimental
`keyNNNNN` parameters) is at [`dns/agents-zone.txt`](../../dns/agents-zone.txt).

## AI Catalog

`/.well-known/ai-catalog.json` is an **Agentic Resource Discovery (ARD) 1.0** catalog —
the artifact Lighthouse 13.5.0 validates under its Agentic Browsing category. Its schema
(`spec/schemas/ai-catalog.schema.json` in `ards-project/ard-spec`) sets
`additionalProperties: false` at the root and allows exactly `specVersion`, `host` and
`entries`, so the file cannot also carry the free-form `agents` / `dns_aid` / `discovery`
blocks it used to. What those held now lives where it is actually consumed:

- **DNS-AID records** — `scripts/publish-dns-aid.mjs` and [`dns/agents-zone.txt`](../../dns/agents-zone.txt)
  are the source of truth; the script has always carried its own record list and never read
  the catalog. Each entry repeats its own record as a scalar `metadata.dnsAid` so the
  binding between a protocol and its `_agents` name stays visible in one place.
- **Discovery URLs** (OAuth protected resource, OpenID configuration, authorization
  server, `security.txt`) — these are standard well-known paths that agents fetch by
  convention, so duplicating them in the catalog added a second copy to drift.
- **WebMCP tools** — registered at runtime from `frontend/src/lib/webmcp.ts` with no
  separate fetchable descriptor, so that entry publishes its tool list inline via ARD's
  `data` member rather than a `url`.

`__tests__/aiCatalog.test.js` pins the ARD shape and asserts that every `url` in the
catalog resolves to a real file under `frontend/public/`, so a renamed artifact fails CI
instead of 404ing for registries that fetch every listed URL.
