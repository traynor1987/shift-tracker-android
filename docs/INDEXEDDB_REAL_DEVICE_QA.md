# Shift Tracker IndexedDB real-device QA

Run this on the Samsung Fold after Web App 2.1.62 is deployed. Keep the app open and export an Emergency Backup if any save warning appears.

## A. Normal startup and migration

- Open the existing production installation without clearing site data.
- Confirm History shift, delivery and retained GPS-point counts match the previous release.
- Confirm Dashboard/payroll totals, rota and attendance records are unchanged.
- Open one retained delivery route and confirm its map/evidence is present.
- Close and reopen the PWA/APK twice. Confirm no repeat migration prompt and no blank/new tracker.
- In Settings → Data & Backup, confirm storage status appears and reports IndexedDB.

## B. New saves

- Clock in, start/end a break, start a Single, tap Delivered, return to store and clock out.
- After each critical action, background then foreground the app once.
- Close and reopen the app. Confirm the final shift, break, delivery and mileage state remains.
- Change one small Setting, reopen an older route and confirm all historical GPS points remain.

## C. Active delivery and process recovery

- Start a delivery in the Android APK and wait for native GPS confirmation.
- Background/lock the Fold, drive a short safe test route, foreground the app and confirm route evidence continues.
- Force-stop only after a GPS point has visibly saved, reopen the APK and confirm the active delivery is restored before native tracking resumes.
- Tap Delivered and Back at Store; confirm the same delivery ID completes and no duplicate route appears.

## D. Hosted update / upgrade installation

- Receive the hosted PWA update and use Refresh App.
- Confirm IndexedDB data, history, payroll, rota, photos and active state remain intact.
- Install an APK upgrade over the current signed APK when one is eventually available; do not uninstall first. Confirm WebView IndexedDB remains intact.

## E. Backup and restore

- Export a Full Backup and confirm its shift/delivery/GPS counts look correct.
- If safe, make one harmless setting change, import that backup, review the preview and confirm Restore.
- Confirm the previous dataset is replaced only after confirmation and the imported setting returns.
- Repeat with an active test delivery only when safe; confirm native GPS stops/reconciles/resumes for the restored delivery ID.
- Select an older pre-2.1.62 backup and confirm it validates and imports through the same preview.

## F. Storage and failure UX

- Confirm Settings shows Storage used, Available quota, Status and persistent-storage status.
- Confirm denial/unavailability of persistent storage does not block normal saving.
- In remote debugging, inspect `ShiftTrackerDB` version 1 and verify the expected object stores exist.
- Verify `dominos-shift-tracker-v1` still exists as the unchanged legacy migration recovery copy after migration.
- If a controlled IndexedDB failure can be simulated, confirm the warning says the latest change may not be stored, Retry Save records a result, and Export Emergency Backup downloads the live in-memory dataset.

## Pass rule

Do not treat the migration as real-device verified until A–F pass with production data counts recorded before and after. Any mismatch, empty startup, missing route, native delivery-ID mismatch or false save-success message is a release blocker.
