---
name: oauth-protected-resource
description: Publish OAuth Protected Resource Metadata per RFC 9728.
---

# Implement OAuth Protected Resource Metadata

Publish OAuth Protected Resource Metadata so agents can discover how to authenticate per [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728).

## Requirements

- Serve JSON at `/.well-known/oauth-protected-resource` with HTTP 200
- Include `resource` (your resource identifier URL)
- Include `authorization_servers` (array of OAuth/OIDC issuer URLs)
- Optionally include `scopes_supported`
- Optionally return `WWW-Authenticate` with `resource_metadata` on 401 responses

## Implementation

This site publishes OAuth Protected Resource Metadata at `/.well-known/oauth-protected-resource`:

```json
{
  "resource": "https://www.hazardnet.live",
  "authorization_servers": [
    "https://www.hazardnet.live",
    "https://securetoken.google.com/hazardnet-aas48424"
  ],
  "scopes_supported": ["openid", "email", "profile", "read:forecasts", ...],
  "bearer_methods_supported": ["header"],
  "resource_documentation": "https://www.hazardnet.live/docs"
}
```

Additionally, every HTTP response includes:

```
WWW-Authenticate: Bearer resource_metadata="https://www.hazardnet.live/.well-known/oauth-protected-resource"
```

## Validate

```
POST https://isitagentready.com/api/scan
Content-Type: application/json

{"url": "https://YOUR-SITE.com"}
```

Check that `checks.discovery.oauthProtectedResource.status` is `"pass"`.
