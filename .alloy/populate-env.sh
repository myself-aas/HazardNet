#!/usr/bin/env bash
# Idempotent local-dev env setup for Alloy sandbox sessions.
# Creates/updates the git-ignored /workspace/.env used by backend/server.js
# (dotenv) and frontend/vite.config.ts (loadEnv on the repo root).
#
# Rules:
#  - values already present in the process environment win
#  - existing non-blank, non-placeholder values in .env are preserved
#  - only local-dev-safe defaults / generated secrets are filled in
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
touch "$ENV_FILE"

is_placeholder() {
  case "$1" in
    ""|REPLACE_WITH_*|CHANGE_ME|changeme|TODO) return 0 ;;
    *) return 1 ;;
  esac
}

get_existing() {
  # prints the current value for key $1 from .env (last wins), if any
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n1
}

set_var() {
  local key="$1" value="$2"
  local from_proc="${!key-}"
  if ! is_placeholder "${from_proc}"; then
    value="${from_proc}"
  else
    local current
    current="$(get_existing "$key")"
    if ! is_placeholder "$current"; then
      return 0
    fi
  fi
  is_placeholder "$value" && return 0
  # rewrite the key in place (portable: filter + append)
  grep -v "^${key}=" "$ENV_FILE" > "$ENV_FILE.tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
}

rand_hex() { openssl rand -hex 32; }

# ── Runtime flags ────────────────────────────────────────────────────────────
set_var IS_ALLOY "${IS_ALLOY:-true}"
set_var NODE_ENV "development"
set_var CSP_ENFORCE "false"
set_var VERCEL_ENV "development"
set_var FRONTEND_ORIGIN "http://localhost:8080,http://localhost:3000,http://127.0.0.1:3000"

# ── Backend ──────────────────────────────────────────────────────────────────
set_var BACKEND_API_KEY "$(rand_hex)"
set_var PORT "3001"

# Keep forecasts on the local in-memory/file store instead of Firebase RTDB so
# the sandbox boots without cloud credentials.
set_var FORECAST_STORE "memory"

# ── Web push (generated local VAPID pair is optional; leave unset if absent) ──
if command -v npx >/dev/null 2>&1 && is_placeholder "$(get_existing VAPID_PUBLIC_KEY)"; then
  : # skipped on purpose: push is not needed to render the frontend
fi

# ── Frontend public config (safe-by-design identifiers from .env.example) ────
set_var VITE_FIREBASE_API_KEY "AIzaSyBwyxWm0MIQlTmjJ-NKPKjl72AYLS7oDqQ"
set_var VITE_FIREBASE_APP_ID "1:1053636076316:web:0fbe66d8e4b90c2de9d0d9"
set_var VITE_FIREBASE_AUTH_DOMAIN "hazardnet-aas48424.firebaseapp.com"
set_var VITE_FIREBASE_DATABASE_URL "https://hazardnet-aas48424-default-rtdb.firebaseio.com"
set_var VITE_FIREBASE_MESSAGING_SENDER_ID "1053636076316"
set_var VITE_FIREBASE_PROJECT_ID "hazardnet-aas48424"
set_var VITE_FIREBASE_STORAGE_BUCKET "hazardnet-aas48424.firebasestorage.app"
set_var VITE_VERCEL_ANALYTICS "false"

chmod 600 "$ENV_FILE"
echo "[alloy] .env ready at $ENV_FILE"
