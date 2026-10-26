# HazardNet App Releases — Operator Guide

HazardNet ships two native clients that live in the `apps/` workspace:

| App | Path | Stack | Executable |
| --- | --- | --- | --- |
| **HazardNet Mobile** | `apps/mobile` | Expo (React Native) for iOS/Android | `.apk` / `.aab` / `.ipa` |
| **HazardNet Windows** | `apps/windows` | React Native for Windows (UWP/WinUI, C++ host) | `.msix` / `.exe` |

This repository stores **source only** — no compiled binaries are committed.
Executables are produced by CI and published to
[GitHub Releases](https://github.com/myself-aas/HazardNet/releases) by the
`App Releases (Windows MSIX)` workflow
(`.github/workflows/app-releases.yml`).

> **Android is currently a template, not a live pipeline** (retired 2026-10-26).
> `Android Release (React Native APK & AAB)` and the `android-apk` job of
> `app-releases.yml` are gone from `.github/workflows/`; the complete APK + AAB
> pipeline is preserved — inert — in
> `.github/workflow-templates/hazardnet-mobile-android-release.yml`. Reasons and
> restoration steps: [§ Android is a template](#android-is-a-template-right-now)
> below.

## Where the executables come from

- **Android APK / AAB** — *not published from this repository right now.* The
  pipeline is `apps/mobile` (an Expo app): `expo prebuild` generates the
  `android/` Gradle project from `app.json` + `eas.json`, then
  `./gradlew assembleRelease bundleRelease` builds the artifacts. It lives in
  `.github/workflow-templates/hazardnet-mobile-android-release.yml` until the
  signing secrets exist. The `android/` and `ios/` directories are generated
  artifacts and are git-ignored by design.
- **Windows MSIX/EXE** — `apps/windows/windows/` is a **committed** Visual
  Studio solution (React Native for Windows). CI restores NuGet, builds
  `Release|x64` with the JS bundle embedded (Hermes bytecode), and uploads
  `HazardNet.exe` plus the packaged `HazardNet.appx` (renamed `.msix`).

## Getting the binaries

1. Go to the [Releases page](https://github.com/myself-aas/HazardNet/releases).
2. Download the asset for your platform:
   - `HazardNet-windows-v<version>-x64.msix` (or the unpacked `.exe`)
   - `HazardNet-mobile-v<version>-android.apk` — only on releases published before
     2026-10-26, or after the Android template is restored
3. Install:
   - **Android:** enable "install unknown apps", tap the `.apk`.
   - **Windows:** double-click the `.msix` (signed with a self-signed CI
     certificate — approve the security prompt), or run the `.exe` directly.

## Triggering a build

- **Tag a release:** `git tag v2.3.0 && git push origin v2.3.0` — CI builds the
  Windows app and attaches the artifacts to that tag's release.
- **Manual:** Actions → *App Releases (Windows MSIX)* → *Run workflow*. A
  (pre-)release named `v<windows-version>-windows-<short-sha>` is created.
- **Android:** copy the template back into `.github/workflows/` first (see
  below); it keeps its own trigger set and publishes
  `v<mobile-version>-android-<short-sha>`.

## Android is a template right now

Two workflows used to build the Android app on every push to `main`, and both
were red for the same reason:

| Retired workflow | Failing step (measured) |
| --- | --- |
| `Android Release (React Native APK & AAB)` (`.github/workflows/android_release.yml`) | *Build signed Release APK & AAB via Gradle (`gradlew`)* — run 40253981974 |
| `Build Android APK` (`.github/workflows/app-releases.yml`, job `android-apk`) | the same Gradle build, duplicated |

The repository has no `ANDROID_KEYSTORE_*` secrets, so there is no Play-ready
artifact to publish; without them the workflow could only ever emit a
throw-away CI-signed APK. The complete pipeline (Expo prebuild → Gradle →
APK + AAB → `SHA256SUMS.txt` → GitHub Release) is preserved verbatim in
`.github/workflow-templates/hazardnet-mobile-android-release.yml`, whose header
carries the restore checklist. In short:

1. Create the four secrets below.
2. Copy the template to `.github/workflows/mobile-android-release.yml`.
3. Run it once with `workflow_dispatch` and watch the Gradle step — that is
   where run 40253981974 failed — before re-enabling its `push` trigger.

## Android signing (repository secrets)

These are needed only when the Android template is restored (they are no longer
referenced by any live workflow). The Expo/React Native template signs release
APKs with the **debug** keystore; CI overrides this with
`apps/mobile/ci-signing.gradle`, which loads a keystore from
`keystore.properties`. To sign with a real, reusable key, set these repository
secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 keystore.jks` (the Play/App Signing keystore) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |

Create a persistent keystore with, e.g.:

```sh
keytool -genkeypair -v -keystore hazardnet-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias hazardnet \
  -dname "CN=HazardNet, OU=Engineering, O=HazardNet, C=BD"
```

> **Without** these secrets CI generates a throw-away keystore on every run.
> The resulting APK is validly signed and installable on-device, but the key
> cannot be reused to publish updates (not usable for Play Store rollout).

## Building locally

### Mobile (Android)
```sh
npm ci
cd apps/mobile
npm run android          # expo run:android (needs Android SDK + emulator)
# or generate the native project only:
npm run prebuild
```
For store builds use EAS (see `apps/mobile/eas.json`): `eas build -p android --profile production`.

### Mobile (iOS)
```sh
cd apps/mobile
npm run ios              # requires macOS + Xcode
```

### Windows
```sh
npm ci
cd apps/windows
npm run windows          # build + run (needs VS 2022 "Desktop development with C++")
npm run build:windows    # Release build only, output in windows/HazardNet/Build/Release/
```
The `windows/` solution is checked in; if you bump `react-native-windows` and
the layout changes, regenerate with `npm run init:windows`.

## Troubleshooting

- **Windows job: `MSBUILD : error MSB4019` (missing targets)** — the runner
  needs the Visual Studio 2022 "Desktop development with C++" workload
  (preinstalled on `windows-2022`). Keep `runs-on: windows-2022`.
- **Windows job: JS bundle missing/stale** — the bundle is produced by the
  MSBuild `MakeBundle` target from `apps/windows/index.windows.js`. The
  component name in that file must match `ComponentName` in
  `windows/HazardNet/MainPage.xaml`.
- **Android job: `SDK location not found`** — the `expo prebuild` output reads
  `local.properties`; the `ubuntu-latest` runner has the Android SDK and
  licenses pre-accepted. If you fork to a self-hosted runner, export
  `ANDROID_HOME` / `ANDROID_SDK_ROOT`.
- **APK won't install over an older one** — the signing key changed
  (see the signing section). Uninstall the previous build first.
