---
name: a2a-agent-card
description: Publish an A2A Agent Card at /.well-known/agent-card.json for agent-to-agent discovery.
---

# Implement A2A Agent Card

Publish an A2A Agent Card for agent-to-agent discovery per the [A2A Protocol Specification](https://a2a-protocol.org/latest/specification/).

## Requirements

- Serve JSON at `/.well-known/agent-card.json` with HTTP 200
- Include `name`, `version`, and `description`
- Include `supportedInterfaces` with service URL and transport protocol
- List `capabilities` and `skills` (each with `id`, `name`, `description`)

## Implementation

This site publishes an A2A Agent Card at `/.well-known/agent-card.json`:

- **name:** HazardNet
- **version:** 3.2.0
- **description:** Multi-Hazard Early Warning AI agent for Bangladesh agriculture
- **capabilities:** streaming: false, pushNotifications: true
- **supportedInterfaces:** HTTP+JSON at `/api`, protocolVersion 1.0
- **securitySchemes:** bearerAuth (Firebase JWT), apiKeyAuth, anonymous
- **6 skills:** hazard-forecast, weather-observations, alert-monitoring, historical-catalog, ai-advisory-chat, unit-conversions

See [Agent Discovery](https://a2a-protocol.org/latest/topics/agent-discovery/) for the full schema.

## Validate

```
POST https://isitagentready.com/api/scan
Content-Type: application/json

{"url": "https://YOUR-SITE.com"}
```

Check that `checks.discovery.a2aAgentCard.status` is `"pass"`.
