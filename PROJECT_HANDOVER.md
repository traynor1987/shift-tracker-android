# Domino's Shift Tracker — project handover

This file is the recovery handover for the existing project. The checked-in
source is authoritative; older reports are historical evidence only.

## Project

- **Project:** Domino's Shift Tracker
- **Production URL:** https://dominos-shift-tracker.traynor1987.chatgpt.site/
- **Web version in current source:** **2.1.2** (`lib/nativeBridge.ts` and the
  About panel). The older lowercase `project_handover.md` records Build 215;
  a literal Build 217 marker was not found in the current source, so 2.1.2 is
  the version to trust for this checkout.
- **Android shell version:** **2.1.2** (`android-shell/app/build.gradle.kts`),
  versionCode 3, bridge version 1. The bridge version stays compatible so
  ordinary hosted-PWA refreshes do not require an APK rebuild.

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

### Stage 2 — startup diagnostics and staged permissions patched, real-device first sample still pending

- `SINGLE`/`DOUBLE` starts the native foreground location service.
- `DELIVERED` leaves native tracking active for the return journey.
- `BACK AT STORE`, `CANCEL`, and clock-out finalisation stop the service and
  remove its notification.
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
- The PWA-to-shell listener is registered before the hello response can arrive.
  The shell now reports `SERVICE_NOT_STARTED`, `PERMISSION_MISSING`,
  `LOCATION_PROVIDER_DISABLED`, `WAITING_FOR_FIX`, and `SAMPLE_RECEIVED`, plus
  foreground/background permission, notification permission, provider, service,
  and last-sample diagnostics without exposing coordinates in the diagnostic
  payload.
- Foreground precise location is requested first while the Activity is visible;
  notification permission is requested separately before the foreground
  service starts. The manifest also declares `ACCESS_BACKGROUND_LOCATION`.
  When the user chooses the optional all-time capability, Android requests
  background permission in a separate second stage. On Android 11+ the runtime
  dialog cannot grant “Allow all the time”, so the shell then opens Shift
  Tracker App info and reports the return result to the PWA; the user chooses
  the localized background option under Permissions → Location. This is
  capability only: the service remains delivery-session-scoped.
- Native diagnostics now distinguish `FOREGROUND_PERMISSION_GRANTED`,
  `BACKGROUND_PERMISSION_MISSING`, `BACKGROUND_PERMISSION_GRANTED`,
  `SERVICE_ACTIVE`, `WAITING_FOR_FIX`, and `SAMPLE_RECEIVED`, with separate
  foreground/background, notification, provider, service, and last-sample
  fields. When the secure native bridge is available, the PWA claims native GPS
  ownership before starting a delivery and does not show the browser GPS
  permission prompt; normal browser/PWA mode keeps its existing prompt and
  `watchPosition` fallback.

Cloud Build #3 succeeded and its debug APK was installed on a real Samsung
Fold. The public hosted PWA now loads in that installed shell. The first Fold
test of APK 2.1.1 reached the native diagnostics but remained at the foreground
permission state, and Android Location settings did not yet expose “Allow all
the time”. This 2.1.2 patch adds the missing separate background request and
settings return path. A first native GPS sample is still not real-device-proven;
the next debug APK must be installed before repeating the test.

## GPS and recovery storage

The native provider is Google Play Services fused high-accuracy location.
Samples are validated and sent to the existing canonical web ingestion and
analytics pipeline. Recovery samples are stored in an encrypted,
Android-Keystore-backed AES-GCM file, bounded to 20,000 samples, then removed
one-by-one after PWA acknowledgement.

## Permissions and security

The manifest declares fine/coarse location, `ACCESS_BACKGROUND_LOCATION`,
foreground service, `FOREGROUND_SERVICE_LOCATION`, notifications, and Internet.
Foreground precise location is requested first, notification permission is
requested separately, and background location is requested only afterward. On
Android 11+ the separate background request is followed by the app's App Info
→ Permissions → Location screen because the runtime dialog cannot grant the
all-time option. HTTPS is required;
cleartext traffic is disabled; the bridge is limited to the exact trusted
origin and named message types.

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
- Cloud-build JVM target fix: `android-shell/app/build.gradle.kts` now sets
  Android Java source/target compatibility to Java 17 and Kotlin's typed
  `compilerOptions.jvmTarget` to `JvmTarget.JVM_17`, with a Kotlin JVM
  toolchain of 17. This matches the existing Java 17 Actions environment and
  fixes the `compileDebugJavaWithJavac` 1.8 versus `compileDebugKotlin` 17
  incompatibility reported by the first cloud build.
- Cloud Build #2 reached Kotlin compilation and exposed four `MainActivity.kt`
  errors. The fix enables Android `BuildConfig` generation, uses a typed
  `JSONObject.apply` payload builder for the shell-ready message, and matches
  the current `ComponentActivity` permission callback signature with
  `Array<String>`. Exact-origin bridge checks, hosted-PWA loading, runtime
  permissions, native foreground GPS, canonical PWA ingestion, browser-GPS
  suppression, and encrypted recovery storage are unchanged.
- No release signing, keystore, signing password, or secret is included.
- The first cloud build failed on the JVM target mismatch above, and Cloud
  Build #2 failed on the `MainActivity.kt` issues above. The fixes are applied;
  Cloud Build #3 subsequently succeeded and its debug APK was installed on a
  real Samsung Fold.
- The current public-Site Fold test has passed the hosted-PWA loading step but
  has not yet received the first native sample. Background/screen-lock GPS,
  notification persistence, recovery delivery, and duplicate-sample behavior
  remain unverified until the 2.1.2 permission-flow patch is installed and
  tested.
- Local `npm test` remains **84 passed, 0 failed**. `npm run lint` completes with
  the repository's existing warnings and no errors. The checkout has no Gradle
  wrapper or local `gradle` executable, so `:app:assembleDebug` must be verified
  by the existing Java 17 GitHub Actions workflow.

## Build kit contents

`shift-tracker-android-cloud-build.zip` is intended to contain only the
Android shell source/build files, the workflow, the Android build README, and
this handover. It must not contain API keys, unrestricted Google keys, customer
data, GPS history, or build outputs.

## Exact next step

Run the Android debug workflow for this patch, install the new APK on the Fold,
start Single/Double, and read the in-app native diagnostic line. It should
progress from `SERVICE_NOT_STARTED` to `WAITING_FOR_FIX` to `SAMPLE_RECEIVED`.
Then test Home/app switch/screen lock, Delivered, Back at Store, Cancel, and
the optional `Allow all the time` settings flow. Do not start Stage 3 or migrate
data.

## Device test checklist

1. Open the APK and verify the hosted PWA loads.
2. Check web version 2.1.2 and Android shell 2.1.2 in About.
3. Start a test Single delivery and confirm the foreground notification.
4. Read the diagnostic line: bridge, foreground precision, background setting,
   FGS state, and provider state are shown without coordinates.
5. Move safely, lock the screen, keep moving, unlock, and press Delivered.
6. Confirm tracking continues through the return journey.
7. If desired, choose `Allow all the time` from the in-app Location settings
   guidance; verify this does not start tracking outside a delivery.
8. Press Back at Store or cancel; confirm the notification disappears and the
   diagnostic returns to stopped.
9. Inspect route evidence, timestamps, accuracy, geofence, mileage, traffic,
   OSM, customer detection, and duplicate-sample behaviour.
