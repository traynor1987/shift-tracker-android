# Automatic return and update persistence — Web 2.1.232

30 September 2026. Baseline Web 2.1.231 (`58d7db59cb8ebcdd00b0dc00019c5e7a28edf824`).

## Report and reproduced faults

The handset evidence screenshot shows start 13:19:20, Real exit 13:22:00, Real entry 13:32:10 and completion 14:06:18. The UI reports an entry-to-completion gap of 34m 7s. The driver reported an automatic calibrated-zone return before updating. Without the original saved record and event provenance, the precise historical sequence cannot be established from this screenshot alone. Existing historical records are not rewritten.

Actual-handler regression tests reproduced an overdue automatic fallback completing at callback time after resume, rather than its original due time. The calibrated carryout path also used callback receipt instead of the observed sample timestamp. Update/reopen actions could run while local persistence was pending.

## Corrections

- Calibrated-zone automatic completion uses its observed sample timestamp. Ordinary GPS-confirmed fallback uses confirmed Real entry plus the existing weekly return allowance, including when the callback runs late after resume. Manual Back at Store still uses the action clock. No Real/Domino's entry evidence is invented or replaced; weekly allowance rules and all GPS accuracy/freshness/geofence thresholds remain unchanged.
- Automatic timestamps must be finite, due, and consistent with delivery start, exit, Real entry and explicit customer-delivered boundaries. The atomic updater revalidates the latest draft, customer completion and recovery entry identity before finalizing. A queued correction or previously completed record rejects unchanged.
- Completion notifications, companion reset and prompts follow an accepted mutation. GPS ingestion retains these callbacks in its existing single atomic location batch. A rejected calibrated-zone attempt clears its same-delivery retry latch so a fresh sample can try again.
- Web installation, app reopen, browser refresh and service-worker-triggered reload wait for actual tracked local persistence. Pending writes added during the wait also block the action. A failed save or a 15-second timeout keeps the app open with a retry message; a timed-out drain stops following later saves and cannot launch an update later. This is a web-layer guard; native GPS background behavior still needs physical verification.
- Version/cache sequence advanced to Web 2.1.232 / 156. No Android/Wear package was changed.

## Verification

- Strict TypeScript check: zero errors. Production Worker build, artifact validation and rendered HTML test passed.
- Application suite: 507 passed, zero failed/skipped. Handler tests cover overdue resume, observed carryout time, manual timing, invalid and queued evidence, atomic GPS effects, rejected retry, durable IndexedDB reload and backup validation. Save-gate tests cover real pending/failed saves and actual web install/reopen handlers.
- The first full run found one obsolete hosted-backup source assertion expecting an undefined completion callback. It was updated to verify the unchanged location checkpoint mode with the accepted-mutation callback. Strict/rendered/application checks were rerun; the unchanged production build was reused.
- Lint: zero errors, 33 pre-existing warnings. Independent read-only review found no remaining critical, important or minor issue.

## Physical acceptance and history

Check a new delivery on the phone: explicit Delivered, calibrated-zone return, update/reopen, then inspect the saved completion boundary and Hustle. Automated checks establish the corrected code paths, not background-provider reliability on the handset. The previously displayed 34-minute record remains as saved; do not substitute Real entry for an unknown carryout completion or silently correct historical timing.
