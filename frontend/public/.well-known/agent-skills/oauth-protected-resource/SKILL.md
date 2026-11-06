---
name: oauth-protected-resource
description: Publish OAuth Protected Resource Metadata per RFC 9728.
---

# Implement OAuth Protected Resource Metadata

Publish OAuth Protected Resource Metadata so agents can discover the resource identifier and token issuer per [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728).

## Requirements

- Serve a JSON object at `/.well-known/oauth-protected-resource` with HTTP 200 and `Content-Type: application/json`
- Include `resource`, an HTTPS resource identifier without a fragment
- Include `authorization_servers` as an array of issuer identifiers when the issuers are enumerable
- Optionally include `scopes_supported` and `bearer_methods_supported`
- Optionally return `WWW-Authenticate` with `resource_metadata` on 401 responses

## Implementation

HazardNet serves this document from a Cloudflare Pages Function (Workers runtime), with an identical extensionless static asset as the fail-open/local-development fallback. Express serves the same shared document. Both `https://hazardnet.live` and `https://www.hazardnet.live` serve this path directly (it does not redirect), so `resource` matches the requested host: the apex document names the apex, the `www` document names `www`. Any other Host falls back to the canonical `https://www.hazardnet.live`. Documentation, policy and TOS URLs stay canonical.

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

The owner selected the existing Firebase OIDC issuer. The website origin is the resource, not an authorization server. Cloudflare Access is not configured by this metadata; adopting it later requires an owner-provided issuer and matching token-validation changes.

An otherwise unchallenged 401 from the Pages or Express middleware carries:

```
WWW-Authenticate: Bearer resource_metadata="https://www.hazardnet.live/.well-known/oauth-protected-resource"
```

A route-specific challenge is preserved. Successful responses use the `Link` header for proactive discovery instead of an authentication challenge. Publication does not change which endpoints require Firebase tokens, roles or server-to-server API keys.

## Validate

After deployment, from a network that can reach the scanner:

```
POST https://isitagentready.com/api/scan
Content-Type: application/json

{"url": "https://hazardnet.live"}
```

Check that `checks.discovery.oauthProtectedResource.status` is `"pass"`. Also fetch the canonical well-known URL directly and compare `resource` and `authorization_servers`. The branch-local verification record is in `docs/ops/oauth-protected-resource.md`; an external scanner pass is not claimed before it is observed.
