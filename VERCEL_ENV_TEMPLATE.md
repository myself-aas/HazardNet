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
| `VITE_ADSENSE_CLIENT` | Google AdSense Client ID for monetization. | Production | `ca-pub-xxxxxxxxxxxxxxxx` |
| `VITE_ADSENSE_SLOT_ARTICLE_FOOTER` | AdSense slot ID for footer ads. | Production | `1234567890` |
| `VITE_ADSENSE_SLOT_ARTICLE_INLINE` | AdSense slot ID for inline articles. | Production | `1234567890` |
| `VITE_ADSENSE_SLOT_BLOG_INDEX` | AdSense slot ID for blog index. | Production | `1234567890` |
| `VERCEL_ENV` | Environment identifier (`production`, `preview`, `development`). | Production, Preview, Development | `production` |
