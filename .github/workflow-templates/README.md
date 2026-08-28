# HazardNet Workflow Templates

Reusable GitHub Actions workflow templates for the HazardNet product
repositories (Android field agent, Windows GIS workstation, Linux daemon/CLI,
Python package, npm package).

**These files are templates, not live workflows.** GitHub Actions only
executes workflows in `.github/workflows/`; files under
`.github/workflow-templates/` are inert. HazardNet's own CI
(`.github/workflows/ci.yml`) is untouched by this directory and keeps running
exactly as before. The product repositories are separate from HazardNet, and
their exact layouts are unknown, so every template is parameterized with
documented placeholder paths and explicit configuration variables instead of
assuming build files that only exist in those repositories.

| Template | Intended product | Platform / toolchain | Publishes to |
| --- | --- | --- | --- |
| `hazardnet-field-agent-android.yml` | Android field agent app | Linux, Gradle (JDK/Temurin) | GitHub Releases (APK/AAB) |
| `hazardnet-gis-workstation-windows.yml` | GIS workstation | Windows, MSBuild / .NET | GitHub Releases (installer/zip) |
| `hazardnet-daemon-cli-linux.yml` | Headless daemon & CLI | Linux, CMake or build script | GitHub Releases (tar.gz archives) |
| `hazardnet-python-package.yml` | Python package | Linux, pip/build/twine | PyPI **and** GitHub Releases (sdist/wheel) |
| `hazardnet-npm-package.yml` | npm package | Linux, Node/npm | npm registry **and** GitHub Releases (tarball) |

---

## Quick start (adopting a template)

1. **Copy** the template into the product repository as
   `.github/workflows/<template-name>.yml` (keep the Python file path stable —
   PyPI trusted publishing is registered against the workflow path).
2. **Edit the `CONFIGURATION` block** at the top of the file. Every entry is a
   plain string; an empty string (`''`) disables the related step. Values
   marked `<<< EDIT` are required (`SOLUTION_OR_PROJECT` in the Windows
   template, the default branch in all of them).
3. **Set the default branch** in `on.push.branches` if it is not `main`.
4. **Create a `release` environment** in the product repository
   (Settings → Environments). Add required reviewers there if releases should
   need approval, and store release credentials as *environment* secrets (not
   plain repository secrets) so they are only exposed to release jobs.
5. **Add the required secrets** (see per-template tables below). CI runs
   without secrets; only publishing and signing require them.
6. **Tag a release**: push a strict-semver tag `vMAJOR.MINOR.PATCH[-pre][+build]`
   (e.g. `v1.2.3`, `v1.2.3-rc.1`) or run the workflow manually with the
   `release` input checked — dispatching *with a tag selected* is the
   recommended manual path; dispatching from a branch additionally requires
   the `release_tag` input.

Nothing publishes by accident: pull requests and ordinary branch pushes can
never reach a publish job (see the release gate below).

## Triggers

| Event | Behavior |
| --- | --- |
| `pull_request` (any branch) | Validation only. Fork PRs see no secrets → unsigned/unsigned-skip builds, no publish. |
| `push` to the default branch | Validation only, artifacts uploaded for inspection. |
| `push` of a tag `v*` | Validation **and** release if — and only if — the tag is strict semver; non-semver `v*` tags log a warning and run validation only. |
| `workflow_dispatch` with `release=true` | Release run. Requires a tag selected in the dispatch dialog, or an explicit `release_tag` input (e.g. `v1.2.3`); otherwise the gate fails fast. |
| `workflow_dispatch` with `release=false` | Validation only (e.g. to run Android instrumentation on demand). |

## Shared safeguards (built into every template)

- **Release gate job** — runs first and computes `should-publish`:
  publication requires `push` of a strict-semver tag or a manual
  `release=true` dispatch with a resolvable semver tag. Pull requests and
  untagged pushes always evaluate to `should-publish=false`, and every
  release/publish job is additionally guarded with
  `if: needs.release-gate.outputs.should-publish == 'true'`.
  The gate also derives `version` and `prerelease` (used for release notes,
  npm dist-tags and GitHub prerelease marking).
- **Least-privilege permissions** — workflow-level `permissions: contents:
  read`; only release jobs escalate (`contents: write` for GitHub Releases,
  `id-token: write` for PyPI trusted publishing and npm provenance).
- **Protected `release` environment** — all publish/release jobs declare
  `environment: release` so approvals and environment-scoped secrets apply.
- **Concurrency** — validation runs cancel stale peers per event-type+ref
  lane; tag and dispatch runs are never cancelled mid-release.
- **Dependency caching** — Gradle, NuGet/dotnet (via MSBuild/`setup-dotnet`),
  pip (keyed on the packaging manifest) and npm (keyed on the lockfile).
- **Pinned major action versions** — `actions/*@v4|v5`,
  `gradle/actions/setup-gradle@v4`, `microsoft/setup-msbuild@v2`,
  `reactivecircus/android-emulator-runner@v2`,
  `softprops/action-gh-release@v2`, `pypa/gh-action-pypi-publish@release/v1`
  (matching the versions already used by HazardNet's own workflows).
- **Fail fast** — missing build entrypoints (`gradlew`/`settings.gradle`,
  solution/project file, `CMakeLists.txt`/build script, `pyproject.toml`/
  `setup.py`/`setup.cfg`, `package.json`/lockfile), failed tests, invalid
  package metadata (`twine check --strict`, npm pack verification,
  package-version vs. tag mismatch) and missing release credentials all fail
  the run with a `::error::` annotation.
- **Secret hygiene** — secrets are only referenced via `env:` indirection or
  action inputs, never echoed, never placed in command lines that end up in
  logs; signing/registry material is expected as environment secrets.
- **Artifacts** — every successful validation job uploads its build outputs
  with `if-no-files-found: error` and a configurable retention period
  (`ARTIFACT_RETENTION_DAYS`, default 14 days). Release jobs add
  `SHA256SUMS.txt` alongside uploaded assets.

## CI artifacts vs. registry/GitHub publication

Two different distribution channels are kept distinct:

- **CI artifacts** (`actions/upload-artifact`) — downloadable from the workflow
  run for inspection/debugging; ephemeral (retention days), never public, and
  produced on every run including pull requests.
- **Publication** — either a **GitHub Release** (public download page; assets
  are the same files as the CI artifacts, re-uploaded by the gated release
  job) and/or a **registry** (PyPI/npm) that pulls from the validated build.
  Publishing happens only through the gated release jobs, in the `release`
  environment, with registry credentials present.

## Per-template reference

### 1. Android field agent (`hazardnet-field-agent-android.yml`)

Expects a standard Gradle layout: `./gradlew`, `settings.gradle(.kts)` and the
app module (`GRADLE_MODULE_DIR`, default `app`).

| Variable | Default | Notes |
| --- | --- | --- |
| `JAVA_VERSION` | `17` | Temurin JDK for Gradle. |
| `GRADLE_MODULE_DIR` | `app` | Module that builds the app; used to locate APK/AAB outputs. |
| `LINT_TASK` / `UNIT_TEST_TASK` | `lintRelease` / `testReleaseUnitTest` | `''` skips; adjust for flavors/build variants. |
| `ASSEMBLE_TASK` / `BUNDLE_TASK` | `assembleRelease` / `bundleRelease` | APK/AAB assembly; at least one must be set. |
| `GRADLE_EXTRA_ARGS` | `''` | Appended to every `./gradlew` invocation. |
| `INSTRUMENTATION_ENABLED` | `false` | `true` runs emulator tests on every CI run; also on-demand via the `run_instrumentation` dispatch input. |
| `INSTRUMENTED_TEST_TASK`, `EMULATOR_API_LEVEL`, `EMULATOR_TARGET`, `EMULATOR_ARCH` | `connectedDebugAndroidTest`, `34`, `default`, `x86_64` | Emulator configuration. |
| `ARTIFACT_RETENTION_DAYS` | `14` | CI artifact retention. |

**Signing.** Release builds are **signed only when all four secrets exist**;
otherwise the same assembly runs unsigned (and fork PRs always build
unsigned, since they see no secrets). The keystore is base64-decoded to the
runner temp dir and exposed to Gradle as project properties via
`ORG_GRADLE_PROJECT_*` environment variables, so values never appear in
command lines or logs. The app's `build.gradle(.kts)` should consume them,
e.g.:

```kotlin
// app/build.gradle.kts (sketch) — sign only when CI provides the inputs
val ciKeystore = providers.gradleProperty("hzKeystorePath")
android {
    signingConfigs.create("ci") {
        storeFile = ciKeystore.orNull?.let(::file)
        storePassword = providers.gradleProperty("hzKeystorePassword").orNull
        keyAlias = providers.gradleProperty("hzKeystoreAlias").orNull
        keyPassword = providers.gradleProperty("hzKeyPassword").orNull
    }
    // assign the "ci" config to the release build type when storeFile != null
}
```

| Secret (release environment) | Purpose |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded keystore (`base64 -w0 release.keystore`). |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password. |
| `ANDROID_KEYSTORE_ALIAS` | Key alias. |
| `ANDROID_KEY_PASSWORD` | Key password. |

Artifacts: `android-release-signed` or `android-release-unsigned` (APK+AAB);
release assets on tags: APK, AAB, `SHA256SUMS.txt`.

### 2. Windows GIS workstation (`hazardnet-gis-workstation-windows.yml`)

Runs on `windows-latest` with `microsoft/setup-msbuild@v2` and (optionally)
`actions/setup-dotnet@v4`. MSBuild conventions for both .NET (SDK-style) and
.NET Framework solutions are supported.

| Variable | Default | Notes |
| --- | --- | --- |
| `SOLUTION_OR_PROJECT` | `./src/REPLACE_ME.sln` | **Required edit.** `.sln`/`.csproj`/`.vbproj`/`.fsproj`. |
| `BUILD_CONFIGURATION` / `BUILD_PLATFORM` | `Release` / `Any CPU` | MSBuild configuration/platform. |
| `RUNTIME_IDENTIFIER` / `SELF_CONTAINED` | `win-x64` / `false` | RID for publish and `/p:RuntimeIdentifier`; `''` omits. |
| `DOTNET_VERSION` | `9.0.x` | `''` skips the .NET SDK (pure .NET Framework solutions). |
| `RESTORE_COMMAND` | `''` | Override restore (e.g. `nuget restore`, `dotnet restore`). Default: `msbuild /t:Restore`. |
| `MSBUILD_EXTRA_ARGS` | `''` | Extra MSBuild build arguments. |
| `TEST_COMMAND` | `dotnet test --no-build` | `''` disables; e.g. `dotnet vstest <built test dlls>` for classic solutions. |
| `PACKAGE_COMMAND` | `''` | Overrides packaging entirely (e.g. an MSBuild publish profile command). Default: `dotnet publish … -o publish` (SDK-style) or `msbuild /t:Publish` (Framework). |
| `INSTALLER_SCRIPT` | `''` | e.g. `./scripts/build-installer.ps1` (Inno Setup/WiX). Must write output to `./package`. `''` zips `publish/` instead. |
| `PACKAGE_PREFIX` | `hazardnet-gis-workstation` | Base name for the zip artifact. |
| `SIGN_FILES` / `SIGN_TIMESTAMP_URL` | `*.exe,*.dll` / digicert URL | What Authenticode signing matches under `publish/` + `package/`. |

| Secret (release environment) | Purpose |
| --- | --- |
| `CODE_SIGNING_CERT_PFX_BASE64` | Base64-encoded PFX; signing runs only when both secrets exist. |
| `CODE_SIGNING_CERT_PASSWORD` | PFX password. |

Artifacts: `windows-package` (installer or zip); release assets on tags: the
package files plus `SHA256SUMS.txt`.

### 3. Linux daemon & CLI (`hazardnet-daemon-cli-linux.yml`)

Two build modes, selected by `BUILD_SYSTEM`:

- `cmake` (default): configure/build with CMake into `build/<target>`, then
  `ctest` when `CTEST_ENABLED`.
- `script`: run `BUILD_SCRIPT` (default `./scripts/build.sh`) with
  `HZ_TARGET`, `HZ_BUILD_TYPE`, `HZ_BUILD_DIR` and `SCRIPT_BUILD_ARGS`
  exported — the product repo defines the script; the template never assumes
  its contents.

| Variable | Default | Notes |
| --- | --- | --- |
| `BUILD_SYSTEM` | `cmake` | `cmake` or `script`. |
| `CMAKE_SOURCE_DIR` / `CMAKE_BUILD_TYPE` / `CMAKE_EXTRA_ARGS` | `.` / `Release` / `''` | CMake configure inputs. |
| `CTEST_ENABLED` / `CTEST_EXTRA_ARGS` | `true` / `''` | Test run after a cmake build. |
| `BUILD_SCRIPT` / `SCRIPT_BUILD_ARGS` | `./scripts/build.sh` / `''` | `script` mode entrypoint. |
| `SMOKE_TEST_COMMAND` | `./scripts/smoke-test.sh` | `''` disables. Runs with `HZ_TARGET`/`HZ_BUILD_TYPE`/`HZ_BUILD_DIR` exported; must fail non-zero on breakage. |
| `PACKAGE_PREFIX` | `hazardnet-daemon-cli` | Archive base name. |
| `DIST_GLOBS` | `build/bin/*` (one glob per line) | Everything matched is archived per target. |

The `matrix.target` list (default `linux-x86_64`) defines supported
architectures/configurations; add rows (e.g. `linux-aarch64`) and a
`cmake_toolchain` entry per cross-compile target — see the commented example
in the template.

No secrets required for CI or GitHub Releases (uses `GITHUB_TOKEN`).
Artifacts: `daemon-cli-<target>` tar.gz archives; release assets on tags: all
target archives plus `SHA256SUMS.txt`.

### 4. Python package (`hazardnet-python-package.yml`)

| Variable | Default | Notes |
| --- | --- | --- |
| `python-version` matrix | `3.10–3.13` | Edit the matrix in the `test` job directly. |
| `PACKAGE_MANIFEST` | `pyproject.toml` | Guard + pip cache key. |
| `INSTALL_COMMAND` | `''` | Default: `pip install -e '.[dev]' pytest` (unknown extras only warn). |
| `LINT_COMMAND` / `TYPECHECK_COMMAND` | `''` / `''` | e.g. `ruff check .` / `mypy .`; configured ⇒ run, `''` ⇒ skipped. |
| `TEST_COMMAND` | `pytest` | Required step. |
| `BUILD_PYTHON_VERSION` | `3.12` | Python for the packaging job. |
| `BUILD_COMMAND` | `python -m build` | Produces sdist+wheel into `./dist`. |
| `PUBLISH_MODE` | `trusted-publishing` | `trusted-publishing` (OIDC) or `api-token` (fallback). |
| `PUBLISH_REPOSITORY_URL` | `https://upload.pypi.org/legacy/` | Point to TestPyPI for staging; a `vars.PYPI_REPOSITORY_URL` repo variable overrides it. |

Metadata is validated with `twine check --strict` on every run, and the wheel
version must equal the release tag before publishing.

| Secret (release environment) | Purpose |
| --- | --- |
| `PYPI_API_TOKEN` | Only used when `PUBLISH_MODE: api-token`. |

**Trusted publishing (default):** register the product repository on PyPI as
an OIDC/trusted publisher with the exact workflow path
(`.github/workflows/hazardnet-python-package.yml`), environment `release`,
and the job name `publish-pypi`. No token is stored anywhere in this mode.
The `api-token` mode requires `PYPI_API_TOKEN` and disables attestations.

Artifacts: `python-dist` (sdist+wheel); release on tags: PyPI upload **and**
GitHub Release with dist + `SHA256SUMS.txt`.

### 5. npm package (`hazardnet-npm-package.yml`)

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_VERSION` | `20` | Keep in sync with the package's `engines` field. |
| `LOCKFILE_PATH` | `package-lock.json` | Must be committed; guards `npm ci`. |
| `INSTALL_COMMAND` | `npm ci` | Adjust for npm-shrinkwrap/yarn/pnpm conventions. |
| `LINT_SCRIPT` / `TYPECHECK_SCRIPT` / `TEST_SCRIPT` / `BUILD_SCRIPT` | `lint` / `typecheck` / `test` / `build` | Run with `npm run --if-present` — absent scripts are skipped, failing scripts fail the run; `''` skips the step entirely. |
| `SMOKE_COMMAND` | `''` | e.g. `npx --no-install <cli> --help`. Runs in a scratch project with the packed tarball installed and its `node_modules/.bin` on `PATH`. |
| `NPM_ACCESS` | `public` | `restricted` for private scoped packages. |
| `NPM_DIST_TAG` | `''` | Auto: `next` for prerelease tags, else `latest`. |
| `NPM_PROVENANCE` | `true` | Requires publishing from this GitHub repo to the public npm registry with a `repository` field in `package.json`; set `false` for private registries. |

| Secret (release environment) | Purpose |
| --- | --- |
| `NPM_AUTH_TOKEN` | Granular npm publish token (automation scope). Required for publishing. |

Every run verifies the packed tarball: non-empty file list, required
`package.json` fields (`name`, `version`), and every declared `bin` target
present in the tarball. Publishing re-checks that `package.json` version
equals the release tag, runs `npm publish --dry-run` for a last review, then
publishes with provenance under the computed dist-tag.

Artifacts: `npm-package` (tarball + `pack-manifest.json`); release on tags:
npm publish **and** GitHub Release with the tarball + `SHA256SUMS.txt`.

## Tag conventions

- `v` + strict semver: `vMAJOR.MINOR.PATCH[-prerelease][+build]`
  (e.g. `v1.0.0`, `v2.1.3-rc.1`). Prerelease tags publish as GitHub
  pre-releases and npm dist-tag `next`.
- Non-semver tags matching `v*` are validated but never published (warning
  annotation in the gate job). Tags not matching `v*` do not trigger the
  workflow at all.
- Python/npm releases additionally require the package version in the
  manifest to equal the tag — version bumps and tags are reviewed together.

## Customization notes

- Keep the `release-gate` job intact when editing; it is the single decision
  point for publishing.
- Manual dispatch caveat: when dispatching `release=true` from a *branch*
  with a `release_tag` input, the npm job checks out that tag to publish,
  while release assets come from the dispatched commit — prefer dispatching
  with the tag selected so everything matches.
- CI artifacts expire per `ARTIFACT_RETENTION_DAYS`; GitHub Release assets
  are permanent until deleted; registry uploads follow the registry's
  immutability rules (PyPI versions can never be re-uploaded; npm requires a
  new version).

## Validation performed here (structural only)

The templates in this directory were validated structurally: YAML parsing of
all five files, GitHub Actions expression/structure checks (jobs, needs
references, outputs, step `if` conditions, `with:` inputs, permissions and
concurrency blocks), `bash -n` syntax checks of every `run:` script, and
Node syntax checks of the embedded validation scripts. No product builds are
executed in HazardNet — these templates build product code only after being
copied into the corresponding product repositories.
