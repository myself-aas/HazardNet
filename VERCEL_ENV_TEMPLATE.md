# Vercel Environment Variables Secrets Template for HazardNet

Configure these environment variables in your Vercel project under **Project Settings > Environment Variables** (selecting Production, Preview, and Development environments as needed) to run HazardNet fluently.

---

## 1. Core API & AI Orchestration Keys
| Environment Variable | Description | Recommended Scope | Example Value |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Primary Gemini API key for server-side AI Advisory synthesis. | Production, Preview, Development | `AIzaSy...` |
| `GEMINI_API_KEY_BACKUP` | Secondary backup Gemini key for failover. | Production, Preview | `AIzaSy...` |
| `BACKEND_API_KEY` | Internal shared secret key for backend service authentication. | Production, Preview | `sec_xyz123...` |
| `GROQ_API_KEY` | Groq API key for high-speed fallback inference. | Production, Preview | `gsk_...` |
| `OPENROUTER_API_KEY` | OpenRouter API key. | Production, Preview | `sk-or-...` |

---

## 1b. Alert engine (PRODUCT_SPEC §1.3/§1.6)
| Environment Variable | Description | Recommended Scope | Example Value |
| :--- | :--- | :--- | :--- |
| `ALERT_DUTY_OFFICERS` | Comma-separated uids/emails allowed to approve or reject an alert above WATCH. | Production, Preview | `uid1,duty@example.org` |
| `ALERT_AUTO_PUBLISH` | `false` keeps every alert in DRAFT (no automatic publication at all). | Production | `true` |
| `ALERT_MAX_AUTO_PUBLISH_LEVEL` | Ceiling for automatic publication. Raising it above `WATCH` weakens §1.6. | Production | `WATCH` |
| `ALERT_WATCH_PROBABILITY` / `ALERT_WARNING_PROBABILITY` | §1.3 probability thresholds. | Production, Preview | `0.4` / `0.65` |
| `ALERT_WATCH_SEVERITY` / `ALERT_DIVERGENCE_WATCH` | Severity band and divergence rule. | Production, Preview | `0.55` / `0.3` |
| `ALERT_ALLOW_UNCALIBRATED_WARNING` | Allows WARNING without a fitted calibration. A product decision, surfaced on the policy endpoint. | Production | *(unset)* |
| `SMS_PROVIDER` | `bulksmsbd`, `greenweb` or `none`. | Production | `bulksmsbd` |
| `SMS_SENDER_ID` | Registered sender id / mask shown to recipients. | Production | `HazardNet` |
| `SMS_DRY_RUN` | `true` builds the request and reports it without sending — use before enabling a gateway. | Preview | `true` |
| `SMS_MAX_PER_RUN` | Cap on SMS attempted per engine run; the overflow is counted, not dropped. | Production | `25` |
| `BULKSMSBD_API_KEY` / `GREENWEB_API_KEY` | Gateway credentials (one provider). | Production | `...` |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_ALERT_CHAT_ID` | Telegram delivery. | Production | `123:ABC` / `-100...` |
| `ALERT_AUTO_PUBLISH_MINUTES` | Minimum gap between automatic publications (spam guard). | Production | `720` |
| `ALERT_NOTIFY_TIMEOUT_MS` | Bound on the notification leg so a slow gateway cannot hold a run. | Production | `10000` |

---
## 2. Database & Storage Configuration
| Environment Variable | Description | Recommended Scope | Example Value |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL or Cloud SQL connection string. | Production, Preview | `postgresql://user:pass@host:5432/db` |
| `FORECAST_STORE` | Forecast persistence mode (`memory`, `firestore`, or `postgres`). | Production, Preview | `firestore` |

---

## 3. Firebase Client & Auth Configuration (Public & Private)
| Environment Variable | Description | Recommended Scope | Example Value |
| :--- | :--- | :--- | :--- |
| `VITE_FIREBASE_API_KEY` | Firebase Web API Key. | Production, Preview, Development | `AIzaSy...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain. | Production, Preview, Development | `your-app.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID. | Production, Preview, Development | `ai-studio-hazardnet-...` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket. | Production, Preview, Development | `your-app.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging Sender ID. | Production, Preview, Development | `1234567890` |
| `VITE_FIREBASE_APP_ID` | Firebase Web App ID. | Production, Preview, Development | `1:123:web:abc` |
| `VITE_FIREBASE_MEASUREMENT_ID` | Firebase Google Analytics Measurement ID. | Production, Preview, Development | `G-XYZ` |
| `VITE_FIREBASE_FIRESTORE_DATABASE_ID` | Firestore Database ID. | Production, Preview, Development | `(default)` |

---

## 4. Push Notifications & Monetization (AdSense)
| Environment Variable | Description | Recommended Scope | Example Value |
| :--- | :--- | :--- | :--- |
| `VAPID_PUBLIC_KEY` | Web Push VAPID Public Key. | Production, Preview | `BEl4...` |
| `VAPID_PRIVATE_KEY` | Web Push VAPID Private Key. | Production | `private_key...` |
| `WEB_PUSH_CONTACT` | Contact URL/email for push service. | Production, Preview | `mailto:admin@hazardnet.live` |
| `VERCEL_ENV` | Environment identifier (`production`, `preview`, `development`). | Production, Preview, Development | `production` |
