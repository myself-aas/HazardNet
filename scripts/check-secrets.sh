#!/usr/bin/env bash
# Working-tree secret scan (SEC-07) — CI gate against NEW committed secrets.
#
# Scans tracked text files for high-confidence credential patterns. History
# is out of scope (past leaks are tracked for rotation in docs/audits/);
# this gate stops new leaks from merging.
#
# Placeholder-safe: lines containing REPLACE_WITH / USER:PASSWORD / EXAMPLE /
# CHANGEME / <placeholder> (any case) are ignored, so .env.example-style
# templates pass while real values fail.
set -euo pipefail

cd "$(dirname "$0")/.."

# High-confidence patterns (provider-prefixed or structurally unique).
PATTERNS=(
  'ghp_[A-Za-z0-9]{20,}'
  'gho_[A-Za-z0-9]{20,}'
  'github_pat_[A-Za-z0-9_]{20,}'
  'sk-[A-Za-z0-9]{20,}'
  'gsk_[A-Za-z0-9]{20,}'
  'AIza[0-9A-Za-z_-]{20,}'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
  'AKIA[0-9A-Z]{16}'
  'hf_[A-Za-z0-9]{10,}'
  'vcp_[A-Za-z0-9]{10,}'
  'SG\.[A-Za-z0-9_-]{10,}'
  '-----BEGIN ([A-Z0-9 ]+ )?PRIVATE KEY-----'
  'postgresql://[^/:@?#]+:[^/@?#]+@'
  'mongodb(\+srv)?://[^/:@?#]+:[^/@?#]+@'
)

# Known-benign literals (each narrowly scoped — any OTHER match still fails):
#  - AIzaSyBwyx...: the Firebase *web* API key (public-by-design browser
#    identifier, duplicated from firebase-applet-config.json as the documented
#    default in frontend/src/lib/config.ts; abuse is controlled by
#    firestore.rules + Firebase console API restrictions, not by secrecy).
#  - user:pass / test:test / postgres:postgres: dummy credentials in unit-test
#    fixtures (__tests__/) and doc examples; localhost/example hosts likewise.
ALLOWLIST='REPLACE_WITH|USER:PASSWORD|CHANGEME|EXAMPLE|<placeholder>|\.\.\.|…|AIzaSyBwyxWm0MIQlTmjJ-NKPKjl72AYLS7oDqQ|user:pass@|test:test@|postgres:postgres@|@localhost|@127\.0\.0\.1|@db\.example\.|@example\.[a-z]+'

# Tracked text files only; lockfiles + this script + binary blobs excluded.
mapfile -t FILES < <(git ls-files \
  | grep -vE '^(bun\.lock|pnpm-lock\.yaml|package-lock\.json|frontend/package-lock\.json)$' \
  | grep -vE '^scripts/check-secrets\.sh$')

HITS=0
for pattern in "${PATTERNS[@]}"; do
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    if echo "$hit" | grep -qiE "$ALLOWLIST"; then
      continue
    fi
    echo "❌ possible secret ($pattern): $hit"
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
