#!/usr/bin/env bash
# Working-tree secret scan (SEC-07) — CI gate against NEW committed secrets.
#
# Scans tracked text files for high-confidence credential patterns. History
# is out of scope (past leaks are tracked for rotation in docs/audits/);
# this gate stops new leaks from merging.
#
# Placeholder-safe: the *matched value* containing REPLACE_WITH / USER:PASSWORD /
# EXAMPLE / CHANGEME / <placeholder> (any case) is ignored, so template files
# pass while real values fail.
#
# Audit 2026-09-18 (SEC-14) — the false negative this script shipped with:
# the allowlist was tested against the whole `file:line:match` string, so the
# path of any file whose *name* contained "example" was itself an allowlist hit.
# Real provider keys (GROQ `gsk_…`, HuggingFace `hf_…`, Vercel `vcp_…`) sat in
# `.env.example` and the scan reported "✅ passed". The allowlist is now applied
# to the matched value only — never to the path — and
# `scripts/tests/test_secret_scan.py` pins both directions (a secret in a file
# named `.env.example` must fail; a placeholder must pass).
set -euo pipefail

cd "$(dirname "$0")/.."

# High-confidence patterns (provider-prefixed or structurally unique).
PATTERNS=(
  'ghp_[A-Za-z0-9]{20,}'
  'gho_[A-Za-z0-9]{20,}'
  'github_pat_[A-Za-z0-9_]{20,}'
  'sk-[A-Za-z0-9]{20,}'
  'sk-or-v1-[A-Za-z0-9]{20,}'
  'gsk_[A-Za-z0-9]{20,}'
  'AIza[0-9A-Za-z_-]{20,}'
  'AQ\.[A-Za-z0-9_.-]{20,}'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
  'AKIA[0-9A-Z]{16}'
  'hf_[A-Za-z0-9]{10,}'
  'vcp_[A-Za-z0-9]{10,}'
  'SG\.[A-Za-z0-9_-]{10,}'
  '-----BEGIN ([A-Z0-9 ]+ )?PRIVATE KEY-----'
  'postgresql://[^/:@?#]+:[^/@?#]+@'
  'mongodb(\+srv)?://[^/:@?#]+:[^/@?#]+@'
  # Generic assignment rule: any *_KEY / *_TOKEN / *_SECRET / *_PASSWORD /
  # *_PRIVATE_KEY / *_WEBHOOK given a long literal value. Added after the
  # 2026-09-18 audit because provider prefixes only cover providers we already
  # knew about — BACKEND_API_KEY (64 hex chars) and VAPID_PRIVATE_KEY had no
  # prefix at all and no pattern.
  '^[A-Z][A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY|WEBHOOK)=[^[:space:]]{16,}'
)

# Known-benign *values* (each narrowly scoped — any OTHER match still fails):
#  - AIzaSyBwyx...: the Firebase *web* API key (public-by-design browser
#    identifier, duplicated from firebase-applet-config.json as the documented
#    default in frontend/src/lib/config.ts; abuse is controlled by
#    firestore.rules + Firebase console API restrictions, not by secrecy).
#  - user:pass / test:test / postgres:postgres: dummy credentials in unit-test
#    fixtures (__tests__/) and doc examples; localhost/example hosts likewise.
#  - Placeholder vocabulary: REPLACE_WITH / CHANGEME / <placeholder> / EXAMPLE /
#    REDACTED / "..." and GitHub Actions expressions.
ALLOWLIST='REPLACE_WITH|USER:PASSWORD|CHANGEME|EXAMPLE|REDACTED|<[^>]*>|your_|_here|\.\.\.|…|AIzaSyBwyxWm0MIQlTmjJ-NKPKjl72AYLS7oDqQ|user:pass@|test:test@|postgres:postgres@|test-|dummy|fake|not-a-real|\$\{\{|@localhost|@127\.0\.0\.1|@db\.example\.|@example\.[a-z]+'

# VITE_* values are compiled into the browser bundle by Vite: they are public by
# construction. Only the two public-by-design shapes are exempted here (the
# analytics tag and the Firebase web key) — a provider secret mistakenly placed
# in a VITE_ var still fails the scan.
PUBLIC_BROWSER_VALUE='^(vcp_|AIza)'

# Names that are public by definition: a *public* half of a keypair, or a
# publishable/anon key. The exemption is on the variable NAME, so a private key
# pasted into a *_PUBLIC_KEY variable still fails.
PUBLIC_ASSIGNMENT='^[A-Z][A-Z0-9_]*(PUBLIC_KEY|ANON_KEY)='

# Tracked text files only; lockfiles, this script and its own test suite excluded.
# The test suite (scripts/tests/test_secret_scan.py) contains *deliberately* credential-
# shaped fixtures — that is the whole point of it — so scanning it reports the scanner's own
# regression tests. The exclusion is pinned by test_scan_covers_the_whole_tracked_tree, so
# any file added to this list has to be justified there.
mapfile -t FILES < <(git ls-files \
  | grep -vE '^(bun\.lock|pnpm-lock\.yaml|package-lock\.json|frontend/package-lock\.json)$' \
  | grep -vE '^scripts/(check-secrets\.sh|tests/test_secret_scan\.py)$')

# The matched value, not the path: `file:line:match` → `match` → value of an
# assignment when the match is one.
value_of() {
  local match="$1"
  if printf '%s' "$match" | grep -qE '^[A-Z][A-Z0-9_]*='; then
    printf '%s' "${match#*=}"
  else
    printf '%s' "$match"
  fi
}

HITS=0
for pattern in "${PATTERNS[@]}"; do
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    file="${hit%%:*}"
    rest="${hit#*:}"
    lineno="${rest%%:*}"
    match="${rest#*:}"

    value="$(value_of "$match")"

    # Public-by-design browser values: the *containing line* has to be a VITE_
    # assignment, and the value one of the two shipped shapes.
    if printf '%s' "$value" | grep -qE "$PUBLIC_BROWSER_VALUE" \
      && sed -n "${lineno}p" "$file" 2>/dev/null | grep -qE '^[[:space:]]*VITE_[A-Z0-9_]*='; then
      continue
    fi

    # Public-by-design names (publishable halves) are exempted by name.
    if printf '%s' "$match" | grep -qE "$PUBLIC_ASSIGNMENT"; then
      continue
    fi

    # Placeholder / dummy detection runs on the VALUE.
    if printf '%s' "$value" | grep -qiE "$ALLOWLIST"; then
      continue
    fi

    echo "❌ possible secret ($pattern): ${file}:${lineno}:${match}"
    HITS=$((HITS + 1))
  done < <(printf '%s\n' "${FILES[@]}" | xargs grep -InoE "$pattern" 2>/dev/null | grep -vE '^[^:]+:[0-9]+:$' || true)
done

if [ "$HITS" -gt 0 ]; then
  echo ""
  echo "❌ Secret scan FAILED: $HITS potential credential(s) in tracked files."
  echo "   Remove the values (use placeholders + GitHub Actions secrets) and rotate anything committed."
  exit 1
fi

echo "✅ Secret scan passed (${#FILES[@]} tracked files, ${#PATTERNS[@]} patterns)."
