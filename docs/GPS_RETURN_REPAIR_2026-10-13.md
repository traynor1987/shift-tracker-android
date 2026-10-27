# Web 2.1.233 — GPS return recovery

An accurate fix inside the protected store boundary after a GPS gap previously set the entry as unobserved, but subsequent fixes never made the run eligible for automatic completion. Two less accurate fixes could hide the same gap by measuring continuity from the first candidate rather than its predecessor.

This release retains the original continuity status throughout confirmation and drops pending candidates across gaps longer than 60 seconds. Page-recovery evaluators seed their last sample time from geofence-eligible retained route fixes and known evidence and mark initial crossing continuity unknown, so recreation between pending confirmation samples cannot turn a gap into an observed crossing. Restore/import evaluators use the same conservative continuity rule.

A separate optional `storeReturnConfirmedAt` records an actual, evaluator-confirmed inside fix after all customers were explicitly Delivered and after the same run’s observed exit. It is operational evidence, not an exact boundary-crossing timestamp. Automatic completion, manual return and companion actions can use it; exact Hustle calculations continue to require observed exit/entry evidence. Completion remains anchored to the original confirmation plus allowance, rather than reopen time. Fresh store-presence proof stays required if enabled.

The field is optional, validated on backup import, and persists through the existing canonical IndexedDB save/reload path. No schema reset, GPS boundary movement, historical repair or Android APK update is included.

Eleven new regression tests cover gap continuity, expired candidates, operational recovery without fabricated crossing timing, rejected uncertain/outside/pre-customer fixes, the actual completion handler, canonical save/reload and malformed backup data, and actual GPS ingestion after page recreation with a retained native fix. The first four failed against the baseline before implementation. The completion handler test also exposed its original exact-return gate before that gate was repaired. Review regressions cover rejected old fixes, poor-accuracy continuity seeds, undo/re-Delivered, and exact entry preceding Delivered. Invalidated operational evidence can be refreshed without editing the old exact entry.

Closed-app limit: Android’s existing foreground service and journal remain unchanged. A fully destroyed WebView cannot run JavaScript immediately; retained fixes are reconciled on reopening. This release does not claim independent native return alerts/completion, force-stop tracking, corrected native watchdog health or replay/live ordering. Those native audit findings still require a signed native milestone. No physical-device acceptance is claimed.

Device acceptance: update the web app to 2.1.233, then test one normal delivery, one locked/background delivery and one closed/reopened delivery. Confirm the existing run completes once, no timer inflation occurs, and uncertain crossing timing is labelled honestly. Export diagnostics immediately if GPS still fails to return.

Release verification: `TZ=Europe/London npm test` passed strict TypeScript, production build and artifact validation, one rendered HTML test and 518 TypeScript tests. Independent code review found no remaining critical or important defects after the review corrections. No physical-device test has been performed.
