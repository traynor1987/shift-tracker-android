# Completion pass — Web 2.1.229

Date: 30 September 2026. Baseline: Web 2.1.228, source `7e7ebc0e94cf667931815ba0b8d22f3a353c4808`. Native baseline: Android/Wear 2.2.70, versionCode 75, source `1d0f29a26b262f48b23de8671361d8e1a62d533a`.

## Changes

- Added compact GPS and local-save status on the active shift. GPS health observes provider receipts independently of accuracy/geofence acceptance and retained map points. Route-only tracking, early dispatch and carryout demand follow the existing watch rules; a fresh browser fallback supersedes an old native fix.
- Local status follows actual IndexedDB promises, including restore/fresh operations. A rejected write is never labelled saved. The small status component polls without adding app-wide rerenders to each GPS save.
- Added a normal Settings diagnostics export and a tracking-status detail dialog. The export allowlists versions, numeric/boolean native health and bounded performance aggregates; it excludes routes, customer details, recovery keys and tracker records.
- Added a read-only clock-out checklist for unfinished delivery, missing mileage, break details and outstanding task outcomes. Clock-out behaviour, saved finish time, task transitions and Management Blocked remain intact.
- Consolidated off-shift review, payslip discrepancy and full-backup reminders under Needs attention. Payslip comparisons reuse the existing tolerances and before-tracker adjustments.
- Optional developer log storage failures no longer interrupt GPS processing. Hosted backup respects the saved enabled/disabled preference, and individual hosted fetches time out after 45 seconds.
- Corrected Nova's raw Responses API parsing: address JSON is read from completed output messages. Incomplete/refusal/malformed responses do not become an address candidate.
- Updated the bundled Android fallback to the existing signed 2.2.70 release. The downloaded APK hash matches its published manifest, and its embedded signing-certificate hash matches the existing certificate. No new APK or native GPS algorithm was created by this pass.
- Repaired fourteen stale source-format test failures while preserving the original behavioural/accessibility guards.

## Hosted safeguards

The new Drizzle migration adds durable request budgets. Existing data migrations are unchanged.

| Boundary | Enforcement |
| --- | --- |
| New capabilities | Atomic insert/count; at most 4 new devices per UTC day and 64 total; denied attempts consume no permanent slots |
| Nova paid requests | Existing registered capability; 3 global/minute, 50/device/day and globally/day, 500 global/calendar month; bounded image body, 30-second upstream timeout and 768 output tokens |
| Google geocoding | Existing registered capability; 10 global/minute, 150/device/day and globally/day, 5,000 global/calendar month; bounded JSON and 20-second upstream timeout |
| Hosted writes | 120/device/hour; 256 MiB/device/day and globally/day; checkpoint bodies at most 32 MiB, report bodies at most 5 MiB |
| Existing object IDs | Conditional R2 create prevents overwriting a valid backup/report |
| Checkpoint dates | Reject already-expired or implausibly future dates; downloads reject expired checkpoints immediately |
| Expired bytes | Activity-driven cleanup deletes R2 bytes before database metadata; failures remain retryable |

These are capped device capabilities, not account-bound owner authentication. Public enrollment can still be exhausted within its ceilings. Cleanup runs on authenticated hosted activity; an idle site does not guarantee deletion at the exact expiry instant. Server budgets use UTC calendar windows; existing client ledgers retain their rolling windows. Failed upstream attempts consume request allocations conservatively.

Refresh older installed web copies after publishing: paid requests now require the capability headers supplied by this version. Hosted recovery still uses the existing user-held encryption/recovery key. The public site's audience was preserved.

## Verification

- Production build and packaged Worker/default.fetch validation passed.
- Rendered-artifact HTML test passed.
- Full application suite: **488 passed, 0 failed, 0 skipped**.
- Lint: **0 errors**, 33 existing warnings.
- Final `npm audit`: **0 vulnerabilities**, including development dependencies. This reports known dependency advisories, not a complete application security certification.
- Strict TypeScript: **138 existing errors** in both baseline and final tree with the same final dependency installation. Comparison found no additional error; only the printed order of a union of Pick keys differs. Strict type checking is still outstanding repository debt.
- Real SQLite tests exercised concurrent durable budgets and enrollment, denied retries, next-day recovery and total registration ceiling.
- Real fake-indexeddb journey exercised offline shift persistence, quota-write rejection, reload, AES-GCM checkpoint round trip, replacement and restore. Pay, mileage, delivery, route points and Management Blocked outcomes survived, and recovery readiness returned ready.
- Independent code review identified and verified fixes for enrollment quota consumption and native/browser GPS-status precedence.

Browser interaction/layout QA and physical-device GPS acceptance were unavailable. These automated checks do not establish that every handset freeze or background-provider problem is resolved. No real customer data or paid provider call was used in verification.

## Physical acceptance still required

1. Refresh until Settings reports Web 2.1.229, alongside Android/Wear 2.2.70. Confirm light/dark layouts and narrow Fold screens, tracking details/close controls and diagnostics export.
2. Start a real delivery, background the app, lock the screen for several minutes and resume. Check elapsed time, fresh provider status, responsive controls and eventual route catch-up.
3. Test route recording with location assistance off; GPS should still report receiving fixes. Uncertain accuracy must not fabricate store-return evidence. If native tracking fails and browser fallback starts, fresh browser fixes should update health.
4. Exercise Delivered, Back at Store, task pause/resume and Management Blocked. Check the clock-out checklist and post-shift review without changing recorded task outcomes or timing.
5. While offline, save work and reload; then reconnect and confirm verified hosted recovery. Keep the recovery key separately, verify Full Backup export/import, and retain diagnostics if a stall recurs.

## Rollback

Republish the previously saved Web 2.1.228 site version if an operational regression requires rollback. The migration only adds a table and leaves existing records compatible. Refresh installed clients to the rolled-back web version. Native 2.2.70 remains the same existing signed release.
