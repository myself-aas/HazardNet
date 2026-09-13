#!/usr/bin/env bash
#
# Resolve which Vercel org + project this repository deploys to, from the
# credentials in the environment, and export the ids the Vercel CLI needs.
#
# Why this exists (2026-09-14 — see
# docs/audits/2026-09-14-vercel-deploy-403-project-unresolved.md):
#
# The Vercel CLI trusts `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` blindly, so a
# stale pair produces a 403 that the CLI reports as
#
#   Retrieving project…
#   Error: Could not retrieve Project Settings. To link your Project, remove
#   the `.vercel` directory and deploy again.      (code PROJECT_UNAUTHORIZED)
#
# which misdirects the reader to a local `.vercel` directory that CI never has.
# This script asks the API what the token can actually see, and exports ids
# that are *verified the same way the CLI verifies them*.
#
# Two token shapes have to work, and they behave differently:
#
#   * an account token — `GET /v2/user` answers, so the token's own personal
#     scope is a candidate;
#   * a **team-scoped** token — `/v2/user` answers 403 `forbidden` (it is not
#     bound to a user), which is *not* the same as the `invalidToken` flag a
#     revoked token carries. Such a token can only be used against its team, so
#     failing on `/v2/user` would reject a perfectly good credential.
#
# Verification mirrors the CLI's own `getLinkedProject` path, because that is
# what decides whether the deploy runs:
#
#   GET /v2/teams/<org>                      must not be 403 (404 is tolerated)
#   GET /v9/projects/<idOrName>?teamId=<org> must be 200
#
# A candidate that passes both is one the CLI will accept.
#
# Inputs (environment):
#   VERCEL_TOKEN          required — the only credential.
#   VERCEL_ORG_ID         optional — preferred when the token can use it.
#   VERCEL_PROJECT_ID     optional — preferred when it belongs to that org.
#   VERCEL_ORG_SLUG       optional — team slug fallback (default: aas-core).
#   VERCEL_PROJECT_NAME   optional — project name fallback (default: hazardnet).
#   VERCEL_API            optional — API base, for tests (default: api.vercel.com).
#   GITHUB_ENV            optional — when set, the resolved ids are appended so
#                         later steps (`npx vercel deploy`) pick them up.
#
# Exit status: 0 with the ids resolved, 1 with a diagnosis otherwise. The token
# is never printed.

set -euo pipefail

: "${VERCEL_TOKEN:?VERCEL_TOKEN is required}"

api=${VERCEL_API:-https://api.vercel.com}
org_slug=${VERCEL_ORG_SLUG:-aas-core}
project_name=${VERCEL_PROJECT_NAME:-hazardnet}
configured_org=${VERCEL_ORG_ID:-}
configured_project=${VERCEL_PROJECT_ID:-}

# ── probes ──────────────────────────────────────────────────────────────────
# `-w` keeps the HTTP status on its own last line: no `-f`, so an error body
# arrives intact and its `error.code` can be reported instead of guessed at.
PROBE_HTTP=""
PROBE_BODY=""
probe() {
  local out
  out=$(curl -sS -m 20 -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    -w $'\n%{http_code}' "${api}$1" 2>/dev/null || true)
  PROBE_HTTP=$(printf '%s' "$out" | tail -n1)
  PROBE_BODY=$(printf '%s' "$out" | sed '$d')
}
field() { printf '%s' "$2" | jq -r "$1" 2>/dev/null || true; }

# Everything probed, for the failure report: "path | http | code".
DIAG=()
diag_add() { DIAG+=("$1 | HTTP $2 | ${3:-no error code}"); }

# ── 1. Is the token itself usable? ──────────────────────────────────────────
# Only an explicit `invalidToken` / `missingToken` flag is fatal here. A bare
# 403 on /v2/user is how a team-scoped token answers, and those deploy fine.
probe /v2/user
user_http=$PROBE_HTTP
user_error=$(field '.error.code // empty' "$PROBE_BODY")
user_id=$(field '.user.id // empty' "$PROBE_BODY")
who=$(field '.user.username // .user.email // empty' "$PROBE_BODY")
diag_add "/v2/user" "$user_http" "$user_error"

if [ "$(field '.error.invalidToken // empty' "$PROBE_BODY")" = "true" ] ||
  [ "$(field '.error.missingToken // empty' "$PROBE_BODY")" = "true" ]; then
  echo "::error::VERCEL_TOKEN was rejected as invalid, revoked or expired (HTTP ${user_http}${user_error:+, code ${user_error}}). Re-issue it and update the repository secret."
  exit 1
fi

# ── 2. Which teams can it see? ──────────────────────────────────────────────
probe /v2/teams
teams_http=$PROBE_HTTP
teams_error=$(field '.error.code // empty' "$PROBE_BODY")
diag_add "/v2/teams" "$teams_http" "$teams_error"

team_lines=$(printf '%s' "$PROBE_BODY" | jq -r '.teams[]? | "\(.id)\t\(.slug)"' 2>/dev/null || true)
team_slugs=$(printf '%s' "$team_lines" | awk -F'\t' 'NF{printf "%s%s", sep, $2; sep=", "}')
team_id_for_slug=$(printf '%s' "$team_lines" | awk -F'\t' -v s="$org_slug" '$2==s{print $1; exit}')

# ── 3. Candidate scopes, most-explicit first ────────────────────────────────
# <org value> TAB <label> TAB <1 if personal scope>
candidates=()
add_candidate() {
  [ -n "$1" ] || return 0
  local existing
  for existing in "${candidates[@]+"${candidates[@]}"}"; do
    if [ "${existing%%$'\t'*}" = "$1" ]; then return 0; fi
  done
  candidates+=("$1"$'\t'"$2"$'\t'"$3")
}

add_candidate "$configured_org" "VERCEL_ORG_ID secret" 0
add_candidate "$team_id_for_slug" "team slug '${org_slug}'" 0
# The slug itself, tried only when the id is not discoverable. Whether the API
# accepts a slug where an id is expected is settled by the probe below, not by
# assumption — a candidate is adopted only if it verifies.
if [ -z "$team_id_for_slug" ]; then
  add_candidate "$org_slug" "team slug '${org_slug}' used as id" 0
fi
add_candidate "$user_id" "personal account" 1

# ── 4. Verify candidates the way the CLI will use them ──────────────────────
RESOLVED_ORG=""
RESOLVED_PROJECT=""
RESOLVED_NAME=""
RESOLVED_VIA=""

verify_candidate() { # <org value> <personal 0|1>
  local org=$1 personal=$2 scope_query="" org_http wanted got_id

  if [ "$personal" = "1" ]; then
    # A user id is not a team id, so the project lookup must not send teamId.
    scope_query=""
  else
    scope_query="?teamId=${org}"
    probe "/v2/teams/${org}"
    org_http=$PROBE_HTTP
    diag_add "/v2/teams/${org}" "$PROBE_HTTP" "$(field '.error.code // empty' "$PROBE_BODY")"
    # The CLI tolerates a 404 here (org = null) but throws on 403.
    if [ "$org_http" = "403" ]; then return 1; fi
  fi

  # Configured id first (and it must answer about that id), then by name: the
  # name is what survives a project being recreated under another team, which
  # is the failure being repaired.
  for wanted in "$configured_project" "$project_name"; do
    [ -n "$wanted" ] || continue
    probe "/v9/projects/${wanted}${scope_query}"
    diag_add "/v9/projects/${wanted}${scope_query}" "$PROBE_HTTP" "$(field '.error.code // empty' "$PROBE_BODY")"
    if [ "$PROBE_HTTP" != "200" ]; then continue; fi
    got_id=$(field '.id // empty' "$PROBE_BODY")
    if [ -z "$got_id" ]; then continue; fi
    if [ "$wanted" = "$configured_project" ] && [ "$got_id" != "$configured_project" ]; then continue; fi
    RESOLVED_ORG=$org
    RESOLVED_PROJECT=$got_id
    RESOLVED_NAME=$(field '.name // empty' "$PROBE_BODY")
    return 0
  done
  return 1
}

for candidate in "${candidates[@]+"${candidates[@]}"}"; do
  IFS=$'\t' read -r cand_id cand_label cand_personal <<<"$candidate"
  if verify_candidate "$cand_id" "$cand_personal"; then
    RESOLVED_VIA=$cand_label
    break
  fi
done

# ── 5. Report, or explain exactly what was refused ──────────────────────────
if [ -z "$RESOLVED_PROJECT" ]; then
  # The full table goes to stderr for the step log, and the headline facts are
  # repeated as annotations: a step log is a click away in the UI, an
  # annotation is on the pull request, which is where triage actually happens.
  echo "::error::Could not resolve a Vercel project for this repository — every scope visible to VERCEL_TOKEN refused '${project_name}'."
  echo "::error::token user: ${who:-unavailable}${user_id:+ (${user_id})} | visible teams: ${team_slugs:-none reported}"
  echo "::error::configured: org=${configured_org:-unset} project=${configured_project:-unset} | tried team slug '${org_slug}'"
  ann=0
  for entry in "${DIAG[@]+"${DIAG[@]}"}"; do
    ann=$((ann + 1))
    if [ "$ann" -gt 6 ]; then break; fi
    echo "::error::probe ${entry}"
  done
  echo "::error::reading: 403 team_unauthorized = token cannot reach that team; 403 invalidToken = expired credential; 404 = id/slug unknown to this token."
  {
    echo "  token user       : ${who:-unavailable}${user_id:+ (${user_id})}"
    echo "  visible teams    : ${team_slugs:-none reported}"
    echo "  configured ids   : org=${configured_org:-unset} project=${configured_project:-unset}"
    echo "  searched for     : team slug '${org_slug}' / project '${project_name}'"
    echo "  probes (path | HTTP | error):"
    for entry in "${DIAG[@]}"; do echo "    ${entry}"; done
    if [ "$user_http" = "403" ]; then
      echo "  reading          : /v2/user refused the token without an 'invalidToken' flag,"
      echo "                     which is how a team-scoped token answers — so the token is"
      echo "                     probably scoped to a team this job cannot name. Confirm the"
      echo "                     team slug in VERCEL_ORG_SLUG and re-copy the ids from the"
      echo "                     project's Vercel dashboard (Settings -> General)."
    else
      echo "  reading          : the token authenticated but no scope it can see owns the"
      echo "                     project. Re-copy the ids from the project's Vercel dashboard"
      echo "                     (Settings -> General)."
    fi
  } >&2
  exit 1
fi

echo "token user       : ${who:-unavailable (team-scoped token)}"
echo "visible teams    : ${team_slugs:-none reported}"
echo "resolved org     : ${RESOLVED_ORG} (${RESOLVED_VIA})"
echo "resolved project : ${RESOLVED_PROJECT}${RESOLVED_NAME:+ (${RESOLVED_NAME})}"

if [ -n "$configured_org" ] && [ "$configured_org" != "$RESOLVED_ORG" ]; then
  echo "::notice::VERCEL_ORG_ID secret (${configured_org}) is not usable by this token; deployed with the resolved org ${RESOLVED_ORG}. Re-copy the secret from the Vercel dashboard when convenient."
fi
if [ -n "$configured_project" ] && [ "$configured_project" != "$RESOLVED_PROJECT" ]; then
  echo "::notice::VERCEL_PROJECT_ID secret (${configured_project}) is not the project in ${RESOLVED_ORG}; deployed with the resolved project ${RESOLVED_PROJECT}."
fi

if [ -n "${GITHUB_ENV:-}" ]; then
  {
    echo "VERCEL_ORG_ID=${RESOLVED_ORG}"
    echo "VERCEL_PROJECT_ID=${RESOLVED_PROJECT}"
  } >>"$GITHUB_ENV"
fi
