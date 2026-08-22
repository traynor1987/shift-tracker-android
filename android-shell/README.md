# Shift Tracker Android shell — 2.2.3

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
- browser `watchPosition` remains the fallback in normal PWA/browser mode and
  is suppressed while the native bridge has an active/requested delivery
- user-initiated photo capture and file selection use Android's camera/document
  apps through `WebChromeClient`; no camera, media-library or storage permission
  is requested by Shift Tracker
- privacy-sanitised JSON backups and CSV exports use Android's create-document
  picker; imports use the existing PWA validation and explicit restore step
- the launcher uses the same Shift Tracker icon as the hosted PWA

The native shell is still a thin remote WebView. Web publishes remain
independent: after publishing the hosted PWA, use **Refresh App** in the
installed shell; an APK rebuild is not required for ordinary web changes.

## Cloud debug APK builds

The repository contains `.github/workflows/android-debug-apk.yml`. It builds
only when Android-shell files change or when you manually choose **Run
workflow** in GitHub Actions. The workflow installs Java 17, Android SDK 35
and Gradle 8.9 on a GitHub-hosted runner, then uploads the automatically
debug-signed `app-debug.apk` as a short-lived Actions artifact.

This is deliberately a debug build only. There are no release-signing keys,
keystores or signing secrets in this project. Do not use the debug APK for
Play Store distribution.

### Phone-only setup

The APK build does not need the full PWA source. A GitHub repository only needs
the `android-shell/` directory and `.github/workflows/android-debug-apk.yml`.
The easiest phone workflow is:

1. Create a private GitHub repository from the GitHub mobile app or website.
2. Download the Android-shell build kit from this Work conversation and extract
   it on the phone. It contains the two paths above.
3. From a phone terminal such as Termux, initialise the extracted folder, add
   the new GitHub repository as `origin`, commit it and push the `main` branch.
   GitHub will ask for your username and a fine-grained token with repository
   Contents write access; create that token in GitHub's browser settings and
   do not put it in the source or workflow.
4. Open the repository's **Actions** tab, choose **Android debug APK**, press
   **Run workflow**, and select `main` if GitHub has not already started the
   build from the push.
5. Open the completed run, scroll to **Artifacts**, download the
   `shift-tracker-debug-apk` ZIP, extract it and install `app-debug.apk` on the
   Android device. Android may require allowing installs from the browser or
   file manager used for the download.

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
