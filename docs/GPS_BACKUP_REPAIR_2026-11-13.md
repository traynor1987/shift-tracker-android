# Shift Tracker GPS and backup repair — release report

Date: 13 November 2026 (Europe/London).

## 1. Background return root cause

The current hosted PWA (2.1.250, `24d89bf17e00403005a0890f4e1fd44b7503dd34`) established canonical return evidence inside the same per-point ingestion path that replays the encrypted native GPS journal. Those samples are processed sequentially and durably saved. The audible return alert was dispatched by a React effect after canonical return evidence appeared. Consequently, foreground return eligibility and the sound waited behind route/mileage replay when the WebView resumed.

Stable Android 2.2.73 (`1ae628d5e56a959b9f7bc4709c5640db6645c499`) did not contain the later native return observer. The recovered store-aware 2.2.75 candidate (`b4ebcf91ae2e98983bb94fb64eb6aeba5935c048`) already observed returns on the ordered native GPS worker, but only refreshed a low-importance foreground notification; it never invoked the existing audible geofence alert. Its diagnostic timestamps were not reconciled as independent canonical web evidence.

These are code-confirmed faults. The owner's installed APK version and device logs were not available, so provider delivery/buffering and Android notification settings on that specific drive were not measured.

The requested cause separation is:

| Possibility | Finding |
| --- | --- |
| A. Native updates stop | Not established for the physical drive; existing foreground-service location declarations are present. Device/provider/battery behavior remains a physical check. |
| B. Native callbacks buffer | Native requests have bounded batching (delivery modes up to 2/10 seconds); this does not require WebView reopening. Actual provider latency was not measured. |
| C. WebView processing pauses | Native journal replay waits for a connected web consumer and is processed sequentially. |
| D. Foreground React coupling | Confirmed: the web return-alert effect needed canonical return evidence. |
| E. Mileage coupling | Confirmed shared ingestion/persistence pipeline, rather than a mileage-distance threshold. |
| F. Background alert path | Confirmed missing audible native alert invocation in the recovered candidate. Android permission/channel/DND blocking remains separate. |
| G. Resume reconciliation | Confirmed: native return diagnostics were not independent canonical input. |

## 2. Backup root cause

The screenshot's generic error is reached after initial backup creation/validation, in serialization or saving. A deterministic failure was reproduced: the original native bridge rejects a single export above 20,000,000 characters before opening the document picker, with a misleading file-type error. Pretty-printed full GPS history amplified the payload. The old implementation also wrote on the UI thread, reported success without reopening the saved file, and kept picker content only in the Activity.

The precise device-specific failing stage remains unconfirmed without the device's payload size/logs. New stage-specific diagnostics distinguish database read, preparation, validation, serialization, transfer, picker cancellation, write, verification, interruption and receipt recovery.

Review also found the bridge's temporary onmessage subscriptions could replace the main listener. A shared subscriber multiplexer now preserves concurrent GPS, drain and backup replies.

## 3. Files changed

Android production paths under `android-shell/app/src/main/java/site/chatgpt/traynor1987/dominosshifttracker/`:

- `DeliveryLocationService.kt`, `NativeReturnObserver.kt`, `NativeReturnPolicy.java`, `NativeDrainPolicy.kt`, `NativeSampleStore.kt`.
- `NativeShiftState.kt`, `NativeStoreProfile.kt`, `NativeTrackingPolicy.kt`, `TrackerNotifications.kt`, `MainActivity.kt`.
- `NativeFileExport.java`.

Web production paths:

- `components/ShiftTrackerApp.tsx`.
- `lib/nativeReturnEvidence.ts`, `lib/nativeBridge.ts`, `lib/domain.ts`, `lib/returnEligibility.ts`, `lib/storeProfiles.ts`.
- `lib/backup.ts`, `lib/backupExport.ts`, `lib/backupExport.worker.ts`, `lib/backupExportData.ts`, `lib/indexedDbStorage.ts`, `lib/storage.ts`.
- `public/sw.js`, `public/version.json` and release metadata.

Regression fixtures cover the corresponding native policies/persistence and web bridge, backup, store, return and actual React task handlers. Release changes include both Gradle version declarations, the signed workflow and `android-shell/scripts/verify-signing-continuity.sh`. No production stylesheet, payroll formula, Ormskirk boundary or carry-out calibration was changed.

## 4. Native return behavior

The foreground location service owns acquisition and evaluates qualified return evidence on its ordered worker after journal persistence. Events retain stable event ID, shift/delivery/store identity, store revision, generation, actual acquisition timestamps, accuracy, native source and acknowledgement state. A bounded 64-event ledger and checkpoint survive observer recreation. Stale/future/invalid fixes, old deliveries, incomplete Delivered state and unverified store profiles fail closed.

A qualified event invokes the existing native audible geofence notification without the WebView. The web receives that event before normal replay, validates the active canonical shift/delivery/profile, saves return evidence independently of mileage, and acknowledges only after successful IndexedDB persistence. Native owns the chime for these events, preventing a second web alert.

Back at Store becomes eligible from the saved event. An explicit completion tap captures its original time, drains a bounded watermark of already-persisted route samples, and then finalises the delivery. New fixes cannot indefinitely extend that barrier; a drain error leaves the delivery open. This prevents early completion from dropping queued mileage. The event itself never completes a delivery, invents Delivered actions or replaces an unobserved GPS crossing with an exact one.

Shift-long monitoring defaults on when no preference was saved; an explicit off preference is respected. Idle/near-store/moving states retain adaptive monitoring. Maghull automation remains gated by its accepted physical calibration; it never receives Ormskirk's boundary. Ormskirk coordinates and radius are unchanged.

## 5. Backup behavior

Normal export waits for pending local saves, then a worker reads a consistent readonly canonical IndexedDB snapshot including historical and active shifts, separated GPS routes, payroll and store identities. Export reads preserve persisted record identities without rerunning loader migrations. Existing Full Backup format 1 and protected restore validation remain in use. Emergency backup retains its explicit in-memory fallback.

New Android shells negotiate bounded 48 Ki-character chunks with acknowledgements into private disk staging. Surrogate-pair boundaries are preserved. SAF lets the owner choose a document destination without broad storage permissions. A worker writes the selected URI, reopens it, and compares byte length plus SHA-256 to the staged file before returning verified success. Native staging is bounded at 512 MiB and oversized exports fail explicitly.

Cancellation is distinct from success. Interrupted transfers become retryable errors. Pending request IDs and terminal receipts survive resume/recreation; no raw backup content is stored in browser receipt metadata. Older APKs retain the existing small-file path and receive an explicit update requirement for oversized exports. Failed/cancelled exports do not mutate canonical history; successful export retains the established last-backup metadata update.

## 6. Verification

- Final web `TZ=Europe/London npm test`: strict TypeScript, production build, artifact validation, 34/34 rendered MJS checks and 670/670 TypeScript application tests passed at `c838ad7cc5ebb8cff1feae2d336fb71a96bb0efc`.
- Focused GPS/bridge/task set: 135/135 passed.
- Export tests cover empty data, historical/active shifts, payroll, multiple stores, a 225,000-point synthetic GPS history, format compatibility and restore round-trip. Native transport tests cover over-20-million-character content, Unicode chunk boundaries, cancel/write/verification failure, dropped callbacks and recovery.
- Native build: 127/127 Android/Wear JVM tests passed, zero skipped/errors/failures. The signed workflow also runs Wear lint, signature/package checks, a pinned production certificate check and comparison with the previous stable APK.
- Android instrumentation: 18 tests on API 35 / Android 15 emulator. Final run and publication status are recorded below.
- Stale tests were repaired without changing production UI: the legacy CSS guard now permits only its already-existing scoped monitoring-control suffix; the store-backup source guard follows the new canonical worker path.

## 7–9. Release and source provenance

- Web target: 2.1.251, service-worker cache sequence 169; existing production site: https://dominos-shift-tracker.traynor1987.chatgpt.site.
- Native target: 2.2.76, versionCode 81; package `site.chatgpt.traynor1987.dominosshifttracker.stable`.
- Production signing certificate SHA-256: `fdfd0db43b2d1ef9a7516aad5c78f62a16c1f6ae048eccb8c7024f3ceda5d4e1`.
- Native repair commits on GitHub: `ca5a25952cd9ccf2a3ab6f385490b761b682085a` (backup), `866b3d5feea360109cc853763440ec5b6d63a181` (GPS), `ee9988b7d763fd67dcd677c928d1a3b42cb32c30` (bridge), `e3cf0552f4e2a36268e929ced0bfe24ff10be6d2` (original tap time), `4ed5ff6ab2bc0fda973f4103f630d315fc7daa46` (interrupted export recovery).
- Exact full Web 2.1.251 source backup on GitHub: `74407ea5fc3315eca571227f67b1275188b6d2be` on `fix/web-gps-backup-2026-11-13`; its tree matches the tested Sites source.
- Final native verification run: https://github.com/traynor1987/shift-tracker-android/actions/runs/43513758011.

### Verified publication

- Web 2.1.251 is **published**, Sites release 501, deployment succeeded at 22:01:27 UTC on 13 November 2026. URL: https://dominos-shift-tracker.traynor1987.chatgpt.site.
- Deployed Sites source: `fce8e6d40f4bbd55270b9a298d00606df7f1b889`. Its tree `f3588a4625dc71918f4675c372d94cdf50029e24` exactly matches GitHub backup commit `74407ea5fc3315eca571227f67b1275188b6d2be`.
- After the full regression run, release-only changes updated the download link and final APK checksums. The final source passed a fresh production build/artifact validation and 15/15 updater, version, channel, modal and save-gate checks.
- Android 2.2.76/code 81 is **published as stable**, not draft/prerelease: https://github.com/traynor1987/shift-tracker-android/releases/tag/v2.2.76.
- Release target: `4ed5ff6ab2bc0fda973f4103f630d315fc7daa46`. Production workflow https://github.com/traynor1987/shift-tracker-android/actions/runs/43514540027 completed successfully, including signed build, instrumentation and gated publication.
- Phone APK: https://github.com/traynor1987/shift-tracker-android/releases/download/v2.2.76/Shift-Tracker-2.2.76.apk.
- Published phone SHA-256: `dd8efa37389d36fd6d72302f90ebbf0c40476bbd88c09ef5aca874cd16fc0dab`.
- Published Wear SHA-256: `b9d0759fd763089101c4a77efa007151f4c88973f7a77af043ca07bca85cead3`.
- Downloaded published release JSON, GitHub asset digests, signed build logs and deployed PWA metadata agree on both hashes. Main-branch rebuild hashes differed from the earlier branch build, so only the actual published hashes were deployed.
- Both APKs passed signing verification with the pinned certificate and previous stable signing identity. Package and increasing versionCode support an in-place update; installation on the owner's physical Fold remains untested.


## 10. Physical owner acceptance still required

1. Update in place; do not uninstall. Confirm existing history, active state and payroll remain present.
2. On the Fold running Android 17, clock in, start Single/Double, record the required Delivered actions, minimise and lock the phone, then return to calibrated Ormskirk. Verify one audible return notification before reopening.
3. Reopen: eligibility should already be correct. Tap Back at Store promptly and verify the original tap time, complete mileage and no duplicate return/customer/reimbursement records. Repeat with normal Activity destruction and interrupted connectivity.
4. Download a full real-history backup to Downloads and another chosen provider. Locate the JSON file and inspect the protected restore preview/counts. Check cancellation and background/resume; perform any actual restore only through the existing safeguarded flow.
5. Confirm an uncalibrated Maghull shift produces no automatic store transition. Observe shift-long battery use on the real device.

Physical Fold/background/Samsung document-provider acceptance and battery measurements have not been performed. Android force-stop prevents background execution until the app is allowed to run again. Revoked location permissions, disabled device location, notification-channel sound/DND and manufacturer battery restrictions remain OS/user controls. Existing location FGS permissions/type are retained; no broad storage permissions were added.

Android references: https://developer.android.com/develop/background-work/services/fgs/service-types and https://developer.android.com/training/data-storage/shared/documents-files.
