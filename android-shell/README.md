# Shift Tracker Android shell — 2.2.10

This is deliberately a thin Android wrapper for the published Shift Tracker
PWA. It does not contain a copy of the web UI and therefore ordinary web
publishes continue to appear after **Refresh App** without rebuilding an APK.

Current stage:

- exact HTTPS origin lock: `dominos-shift-tracker.traynor1987.chatgpt.site`
- external top-level links open outside the privileged WebView
- no `addJavascriptInterface`; origin-restricted Web Message bridge only
- native replies use AndroidX's paired `JavaScriptReplyProxy`, so service
  states and GPS samples return through that same exact-origin bridge object
  rather than an unrelated page-level window message
- bridge reports the independent shell version and brokers only named,
  exact-origin delivery-location messages
- foreground Android GPS runs only for an active Single/Double delivery;
  the persistent low-priority notification is visible for that period
- samples keep the provider timestamp, accuracy, speed and heading and are
  held in an encrypted Keystore-backed recovery journal until the PWA's
  canonical ingestion path acknowledges them
- Delivered deliberately leaves the service running for the return journey;
  Back at Store or Cancel stops it and removes the notification
- the hosted PWA may replace a bounded rota reminder plan; Android persists
  only notification metadata, reschedules it after reboot/package update and
  keeps these alarms completely separate from the delivery GPS service
- browser `watchPosition` remains the fallback in normal PWA/browser mode and
  is suppressed while the native bridge has an active/requested delivery
- user-initiated photo capture and file selection use Android's camera/document
  apps through `WebChromeClient`; no camera, media-library or storage permission
  is requested by Shift Tracker
- privacy-sanitised JSON backups and CSV exports use Android's create-document
  picker; imports use the existing PWA validation and explicit restore step
- the launcher uses the same Shift Tracker icon as the hosted PWA

## Android 2.2.10 notifications and photo picker

Android 2.2.10 adds exact-origin bridge commands for normal notification-bar
status without changing the delivery foreground-service lifecycle. Active
cleaning and preparation tasks show the task name and Android chronometer;
paused tasks show a paused state, and completion/cancellation clears it.
Confirmed canonical Real-geofence exits and returns create short, silent native
alerts. These notifications never start location collection.

The document picker now explicitly reads every URI from Android `ClipData`,
preserves selection order, removes duplicates and retains the read grant for
each selected document. This replaces the generic WebView result parser that
could return only one item or an unreadable handle for a multi-photo choice.

The native shell is still a thin remote WebView. Web publishes remain
independent: after publishing the hosted PWA, use **Refresh App** in the
installed shell; an APK rebuild is not required for ordinary web changes.

## Android 2.2.9 GPS watchdog

Android 2.2.9 cumulatively includes the 2.2.7 portrait lock and 2.2.8 native
rota reminders. While a delivery is active, a native watchdog now detects a
60-second gap in fused-location samples, reports the stalled state, and
re-registers the location request for the same delivery ID. Recovery attempts
are rate-limited to one per minute, preserve the encrypted sample journal, and
do not create a second delivery or invent route points.

## Permanent signed APK builds

The release application ID is permanently
`site.chatgpt.traynor1987.dominosshifttracker.stable`. It installs beside the
legacy 2.2.5 debug APK, so the old WebView data does not need to be deleted
before the signed app and imported backup have been verified. Every later
release must keep this application ID, the same signing key and a larger
`versionCode`; Android can then update it in place normally.

The launcher activity is fixed to portrait so the native shell behaves like
the installed PWA and cannot rotate into a landscape layout during a shift.

The repository contains `.github/workflows/android-signed-apk.yml`. It runs the
native JVM tests, assembles the release, verifies the APK signature and package
ID, writes a SHA-256 checksum, and uploads `shift-tracker-signed-apk`. The
workflow never prints or uploads the keystore.

### One-time signing-key setup

Run the supplied helper in Termux or another trusted Java 17 environment:

```bash
cd android-shell
./scripts/create-release-keystore.sh
```

`keytool` asks for the passwords without the script putting them on the command
line. Keep the generated `.jks` in two secure private locations. Losing the
keystore or its passwords makes future updates to the signed app impossible.

Create these encrypted GitHub Actions repository secrets:

- `SHIFT_TRACKER_KEYSTORE_BASE64` — the complete one-line `.jks.base64` value
- `SHIFT_TRACKER_KEYSTORE_PASSWORD` — the keystore password
- `SHIFT_TRACKER_KEY_ALIAS` — `shifttracker`
- `SHIFT_TRACKER_KEY_PASSWORD` — the key password

Never commit the `.jks`, its Base64 copy or either password. After the secrets
exist, run **Android signed APK** in GitHub Actions and download the
`shift-tracker-signed-apk` artifact.

### Safe first migration

1. In the existing APK, generate a current Full Backup and confirm success.
2. Install the signed APK beside it; do not uninstall the existing APK.
3. Open the signed app and import the Full Backup after its validation preview.
4. Compare shifts, payroll, settings and delivery totals in both apps.
5. Grant the signed app its own Android location/notification permissions.
6. Complete the Fold GPS test plan before treating it as the operational app.
7. Keep the old APK until the signed app has passed real-shift verification.

The JSON backup intentionally does not contain separately stored IndexedDB
photo blobs. Existing photos remain safe in the old APK only while that APK
stays installed; do not uninstall it if those photos are still required.

Normal hosted-PWA changes still use ChatGPT Work → Publish → Refresh App. A
new APK is needed only when this native shell, its permissions or its Android
dependencies change.

## Permission and tracking behaviour

Foreground precise location is requested first. `Allow all the time` is a
separate, user-initiated capability: on Android 11+ the PWA's Route recording
settings explain the reason and the shell opens this app's Android settings,
where the user can choose the localized background-location option. The grant
does not start continuous tracking. Single/Double starts the location
foreground service; Delivered keeps it running; Back at Store or Cancel stops
it. With no active delivery the service is stopped and no location is sampled.

The shell keeps `allowFileAccess=false`, `allowContentAccess=false`, cleartext
disabled and the exact-origin Web Message allow-list. Camera and document
operations require a visible system picker and return only the URI the user
selected. JSON/CSV export is limited by name, MIME type and size and writes
only to the destination chosen in Android's document picker.

## Android 2.2.2 GPS recovery fix

Android 2.2.2 keeps the existing Stage 2 lifecycle and exact-origin bridge but
fixes first-fix delivery when the same fused-provider sample is encountered by
the encrypted recovery journal more than once. Already-journaled samples are
now treated as recoverable pending work, genuine storage failures remain
retryable, and encrypted file replacement uses Android `AtomicFile` rollback.
Provider coordinates, timestamps, accuracy, speed and heading are unchanged.

## Android 2.2.3 Keystore persistence fix

Android 2.2.3 lets Android Keystore generate the required randomized AES-GCM
encryption IV and stores that returned IV with the encrypted recovery journal.
The previous caller-generated encryption IV was rejected by Keystore with
`InvalidAlgorithmParameterException`. If recovery persistence ever fails for a
different reason while the exact-origin bridge is connected, the valid sample
is now dispatched live and the persistence failure remains visible in native
diagnostics. Background recovery still uses the encrypted journal normally.

## Android 2.2.4 status follow-up

Real-device testing on a Samsung Fold has now proved the complete native path:
fused fixes are acquired, encrypted recovery append succeeds, the exact-origin
bridge dispatches them, canonical PWA ingestion accepts them, route points are
stored, and the store geofence exit is detected. Android 2.2.4 does not change
that working pipeline. It keeps `lastSampleReceivedAt` current for every valid
sample and prevents temporary fused-provider availability callbacks from
reporting `WAITING_FOR_FIX` after a sample has already been accepted.

The paired hosted PWA 2.1.14 suppresses browser installation prompts only when
the trusted native bridge object is present, shows installed-native status,
and presents Break / Clock out in a professional upward-opening action tray
above the fixed navigation. Normal browser/PWA installation remains unchanged.

Shell 2.2.4 also fixes an intermittent all-black WebView after Android reclaimed
or recreated the Activity. The shell now explicitly saves/restores WebView
state, falls back to the exact trusted production URL when no page was restored,
resumes the WebView renderer with the Activity, and recreates only the WebView
if Android reports that its renderer exited. App-level WebView storage remains
intact, so PWA data, backup/restore and hosted refresh behavior are unchanged.
