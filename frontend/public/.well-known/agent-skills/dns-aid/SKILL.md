---
name: dns-aid
description: Publish DNS for AI Discovery (DNS-AID) SVCB/HTTPS records for DNS-based agent discovery.
---

# Implement DNS for AI Discovery (DNS-AID)

Publish DNS for AI Discovery (DNS-AID) records so agents can discover your agent endpoints through DNS.

## Requirements

- Publish DNS for AI Discovery (DNS-AID) records under your domain's `_agents` namespace, such as `_index._agents.example.com` or `_a2a._agents.example.com`
- Use ServiceMode `SVCB` records, or `HTTPS` records for HTTPS endpoints, with `alpn` and endpoint connection parameters
- Use numeric `keyNNNNN` SvcParamKey names for experimental DNS for AI Discovery (DNS-AID) custom parameters until they are registered
- Sign public DNS for AI Discovery (DNS-AID) discovery zones with DNSSEC so validating resolvers return authenticated data

## Implementation

This site publishes DNS-AID records under `_agents.hazardnet.live`:

```dns
_index._agents.hazardnet.live. 3600 IN HTTPS 1 www.hazardnet.live. alpn="https" port=443 mandatory=alpn,port
_a2a._agents.hazardnet.live.   3600 IN HTTPS 1 www.hazardnet.live. alpn="a2a" port=443 mandatory=alpn,port
_mcp._agents.hazardnet.live.   3600 IN HTTPS 1 www.hazardnet.live. alpn="mcp" port=443 mandatory=alpn,port
_api._agents.hazardnet.live.   3600 IN HTTPS 1 www.hazardnet.live. alpn="https" port=443 mandatory=alpn,port
_webmcp._agents.hazardnet.live. 3600 IN HTTPS 1 www.hazardnet.live. alpn="webmcp" port=443 mandatory=alpn,port
```

### Publishing

Records are published via the Cloudflare API:

```bash
CLOUDFLARE_API_TOKEN=token CLOUDFLARE_ZONE_ID=zone-id node scripts/publish-dns-aid.mjs
```

### Zone file

The DNS zone file is at `dns/agents-zone.txt` with all record definitions and experimental `keyNNNNN` parameters.

### AI Catalog

A machine-readable AI catalog is published at `/.well-known/ai-catalog.json` listing all agent endpoints, their DNS-AID records, and discovery URLs.

## Validate

The scanner validates DNS-AID via DNS-over-HTTPS (Cloudflare `cloudflare-dns.com` with Google DNS fallback).

```
POST https://isitagentready.com/api/scan
Content-Type: application/json

{"url": "https://YOUR-SITE.com"}
```

Check that `checks.discoverability.dnsAid.status` is `"pass"`.
