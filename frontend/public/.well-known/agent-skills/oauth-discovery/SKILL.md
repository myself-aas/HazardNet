---
name: oauth-discovery
description: Publish OAuth/OIDC discovery metadata for agent authentication.
---

# Implement OAuth/OIDC Discovery

Publish OAuth or OpenID Connect discovery metadata so agents can authenticate with your APIs.

See [OpenID Connect Discovery](http://openid.net/specs/openid-connect-discovery-1_0.html) and [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414).

## Requirements

- Serve JSON at `/.well-known/openid-configuration` (OIDC) or `/.well-known/oauth-authorization-server` (OAuth 2.0)
- Include `issuer`, `authorization_endpoint`, `token_endpoint`, `jwks_uri`
- List `grant_types_supported` and `response_types_supported`
- Keep issuer identifiers aligned with the tokens the resource actually accepts; do not list the resource origin as an issuer unless it really is one

## Implementation

This site publishes three discovery documents. They have different roles:

### 1. OIDC-shaped convenience document (`/.well-known/openid-configuration`)

- **issuer:** `https://securetoken.google.com/hazardnet-aas48424` (matches the Firebase ID token `iss` claim)
- **authorization_endpoint:** `https://www.hazardnet.live/signup`
- **token_endpoint:** Firebase Identity Toolkit sign-in
- **jwks_uri:** Google's public JWKS for verifying Firebase tokens
- **response_types_supported:** `["id_token", "token"]`
- **grant_types_supported:** `["authorization_code", "implicit", "refresh_token", "password"]`
- **subject_types_supported:** `["public"]`
- **id_token_signing_alg_values_supported:** `["RS256"]`

This is a site-hosted convenience description of the Firebase flow, not a claim that HazardNet operates the Firebase issuer. The registration and token-refresh steps agents should follow are in `/auth.md`.

### 2. Site-scoped Auth.md / OAuth descriptor (`/.well-known/oauth-authorization-server`)

- **issuer:** `https://www.hazardnet.live`
- Includes Auth.md flow metadata (`identity_types`, assertion types, anonymous access)
- This descriptor is **not** listed in the PRM's `authorization_servers`; it does not make the website a Firebase token issuer

### 3. OAuth Protected Resource Metadata (`/.well-known/oauth-protected-resource`)

- **resource:** `https://www.hazardnet.live`
- **authorization_servers:** `["https://securetoken.google.com/hazardnet-aas48424"]` only
- Served by a Pages Function with an identical static fallback; see the `oauth-protected-resource` skill

## Validate

```
POST https://isitagentready.com/api/scan
Content-Type: application/json

{"url": "https://hazardnet.live"}
```

Check that `checks.discovery.oauthDiscovery.status` is `"pass"`. Record the observed result after deployment; the command alone is not evidence of a pass.
