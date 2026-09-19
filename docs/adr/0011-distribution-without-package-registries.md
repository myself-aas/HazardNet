# ADR 0011 — Distribution without package registries: the site, GitHub Releases, and the repository

- **Status:** Accepted (2026-09-19). Closes `[ASK USER] 1` in
  `docs/ops/2026-09-19-advanced-ops-dev-plan.md` — the owner decision is
  **do not publish an npm or PyPI package, and stop querying the registries.**
- **Context:** the Download Center (`frontend/src/pages/DownloadCenter.tsx`),
  `frontend/src/lib/downloadChannels.ts`, `frontend/src/hooks/useReleaseChannels.ts`;
  `.github/workflow-templates/` (five product-repository release templates, two of
  them registry publishers); ADR 0008 (the committed snapshot as the delivery path);
  the QA findings on `/download` in `e2e/full-app-qa.spec.ts` and
  `docs/audits/2026-09-15-ci-backend-tests-and-workflow-green.md`.

## Context

`/download` described five distribution channels: an Android field agent, a Windows
GIS workstation, a Linux daemon/CLI, a Python package and an npm package. Two of
those five were rendered as **install commands with a live version number**:

```
pip install hazardnet==<version from pypi.org>
npm install hazardnet@<version from registry.npmjs.org>
```

HazardNet has never published to either registry. So on every visit the page:

1. issued requests to `pypi.org` and `registry.npmjs.org` that could only answer
   404 — they were the external failures the QA suite kept reporting on
   `/download` (seven failing external requests per page load in the audit, and a
   standing red `Route health › /download` test);
2. needed an **ownership guard** whose entire job was to detect that a package
   named `hazardnet` on a public registry is not ours. That guard is not a safety
   net for a distribution channel we have; it is a symptom of describing one we do
   not. `hazardnet` is an unreserved name on both registries, so the realistic
   outcome of the guard firing is a visitor being told "awaiting release" about a
   package nobody intends to release — and the unrealistic outcome is worse: a
   third party registers the name and our page renders *their* version number next
   to *our* install command;
3. rendered a `CopyButton` inviting the visitor to run a command that cannot work.

The page was not lying loudly, which is why it survived several audits: every
sentence was defensible in isolation ("release pipeline prepared", "awaiting
release"). The aggregate claim — *you can install HazardNet from a package
registry* — was false, and it was the only claim a visitor acts on.

Separately, the root `package.json` had no `"private": true`. Nothing in CI
publishes it, but the manifest was one mistyped `npm publish` away from putting a
package on the public registry under the name this ADR says we do not use.

## Decision

1. **Distribution is three things, and only three:** the deployed website
   (`hazardnet.live`), GitHub Release assets on the product repositories, and the
   repository itself. No PyPI project, no npm package.
2. **`/download` makes no network requests by default.** It renders the channel
   definitions from `downloadChannels.ts` and links to the repositories. The
   registry lookups are **removed, not disabled** — there is no flag that turns
   `pypi.org` or `registry.npmjs.org` back on, because there is nothing there to
   look up.
3. **Live GitHub Releases lookups are opt-in**, via `VITE_DOWNLOAD_LIVE_RELEASES=true`,
   for a deployment whose product repositories exist and actually publish
   releases. Results are session-cached under `hazardnet.download.v2` to stay
   inside the unauthenticated GitHub API rate budget. Until the flag is set the
   channel shows its "release pipeline prepared" state.
4. **The channel model carries a `distribution` sentence instead of an install
   command**, e.g. the Python channel reads *"Source and built sdist/wheel from
   the product repository. Not published to PyPI (ADR 0011) — there is no
   `pip install hazardnet`."* The install-command UI and its `CopyButton` are
   gone; the page states what is distributed rather than how to install something
   that does not exist.
5. **`VITE_PYPI_PACKAGE_NAME` and `VITE_NPM_PACKAGE_NAME` are removed.** Setting
   them does nothing.
6. **The root `package.json` is `"private": true`** (the frontend workspace already
   was), so `npm publish` from this repository fails outright instead of depending
   on someone remembering this decision.
7. **The two registry workflow templates stay in `.github/workflow-templates/` as
   inert reference material**, annotated `NOT ADOPTED BY THIS PROJECT (ADR 0011)`.
   GitHub Actions does not execute anything outside `.github/workflows/`, so they
   cannot publish from here. Copying one into a product repository is a decision
   to reverse this ADR and must be recorded as one.

## Consequences

**What gets better**

- `/download` stops failing its own QA gate: no external requests means no
  environmental 404s to mute, and the `Route health` and `Console health`
  assertions for that route are now measuring the page rather than the absence of
  a package.
- The squatting exposure disappears with the lookups. There is no longer a code
  path in which a stranger's `hazardnet` package can supply a version string to
  our page.
- The client bundle loses two fetch paths, a cache tier and an ownership-check
  helper — less code whose only job was to describe a channel we do not have.

**What it costs**

- Anyone who wanted `pip install hazardnet` has to clone the repository or
  download a release asset. That is a real inconvenience for the Python and
  JavaScript channels, and it is now stated on the page instead of implied
  otherwise.
- The `distribution` sentence per channel is hand-maintained copy. If a channel's
  artefacts change (an AAB appears next to the APK, a `SHA256SUMS.txt` is
  dropped), the sentence has to be edited; there is no registry metadata to
  derive it from. That is the trade: a sentence we review, instead of a version
  number we cannot control.
- Reversing this decision means re-adding the removed code (registry types,
  lookups, the ownership guard, the install-command UI). It is in git history, so
  it is recoverable, but it is not a flag flip.

**What to watch**

- `site-health.yml` probes `/download`; it must keep answering 200 with its
  prerendered body.
- If a product repository ever publishes a registry package, this ADR is
  superseded by a new one that names the package, the owner and the provenance
  check — not by editing `downloadChannels.ts` in place.
