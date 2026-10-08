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

A machine-readable catalog of all agent endpoints is at
`/.well-known/ai-catalog.json`, listing protocols, endpoints, DNS-AID records,
and discovery URLs.
