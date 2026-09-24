# Environment Variables & Secrets — Complete Setup Guide

**Audience:** the repository owner (or any contributor) deploying HazardNet — the web
app at hazardnet.live, its serverless API, and its CI — using **only free tiers that
require no credit card anywhere**.

Every platform below was chosen so that the full production stack runs at **$0/month
with no payment method ever entered**. Where a vendor has a paid tier, this guide
explicitly says what to avoid clicking so you stay free.

---

## 0. How secrets flow in this repo

There are exactly **three injection surfaces**. Every variable in this guide belongs
to one (or more) of them:

| Surface | Where it is set | Consumed by |
| --- | --- | --- |
| **A. Vercel project environment** | vercel.com → Project → Settings → Environment Variables (or `vercel env add`) | the serverless functions in `api/` + `backend/` at runtime, and the Vite build that produces `frontend/dist` |
| **B. GitHub Actions secrets/variables** | github.com → repo → Settings → Secrets and variables → Actions (or `gh secret set`) | the workflows in `.github/workflows/` (`ci.yml`, `verify-secrets.yml`, `site-health.yml`, `Firebase-Store-Verify.yml`, `app-releases.yml`) |
| **C. Local `.env`** | `cp .env.example .env` in the repo root, then fill values (never committed) | local dev servers, local rebuilds of the snapshots (`node scripts/build_forecast_snapshot.mjs`, …) |

**Golden rules**

1. Real values live **only** in A and B (and your local C). `.env.example` is the only
   env file ever committed — it contains placeholders only.
2. Anything prefixed `VITE_` is **public by design** (it is compiled into the JS bundle).
   Only ever put public identifiers there — never a private key.
3. After changing any Actions secret, re-run the mapping check:
   `bash scripts/verify-actions-secrets.sh` (see §6).
4. Before every commit, run `bash scripts/check-secrets.sh` — it is the repo's own
   leak scanner and also runs in CI.
5. Rotate anything that has ever been pasted into a chat, screenshot, or old commit
   (see §7).

---

## 1. Platform-by-platform setup (all $0, no credit card)

### 1.1 Vercel — hosting, serverless functions, CDN, analytics

**What it provides:** static hosting + the serverless API routes, custom domain TLS,
preview deployments, optional Web Analytics.

**Cost / card:** Hobby plan is **$0 forever, no credit card, no expiry**. It cannot be
charged (no payment method exists on the plan). The only constraint is the fair-use
clause: **personal / non-commercial use**. Keep the project non-commercial and you
never see a billing screen.

**Steps**

1. Go to <https://vercel.com> → **Sign Up** → **Continue with GitHub** (authorize;
   this also wires up Git integration — no card step exists in this flow).
2. **Add New… → Project** → Import `myself-aas/HazardNet`.
3. Framework Preset: **Vite**; Root Directory: leave default (the repo root serves the
   API from `api/` and builds `frontend/` per the repo's `vercel.json`/build config).
4. Before the first deploy, open **Settings → Environment Variables** and add the
   variables from §2 (scope: Production + Preview; repeat per field with
   **Add to all environments** or set per environment as the table says).
5. Deploy. Then add the custom domain: **Settings → Domains → Add** (`hazardnet.live`,
   `www`). At your registrar, add the CNAME/A records Vercel shows — TLS certificates
   are issued automatically and free.
6. Optional analytics: **Project → Analytics → Enable** (included in Hobby's free
   usage allowance), then set `VITE_VERCEL_ANALYTICS=on` so the app loads it.
7. CLI alternative (useful for bulk imports):
   ```bash
   npm i -g vercel
   vercel login            # browser auth, no card
   vercel link             # connect this repo folder to the project
   vercel env add GEMINI_API_KEY production    # paste value when prompted
   vercel env pull .env.local                  # pull the set down for local dev
   ```

**Stay-free notes:** don't add a payment method (Hobby has no field for one unless you
upgrade — just never click Upgrade). If a month's limit is hit, usage pauses until the
window resets; it never auto-bills.

### 1.2 Firebase — Auth, Firestore, push (FCM)

**What it provides:** user authentication, the Firestore forecast/alert store, cloud
messaging for push notifications.

**Cost / card:** the **Spark plan is $0, requires no payment method, and can never
generate a bill** — when a free quota is exhausted the product pauses until the quota
resets. Auth, Firestore (within free daily quotas), and FCM are all covered by Spark.

> ⚠️ **One 2026 trap:** Cloud Storage now requires upgrading the project to the
> paid-with-card Blaze plan. **HazardNet does not need Cloud Storage — never enable
> it.** Stay on Spark.

**Steps**

1. Go to <https://console.firebase.google.com> → **Create a project** (or reuse
   `hazardnet-aas48424` if it is yours). Google account only; no billing prompt.
2. **Build → Authentication → Get started**: enable the providers the app uses
   (Email/Password and Google are typical; Anonymous if the app allows guest mode).
3. **Build → Firestore Database → Create database** → Production mode → pick a region
   (e.g. `asia-south1`). Note the **database ID** — `(default)` unless you create a
   named one; the ID goes into `VITE_FIREBASE_FIRESTORE_DATABASE_ID` (leave unset for
   the default database).
4. **Register the web app**: Project Overview → the **`</>`** (Web) icon → nickname it
   → Firebase shows a `firebaseConfig` block. Those exact fields map to:
   | firebaseConfig field | env variable |
   | --- | --- |
   | `apiKey` | `VITE_FIREBASE_API_KEY` |
   | `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
   | `projectId` | `VITE_FIREBASE_PROJECT_ID` |
   | `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` |
   | `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
   | `appId` | `VITE_FIREBASE_APP_ID` |
   | `measurementId` | `VITE_FIREBASE_MEASUREMENT_ID` (only if you enabled Analytics) |
   These are **public identifiers** (they ship in every Firebase web app) — safe to
   put in frontend build env and even in repo *Variables*, never secrets.
5. **Service account** (for the server + CI):
   **Project Settings (gear) → Service accounts → Generate new private key → Generate**.
   A JSON file downloads. This JSON is the credential behind:
   - `FIREBASE_SERVICE_ACCOUNT_JSON` — the **entire JSON minified onto one line**
     (paste it as-is into a Vercel env var; the server parses it).
   - The CI triple: `FIREBASE_PROJECT_ID` (top-level `project_id` field),
     `FIREBASE_CLIENT_EMAIL` (the `client_email` field),
     `FIREBASE_PRIVATE_KEY` (the `private_key` field — **set it with real newlines**
     where the workflow expects the raw key; GitHub secrets preserve newlines when you
     paste the `-----BEGIN PRIVATE KEY-----…-----END PRIVATE KEY-----` block).
   Treat this file like a root password: never commit it, rotate it if it leaks
   (Project Settings → Service accounts → the key's ⋮ menu → Delete).
6. Firestore rules: while in Production mode, deploy the rules the repo ships (if a
   `firestore.rules` exists) or write minimal rules so only the service account and
   authenticated reads/writes the app needs are allowed.

### 1.3 Google AI Studio — `GEMINI_API_KEY`

**What it provides:** the Gemini API used by the advisory generation chain
(`backend/utils/ai_fallback_engine.js`, `chatService`), with a deterministic fallback
if the key is unset.

**Cost / card:** the free tier is real: **a Google account alone is enough — no credit
card and no Google Cloud billing account**. Free-tier limits cover the Flash-class
models (order of 10 requests/minute, a few hundred requests/day — enough for an
advisory feature with caching).

**Steps**

1. Go to <https://aistudio.google.com/app/apikey> and sign in with any Google account.
2. **Create API key** → pick/create a project when asked → copy the key (starts with
   `AIza`, ~39 characters). The key is shown once — store it in your password manager
   immediately.
3. Put it in Vercel (`GEMINI_API_KEY`, scopes: Production/Preview) and in GitHub
   (`GEMINI_API_KEY` secret) if CI exercises advisory smoke tests.
4. **Backup key** (`GEMINI_API_KEY_BACKUP`): create a *second* key in a *second*
   project (or a second Google account) and set it as the failover. This gives you
   continuity when one project's free quota is exhausted.

**Stay-free notes:** never upgrade the key's project to paid billing; if you hit free
limits, add `GEMINI_API_KEY_BACKUP`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` — the code
falls through providers automatically.

### 1.4 Groq — `GROQ_API_KEY`

**What it provides:** fast OpenAI-compatible inference over open models; one of the
advisory fallback providers.

**Cost / card:** the free tier needs **no credit card** and includes every model,
limited by rate limits (~30 requests/minute plus daily token caps).

**Steps**

1. Go to <https://console.groq.com> → **Sign up** (email or Google SSO; no payment
   step exists). Verify your email.
2. **API Keys → Create API Key** → name it `hazardnet` → copy it **immediately**
   (shown exactly once; keys start with `gsk_`).
3. Set `GROQ_API_KEY` in Vercel.

### 1.5 OpenRouter — `OPENROUTER_API_KEY`

**What it provides:** one OpenAI-compatible endpoint over many free open-weight
models (Llama, Gemma, Qwen, DeepSeek, Mistral…), used as an advisory fallback.

**Cost / card:** signing up and using **free models (`:free` suffix) requires no
credit card**. Without any purchase the free-model allowance is roughly
**50 requests/day (20 requests/minute)** — plenty for a fallback path.

**Steps**

1. Go to <https://openrouter.ai> → **Sign in** (Google/GitHub SSO; no card).
2. **Keys** (<https://openrouter.ai/settings/keys>) → **Create Key** → copy it
   (starts with `sk-or-`).
3. Set `OPENROUTER_API_KEY` in Vercel.
4. **Stay-free note:** the dashboard may advertise credits — ignore it. Only use
   model IDs ending in `:free` in any configuration you control; adding a card is
   never required.

### 1.6 Hugging Face — `HUGGINGFACE_API_KEY`

**What it provides:** access token for HF-hosted inference/models, another advisory
fallback provider.

**Cost / card:** accounts and read tokens are **free, no card**.

**Steps**

1. Go to <https://huggingface.co/join> → sign up (email verification; no card).
2. **Settings → Access Tokens** (<https://huggingface.co/settings/tokens>) →
   **Create new token** → type **Read** → name it `hazardnet` → copy (starts with
   `hf_`).
3. Set `HUGGINGFACE_API_KEY` in Vercel.

### 1.7 Self-generated secrets (no vendor at all)

These are generated locally with standard tools — free forever, no account:

**`BACKEND_API_KEY`** — bearer token protecting the ingest endpoint
(`POST /api/v1/forecasts/update`). Generate 32 random bytes and share it with the
ingest caller only:

```bash
openssl rand -hex 32     # e.g. 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
```

Set the same value in Vercel (`BACKEND_API_KEY`) and wherever the authorized caller
lives (CI secret of the same name).

**`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VITE_VAPID_PUBLIC_KEY` /
`WEB_PUSH_CONTACT`** — Voluntary Application Server Identification keys for web push
notifications. Generate once with the `web-push` CLI:

```bash
npx web-push generate-vapid-keys
# prints:
#   Public Key:  <BNx…-style URL-safe base64 string>
#   Private Key: <…>
```

- `VAPID_PUBLIC_KEY` → Vercel (server side)
- `VAPID_PRIVATE_KEY` → Vercel (server side, **secret**)
- the same **public** key → `VITE_VAPID_PUBLIC_KEY` (frontend build; public by design)
- `WEB_PUSH_CONTACT` → a `mailto:` address the push service can contact, e.g.
  `mailto:admin@hazardnet.live`

**Android signing (`app-releases.yml`)** — optional; if unset, the workflow signs the
APK with a throw-away CI keystore (installable but not updatable). For a stable key:

```bash
keytool -genkeypair -v -keystore keystore.jks -alias hazardnet \
  -keyalg RSA -keysize 2048 -validity 10000
# (keytool ships with any free JDK, e.g. Temurin from adoptium.net)
base64 -w 0 keystore.jks > keystore.b64
```

Then set four GitHub secrets: `ANDROID_KEYSTORE_BASE64` (contents of `keystore.b64`),
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`hazardnet`),
`ANDROID_KEY_PASSWORD` (key password; may equal the store password). Store the
original `keystore.jks` safely offline — it is the only way to ship updates to the
same install base.

### 1.8 GitHub — Actions secrets, variables, and Codecov

**Cost / card:** GitHub free accounts include Actions with unlimited minutes on public
repos; secrets are a free feature. No card anywhere.

**Steps**

1. UI: repo → **Settings → Secrets and variables → Actions**.
   - **Secrets** tab → **New repository secret** → name + value (see §2/§3 for the list).
   - **Variables** tab → for non-secret config (`API_METADATA_URL`, `PUSH_TO_API`).
2. CLI (faster for many secrets):
   ```bash
   gh auth login
   gh secret set BACKEND_API_KEY --body "<value>"
   gh secret set FIREBASE_PRIVATE_KEY < firebase-private-key.pem   # file input keeps newlines
   gh variable set API_METADATA_URL --body "https://www.hazardnet.live"
   ```
3. **Codecov token** (`CODECOV_TOKEN`, optional — uploads are warn-only without it):
   go to <https://codecov.io> → **Sign in with GitHub** → pick the repo → copy the
   **Upload token**. Codecov is free for open-source repos, no card.

### 1.9 Legacy / optional CI credentials

These names still exist in the verify workflow's catalog but are **optional or
legacy** after the research-tooling cleanup:

- **`EE_SERVICE_ACCOUNT_JSON`** — legacy data-source service-account key for the old
  scheduled pipeline, which is no longer part of CI. Nothing needs this to deploy.
  If you ever revive a data pipeline: create a Google Cloud project (possible without
  adding billing), create a service account (IAM & Admin → Service Accounts → Keys →
  Add key → JSON), and paste the JSON. If any step demands enabling billing, stop —
  the variable is optional.
- **`HAZARDNET_API_URL` / `HAZARDNET_API_KEY`** + the `PUSH_TO_API` **variable** —
  only consumed when an external ingest API is deployed and `PUSH_TO_API=true`. The
  committed snapshot is the default delivery path; leave unset otherwise.
- **`BENCH_URL`** — latency benchmark target; the benchmark script was removed with
  the research tooling, so this is inert. Leave unset.

---

## 2. Complete variable reference

### 2.1 Serverless runtime (Vercel project environment; scope: Production + Preview)

| Variable | Required | Purpose / consumed by | How to obtain (free) |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | recommended | Advisory generation (`ai_fallback_engine`, `chatService`); deterministic fallback if unset | §1.3 AI Studio |
| `GEMINI_API_KEY_BACKUP` | optional | Failover when the primary is rate-limited | §1.3, second project |
| `GROQ_API_KEY` | optional | Advisory fallback provider | §1.4 |
| `OPENROUTER_API_KEY` | optional | Advisory fallback provider | §1.5 |
| `HUGGINGFACE_API_KEY` | optional | Advisory fallback provider | §1.6 |
| `BACKEND_API_KEY` | **required for ingest** | Bearer token for `POST /api/v1/forecasts/update` | §1.7 `openssl rand -hex 32` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **required** | Firestore store access (server boot) | §1.2 step 5, minified JSON |
| `VAPID_PUBLIC_KEY` | for push | Web-push server key | §1.7 |
| `VAPID_PRIVATE_KEY` | for push | Web-push server key (**secret**) | §1.7 |
| `WEB_PUSH_CONTACT` | for push | `mailto:` contact sent to push services | your email |
| `FRONTEND_ORIGIN` | recommended | CORS allowlist, e.g. `https://www.hazardnet.live` (comma-separate extras) | your domain |
| `CSP_ENFORCE` | optional | Set `1` to enforce Content-Security-Policy headers (start without it, watch reports, then enable) | decision |
| `FIREBASE_VERIFY_TIMEOUT_MS` | optional | Auth token verification timeout tuning | decision |
| `CONVERSION_PERSIST_TIMEOUT_MS` | optional | Persistence step timeout tuning | decision |
| `FORECAST_STORE` | optional | Override the forecast-store path/descriptor (defaults are correct for this repo) | keep default |
| `FORECAST_DATASET` | optional | Dataset label in API metadata (default `hazardnet/weekly-forecasts`) | keep default |
| `SNAPSHOT_SOURCE` / `SNAPSHOT_RUN_REPORT` / `SNAPSHOT_KERNEL` / `SCENE_MANIFEST` | optional | Provenance overrides for local snapshot rebuilds | keep default |
| `ALERT_AUTO_PUBLISH` | optional | `false` (default) keeps alert publication manual | decision |
| `ALERT_AUTO_PUBLISH_MINUTES` | optional | Auto-publish delay minutes when enabled | decision |
| `ALERT_DUTY_OFFICERS` | optional | Comma-separated duty-officer identifiers for the alert desk | decision |
| `QA_CHROMIUM_PATH` / `PLAYWRIGHT_CHROMIUM_PATH` | CI-only | Explicit Chromium binary paths for headless QA | leave unset locally |
| `NODE_ENV`, `VERCEL_ENV` | — | **Platform-provided. Never set these manually.** | automatic |

### 2.2 Frontend build (`VITE_*` — public by design; set in Vercel build env)

| Variable | Required | Purpose | Value source |
| --- | --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | yes | Firebase web SDK | §1.2 step 4 |
| `VITE_FIREBASE_AUTH_DOMAIN` | yes | Firebase web SDK | §1.2 step 4 |
| `VITE_FIREBASE_PROJECT_ID` | yes | Firebase web SDK | §1.2 step 4 |
| `VITE_FIREBASE_STORAGE_BUCKET` | yes | Firebase web SDK config (unused while Storage is disabled) | §1.2 step 4 |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | yes (push) | FCM sender | §1.2 step 4 |
| `VITE_FIREBASE_APP_ID` | yes | Firebase web SDK | §1.2 step 4 |
| `VITE_FIREBASE_MEASUREMENT_ID` | optional | Analytics (only if enabled) | §1.2 step 4 |
| `VITE_FIREBASE_DATABASE_URL` | optional | Only if a Realtime Database instance is used | Firebase console → RTDB |
| `VITE_FIREBASE_FIRESTORE_DATABASE_ID` | optional | Set only for a **named** Firestore DB; unset = `(default)` | §1.2 step 3 |
| `VITE_VAPID_PUBLIC_KEY` | for push | Public push key in the client | §1.7 |
| `VITE_CONTACT_EMAIL` | recommended | Public contact address rendered on the site | your email |
| `VITE_VERCEL_ANALYTICS` | optional | `on` to load Vercel Web Analytics | §1.1 step 6 |
| `VITE_DOWNLOAD_GITHUB_OWNER` / `VITE_DOWNLOAD_REPO_ANDROID` | optional | Download-link overrides (default to this GitHub repo) | keep default |
| `VITE_DOWNLOAD_LIVE_RELEASES`, `VITE_DOWNLOAD_REPO_{WINDOWS,LINUX,NPM,PYTHON}`, `VITE_NPM_PACKAGE_NAME`, `VITE_PYPI_PACKAGE_NAME` | optional | Additional package/download-link overrides | keep default |

### 2.3 GitHub Actions secrets & variables

| Name | Type | Required | Consumer | Setup |
| --- | --- | --- | --- | --- |
| `GEMINI_API_KEY` | secret | optional | advisory smoke paths | §1.3 |
| `BACKEND_API_KEY` | secret | optional | ingest smoke paths | §1.7 |
| `FIREBASE_PROJECT_ID` | secret | yes (store-verify job) | `Firebase-Store-Verify.yml` | §1.2 `project_id` |
| `FIREBASE_CLIENT_EMAIL` | secret | yes (store-verify job) | `Firebase-Store-Verify.yml` | §1.2 `client_email` |
| `FIREBASE_PRIVATE_KEY` | secret | yes (store-verify job) | `Firebase-Store-Verify.yml` | §1.2 `private_key` (real newlines) |
| `CODECOV_TOKEN` | secret | optional | coverage upload in `ci.yml` | §1.8 step 3 |
| `HAZARDNET_API_URL` / `HAZARDNET_API_KEY` | secret | only with an ingest API | `site-health.yml` probes, ingest push | §1.9 |
| `EE_SERVICE_ACCOUNT_JSON` | secret | legacy/optional | verify catalog only | §1.9 |
| `BENCH_URL` | secret | no (inert) | legacy bench | leave unset |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | secrets | optional | `app-releases.yml` APK signing | §1.7 |
| `API_METADATA_URL` | **variable** | recommended | `site-health.yml` metadata probe | your live URL |
| `PUSH_TO_API` | **variable** | optional | master switch for ingest push | `false` unless an ingest API exists |

Test-only dummies (`secrets.FOO`, `secrets.X` in `verify-secrets.yml`) exist to prove
the checker works — never set them in the real repo settings.

---

## 3. Where-to-put-it matrix (quick copy map)

| Do this | With these |
| --- | --- |
| **Vercel → Environment Variables** | `GEMINI_API_KEY`, `GEMINI_API_KEY_BACKUP`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `HUGGINGFACE_API_KEY`, `BACKEND_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `WEB_PUSH_CONTACT`, `FRONTEND_ORIGIN`, all `VITE_*` from §2.2, optional flags (`CSP_ENFORCE`, `ALERT_*`, timeouts) |
| **GitHub → Secrets** | `GEMINI_API_KEY`, `BACKEND_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `CODECOV_TOKEN`, optional: `HAZARDNET_API_URL`, `HAZARDNET_API_KEY`, `EE_SERVICE_ACCOUNT_JSON`, `ANDROID_KEYSTORE_*` |
| **GitHub → Variables** | `API_METADATA_URL`, `PUSH_TO_API` |
| **Local `.env` (from `.env.example`)** | everything you need for local runs; `vercel env pull .env.local` is the easiest way to populate it |

---

## 4. Local development walkthrough

```bash
# 0. one-time tooling (all free): Node 20 LTS from nodejs.org, plus
npm install --legacy-peer-deps        # repo root deps
npm install --prefix frontend         # frontend deps

# 1. template
cp .env.example .env                  # NEVER commit .env (gitignore already blocks it)

# 2. fill values as you need them:
#    - backend API smoke tests need BACKEND_API_KEY + FIREBASE_SERVICE_ACCOUNT_JSON
#    - advisory needs at least one provider key (GEMINI/GROQ/OPENROUTER/HF)
#    - frontend dev server needs the VITE_FIREBASE_* set

# 3. easiest accurate fill — pull the exact production values Vercel already has:
vercel link && vercel env pull .env.local

# 4. run the stack locally and confirm health
npm run build --prefix frontend       # or: vercel dev
curl -s localhost:3001/api/v1/forecasts/metadata | head
```

---

## 5. Verification checklist

1. **Secrets presence (CI parity):** map the secrets into a step's `env:` exactly like
   the consuming workflow does, then run `bash scripts/verify-actions-secrets.sh`.
   The script prints presence/length/fingerprint only — never values. Exit 0 = all
   required-for-this-job secrets are in.
2. **Leak scan:** `bash scripts/check-secrets.sh` must pass locally and in CI
   (`ci.yml` runs it on every push).
3. **API metadata is live and honest:**
   `curl -s https://<your-deployment>/api/v1/forecasts/metadata` should return
   `data_source`, `notebook_source: "hazardnet/forecast-pipeline"` and the two
   dataset entries.
4. **Advisory chain:** with only the deterministic fallback (no AI keys) the advisory
   endpoint must still answer — AI keys are an enhancement, not a dependency.
5. **Push notifications:** subscribe in the app; if subscription fails, re-check the
   three VAPID values (the public key must be identical in `VAPID_PUBLIC_KEY` and
   `VITE_VAPID_PUBLIC_KEY`).
6. **Store verify workflow** (after the Firebase secrets land): re-run
   `Firebase-Store-Verify.yml` from the Actions tab — green means the service account
   can read/write the forecast store.

---

## 6. Rotation & hygiene

- **Rotate** (generate a fresh value, update surface A then B, delete the old):
  - any key that ever appeared in a screenshot, chat, or old commit — immediately;
  - `GEMINI_API_KEY*` quarterly (AI Studio: delete + recreate, 1 minute);
  - `BACKEND_API_KEY` whenever an operator who knew it leaves (coordinate with the
    ingest caller to avoid downtime: add a second key window if needed);
  - Firebase service-account keys: Project Settings → Service accounts → delete old
    key after the new one is deployed everywhere.
- **Never** paste real values into issues, PRs, or this repo's files. `.env.example`
  placeholders only.
- **Fingerprints, not values:** when you need to confirm "which value is deployed",
  use `scripts/verify-actions-secrets.sh`'s fingerprint output (first 6 hex of
  SHA-256) to compare surfaces without exposing anything.
- **Incident procedure:** leak suspected → rotate the affected credential → run
  `bash scripts/check-secrets.sh` → check Actions logs for accidental `echo` of
  secrets → if a value reached a public commit, also see
  `docs/PUBLICATION_POLICY.md` for history handling.

---

## 7. Free-tier summary (everything above, one table)

| Platform | Provides | Plan | $0? | Card required? | Hard limits to know |
| --- | --- | --- | --- | --- | --- |
| Vercel | hosting, serverless, CDN, TLS | Hobby | yes | **No** | non-commercial use clause; monthly usage allowance pauses at the cap |
| Firebase | Auth, Firestore, FCM | Spark | yes | **No** | daily Firestore quotas; **do not enable Cloud Storage (needs paid Blaze)** |
| Google AI Studio | Gemini API key | free tier | yes | **No** | per-minute/per-day request caps on Flash-class models |
| Groq | OpenAI-compatible LLM API | free tier | yes | **No** | ~30 req/min + daily token caps |
| OpenRouter | multi-model free endpoint | free tier | yes | **No** | ~50 free-model requests/day, 20/min |
| Hugging Face | model-host tokens | free account | yes | **No** | rate-limited free inference |
| GitHub | CI, secrets, releases | Free | yes | **No** | unlimited Actions minutes on public repos |
| Codecov | coverage reporting | OSS | yes | **No** | free for open-source repos |
| openssl / web-push / keytool | self-issued secrets | — | yes | **No** | none |

**Bottom line:** the entire HazardNet production stack — hosting, database, auth,
push, AI advisory, CI, signing — runs at **$0/month with no credit card ever
entered**.
