# Audit — the secret scan could not see the file most likely to hold a secret

**Date:** 2026-09-18 · **Scope:** `scripts/check-secrets.sh` (SEC-07 gate, wired into
`.github/workflows/ci.yml` → *Security & Quality* job) and every tracked file it scans.
**Severity:** critical (credential exposure) + high (a security gate that reported
success while blind to its highest-risk input).
**Found by:** the Phase 6 security pass, while auditing the row "committed Firebase client
configs (ADR 0001)" — the check began as "is the Firebase web config really public?" and
ended by finding live provider keys in the template file.

---

## 1. What happened

`.env.example` is tracked, and it carried **real credentials** for:

| Line | Variable | Shape |
| ---- | -------- | ----- |
| 1 | `BACKEND_API_KEY` | 64 hex chars — the key that gates ingest/pipeline routes |
| 7 | `GEMINI_API_KEY` | `AQ.…` (Google AI Studio) |
| 8 | `GEMINI_API_KEY_BACKUP` | `AQ.…` |
| 9 | `OPENROUTER_API_KEY` | `sk-or-v1-…` |
| 10 | `GROQ_API_KEY` | `gsk_…` |
| 11 | `HUGGINGFACE_API_KEY` | `hf_…` |
| 13 | `VAPID_PRIVATE_KEY` | web-push private key |

The repository is **private** (`myself-aas/HazardNet`, `isPrivate: true`), which limits the
audience — but the values are in git history, in every clone, in any fork, in CI logs and
in any future archive/visibility change. They must be treated as disclosed.

## 2. Why the gate did not fire

The scan's allowlist was applied to the whole `file:line:match` string that `grep -InoE`
produces:

```bash
if echo "$hit" | grep -qiE "$ALLOWLIST"; then continue; fi     # hit = ".env.example:10:gsk_…"
```

The allowlist contains the placeholder token `EXAMPLE` (correctly — `REPLACE_WITH`,
`CHANGEME`, `EXAMPLE` vocabulary must not fail a template). Because the *path* is part of
the string being tested, **the filename `.env.example` itself was an allowlist hit**: every
match inside it was discarded before it could be reported.

Proof on the pre-fix file (2026-09-18):

```
$ printf '%s' ".env.example:10:gsk_ksTX…" | grep -qiE 'REPLACE_WITH|…|CHANGEME|EXAMPLE|…'
SUPPRESSED by the EXAMPLE token in the path
$ bash scripts/check-secrets.sh
✅ Secret scan passed (927 tracked files, 14 patterns).
```

Three further blind spots in the same file, all fixed in the same change:

1. **No pattern for two of the providers present.** Gemini (`AQ.…`) and OpenRouter
   (`sk-or-v1-…`) had no prefix rule; `sk-[A-Za-z0-9]{20,}` does not match `sk-or-v1-…`
   because the character after `sk-` is `o` followed by a hyphen.
2. **No generic assignment rule.** `BACKEND_API_KEY` (64 hex) and `VAPID_PRIVATE_KEY` have
   no provider prefix at all, so no prefix-shaped pattern could ever catch them.
3. **`VITE_` values were not distinguished from server-side ones.** Some are public by
   construction (Vite inlines them into the browser bundle: the Firebase web API key and
   the Vercel analytics tag); others are not.

## 3. What was fixed (in-repo, this change)

`scripts/check-secrets.sh`:

- the allowlist is applied to the **matched value only** — the path is never part of the
  exemption test (`value_of()` splits `file:line:match`, then the assignment value);
- new patterns: `AQ\.[A-Za-z0-9_.-]{20,}`, `sk-or-v1-[A-Za-z0-9]{20,}`, and the generic
  `^[A-Z][A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY|WEBHOOK)=[^[:space:]]{16,}`
  (17 patterns total, up from 14);
- public-by-design exemptions are now explicit and narrow: a `VITE_` assignment whose
  value matches `vcp_`/`AIza` (compiled into the bundle), and variables *named*
  `*_PUBLIC_KEY` / `*_ANON_KEY` — a private key pasted into a `*_PUBLIC_KEY` variable
  still fails;
- placeholder vocabulary extended to any `<…>` token and `your_`/`_here` forms, so
  `docs/PRODUCTION_RUNBOOK.md` examples keep passing.

`.env.example`: rewritten as a template — every credential is now
`REPLACE_WITH_…`, with a header stating that no real value may live in a tracked file, and
`public by design` marking the values that are safe (Firebase web config, VAPID public
key, analytics tag).

`scripts/tests/test_secret_scan.py` (new, 22 tests): runs the scanner in throwaway git
repos and pins **both** directions — a synthetic credential in `.env.example` and in
`docs/example-config.md` must fail; placeholders, `<…>` values and the public-by-design
shapes must pass; a private key in a `*_PUBLIC_KEY` variable must fail; the shipped
template is asserted assignment-by-assignment.

Verified after the fix:

```
$ bash scripts/check-secrets.sh      # on the pre-rewrite tree
❌ Secret scan FAILED: 11 potential credential(s) in tracked files.
$ bash scripts/check-secrets.sh      # after the rewrite
✅ Secret scan passed (927 tracked files, 17 patterns).
```

## 4. What the owner must do (cannot be done from the repository)

1. **Rotate every value listed in §1**, in this order (the order matters: rotating the
   backend key last avoids a window where the UI is up but ingest is rejected):
   VAPID pair (`npx web-push generate-vapid-keys`), Gemini ×2, OpenRouter, Groq,
   HuggingFace, then `BACKEND_API_KEY` + `HAZARDNET_API_KEY` together.
2. **Update the copies**: GitHub Actions secrets, Vercel project env vars (Production and
   Preview), and anything local. `scripts/verify-actions-secrets.sh` +
   the *Verify GitHub Actions Secrets* workflow confirm the Actions side; the
   `site-health` workflow catches a backend that rejects authenticated ingest.
3. **Decide on history.** Rotation is what actually removes the risk; history rewriting
   (`git filter-repo` + force-push) is disruptive on a repository with an open PR history
   and, for a private repo, optional. If history is left alone, record that decision —
   the values are dead after rotation.
4. **Check for use.** Google AI Studio / OpenRouter / Groq / HuggingFace consoles show
   recent usage; an unexplained spike means the key was used by someone else.
5. Consider a GitHub **push protection** rule for the provider patterns now in the scanner
   (repo → Settings → Code security → Secret scanning), so the platform blocks the push
   rather than CI catching it afterwards.

## 5. Where this leaves the SEC-07 row

The gate now fails closed for the shapes it knows, including the file that leaked, and the
gate itself is tested. Nothing about this fix is a substitute for rotation: a scanning
rule cannot un-publish a key. Both this document and
`docs/ops/owner-actions.md` (Action 7) carry the rotation as an open owner item.
