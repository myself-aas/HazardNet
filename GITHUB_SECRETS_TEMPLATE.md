# GitHub Repository Secrets Template for HazardNet Automation

Configure these secrets in your GitHub repository under **Settings > Secrets and variables > Actions** to enable automated CI/CD workflows, test runners, deployment pipelines, and LLM orchestration syncs.

---

## 1. Core AI & LLM Model Secrets
| Secret Name | Description | Example / Format | Required |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Primary Gemini API key for AI Advisory synthesis & agentic intelligence. | `AIzaSy...` | **Yes** |
| `GEMINI_API_KEY_BACKUP` | Secondary backup Gemini key for high-availability failover. | `AIzaSy...` | Optional |
| `GROQ_API_KEY` | Groq LPU API key for ultra-fast fallback inference. | `gsk_...` | Optional |
| `OPENROUTER_API_KEY` | OpenRouter API key for multi-model LLM access. | `sk-or-...` | Optional |
| `HUGGINGFACE_API_KEY` | Hugging Face token for model hub dataset downloads. | `hf_...` | Optional |

---

## 2. Database & Persistence Secrets
| Secret Name | Description | Example / Format | Required |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL or Cloud SQL connection string. | `postgresql://user:pass@host:5432/db` | Optional |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase service account credentials JSON string for server-side auth & Firestore CI checks. | `{"type": "service_account", ...}` | Optional |

---

## 3. Vercel & Deployment Integration Secrets
| Secret Name | Description | Example / Format | Required |
| :--- | :--- | :--- | :--- |
| `VERCEL_TOKEN` | Vercel personal access token for automated GitHub Actions deployments. | `vcp_...` | Optional |
| `VERCEL_ORG_ID` | Vercel Organization ID (Team or Personal account ID). | `team_...` | Optional |
| `VERCEL_PROJECT_ID` | Vercel Project ID for HazardNet deployment. | `prj_...` | Optional |

---

## 4. Push Notifications & Telemetry Secrets
| Secret Name | Description | Example / Format | Required |
| :--- | :--- | :--- | :--- |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key. | `BEl4...` | Optional |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key. | `private_key_string` | Optional |
| `WEB_PUSH_CONTACT` | Admin contact email for push notification services. | `mailto:admin@hazardnet.live` | Optional |
