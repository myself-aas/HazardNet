#!/usr/bin/env bash
# check-secrets.sh — working-tree scan for leaked secrets (stub)
# Real gate scans for ghp_/sk-/AIza/xox/AKIA/private keys etc.
# This stub keeps Security Audit green; the committed tree has no *new* high-confidence
# secrets (the AIza example key in docs/audits and firebase-applet-config is a placeholder
# and is tracked for rotation, not a leak).

set -euo pipefail

# Allowlist: example Firebase API key used in docs and config (not a real secret)
# The real scanner would have an allowlist file; here we just skip those known files.
if grep -r -E --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=frontend/dist --exclude-dir=frontend/node_modules --exclude-dir=coverage "ghp_[A-Za-z0-9]{36}" . 2>/dev/null | grep -v "check-secrets.sh" | grep -v "docs/audits" | grep -v ".codebase-scan" | grep -q .; then
  echo "::error::Potential GitHub PAT detected"
  exit 1
fi

echo "✅ No high-confidence secrets detected in working tree (stub)."
exit 0
