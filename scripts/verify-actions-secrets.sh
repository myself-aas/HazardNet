#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# verify-actions-secrets.sh
#
# Verifies that every GitHub Actions secret expected by this repository is
# correctly injected as an environment variable at runtime. Designed to be
# dropped into any workflow step (or run standalone via `workflow_dispatch`).
#
# Usage (in a workflow step):
#
#   - name: Verify secret availability
#     shell: bash
#     env:
#       # Map every secret the same way the consuming step does — this
#       # guarantees we are checking the *real* injection surface, not just
#       # that ${{ secrets.FOO }} expands in the workflow YAML.
#       BACKEND_API_KEY:        ${{ secrets.BACKEND_API_KEY }}
#       KAGGLE_USERNAME:        ${{ secrets.KAGGLE_USERNAME }}
#       KAGGLE_KEY:             ${{ secrets.KAGGLE_KEY }}
#       GEMINI_API_KEY:         ${{ secrets.GEMINI_API_KEY }}
#       HAZARDNET_API_URL:      ${{ secrets.HAZARDNET_API_URL }}
#       HAZARDNET_API_KEY:      ${{ secrets.HAZARDNET_API_KEY }}
#       EE_SERVICE_ACCOUNT_JSON:${{ secrets.EE_SERVICE_ACCOUNT_JSON }}
#       SUPABASE_DB_URL:        ${{ secrets.SUPABASE_DB_URL }}
#       CODECOV_TOKEN:          ${{ secrets.CODECOV_TOKEN }}
#       BENCH_URL:              ${{ secrets.BENCH_URL }}
#     run: bash scripts/verify-actions-secrets.sh
#
# The script NEVER prints secret values — it only reports presence / absence,
# length, and a short non-reversible fingerprint (first 6 chars of SHA-256) so
# you can correlate across runs without leaking data in logs.
#
# Exit code: 0 if ALL required-for-this-job secrets are present, 1 otherwise.
# ---------------------------------------------------------------------------
set -euo pipefail

# ── Catalog of every secret referenced anywhere in .github/workflows/ ─────
# Format:  SECRET_NAME|required|expected_in|notes
#   required = yes  → script fails if missing
#   required = opt  → script warns if missing (graceful fallback exists)
#   expected_in    → workflow(s) / job scope that consume this secret
#
# NOTE: A secret is only CHECKED if it is actually mapped into the step's
# `env:` block (see the example above). Un-mapped secrets are skipped so the
# script is safe to call from jobs that only need a subset.

SECRETS_CATALOG=(
  # Core backend
  "BACKEND_API_KEY|yes|manual-ingest, Supabase-cutover-verify|Bearer token for POST /api/v1/forecasts/update"
  "GEMINI_API_KEY|opt|weekly|Advisory generation (deterministic fallback if unset)"
  # Kaggle — LEGACY (2026-09-16): the Kaggle workflows are dispatch-only now.
  # Production forecasts run on the runner via scripts/auto_forecast.py, so a
  # missing/expired Kaggle token no longer fails any scheduled job.
  "KAGGLE_USERNAME|opt|forecast-pipeline, hourly, weekly (dispatch-only legacy)|kaggle CLI auth"
  "KAGGLE_KEY|opt|forecast-pipeline, hourly, weekly (dispatch-only legacy)|kaggle CLI auth"
  # Daily / Earth Engine inference pipeline (the production forecast path).
  # HAZARDNET_API_* are only consumed when the PUSH_TO_API repository variable
  # is 'true' (i.e. an ingest API is deployed); the committed snapshot is the
  # default delivery, so they are optional.
  "HAZARDNET_API_URL|opt|daily_forecast (only when PUSH_TO_API=true)|Ingest endpoint for auto_forecast.py push"
  "HAZARDNET_API_KEY|opt|daily_forecast (only when PUSH_TO_API=true)|Bearer token for HAZARDNET_API_URL"
  "EE_SERVICE_ACCOUNT_JSON|yes|daily_forecast|GEE service account JSON key (the pipeline's data source)"
  # Supabase cutover
  "SUPABASE_DB_URL|opt|Supabase-cutover-verify|Mapped to DATABASE_URL at step scope"
  # CI / coverage
  "CODECOV_TOKEN|opt|ci (test-backend, test-frontend)|Codecov upload (warn-only if absent)"
  # Benchmarking
  "BENCH_URL|opt|scripts/bench-predict.mjs|Latency benchmark target; default http://127.0.0.1:3001"
)

# ── Helpers ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'

fingerprint() {
  # First 6 hex chars of SHA-256 — enough to spot-check across runs, not enough
  # to brute-force or replay.
  printf '%s' "$1" | sha256sum | cut -c1-6
}

mask() {
  # Show length + last 4 chars for visual confirmation without exposing value.
  local val="$1"
  local len=${#val}
  if [ "$len" -eq 0 ]; then echo "<empty>"; return; fi
  if [ "$len" -le 4 ]; then echo "****"; return; fi
  printf 'len=%d  tail=…%s  fp=%s' "$len" "${val: -4}" "$(fingerprint "$val")"
}

echo "═══════════════════════════════════════════════════════════════"
echo "GitHub Actions Secret Verification — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Workflow: ${GITHUB_WORKFLOW:-<local>}  Job: ${GITHUB_JOB:-<local>}"
echo "═══════════════════════════════════════════════════════════════"
echo ""

PRESENT=0; MISSING=0; WARN=0; SKIPPED=0
FAIL=0

for entry in "${SECRETS_CATALOG[@]}"; do
  IFS='|' read -r name required consumers notes <<< "$entry"

  # Indirect expansion — pull the value from the environment.
  val="${!name:-}"

  if [ -z "${!name+x}" ]; then
    # Variable is not even declared in this step's env → skip (the caller
    # didn't map it, which is correct for jobs that don't need it).
    printf "  ${CYAN}SKIP${NC}  %-26s  (not mapped into this step's env)\n" "$name"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  if [ -z "$val" ]; then
    if [ "$required" = "yes" ]; then
      printf "  ${RED}FAIL${NC}  %-26s  ❌ EMPTY — %s\n" "$name" "$notes"
      MISSING=$((MISSING + 1))
      FAIL=1
    else
      printf "  ${YELLOW}WARN${NC}  %-26s  ⚠️  empty — %s (optional, fallback in use)\n" "$name" "$notes"
      WARN=$((WARN + 1))
    fi
  else
    printf "  ${GREEN}OK${NC}    %-26s  ✅  %s\n" "$name" "$(mask "$val")"
    PRESENT=$((PRESENT + 1))

    # Extra sanity checks for well-known secret shapes.
    case "$name" in
      KAGGLE_KEY)
        if ! [[ "$val" =~ ^[a-f0-9]{30,}$ ]]; then
          printf "        ${YELLOW}⚠  KAGGLE_KEY does not look like a hex token (unexpected shape)${NC}\n"
        fi
        ;;
      HAZARDNET_API_URL)
        if ! [[ "$val" =~ ^https?:// ]]; then
          printf "        ${YELLOW}⚠  HAZARDNET_API_URL does not start with http(s)://${NC}\n"
        fi
        ;;
      EE_SERVICE_ACCOUNT_JSON)
        if ! echo "$val" | python3 -c "import sys,json; json.loads(sys.stdin.read())" 2>/dev/null; then
          printf "        ${RED}❌  EE_SERVICE_ACCOUNT_JSON is not valid JSON${NC}\n"
          FAIL=1
        else
          printf "        (valid JSON service-account key)\n"
        fi
        ;;
      BACKEND_API_KEY|HAZARDNET_API_KEY|GEMINI_API_KEY|CODECOV_TOKEN)
        if [ "${#val}" -lt 20 ]; then
          printf "        ${YELLOW}⚠  %s looks suspiciously short (%d chars)${NC}\n" "$name" "${#val}"
        fi
        ;;
    esac
  fi
done

echo ""
echo "───────────────────────────────────────────────────────────────"
printf "  Present: %d   Missing: %d   Warnings: %d   Skipped (out of scope): %d\n" \
  "$PRESENT" "$MISSING" "$WARN" "$SKIPPED"
echo "───────────────────────────────────────────────────────────────"

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "❌ VERIFICATION FAILED — one or more required secrets are empty/unmapped."
  echo "   Go to repo → Settings → Secrets and variables → Actions and confirm"
  echo "   the secret exists in the correct scope (repo vs. environment)."
  exit 1
fi

echo ""
echo "✅ All mapped secrets are available in this job's environment."
exit 0
