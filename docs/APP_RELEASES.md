# HazardNet App Releases — Operator Guide

HazardNet ships two native clients that live in the `apps/` workspace:

| App | Path | Stack | Executable |
| --- | --- | --- | --- |
| **HazardNet Mobile** | `apps/mobile` | Expo (React Native) for iOS/Android | `.apk` / `.aab` / `.ipa` |
| **HazardNet Windows** | `apps/windows` | React Native for Windows (UWP/WinUI, C++ host) | `.msix` / `.exe` |

This repository stores **source only** — no compiled binaries are committed.
Executables were produced by CI and published to
[GitHub Releases](https://github.com/myself-aas/HazardNet/releases).

> **Both native release pipelines are templates as of 2026-10-26.** Nothing
> publishes an executable on push any more: `app-releases.yml` (Windows MSIX)
> and `android_release.yml` (Android APK/AAB) were red on every push to `main`
> and were moved, unchanged, to `.github/workflow-templates/`:
>
> | Pipeline | Template | Restore checklist |
> | --- | --- | --- |
> | Android APK + AAB | `hazardnet-mobile-android-release.yml` | file header, [§ Android](#android-is-a-template-right-now) |
> | Windows MSIX + EXE | `hazardnet-windows-msix-release.yml` | file header, [§ Windows](#windows-is-a-template-right-now) |
>
> Release notes and assets from before that date remain on the Releases page.

## Where the executables come from

- **Android APK / AAB** — *not published from this repository right now* (see
  [§ Android](#android-is-a-template-right-now)). The
  pipeline is `apps/mobile` (an Expo app): `expo prebuild` generates the
  `android/` Gradle project from `app.json` + `eas.json`, then
  `./gradlew assembleRelease bundleRelease` builds the artifacts. It lives in
  `.github/workflow-templates/hazardnet-mobile-android-release.yml` until the
  signing secrets exist. The `android/` and `ios/` directories are generated
  artifacts and are git-ignored by design.
- **Windows MSIX/EXE** — *not published from this repository right now* (see
  [§ Windows](#windows-is-a-template-right-now)). The pipeline was:
  `apps/windows/windows/` is a **committed** Visual Studio solution (React
  Native for Windows); CI restored NuGet, built `Release|x64` with the JS bundle
  embedded (Hermes bytecode), and uploaded `HazardNet.exe` plus the packaged
  `HazardNet.appx` (renamed `.msix`).

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

- **Nothing triggers today.** No release workflow is live. Tagging `v2.3.0` and
  pushing builds nothing until a template is restored.
- **Windows:** copy `.github/workflow-templates/hazardnet-windows-msix-release.yml`
  back to `.github/workflows/` and run *App Releases (Windows MSIX)* manually
  first; it names its release `v<windows-version>-windows-<short-sha>`.
- **Android:** copy `.github/workflow-templates/hazardnet-mobile-android-release.yml`
  back after the signing secrets exist; it keeps its own trigger set and
  publishes `v<mobile-version>-android-<short-sha>`.

## Windows is a template right now

`App Releases (Windows MSIX)` (`.github/workflows/app-releases.yml`) failed on
every push to `main` in its **Build Windows x64** job — run 40253981990 is the
last one: `Resolve release metadata` passed, `Build Windows x64` failed,
`Publish Windows artifacts` was skipped. It needs no repository secrets, so the
missing-secret story does not apply: the React Native for Windows build itself
fails. It also held a `windows-2022` runner for up to 90 minutes per push.

The complete pipeline is preserved verbatim in
`.github/workflow-templates/hazardnet-windows-msix-release.yml` (install,
NuGet restore, `npx react-native run-windows --release …`, artifact staging,
`softprops/action-gh-release`, and the `Push logs on failure` steps that were
the only window into the failure). Restore steps are in its header.

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
