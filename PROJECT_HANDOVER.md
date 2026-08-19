# Domino's Shift Tracker — project handover

This file is the recovery handover for the existing project. The checked-in
source is authoritative; older reports are historical evidence only.

## Project

- **Project:** Domino's Shift Tracker
- **Production URL:** https://dominos-shift-tracker.traynor1987.chatgpt.site/
- **Web version in current source:** **2.1.0** (`lib/nativeBridge.ts` and the
  About panel). The older lowercase `project_handover.md` records Build 215;
  a literal Build 217 marker was not found in the current source, so 2.1.0 is
  the version to trust for this checkout.
- **Android shell version:** **2.1.0** (`android-shell/app/build.gradle.kts`),
  versionCode 1, bridge version 1.

## Architecture

The web UI and domain/storage logic remain the hosted PWA. The Android project
is a thin remote WebView shell:

Hosted PWA → exact-origin Android WebView → controlled native bridge → native
Android foreground GPS service.

The shell does not bundle a copy of the PWA, does not use Capacitor
`server.url`, and is not a Trusted Web Activity.

## Phone-first update rule

**Normal web change:** ChatGPT Work → modify/publish the hosted PWA → open the
installed shell → Refresh App. No APK rebuild is required.

**Native change:** changes to Android code, permissions, native services,
dependencies, camera/picker work, notifications, or bridge/security require a
new APK. Stage 3 camera work has not started.

## Android stages verified from source

### Stage 1 — source verified

- HTTPS exact-origin lock for
  `https://dominos-shift-tracker.traynor1987.chatgpt.site`.
- AndroidX origin-restricted Web Message bridge; no
  `addJavascriptInterface` bridge.
- Untrusted top-level URLs are opened externally and cannot use privileged
  bridge messages.
- Cleartext, file access, and content access are disabled.
- Web and shell versions are reported independently.

### Stage 2 — source/test complete, device unverified

- `SINGLE`/`DOUBLE` starts the native foreground location service.
- `DELIVERED` leaves native tracking active for the return journey.
- `BACK AT STORE` and `CANCEL` stop the service and remove its notification.
- Location continues through WebView backgrounding and screen-lock lifecycle
  events in the service design (`START_STICKY` and foreground location service).
- The notification is low priority and exists only while tracking is active.
- Provider timestamp, latitude, longitude, accuracy, speed, and bearing are
  retained. Invalid samples are rejected; timestamps are not invented or
  rewritten.
- Native samples enter the same canonical PWA ingestion path used by browser
  GPS. Native-active state suppresses the browser watcher in the shell while
  ordinary PWA mode keeps the existing `watchPosition` fallback.
- Samples are acknowledged by the PWA after ingestion; the native journal is
  temporary recovery storage, not a competing permanent history database.

This is not real-device proof. The Fold/screen-lock, OEM battery, route,
duplicate-sample, and end-to-end analytics tests still need to happen.

## GPS and recovery storage

The native provider is Google Play Services fused high-accuracy location.
Samples are validated and sent to the existing canonical web ingestion and
analytics pipeline. Recovery samples are stored in an encrypted,
Android-Keystore-backed AES-GCM file, bounded to 20,000 samples, then removed
one-by-one after PWA acknowledgement.

## Permissions and security

The manifest declares fine/coarse location, foreground service,
`FOREGROUND_SERVICE_LOCATION`, notifications, and Internet. It does **not**
declare `ACCESS_BACKGROUND_LOCATION`. Runtime permission requests are made when
native delivery tracking starts. HTTPS is required; cleartext traffic is
disabled; the bridge is limited to the exact trusted origin and named message
types.

## Data and migration

The PWA remains local-first. Current domain code uses localStorage `AppData`
version 1 with `settingsRevision` 5; no PWA database replacement was added.
Android WebView storage is separate from Chrome/PWA storage. No Chrome history
or delivery data has been migrated, copied, overwritten, or reset. The native
GPS recovery file is temporary and separate from PWA history.

## Tests and build status

- `npm test`: **84 passed, 0 failed**.
- The 84 tests include the Android shell contract and Android workflow contract
  checks.
- `git diff --check`: must remain clean before packaging.
- The repository contains `.github/workflows/android-debug-apk.yml`.
- Workflow: Java 17, Android SDK platform/build-tools 35, Gradle 8.9,
  `:app:assembleDebug`, artifact `shift-tracker-debug-apk`, retention 14 days,
  manual `workflow_dispatch` plus Android-file push triggers.
- No release signing, keystore, signing password, or secret is included.
- Cloud build has **not** been proven from this recovery checkout because no
  local APK was available and the GitHub Actions run still needs to be made.
- No real Fold test has been completed.

## Build kit contents

`shift-tracker-android-cloud-build.zip` is intended to contain only the
Android shell source/build files, the workflow, the Android build README, and
this handover. It must not contain API keys, unrestricted Google keys, customer
data, GPS history, or build outputs.

## Exact next step

Build the Stage 2 debug APK in GitHub Actions, download and install it on the
Fold, then run the background/screen-lock GPS test. Do not start Stage 3 and do
not migrate data until that real-device validation is complete.

## Device test checklist

1. Open the APK and verify the hosted PWA loads.
2. Check web version 2.1.0 and Android shell 2.1.0 in About.
3. Start a test Single delivery and confirm the foreground notification.
4. Move safely, lock the screen, keep moving, unlock, and press Delivered.
5. Confirm tracking continues through the return journey.
6. Press Back at Store or cancel; confirm the notification disappears.
7. Inspect route evidence, timestamps, accuracy, geofence, mileage, traffic,
   OSM, customer detection, and duplicate-sample behaviour.
