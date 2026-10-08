---
name: markdown-negotiation
description: Support Accept: text/markdown content negotiation for machine-readable content.
---

# Implement Markdown Content Negotiation

Support `Accept: text/markdown` content negotiation so agents can request markdown versions of your pages.
See [llmstxt.org](https://llmstxt.org/) and [Markdown for Agents](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/).

## Requirements

- When a request includes `Accept: text/markdown`, return a markdown representation of the page
- Set `Content-Type: text/markdown` on the response
- HTML remains the default for requests without the markdown accept header
- Include an `x-markdown-tokens` header with the token count if available

## Implementation

This site implements markdown content negotiation via:

1. **Build-time generator** (`scripts/build_markdown.mjs`) — reads from structured content JSON and generates markdown files for all routes
2. **Express middleware** (`backend/middleware/markdownNegotiation.js`) — detects `Accept: text/markdown` and serves pre-generated `.md` files

### Response Headers

```
Content-Type: text/markdown; charset=utf-8
Vary: Accept
x-markdown-tokens: <estimated-token-count>
Cache-Control: public, max-age=3600
```

## Validate

```
POST https://isitagentready.com/api/scan
Content-Type: application/json

{"url": "https://YOUR-SITE.com"}
```

Check that `checks.contentAccessibility.markdownNegotiation.status` is `"pass"`.
