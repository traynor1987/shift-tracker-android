# Domino's Shift Tracker — project handover

This file is the recovery handover for the existing project. The checked-in
source is authoritative; older reports are historical evidence only.

## Project

- **Project:** Domino's Shift Tracker
- **Production URL:** https://dominos-shift-tracker.traynor1987.chatgpt.site/
- **Web version paired with this shell:** **2.1.45**.
- **Android shell version:** **2.2.6** (`android-shell/app/build.gradle.kts`),
  versionCode 11, bridge version 1. The bridge version stays compatible so
  ordinary hosted-PWA refreshes do not require an APK rebuild.

## Android 2.2.6 — Real-return and native ownership hardening

- Source lineage is verified against GitHub commit `9d75ff9` (Android 2.2.5,
  versionCode 10). That source matches the installed-version screenshot and
  contains the expected foreground service, exact-origin bridge, FileProvider,
  camera/document support and encrypted recovery journal.
- The hosted PWA remains the sole Real-geofence state machine. Its 2.1.45
  delivery-owned evidence rules, ordered exit-before-entry requirement,
  protected 35 m entry and approximately 47 m exit hysteresis are unchanged.
- Native GPS now switches from the normal 5 s / 5 m / 10 s-max-batch route
  profile to a 2 s / 0 m / 2 s-max-batch profile within 250 m of the protected
  Real centre. A 300 m exit threshold prevents sampling-mode churn. This allows
  a return to confirm after the driver parks without changing the protected
  centre, radius or Hustle formula.
- Provider fixes predating the current native delivery session are rejected,
  persisted native tracking exposes its delivery ID after Activity/process
  recovery, and the recovery journal retains only samples owned by the current
  delivery. Diagnostics include tracked ID, sampling mode, provider/receipt
  times, distance from the protected centre and recovery-queue count.
- JVM tests cover near-store selection, route mode, approach hysteresis and
  stale-provider timestamp rejection. GitHub Actions runs those tests before
  assembling the APK.
- Previous GitHub debug artifacts were audited and runs 10, 11 and 12 each have
  a different signing certificate. Therefore no new build can update the
  installed 2.2.5 APK without its now-unavailable private debug key.
- The permanent signed app uses application ID
  `site.chatgpt.traynor1987.dominosshifttracker.stable`. It installs beside the
  legacy APK for a backup/import and real-device verification period. Every
  future signed release must retain that ID, signing key and a monotonically
  increasing versionCode to support normal in-place APK updates.
- `.github/workflows/android-signed-apk.yml` reads the keystore only from four
  encrypted GitHub Actions secrets, runs native tests, builds the release,
  verifies its signature and package ID, and publishes the APK plus SHA-256.
  The private key is never committed or uploaded as an artifact.
- `android-shell/scripts/create-release-keystore.sh` creates the one permanent
  RSA-4096 signing identity locally using interactive `keytool` password input.
  The user must keep the `.jks` and passwords in at least two secure locations.

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

### Stage 2 — native GPS pipeline proven on a real Fold

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
- Real Samsung Fold testing with Android Shell 2.2.3 proved the full path:
  precise fused fix received, encrypted recovery append, native dispatch,
  `NATIVE_SAMPLE_RECEIVED`, `CANONICAL_SAMPLE_ACCEPTED`, route-point append,
  and store-geofence exit detection. Permission staging, foreground service,
  screen-lock survival, Delivered return tracking and the exact-origin bridge
  are therefore no longer the active fault area.
- Android Shell 2.2.4 changes status reporting only. Every accepted provider
  sample refreshes `lastSampleReceivedAt`; a temporary fused-provider
  available/unavailable callback reports the stream as active after the first
  accepted sample instead of reverting to `WAITING_FOR_FIX`.
- Hosted PWA 2.1.14 gives canonical ingestion higher status precedence than
  advisory provider availability. It suppresses `INSTALL PWA` only when the
  existing exact-origin native bridge is present, replacing it with a
  non-actionable installed-native status. Browser/PWA install behavior is
  unchanged.
- The active-shift Break and Clock out controls now live in a professional
  upward-opening action tray above the fixed bottom navigation in both the PWA
  and APK. The collapsed lip remains accessible; opening it overlays the
  Hustle card without shrinking the main shift UI or changing either action.
- Shell 2.2.4 fixes the intermittent black APK screen caused by creating a new
  WebView with a non-null Activity state bundle but neither restoring that
  WebView state nor loading the trusted URL. It now saves/restores state,
  resumes the WebView with the Activity, loads the exact trusted production URL
  when no page can be restored, and recreates only the WebView after a reported
  renderer exit. WebView app storage and the foreground GPS service are not
  cleared or restarted by this recovery.
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
Fold. The public hosted PWA loads in that shell. Subsequent real-device tests
proved all-time permission, the delivery-scoped foreground service, native
fused acquisition, encrypted recovery, native dispatch, canonical ingestion,
route-point storage and geofence exit. Stage 2 is working; Shell 2.2.4 is a
narrow presentation/diagnostic-state follow-up.

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

- Hosted PWA verification on 23 August 2026: production build passed,
  rendered-preview **1/1**, application tests **228/228**, and lint completed
  with **0 errors / 28 existing warnings**.
- `git diff --check`: must remain clean before packaging.
- The repository contains `.github/workflows/android-signed-apk.yml`.
- Workflow: Java 17, Android SDK platform/build-tools 35, Gradle 8.9,
  `:app:testDebugUnitTest :app:assembleRelease`, signature/package verification,
  artifact `shift-tracker-signed-apk`, retention 14 days, manual
  `workflow_dispatch` plus Android-file push triggers.
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
- No release keystore, signing password or secret is included in source or
  artifacts. GitHub Actions receives them only through encrypted repository
  secrets.
- The first cloud build failed on the JVM target mismatch above, and Cloud
  Build #2 failed on the `MainActivity.kt` issues above. The fixes are applied;
  Cloud Build #3 subsequently succeeded and its debug APK was installed on a
  real Samsung Fold.
- Real-device Android 2.2.3 testing subsequently proved fused acquisition,
  encrypted recovery append, native dispatch, PWA receipt, canonical
  acceptance, route-point append and geofence exit. Android 2.2.4 changes only
  post-fix status precedence and rolling last-sample diagnostics.
- The checkout has no Gradle wrapper or local `gradle` executable, so native
  JVM tests, compilation and signing must be verified by the Java 17 GitHub
  Actions workflow after the four signing secrets are configured.

## Build kit contents

`shift-tracker-android-cloud-build.zip` is intended to contain only the
Android shell source/build files, the workflow, the Android build README, and
this handover. It must not contain API keys, unrestricted Google keys, customer
data, GPS history, or build outputs.

## Exact next step

Create and securely retain the permanent signing keystore, configure the four
GitHub Actions secrets, push the 2.2.6 repair branch, and run **Android signed
APK**. Install it beside the legacy APK, import a freshly validated Full Backup,
and complete the Fold GPS checks below. Do not uninstall the legacy APK while
its separately stored photo blobs or data may still be required.

## Device test checklist

1. Open the signed app and verify PWA 2.1.45 / Android 2.2.6 in About.
2. Import the validated backup and compare totals with the still-installed
   legacy app.
3. Start Single inside the Real boundary; confirm notification and tracked ID.
4. Leave beyond the approximately 47 m exit threshold; confirm OUTSIDE and no
   Back-at-Store Hustle while still away.
5. Press Delivered, return through 35 m, park immediately and stop moving;
   confirm entry records promptly and Back at Store produces plausible Hustle.
6. Repeat with screen locked, app backgrounded, and a WebView reload while out.
7. Test cancellation and clock-out paths; the notification must disappear.
8. Install a later signed build with a higher versionCode over this signed app
   and confirm its imported data remains present.

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

## Android shell 2.2.1 — exact-origin reply-channel GPS fix

- Real Fold testing of 2.2.0 proved the camera picker and staged `Allow all the
  time` permission flow, but an active Single still remained at `WAITING FOR
  GPS`. The native service could be commanded through the injected
  `ShiftTrackerNative` object, while its replies were sent separately with
  `WebViewCompat.postWebMessage`; the PWA correctly refused to treat that
  unrelated page-level message as a reply from its exact-origin bridge.
- Android now retains the `JavaScriptReplyProxy` supplied only after a message
  from the exact trusted main frame and sends shell state, service diagnostics,
  validated GPS samples and file-save results back through that paired proxy.
  The proxy is cleared on navigation and Activity destruction. Android's
  documented target-origin `postWebMessage` remains only as a pre-handshake
  compatibility fallback.
- Web App 2.1.12 registers the injected object's message listener before its
  hello command, normalises only replies received through that origin-locked
  object, and keeps the existing strict origin/schema/size checks for ordinary
  window messages. This preserves the exact-origin security boundary rather
  than accepting empty-origin window messages.
- No fused-provider request, permission, service lifecycle, GPS validation,
  timestamp, accuracy, encrypted recovery, canonical ingestion, browser GPS,
  camera, backup/restore, map, hustle or delivery behaviour was changed.
- Web App 2.1.12 production build and all 91 tests pass; lint has no errors and
  retains the existing 28 warnings. Local `git diff --check` passes. The
  connected GitHub integration still cannot create a branch (`403 Resource not
  accessible by integration`), so no 2.2.1 cloud build was started from Work.
- Required verification: publish Web App 2.1.12, cloud-build/install Android
  2.2.1, start Single outdoors, and confirm the UI progresses through native
  service/waiting diagnostics to `SAMPLE_RECEIVED` and a real mapped point.
  Then confirm lock-screen continuation, Delivered continuation and Back at
  Store/Cancel shutdown. No tracking may occur while no delivery is active.

## Android shell 2.2.2 — recovery-journal first-fix correction

- Real Fold diagnostics from Android 2.2.1 proved the fused provider returned
  a legitimate 7 m fix, but the native pipeline reported `append_failed`, then
  `duplicate_timestamp`, with dispatch left at `not_attempted`. Permissions,
  foreground service startup, provider acquisition and the secure reply bridge
  were therefore working; the failure was after sample creation.
- `NativeSampleStore.append` now distinguishes a newly appended sample, an
  identical sample already safely present in the encrypted recovery journal,
  and a genuine read/write failure. A journaled sample is idempotently
  dispatched instead of being misclassified as a failed append.
- The service now marks a provider sample as observed only after it has been
  appended or recovered. A genuine journal failure therefore remains retryable
  on the next real provider callback instead of poisoning that timestamp as a
  duplicate.
- Journal replacement now uses Android `AtomicFile` while retaining the same
  AES-GCM Android Keystore encryption and compatible Base64 file format. A
  failed write is rolled back and emits a bounded, non-sensitive diagnostic
  code; no coordinates or customer data are added to diagnostics.
- Android is version 2.2.2 (`versionCode` 7). No PWA source, permission flow,
  location request, sample values, canonical ingestion, browser suppression,
  camera, backup/restore, geofence, map, hustle or delivery lifecycle was
  changed. Single/Double still starts tracking, Delivered keeps it active, and
  Back at Store/Cancel stops it.
- Required real-device verification: install the cloud-built 2.2.2 debug APK,
  start a new Single outdoors, and confirm recovery becomes `appended` or
  `already_present`, native dispatch becomes `dispatched`, PWA bridge receipt
  appears, canonical ingestion accepts the original fix, and the live map gets
  its first genuine point.

## Android shell 2.2.3 — Android Keystore AES-GCM correction

- Real Fold testing of Android 2.2.2 proved the entire native acquisition path:
  precise foreground and all-time background permission were granted, the
  foreground service was running, the provider and initial-location tasks were
  available, the callback ran, and a genuine fused fix arrived with 5 m
  accuracy. The remaining failure was therefore persistence-only.
- The full diagnostic is `write_invalidalgorithmparameterexception` (the
  console wraps the class name across lines). `NativeSampleStore` generated an
  AES-GCM IV and supplied it to Android Keystore during encryption. Keystore
  keys require randomized encryption by default and reject a caller-provided
  encryption IV. Decryption is the stage where the stored IV must be supplied.
- Encryption now calls `cipher.init(ENCRYPT_MODE, key)` without an IV, reads
  the secure nonce generated by Android Keystore from `cipher.iv`, validates
  its expected GCM length, and stores it beside the ciphertext. The existing
  AES-GCM key alias, encrypted journal format, `AtomicFile` rollback, bounded
  queue and PWA acknowledgement flow remain intact.
- A valid sample is no longer unnecessarily blocked if recovery persistence
  fails for another reason while the exact-origin bridge is connected. Android
  attempts live sample dispatch, records
  `append_failed_live_dispatched:<reason>` if successful, and reports
  `SAMPLE_RECEIVED`. If both persistence and dispatch fail, the sample is not
  marked observed so a later genuine provider callback can retry. This fallback
  does not invent, alter or interpolate coordinates, timestamps or accuracy.
- Android is version 2.2.3 (`versionCode` 8). No permission, foreground-service,
  fused-location request, exact-origin bridge, hosted PWA, canonical ingestion,
  browser suppression, geofence, map, analytics, camera, backup/restore or
  delivery lifecycle code was changed. Single/Double starts tracking,
  Delivered continues it, and Back at Store/Cancel stops it.
- Required real-device verification: install the cloud-built 2.2.3 APK, start
  a fresh Single outdoors and confirm `recoveryStore=appended`,
  `nativeDispatch=dispatched`, `lastSampleReceived` is populated, PWA bridge
  receipt/canonical acceptance appear, and the first genuine map point is
  shown. Then verify lock/background continuity and Back at Store shutdown.

## Android shell 2.2.4 — native presentation and status precedence

- Real Fold testing has confirmed that Android 2.2.3 acquires and persists
  fused fixes, dispatches them through the exact-origin bridge, and reaches
  canonical PWA ingestion, route storage and store-geofence detection.
- `lastSampleReceivedAt` now advances for every accepted provider sample.
  Fused-provider availability callbacks retain their diagnostic value but
  cannot emit `WAITING_FOR_FIX` after the delivery session has received a
  valid sample.
- PWA 2.1.14 similarly retains canonical accepted status when a later advisory
  provider state arrives. The normal validation, geofence and deterministic
  route-point rules are unchanged.
- The trusted bridge suppresses PWA installation controls inside the APK and
  displays installed-native status. Browser/PWA installation remains enabled.
- Break and Clock out retain their existing handlers and confirmations inside
  an upward-opening Shift actions tray above fixed navigation, available in
  both browser PWA and native shell layouts.
- Activity/WebView recovery now prevents a reclaimed Activity or exited WebView
  renderer from leaving a permanent black surface. The recovery reloads only
  the exact trusted hosted PWA and does not clear localStorage, IndexedDB,
  backups, photos, permissions or the active delivery foreground service.
