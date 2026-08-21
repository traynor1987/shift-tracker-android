# Domino's Shift Tracker — project handover

This file is the recovery handover for the existing project. The checked-in
source is authoritative; older reports are historical evidence only.

## Project

- **Project:** Domino's Shift Tracker
- **Production URL:** https://dominos-shift-tracker.traynor1987.chatgpt.site/
- **Web version in current source:** **2.1.3** (`lib/nativeBridge.ts` and the
  About panel). The older lowercase `project_handover.md` records Build 215;
  a literal Build 217 marker was not found in the current source, so 2.1.3 is
  the version to trust for this checkout.
- **Android shell version:** **2.1.3** (`android-shell/app/build.gradle.kts`),
  versionCode 4, bridge version 1. The bridge version stays compatible so
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

### Stage 2 — foreground lifecycle proven; first native callback still pending

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
- APK 2.1.2 proved foreground-service startup and background/screen-lock
  survival on a real Fold: starting Single posted the persistent “Shift Tracker
  delivery GPS” notification and the service remained active through more than
  one minute of screen lock. After almost three minutes, however, no first
  native point arrived. This means the remaining fault is specifically between
  the fused request and PWA ingestion, not the permission or service lifecycle.
- The 2.1.3 diagnostic patch keeps that lifecycle unchanged and exposes each
  pipeline checkpoint without putting coordinates in diagnostics: location
  update request accepted/rejected; provider availability; cached last-location
  availability; fresh current-location availability; callback count; raw fix
  timestamp/accuracy/provider; validation rejection; encrypted recovery append;
  native trusted-WebView dispatch; PWA receipt; and canonical-ingestion result.
  It asks Fused Location Provider for a single current high-accuracy fix in
  addition to the existing continuous high-accuracy request. A cached location
  is used only if its elapsed-realtime age is at most 30 seconds and its
  supplied accuracy is at most 100 m; original timestamp and accuracy are kept.
  Continuous samples retain the existing 250 m validation limit. No coordinate
  is created, interpolated, or time-rewritten.

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
- Cloud Build #3 succeeded and its debug APK was installed on a real Samsung
  Fold. APK 2.1.2 then proved the persistent notification and locked-screen
  foreground-service lifecycle, but still received no first native location
  callback after nearly three minutes. The next cloud build is 2.1.3, which is
  narrowly limited to fused-provider/bridge/ingestion diagnostics and a
  validated initial-fix request. Background-GPS sample delivery, recovery
  delivery, and duplicate-sample behaviour remain unverified until it is
  installed and tested.
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
2. Check web version 2.1.3 and Android shell 2.1.3 in About.
3. Start a test Single delivery and confirm the foreground notification.
4. Read the diagnostic lines: bridge, foreground precision, background setting,
   FGS state and provider state, then request acceptance, provider availability,
   current/last fix status, callback count, recovery append, dispatch, PWA
   receipt, and canonical ingestion. Raw timestamp/accuracy/provider are shown;
   no coordinates are shown.
5. Move safely, lock the screen, keep moving, unlock, and press Delivered.
6. Confirm tracking continues through the return journey.
7. If desired, choose `Allow all the time` from the in-app Location settings
   guidance; verify this does not start tracking outside a delivery.
8. Press Back at Store or cancel; confirm the notification disappears and the
   diagnostic returns to stopped.
9. Inspect route evidence, timestamps, accuracy, geofence, mileage, traffic,
   OSM, customer detection, and duplicate-sample behaviour.

## Android shell 2.2.0 — bridge, background permission, photos and files

- Root cause identified for the proven-service/no-PWA-point failure: AndroidX
  `postWebMessage` delivers the native JSON as a JavaScript string, while Web
  App 2.1.10 accepted only object-valued `event.data`. Web App 2.1.11 now checks
  the exact production origin, bounds the message, parses the JSON string and
  then applies the existing per-message schema validation. Native samples keep
  their provider timestamp and accuracy and still enter the one canonical PWA
  ingestion path; browser `watchPosition` remains suppressed only when the
  trusted shell owns the active delivery.
- The PWA now understands the service's full state vocabulary instead of
  discarding `service_started`, `waiting_for_fix`, `sample_received`, provider,
  foreground and background states. Background-permission status is
  informational and does not incorrectly stop an already-running foreground
  service.
- Android 11+ background location is now a direct second-stage App Info flow
  after precise foreground permission. A Route recording settings card shows
  the current foreground/background state and lets the user open Android's
  Location settings. `Allow all the time` remains capability only: no active
  delivery means no native service and no samples.
- `WebChromeClient.onShowFileChooser` now supports the existing PWA image and
  JSON inputs. Photos use the external camera or Android document picker with a
  cache-only, non-exported `FileProvider`; no CAMERA, READ_MEDIA or storage
  permission was added. Existing IndexedDB photo retention remains unchanged.
- Backup/CSV export now uses an exact-origin, named, bounded JSON/CSV message
  and Android's create-document picker. Restore still uses the PWA's existing
  JSON validation, migration, confirmation and replacement path. Browser/PWA
  mode keeps the original Blob download and file-input behaviour. Android OS
  automatic backup remains disabled so WebView/customer data is not silently
  copied to a cloud backup.
- Android version is 2.2.0 (`versionCode` 5). The launcher icon is the same
  current Shift Tracker icon used by the PWA.

### Audit status

- Exact-origin bridge, HTTPS-only loading, external navigation, mixed-content
  blocking, disabled WebView file/content URL access, encrypted bounded native
  recovery and active-delivery-only service lifecycle remain intact.
- No OpenAI secret, Google geocoding secret, customer record, GPS history,
  photo, backup file, keystore or signing secret is included in the Android
  repository. The shell adds no broad camera/media/storage permission.
- PWA shift/settings/history stay in WebView localStorage; photo blobs stay in
  IndexedDB with the existing retention policy. Portable JSON backups contain
  the existing privacy-sanitised app data and route evidence but intentionally
  do not contain photo blobs or separately stored API credentials.
- Web App 2.1.11 production build and all 90 tests pass. The local environment
  has Java 17 but no Gradle executable/wrapper, so Android compilation must be
  verified by the existing Java 17 GitHub Actions workflow before installation.
- Security finding outside this Android patch: the public Site's Nova and
  Google geocoding endpoints keep their keys server-side, but their usage fuses
  are browser-local rather than a server-enforced per-user quota. Same-origin
  browser policy is not protection against direct scripted requests. Do not
  treat those endpoints as abuse-resistant until hosting provides an app-owned
  authentication or server-side rate-limit boundary. The user-entered Google
  Maps JavaScript key is necessarily visible to the browser and must remain
  restricted to the production site origin and only the required APIs.

### Next real-device verification

1. Cloud-build Android 2.2.0 and install it over the existing debug APK.
2. Refresh the hosted PWA and verify About shows Web App 2.1.11 and Android
   Shell 2.2.0 with the same Shift Tracker launcher icon.
3. In Settings → GPS & Routes → Route recording, open Android Location
   settings and choose Allow all the time with Precise location on.
4. Start Single/Double and confirm the notification, first real GPS point,
   Home/app-switch/lock continuity, Delivered continuation, and Back at
   Store/Cancel stop behaviour. Confirm no notification or samples when idle.
5. Take and choose a cleaning photo. Export a backup, import it, validate it,
   confirm restore, and separately export CSV. Cancelling any Android picker
   must leave existing app data unchanged.
