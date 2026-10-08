# auth.md

HazardNet uses Firebase Authentication for user identity and an API key for server-to-server write endpoints. This document describes how agents can authenticate and interact with the HazardNet API.

## Resource

- **Origin:** `https://www.hazardnet.live`
- **Protected Resource Metadata:** `https://www.hazardnet.live/.well-known/oauth-protected-resource`

## Authorization Server

- **Issuer:** `https://securetoken.google.com/hazardnet-aas48424`
- **Authorization Server Metadata:** `https://www.hazardnet.live/.well-known/oauth-authorization-server`
- **Provider:** Firebase Authentication (Google)

## Authentication Methods

### 1. Firebase ID Token (Bearer JWT)

Most API endpoints accept a Firebase ID token as a Bearer token in the `Authorization` header.

```
Authorization: Bearer <firebase-id-token>
```

Firebase ID tokens are JWTs issued by Firebase Authentication after a user signs in. They are short-lived (typically 1 hour) and must be refreshed.

**Endpoints that require a Firebase ID token:**

- `POST /api/chat` — AI advisory chat (authenticated users get higher rate limits)
- `POST /api/grounding` — Maps and search grounding
- `GET /api/v1/alerts` (review surface) — Alert review queue

**Endpoints that work without authentication:**

- `GET /api/v1/forecasts` — Forecast data (public)
- `GET /api/v1/alerts` — Published alerts (public)
- `GET /api/v1/weather` — Weather observations (public)
- `GET /api/v1/historical` — Historical catalog (public)
- `POST /api/predict` — Stored predictions (public)
- `POST /api/conversions` — Unit conversions (public)

### 2. API Key (Server-to-Server)

Write endpoints that ingest data or broadcast notifications require a pre-shared API key.

```
Authorization: Bearer <api-key>
```

API keys are issued out-of-band by the HazardNet team. Contact `contact@hazardnet.live` for access.

**Endpoints that require an API key:**

- `POST /api/v1/forecasts` — Forecast CSV ingest
- `POST /api/push` — Web push notification broadcast

## Scopes

| Scope | Description |
|-------|-------------|
| `read:forecasts` | Read forecast records |
| `read:alerts` | Read published alerts |
| `read:weather` | Read weather observations |
| `read:historical` | Read historical hazard catalog |
| `read:predictions` | Read stored predictions |
| `write:forecasts` | Ingest forecast data (API key only) |
| `write:push` | Broadcast push notifications (API key only) |
| `chat` | AI advisory chat |
| `grounding` | Maps and search grounding |

## Agent Registration

### For Firebase Authentication (User Endpoints)

Agents that need to call authenticated endpoints should register a user account:

1. **Web registration:** Visit `https://www.hazardnet.live/signup` and create an account with email and password.
2. **Firebase REST API:** Use the Firebase Auth REST API to create a user programmatically:
   ```
   POST https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=<firebase-api-key>
   Content-Type: application/json

   {
     "email": "agent@example.com",
     "password": "secure-password"
   }
   ```
3. **Obtain an ID token:** After registration, sign in to get an ID token:
   ```
   POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<firebase-api-key>
   Content-Type: application/json

   {
     "email": "agent@example.com",
     "password": "secure-password",
     "returnSecureToken": true
   }
   ```
   The response includes an `idToken` (JWT) to use as the Bearer token.

**Firebase API Key:** The public Firebase web API key is `AIzaSyBwyxWm0MIQlTmjJ-NKPKjl72AYLS7oDqQ`. This key is for client-side authentication only — it is not a secret.

### For API Key Access (Write Endpoints)

API keys for server-to-server write endpoints are issued by the HazardNet team. Email `contact@hazardnet.live` with:

- Your organization or project name
- The endpoints you need access to
- Expected usage patterns

### Anonymous Access

Many read endpoints are public and do not require any authentication:

- `GET /api/v1/forecasts` — Forecast data
- `GET /api/v1/alerts` — Published alerts
- `GET /api/v1/weather` — Weather observations
- `GET /api/v1/historical` — Historical catalog
- `POST /api/predict` — Stored predictions
- `POST /api/conversions` — Unit conversions

Anonymous requests are subject to stricter rate limits (10 requests/minute vs 60 for authenticated users).

## Bearer Methods

- **Header:** `Authorization: Bearer <token>`

## Roles

Firebase users may have custom claims that grant elevated privileges:

| Role | Description |
|------|-------------|
| `user` | Default role for all authenticated users |
| `admin` | Administrative access (set via Firebase Admin SDK) |
| `duty_officer` | Alert review and publishing authority |

## Token Refresh

Firebase ID tokens expire after approximately 1 hour. Use the refresh token from the sign-in response to obtain a new ID token:

```
POST https://securetoken.googleapis.com/v1/token?key=<firebase-api-key>
Content-Type: application/json

{
  "grant_type": "refresh_token",
  "refresh_token": "<refresh-token>"
}
```

## Rate Limits

| Identity | Rate Limit |
|----------|------------|
| Anonymous (no token) | 10 requests/minute per IP |
| Authenticated (Firebase token) | 60 requests/minute per user |
| API key | Configured per key |

## Contact

- **Email:** contact@hazardnet.live
- **Repository:** https://github.com/myself-aas/HazardNet
- **Documentation:** https://www.hazardnet.live/docs

## agent_auth

```json
{
  "skill": "agent-registration",
  "register_uri": "https://www.hazardnet.live/signup",
  "methods": [
    {
      "type": "firebase",
      "description": "Firebase Authentication with email/password",
      "registration_endpoint": "https://identitytoolkit.googleapis.com/v1/accounts:signUp",
      "token_endpoint": "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword",
      "bearer_method": "header",
      "credential_type": "jwt"
    },
    {
      "type": "api_key",
      "description": "Pre-shared API key for server-to-server write endpoints",
      "contact": "contact@hazardnet.live",
      "bearer_method": "header",
      "credential_type": "opaque"
    },
    {
      "type": "anonymous",
      "description": "No authentication required for public read endpoints",
      "bearer_method": null,
      "credential_type": null
    }
  ]
}
```
