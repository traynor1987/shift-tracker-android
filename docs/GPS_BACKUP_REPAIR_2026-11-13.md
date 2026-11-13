# Background GPS and backup repair — verification record

## Scope and recovered source

- Production Android baseline: `1ae628d5e56a959b9f7bc4709c5640db6645c499` (2.2.73).
- Preserved native monitoring/store-aware candidate: `b4ebcf91ae2e98983bb94fb64eb6aeba5935c048` (2.2.75).
- Current hosted Web/PWA source: `24d89bf17e00403005a0890f4e1fd44b7503dd34` (2.1.250).
- Repair targets: Android 2.2.76/code 81 and Web 2.1.251. Existing package/signing identity retained.

## Implementation and release plan

1. Trace background acquisition, native checkpoint, audible notification, web replay and canonical persistence independently.
2. Extend the existing native observer with durable identity-scoped return events and direct background alerts; reconcile these independently of route replay in the PWA.
3. Trace backup creation and Android saving, reproduce payload-limit failures, add staged transfer and verified SAF writes without changing backup format or canonical history.
4. Exercise synthetic fixtures, full web regression/build and native unit/instrumentation CI. Keep test evidence outside production history.
5. Compare APK certificates to the previous stable APK, verify version metadata, and publish only after required checks pass.

## Confirmed findings before repair

Stable 2.2.73 lacks the candidate native return observer. In the 2.2.75 candidate, the observer persists background return evidence but the service only refreshes a low-importance foreground notification; it does not call the existing audible geofence alert. Web eligibility still depends on sequential route ingestion.

The screenshot's export error occurs after backup creation/validation, within serialization or file saving. Android rejects a single export above 20,000,000 characters with an unrelated file-type error. It writes on the UI thread and reports success without reopening/verifying the document; pending picker content is Activity-local. Without device logs or the actual backup size, the specific device failure cannot be proved to be the size limit.

## Acceptance still requiring the physical device

Lock/minimise the Fold during a real delivery, return to calibrated Ormskirk, and verify one prompt alert before reopening. Confirm Delivered rules, eligible Back at Store, accurate mileage and no duplicates after resume. Test normal Activity recreation separately from force-stop.

Export the actual history to Downloads and a chosen document provider; inspect the file and use the protected restore preview. Check cancellation, interruption/resume, and an in-place signed upgrade without uninstalling.

Force-stop prevents service execution until Android allows the app to run again. Permission revocation, disabled device location, disabled notification sound/DND and manufacturer battery restrictions remain OS/user controls. No physical acceptance is claimed by CI.
