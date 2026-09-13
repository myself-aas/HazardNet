# 2026-09-14 — Node 20 Actions runtime + `Deploy Production (Vercel)` refusal

Two unrelated problems arrived in the same CI log (the production deploy that
ran after PR #17 merged onto `main`). Both are fixed in the working tree; the
deploy half also has an owner-side check at the end that CI cannot make for us.

```
Node 20 is being deprecated. This workflow is running with Node 24 by default.
...
Run amondnet/vercel-action@v25
... Vercel CLI 25.1.0
Error! You do not have access to the specified account
Learn More: https://err.sh/vercel/scope-not-accessible
```

## 1. Node 20 Actions runtime deprecation

GitHub [deprecated the Node 20 action runtime][changelog] and is removing it
from hosted runners in September 2026; the runner already forces such actions
onto Node 24 and warns about it on every run. The warning is per *action*, not
per `node-version:` input — bumping the version the app is *tested* with does
nothing for it.

Every JavaScript action in `.github/workflows/**` and
`.github/workflow-templates/**` was checked against its own `action.yml`
(`runs.using`) rather than a version table, and the Node 20 ones were moved
onto the verified Node 24 line:

| Action | Was (`using: node20`) | Now | Verified `runs.using` |
|---|---|---|---|
| `actions/checkout` | `@v4` | `@v5` | `node24` |
| `actions/setup-node` | `@v4` | `@v5` | `node24` |
| `actions/setup-python` | `@v5` | `@v6` | `node24` |
| `actions/upload-artifact` | `@v4` | `@v6` | `node24` (v5 still defaulted to node20) |
| `actions/download-artifact` | `@v4` (templates) | `@v7` | `node24` |
| `actions/setup-java` | `@v4` (template) | `@v5` | `node24` |
| `actions/setup-dotnet` | `@v4` (template) | `@v5` | `node24` |
| `microsoft/setup-msbuild` | `@v2` (template) | `@v3` | `node24` |
| `gradle/actions/setup-gradle` | `@v4` (template) | `@v5` | `node24` |
| `codecov/codecov-action` | `@v4` | `@v5` | `composite` — no runtime to deprecate; v4 was `node20` |
| `softprops/action-gh-release` | `@v2` | `@v3` | `node24` |
| `amondnet/vercel-action` | `@v25` | **removed** — see §2 | was `node20`, bundles CLI 25 |

Left alone deliberately:

- `reactivecircus/android-emulator-runner@v2` — already `node24`.
- `pypa/gh-action-pypi-publish@release/v1` — Docker action, no JS runtime.
- `actions/checkout@v6` is also `node24`, but v6 additionally requires runner
  ≥ 2.329.0 for authenticated git inside containers; v5 is the minimal,
  sufficient bump. Revisit only when there is a reason.

Two behavioural notes, neither of which changes behaviour *here*:

- `actions/setup-node@v5` turns on package-manager caching by default **when
  `package.json` has a `packageManager` field**; neither `package.json` here
  has one, and every step that wants caching already passes `cache: 'npm'`.
- `codecov/codecov-action@v5` keeps the inputs this repo uses (`files`,
  `flags`, `fail_ci_if_error`, `token`).

The other noise in that log — `punycode`/`util._extend` DeprecationWarnings and
the `osenv`/`inflight`/`glob@7`/`tar@4` npm deprecation spam — all came from the
dependency tree of `vercel@25.1.0` that the old action installed. The modern
CLI's tree is ~10 packages and is clean.

The app itself still builds and tests on Node 20 (`engines: >=20`). Node 20
reached end-of-life in April 2026, so moving the workflow `node-version` inputs
to 22 LTS is worth doing — but it is a separate, testable change, not part of
unblocking this deploy.

## 2. `You do not have access to the specified account`

`amondnet/vercel-action@v25` is the last release of an action whose build step
is `npx vercel@25.1.0` — a CLI from 2023 — and it was configured like this:

```yaml
with:
  vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
  scope: ${{ secrets.VERCEL_ORG_ID }}      # → CLI --scope <team_… id>
```

`--scope` does not accept an organization **id**; it selects an organization by
**slug** (`vercel --scope aas-core`). Passing `team_…` is what produces
`scope-not-accessible` — see Vercel's own error page and the CLI global options
reference, both of which describe `--scope` in terms of a team slug. The
action's own `vercel-org-id` input was already the correct, id-based mechanism;
the extra `scope:` line was the defect. (Separately: a stale or revoked token
raises the same error, and a 2020 Vercel discussion thread documents exactly
that — which is why the new preflight below prints the token's identity.)

### The fix

Both deploy jobs now call the CLI directly, which is the pattern Vercel
documents for custom CI (install CLI → build → deploy) and needs no
third-party action at all:

```yaml
env:
  VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
  VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
  VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
run: |
  url=$(npx --yes vercel@50 deploy --yes -m githubDeployment=1 …)
```

- `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` scope by id **without** `--scope`, and
  skip project linking — the documented CI behaviour.
- `vercel@50` is pinned to a major line (Vercel's LTS line for CI) instead of
  `@latest`, so a CLI release cannot change the pipeline on a random Tuesday.
  `deploy --help` on that version was checked for every flag used here
  (`--prod`, `-m/--meta`, `--yes`, and the `VERCEL_*` env vars).
- The `-m github…` deployment metadata the old action sent is preserved.
- The deploy URL is written to the job summary.
- gating is unchanged: no `secrets` in any `if:` — still a resolved step output
  (`scripts/tests/test_workflows.py` enforces this).

### Diagnostics added

`Describe Vercel credentials` runs before each deploy (and never fails the
job). It prints which user and which teams the token can see, plus the
configured ids:

```
token user     : <username>
visible teams  : aas-core, …
configured ids : org=team_… project=prj_…
```

and warns when `VERCEL_ORG_ID` is not readable as a team by that token. That
turns "You do not have access to the specified account" into an answer instead
of a guess.

## What is verified, and what is not

Verified here: every action's `runs.using` (fetched from each action's own
`action.yml`), all 12 workflow/template files still parse as YAML,
`python -m pytest scripts/tests -q` passes, every new `run:` script passes
`bash -n` and the credential probe was executed with a failing API (it prints
`unavailable`, warns, and exits 0 as intended), and `npx vercel@50 deploy
--help` was run locally to confirm the flags.

**Not verified: an actual deployment.** This session cannot run GitHub Actions
and has no Vercel credentials, so the next push to `main` is the first real
test of §2's fix. If it fails, the credential preflight above now says why.

## Owner-side follow-up (CI cannot fix this)

The deploy was connecting to Vercel as a team account (`aas-core`) with a
`team_…` org id, and the log's `githubCommitAuthorName=myself-aas` is a user
account. If §2's fix still fails, the remaining possibilities are account-level:

1. The `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` secrets are stale — the
   git-connected install that added `@vercel/analytics` in PR #16 may have
   created its project in a **different team** (a second deployment is also
   visible under a `team_prj_…` id, which cannot be read from the team that
   owns the 2026-09-13 secret set).
2. The `VERCEL_TOKEN` belongs to an account that is not a member of the team
   that owns the project.

Fix: Vercel dashboard → the project's **Settings → General** shows the project
id; the team switcher shows the team slug; re-copy both ids into the repo's
Actions secrets and make sure the token was created by an account inside that
team (a *team* token, not a personal one). `docs/ops/owner-actions.md` tracks
this alongside the other owner-only steps.

[changelog]: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
