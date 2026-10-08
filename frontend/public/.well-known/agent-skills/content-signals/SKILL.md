---
name: content-signals
description: Declare AI content usage preferences with Content Signals in robots.txt.
---

# Implement Content Signals

Declare AI content usage preferences in your robots.txt using [Content Signals](https://contentsignals.org/) ([IETF draft](https://datatracker.ietf.org/doc/draft-romm-aipref-contentsignals/)).

## Requirements

- Add `Content-Signal` directives to your robots.txt under the relevant `User-agent` block
- Declare preferences for `ai-train`, `search`, and `ai-input`
- Example: `Content-Signal: ai-train=no, search=yes, ai-input=no`

## Implementation

This site implements Content Signals in `robots.txt` with the following policy:

```
User-agent: *
Content-Signal: ai-train=no, search=yes, ai-input=no
Allow: /
```

### Policy

- **ai-train=no** — AI training/fine-tuning on site content is not permitted
- **search=yes** — Search indexing and search results are allowed
- **ai-input=no** — Feeding content into AI models (RAG/grounding) is not permitted

## Validate

```
POST https://isitagentready.com/api/scan
Content-Type: application/json

{"url": "https://YOUR-SITE.com"}
```

Check that `checks.botAccessControl.contentSignals.status` is `"pass"`.
