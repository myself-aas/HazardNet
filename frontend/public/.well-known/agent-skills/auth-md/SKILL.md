---
name: auth-md
description: Publish Auth.md agent registration discovery metadata.
---

# Implement Auth.md Agent Registration Discovery

Publish Auth.md support for agent registration.

## Requirements

- Serve `/auth.md` from the service root as Markdown with an H1 heading that contains `auth.md`
- Prefer publishing OAuth Protected Resource Metadata at `/.well-known/oauth-protected-resource`
- Include `resource`, `authorization_servers`, `scopes_supported`, and `bearer_methods_supported` with `header` in the PRM document
- Publish OAuth Authorization Server metadata at `/.well-known/oauth-authorization-server`
- Include a valid `issuer` in Authorization Server metadata and ensure it matches the issuer advertised in PRM
- Add an `agent_auth` block with `skill`, `register_uri`, and at least one complete registration method

## Implementation

This site publishes:

- **`/auth.md`** — Auth.md document with `# auth.md` H1, auth methods (Firebase ID token, API key, anonymous), scopes, registration flow, and `agent_auth` block
- **`/.well-known/oauth-protected-resource`** — PRM with resource, authorization_servers, scopes_supported, bearer_methods_supported
- **`/.well-known/oauth-authorization-server`** — AS metadata with issuer matching PRM, identity types, flow metadata

### Identity Types

- `identity_assertion` with `urn:ietf:params:oauth:token-type:id-jag` and `verified_email`
- `anonymous` with `credential_types_supported` and `claim_uri`

## Validate

```
POST https://isitagentready.com/api/scan
Content-Type: application/json

{"url": "https://YOUR-SITE.com"}
```

Check that `checks.discovery.authMd.status` is `"pass"`.
