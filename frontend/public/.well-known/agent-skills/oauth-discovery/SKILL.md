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

## Implementation

This site publishes three discovery documents:

### 1. OIDC Discovery (`/.well-known/openid-configuration`)

- **issuer:** `https://securetoken.google.com/hazardnet-aas48424` (matches Firebase ID token `iss` claim)
- **authorization_endpoint:** `https://www.hazardnet.live/signup`
- **token_endpoint:** Firebase Identity Toolkit sign-in
- **jwks_uri:** Google's public JWKS for verifying Firebase tokens
- **response_types_supported:** `["id_token", "token"]`
- **grant_types_supported:** `["authorization_code", "implicit", "refresh_token", "password"]`
- **subject_types_supported:** `["public"]`
- **id_token_signing_alg_values_supported:** `["RS256"]`

### 2. OAuth AS Metadata (`/.well-known/oauth-authorization-server`)

- **issuer:** `https://www.hazardnet.live` (matches PRM authorization_servers)
- Includes Auth.md flow metadata (identity_types, assertion types, anonymous access)

### 3. OAuth Protected Resource Metadata (`/.well-known/oauth-protected-resource`)

- **resource:** `https://www.hazardnet.live`
- **authorization_servers:** site URL + Firebase OIDC issuer

## Validate

```
POST https://isitagentready.com/api/scan
Content-Type: application/json

{"url": "https://YOUR-SITE.com"}
```

Check that `checks.discovery.oauthDiscovery.status` is `"pass"`.
