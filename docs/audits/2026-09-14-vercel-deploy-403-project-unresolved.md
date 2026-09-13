# 2026-09-14 — `Deploy Preview/Production (Vercel)` 403, and the misdirecting error it prints

**Trigger:** the Vercel CLI steps added earlier the same day
(`docs/audits/2026-09-14-actions-runtime-and-vercel-deploy.md`) failed on PR
#19's run [`34779634203`](https://github.com/myself-aas/HazardNet/actions/runs/34779634203),
job `103784561604` (`Deploy Preview (Vercel)`), step 5:

```
Retrieving project…
Error: Could not retrieve Project Settings. To link your Project, remove the `.vercel` directory and deploy again.
Learn More: https://vercel.link/cannot-load-project-settings
Error: Process completed with exit code 1.
```

**Outcome:** the deploy no longer trusts the ids in the secrets; it resolves the
org/project the token can actually use, so a stale id degrades to a notice
instead of a failed deploy. Wired into both deploy jobs and guarded by a test.

---

## 1. What the message actually means

The message reads like a local-linking problem. It is not. In Vercel CLI
50.44.0 (`dist/chunks/chunk-V23RAVWV.js`) it is raised from exactly one place:

```js
} catch (err) {
  if (isAPIError(err) && err.status === 403) {
    output_manager_default.stopSpinner();
    if (err.missingToken || err.invalidToken) {
      throw new InvalidToken(client.authConfig.tokenSource);
    } else if (err.code === "forbidden" || err.code === "team_unauthorized") {
      throw new NowBuildError2({
        message: `Could not retrieve Project Settings. To link your Project, remove the
                  ${code(VERCEL_DIR)} directory and deploy again.`,
        code: "PROJECT_UNAUTHORIZED",
        link: "https://vercel.link/cannot-load-project-settings"
      });
    }
  }
  throw err;
}
```

Three things follow, and each rules out a different theory:

| Observation | Ruled out |
| --- | --- |
| The branch is guarded by `err.status === 403` | Network/`curl` problems, a 5xx, a bad build |
| `missingToken` / `invalidToken` throw `InvalidToken` instead | A missing, revoked or expired token |
| `code: forbidden \| team_unauthorized` | Anything about the local repository |

So the token is **valid**, and the `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` pair it
was given is **not one it may use**. The preceding call is
`getProjectByNameOrId(client, link.projectId, link.orgId)` — when
`VERCEL_ORG_ID` *and* `VERCEL_PROJECT_ID` are both set the CLI takes them
straight from the environment and skips linking entirely, which is why no
`.vercel` directory exists at any point and why the advice to remove one cannot
help.

The run's own annotations corroborate it (read via the Checks API — see §5):

```
[warning]  VERCEL_ORG_ID is not readable as a team by this token …
[warning]  The process '/usr/bin/git' failed with exit code 128
[failure]  Process completed with exit code 1
```

Two independent probes — the preflight's `GET /v2/teams/<VERCEL_ORG_ID>` and the
CLI's project lookup — failed against the same id.

## 2. It is not a regression from the CLI rewrite

`main` was already failing this way with the *old* action. Run `34779009115`
(job `103782790033`, `Deploy Production (Vercel)`, `amondnet/vercel-action@v25`):

```
[warning]  Node.js 20 is deprecated. The following actions target Node.js 20 but are
           being forced to run on Node.js 24: actions/checkout@v4, amondnet/vercel-action@v25.
[warning]  The process '/usr/bin/git' failed with exit code 128
[failure]  The process '/usr/local/bin/npx' failed with exit code 1
```

Both flows end in `npx` exiting 1 against the same project, so the rewrite
changed the reporting, not the outcome. `Deploy Preview (Vercel)` also failed on
#17's runs (`34775048268`, `34774866037`) before any of these edits.

Worth keeping separate from the real defect: the `git` exit-128 warning is
present in the old flow too, so the CLI rewrite did not introduce it either.
It is also **not** from the `git log` behind `-m githubCommitMessage` — run
`34781836908` (job `103790542185`) carries the same annotation on a job where
`Deploy to Vercel Preview` was *skipped*, so it comes from the checkout/runner
rather than from anything this change touches. It is cosmetic and predates the
work; nothing here tries to silence it.

The `Vercel` **commit status passes** on both branches
(`vercel.com/aas-core/hazardnet/B3FEktqbZWWRygsoyJoz2XLZK63J` on `main`,
`…/4LWURo91de2GZqE7tEytCswNw6rR` on the PR). The Git integration deploys the
same commits under team `aas-core` without trouble; only the secrets-based CLI
path cannot authenticate.

## 3. Fix

**`scripts/ci/resolve-vercel-scope.sh`** (new) resolves the scope from the token
and exports `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` into `$GITHUB_ENV`. Its first
draft, however, gated on `GET /v2/user` succeeding — and the first live run
(`34781836908`) came back with:

```
[failure] VERCEL_TOKEN did not resolve to a Vercel user — it is invalid, revoked, or expired.
```

That verdict was wrong, and the evidence for saying so is the CLI's own error
from the day before. A revoked token carries `invalidToken` in the error body,
and the CLI checks that flag *before* the code:

```js
if (err.missingToken || err.invalidToken)  throw new InvalidToken(...)
else if (err.code === "forbidden" || err.code === "team_unauthorized")  throw … PROJECT_UNAUTHORIZED
```

Yesterday's failure was `PROJECT_UNAUTHORIZED`, not `InvalidToken` — so the API
had accepted the token and refused it only for the org/project pair. A token
that authenticates there but 403s on `/v2/user` is a **team-scoped** token: it
is not bound to a user, so the user endpoint is not open to it, while its team
still is. Rejecting it at the first probe would have blamed the credential for
what the stale ids were doing.

The final design therefore never treats a bare 403 on `/v2/user` as fatal —
only an explicit `invalidToken` / `missingToken` flag is — and resolves the
scope by trying candidates until one *verifies*:

1. the configured `VERCEL_ORG_ID`;
2. the team id whose slug is `VERCEL_ORG_SLUG` (`aas-core`), from `/v2/teams`;
3. that slug itself, for tokens that cannot enumerate teams (adopted only if
   the probe below succeeds — whether the API accepts a slug where an id is
   expected is settled by measurement, not assumption);
4. the token's own personal account, when `/v2/user` answered.

A candidate is verified **the way the CLI will use it**, mirroring
`getLinkedProject` — that is what decides whether the deploy runs:

| Probe | Required |
| --- | --- |
| `GET /v2/teams/<org>` | must not be 403 (the CLI tolerates 404 here) |
| `GET /v9/projects/<idOrName>?teamId=<org>` | must be 200 |

The project is looked up by the configured id first (and the API must answer
about that same id), then by name — the name being what survives a project
being recreated under another team, which is this failure. Personal scope is
queried without `teamId`, since a user id is not a team id.

On success it prints the resolved scope and a `::notice::` for each stale
secret it had to override. On failure it prints a `path | HTTP | error` table
for every probe plus a reading of what that pattern means, so the next run
answers the question instead of re-posing it.

Both deploy jobs call it as `Resolve Vercel scope` (replacing
`Describe Vercel credentials`, which only diagnosed).

**The shadowing trap:** a step-level `env:` beats `$GITHUB_ENV`. Re-declaring
`VERCEL_ORG_ID` in the deploy step's `env:` — the obvious thing to do, and what
the code did before — silently restores the stale value and the 403.
`scripts/tests/test_workflows.py::test_vercel_deploy_uses_resolved_scope`
enforces the opposite: every Vercel deploy step must be preceded by the
resolver, the resolver must call the script, and the deploy step must not
re-declare either id.

## 4. Verification

The resolver is exercised against a stand-in Vercel API inside the test suite —
`scripts/tests/test_vercel_scope_resolver.py`, whose `FakeVercel` reproduces the
refusals the real endpoints use (403 `invalidToken` for a revoked token, 403
`forbidden` *without* that flag for a team-scoped one, 403 `team_unauthorized`
for a scope the token may not use, 404 for an unknown team, 200 for a match) —
so each branch is provoked rather than asserted. 10 tests:

| Scenario | Expected |
| --- | --- |
| Stale org **and** project ids, account token | resolves from the token, exports both ids |
| …same | `::notice::` names the stale secret |
| Correct configured ids | kept as-is, no notice |
| Stale project id alone | project found by name |
| No `VERCEL_ORG_ID` at all | team-slug fallback |
| **Team-scoped token** (`/v2/user` 403, no flag) | not mistaken for a dead token; resolves |
| **Team-scoped token that cannot list teams** | slug accepted as the id — verified by probe |
| Revoked token (`invalidToken`) | exit 1, named as invalid/revoked/expired |
| No visible scope holds `hazardnet` | exit 1 + the full `path | HTTP | error` table |
| Project in the token's personal account | resolved without `teamId` |

They run under the existing `Pipeline Scripts Tests` job (no network: the
stand-in is a loopback `ThreadingHTTPServer` on an ephemeral port).

The regression guard was verified in both directions: it accepts the current
workflow, and it rejects both a re-declared `VERCEL_ORG_ID` on a deploy step and
a deploy job missing its resolver.

Also checked: `scripts/tests/test_workflows.py` 8/8 (the new guard plus the
existing `secrets`-in-`if:` and structural invariants), all 14 workflow/template
files still parse as YAML, and `bash -n` passes on all 32 `ci.yml` run blocks
and the resolver.

**Not yet verified: a successful deployment.** The resolver's own diagnostics
are what the next run reports, and the production job is `main`-only. If the
resolution still fails, the failure output now names the token's identity, its
visible teams, and the exact HTTP status and Vercel error code of every probe.

## 5. Method note — reading a failed job from here

The step log itself is on Azure blob storage
(`productionresultssa0.blob.core.windows.net` / `results-receiver.actions.githubusercontent.com`),
and both hosts are unreachable from this sandbox (`SSL_ERROR_SYSCALL`, http 000),
so `gh run view --log` and `gh api .../jobs/<id>/logs` return nothing. The
**Checks API** is reachable and carries the annotations quoted above:

```bash
gh api repos/myself-aas/HazardNet/check-runs/<job_id>/annotations \
  --jq '.[] | "[\(.annotation_level)] \(.message)"'
```

That is how the `::warning::` lines and the exit codes in §1 and §2 were read.
