# HazardNet App Releases — Operator Guide

HazardNet ships two native clients that live in the `apps/` workspace:

| App | Path | Stack | Executable |
| --- | --- | --- | --- |
| **HazardNet Mobile** | `apps/mobile` | Expo (React Native) for iOS/Android | `.apk` / `.aab` / `.ipa` |
| **HazardNet Windows** | `apps/windows` | React Native for Windows (UWP/WinUI, C++ host) | `.msix` / `.exe` |

This repository stores **source only** — no compiled binaries are committed.
Executables are produced by CI and published to
[GitHub Releases](https://github.com/myself-aas/HazardNet/releases) by the
`App Releases (Android APK / Windows MSIX)` workflow
(`.github/workflows/app-releases.yml`).

## Where the executables come from

- **Android APK** — `apps/mobile` is an Expo app. CI runs `expo prebuild`
  (generating the `android/` Gradle project from `app.json` + `eas.json`) and
  then `./gradlew assembleRelease`. The `android/` and `ios/` directories are
  generated artifacts and are git-ignored by design.
- **Windows MSIX/EXE** — `apps/windows/windows/` is a **committed** Visual
  Studio solution (React Native for Windows). CI restores NuGet, builds
  `Release|x64` with the JS bundle embedded (Hermes bytecode), and uploads
  `HazardNet.exe` plus the packaged `HazardNet.appx` (renamed `.msix`).

## Getting the binaries

1. Go to the [Releases page](https://github.com/myself-aas/HazardNet/releases).
2. Download the asset for your platform:
   - `HazardNet-mobile-v<version>-android.apk`
   - `HazardNet-windows-v<version>-x64.msix` (or the unpacked `.exe`)
3. Install:
   - **Android:** enable "install unknown apps", tap the `.apk`.
   - **Windows:** double-click the `.msix` (signed with a self-signed CI
     certificate — approve the security prompt), or run the `.exe` directly.

## Triggering a build

- **Tag a release:** `git tag v2.3.0 && git push origin v2.3.0` — CI builds
  both apps and attaches the artifacts to that tag's release.
- **Manual:** Actions → *App Releases (Android APK / Windows MSIX)* →
  *Run workflow*. A (pre-)release named
  `v<mobile-version>-apps-<short-sha>` is created.

## Android signing (repository secrets)

The Expo/React Native template signs release APKs with the **debug**
keystore. CI overrides this with `apps/mobile/ci-signing.gradle`, which loads
a keystore from `keystore.properties`. To sign with a real, reusable key, set
these repository secrets (Settings → Secrets and variables → Actions):

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
