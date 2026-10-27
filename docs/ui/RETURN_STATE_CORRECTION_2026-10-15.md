# Return-state correction — Web 2.1.242

## Verified starting state

Web remote recovered with Sites source helper: 0b4c4b3bfbf2cee828a4a4d1dc384325ae0b400a, Web 2.1.241, Sites 490. Android main recovered through GitHub: 1ae628d5e56a959b9f7bc4709c5640db6645c499, Android/Wear 2.2.73/code 78. Current signed and debug CI runs for that native head succeeded. No historical ZIP used. Native source/signing unchanged in this release.

## Confirmed defect and correction

ActiveShift required canonical confirmedStoreReturnAt AND transient effectiveLocationState.presence !== outside. finishDelivery and native allowedActions already accepted canonical confirmation without that extra condition. Thus a valid canonical return could be displayed while the phone action remained locked. This is a reproducible UI eligibility contradiction, not evidence that the entire reported physical 31–32 seconds was GPS latency.

lib/returnEligibility.ts now derives readiness from the active canonical activity, Delivered requirements, validated return evidence or the existing live-location fallback, and independent optional store-presence proof. The phone button, native offered action, completion handler and finish-and-start-task guard reuse it. An ended or unconfirmed other delivery cannot enable the active one. Exact/operational evidence validation remains in the unchanged domain helpers.

The Android return notification used to be requested inside the exact-entry transition updater. It now follows the current canonical active delivery confirmation through a React effect, including operational confirmation without exact crossing. No notification is sent for ended sessions. One-session memory and sessionStorage guards prevent repeats; guards commit only after the bridge reports a successful send. Failed sends can retry on existing state/handshake/15-second companion updates. No new polling loop or bridge protocol is introduced. Independent store-proof expiry schedules a single native-readiness refresh, cancelled when a newer fix arrives.

## Timing and Real Hustle

Existing deliveryGeofenceDurations uses exact observed entry minus exit for outside Hustle. returnDelayMs is entry to Back at Store tap (or current time while waiting). The latter correctly grows from 32 to 35 seconds while waiting; the UI now labels it ENTRY → BACK TAP. No calculation, evidence timestamp, protected fence, carryout boundary, pay, mileage, reimbursement or historical record has been changed. Missing exact entry remains unavailable, not an operational timestamp substituted as a crossing.

Controlled Chrome foreground benchmark uses scripts/prepare-return-browser.mjs: actual production ActiveShift, synthetic canonical activity state, stale outside live presence, no subsequent GPS sample. Timing starts immediately before React receives the confirmation-state update and ends at the first requestAnimationFrame observing aria-disabled=false. It measures component state-to-visible-DOM eligibility, not physical GPS acquisition or a full native/persistence round trip.

Before (2.1.241): still locked after five observed frames / 339.9ms; no finite readiness latency without a subsequent presence change. After: 5.4, 8.3, 12.0, 9.0, 9.7ms across five runs, each one frame (median 9.0ms). Additional first run 10.3ms/one frame. Legacy: 11.2ms/one frame. Cloud Linux Chrome, synthetic data, production React component bundle. Frame scheduling varies with environment. These are not guarantees for a suspended WebView. No physical acceptance claimed.

## Diagnostics and limits

lib/returnDiagnostics.ts retains at most 200 events, eight session aliases, with 30-minute export retention. wallAt is UTC wall clock; monotonicMs is performance.now within the current page process; evidenceAt preserves an existing provider/evidence timestamp. IDs are replaced by export-local session aliases; no coordinates, addresses, route points or raw delivery IDs are exported. Existing diagnostic exports include returnPipeline.

Stages: sample_received is web receipt of a native sample (browser receipt is also recorded); sample_accepted/rejected records ingestion outcome and explicit stale-session, duplicate, inaccurate or pending-confirmation breadcrumbs where applicable. qualifying_inside records a current accepted inside/pending-inside evaluator sample. exact_entry and operational_confirmation are distinct; canonical_updated records publication into canonical in-memory state. persistence_completed/failed records the native ingestion save outcome. bridge_notified is a native snapshot-send attempt. action_eligible is the phone readiness state; button_frame is the next foreground animation-frame observation. notification_requested is a bridge-send attempt, not OS display acknowledgement. action_completed is successful canonical completion application. Existing aggregate local-save and native receipt/accepted-fix counters remain available.

Native provider receipt and actual Android notification display are not newly individually instrumented by this web-only change. Their physical correlation, screen-off scheduling, OS notification delivery, cold reboot and watch reconnection remain device acceptance work. Monotonic values across processes/restarts cannot be subtracted. Existing replay ordering, journal and session-isolation code is unchanged. No claim that the owner’s exact 31-second delay has been fully measured end to end.

## Automated validation

Strict TypeScript passed. ESLint 0 errors, 36 existing warnings. Production build and artifact validation passed. Full Europe/London suite: 27 MJS + 604 TS = 631 passed, 0 failed. Twenty-six additional tests versus 605 baseline: 25 readiness/notification/diagnostic/timer unit cases and one actual rendered-component regression covering both views. The rendered regression failed before the fix and passes after.

Coverage includes canonical confirmation without next GPS sample, Single/Double Delivered requirements, proof blocked state, exact gap, stale/completed delivery, invalid confirmation ordering, notification failure/retry/dedup and timer independence. Scenario-labelled readiness tests exercise pure state invariants; they are not separate real background/offline/network integration tests. Existing actual ingestion replay, stale callback, rejected accuracy, boundary/gap, offline persistence and task completion regressions also pass. Native JVM tests not rerun because no native code changed; prior CI was read and verified, not represented as a fresh local run. Read-only review found no release blockers after notification and proof-expiry corrections.

Physical acceptance: NOT TESTED. Owner should verify one real return, including Delivered state, readiness change and Android notification; if delayed, export diagnostics promptly so current-page returnPipeline timestamps can be correlated with native counters.
