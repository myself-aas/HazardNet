# Secret rotation

**Owner:** unassigned (see `docs/ops/owner-actions.md`, Action 1).
**Register:** `data/security/secret-rotation.json`.
**Enforcement:** `node scripts/check-secret-rotation.mjs`, run monthly by
`.github/workflows/secret-rotation-audit.yml`.

Nothing in this repository used to say how often a credential is replaced, so a key could sit
untouched indefinitely and no check would notice. This page is the cadence; the register is the
evidence; the script is the thing that nags.

## The cadence

| Credential | Cadence | Why that number |
|---|---|---|
| `BACKEND_API_KEY`, `HAZARDNET_API_KEY` | **90 days** | Self-generated, gates privileged writes, and fail-closed — cheap to rotate, expensive if stale. |
| `GEMINI_API_KEY`, `GEMINI_API_KEY_BACKUP`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `HUGGINGFACE_API_KEY` | **90 days** | Provider keys with no expiry of their own; the cascade means one bad key is survivable, two is not. |
| `FIREBASE_PRIVATE_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON` | **180 days** | A service-account key is a bearer credential for the whole project, but rotating it needs a console round-trip, so a quarterly rhythm is realistic. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | **365 days** | Rotation invalidates every browser push subscription — a user-visible event, so it is annual and announced. |
| `CODECOV_TOKEN`, `EE_SERVICE_ACCOUNT_JSON` | **365 days** | Low blast radius (see below). |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` | **not scheduled** | The Play upload key — see below. |

Every credential also rotates **immediately** on suspected exposure, regardless of the schedule:
a key pasted into an issue, a laptop lost, a provider breach notice, or a contributor who had
access and no longer does.

## Recording a rotation

1. Create the new credential **before** deleting the old one (except where a procedure says
   otherwise — the two Gemini keys deliberately stagger).
2. Set it everywhere the register says (`scope`: `vercel`, `github`, or both). A key that is
   rotated in one place and not the other is an outage, not a rotation.
3. Run the verification path for that credential — at minimum
   `verify-secrets.yml` (Actions → Run workflow) for GitHub secrets, and a deploy plus a
   `site-health.yml` run for Vercel ones.
4. Update `data/security/secret-rotation.json`: set `last_rotated` to today (`YYYY-MM-DD`) and
   append to `history`: `{ "id": "…", "rotated_on": "…", "by": "…", "reason": "scheduled|incident" }`.
5. `node scripts/check-secret-rotation.mjs --strict` should now count one fewer unknown.

Once every dated entry has a real date, switch the workflow to `--strict` so a missing date
becomes a failure instead of a warning.

---

### BACKEND_API_KEY

`openssl rand -hex 32` (or §1.7 of `docs/ENVIRONMENT_SECRETS.md`). Set it in **Vercel**
(Production + Preview) and in **GitHub → Secrets** in the same sitting:

- Vercel first, then GitHub. The nightly `daily_advisory_ingest.yml` uses the GitHub copy and
  will 503 until it is updated; the site keeps serving either way because the key is fail-closed
  rather than fail-open.
- Verify: `curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/ingest" -H "x-api-key: $NEW"`
  returns 400/422 (reached the handler), not 503 (rejected by `apiKeyAuth`).
- `HAZARDNET_API_KEY` is the same shape pointing at an external ingest API: rotate at the API
  end first, then update GitHub.

### Provider API keys

Create the replacement in the provider console, set it in **Vercel → Environment Variables**,
then redeploy or wait for the next deploy — keys are read per request, so no restart logic is
involved.

- Confirm the tier is live, not just present: the advisory path logs which tier answered, and
  `__tests__/` covers the cascade (`backend/utils/ai_fallback_engine.js`).
- Stagger `GEMINI_API_KEY` and `GEMINI_API_KEY_BACKUP` by a few days. Rotating both at once
  turns a single bad key into a full outage of the AI surface.
- Delete the old key in the provider console **after** the new one has served traffic.
  Orphaned-but-live keys are the point of this cadence.

### Firebase service account

Google Cloud → IAM → Service Accounts → the HazardNet account → **Keys** → *Add key* → JSON.

- `FIREBASE_SERVICE_ACCOUNT_JSON` (Vercel) is the whole JSON blob; `FIREBASE_PRIVATE_KEY`
  (GitHub) is the same key's `private_key` with real newlines. Rotate both in one sitting and
  record one date.
- Verify with `Firebase-Store-Verify.yml` (dispatch) before deleting the old key.
- Delete the old key last. Google allows two live keys, but an abandoned one is exactly what
  this register exists to prevent.

### VAPID pair

`npx web-push generate-vapid-keys`. Both values must be replaced together in **Vercel**:
a public key that does not match the private one fails every push with a 400.

Because rotation **invalidates every existing browser subscription**, treat it as a planned
event: note it in the changelog/release notes a week ahead, rotate, and let users re-subscribe
(the subscription flow re-prompts on the next visit). Do not rotate this pair reactively unless
the key is actually suspected exposed.

### Low blast radius

`CODECOV_TOKEN` (coverage upload) and `EE_SERVICE_ACCOUNT_JSON` (legacy verify catalog):
rotate in the provider console and update the GitHub secret. A wrong value fails a step, not the
product. If `EE_SERVICE_ACCOUNT_JSON` is no longer used, the better action is to delete the
secret and remove its row from the register.

### Not scheduled

`ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD` protect the Play **upload key**.
Replacing it means Google Play's key-upgrade process, and doing it casually breaks APK signing
for `app-releases.yml`. `cadence_days: null` in the register is a deliberate decision, recorded
so that "this has no rotation date" reads as intent rather than oversight: rotate only on
suspected compromise, and co-ordinate with the Play Console.

---

## What the check does

`node scripts/check-secret-rotation.mjs` (also `npm run check:rotation`) prints every credential
with the days remaining and exits:

- **0** — nothing overdue.
- **1** — a credential is past its cadence plus the grace period (`defaults.grace_days`, 14), or
  — under `--strict` — a rotation date has never been recorded.
- **2** — the register is missing or malformed.

An entry with `last_rotated: null` is reported as **unknown**, never as healthy. The register
ships with nulls because the real dates were never written down; inventing them would make the
gate green and the control worthless.
