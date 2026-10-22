# Shift monitoring and independent native return — 22 October 2026

Baseline Android/Wear 2.2.73: 1ae628d5e56a959b9f7bc4709c5640db6645c499.
Matching Web 2.1.244: c6c64272d2d13144e3b751a453833ac1f2cf816b, Sites 493.
Candidate Android/Wear 2.2.74 code 79; Web 2.1.245.

## Ownership and evidence

PWA remains canonical for shifts, customers, pay, tasks and completion. Native
service observes locations and checkpoints a fixed-size return evaluator without
requiring an Activity/WebView. Provider points enter the existing encrypted
journal first. Existing replay feeds canonical ingestion; acknowledgement waits
for persistence/rejection. No separate native mileage or delivery engine exists.

Real boundary remains 53.56845,-2.88802,35m with existing 12m outward hysteresis,
65m evidence accuracy ceiling, one conclusive/two borderline fixes and 60-second
rapid-reentry guard. Provider fixes must meet existing 30-second monotonic age and
session-start checks. Gaps over 60 seconds never become exact crossings. Native
exact-entry metadata does not overwrite canonical Real Hustle calculations.

Notification tap queues a shift/activity/generation-scoped request. A newly
synchronised canonical snapshot and a drained durable/dispatch replay queue are
required before forwarding it. Existing customer and store-proof checks still
apply. Expired queued taps (five minutes) require a fresh manual tap. Opt-in mode
suppresses the existing Web automatic return timers/carryout completion; manual
Back at Store is retained. When opt-in is OFF, existing automatic behavior remains.

## Sampling and privacy

- Default OFF, explicit Settings > Tracking/GPS choice.
- At store: balanced-power, requested 30s interval, 15s minimum, max batching 30s.
- High Accuracy choice: high-accuracy priority at the same at-store interval.
- Active delivery near store: existing high-accuracy 2s interval, minimum 1s,
  distance 0m, max batching 2s. Away: existing 5s, minimum 2s, 5m, max batch 10s.
- At-store coordinates are used transiently and never journalled as a route.
- Observer checkpoint contains one identity, evaluator state and timestamps,
  no coordinates. Replaced by the next delivery identity and cleared at Clock Out.
- Existing encrypted route journal cap remains 20,000 rows; no silent eviction.
- No new wake lock, boot GPS receiver or independent retry loop. Existing watchdog
  is reused, with at-store stall recovery deferred until 120s without a useful fix.

## Lifecycle support and limits

Visible Activity starts the location foreground service; pending starts recheck
opt-in and generation. Clock Out clears monitoring identity before stopping GPS.
Targeted delivery stops fall back to adaptive monitoring only within the opted-in
active shift. Screen lock/Activity destruction do not own service lifetime.
Sticky process restoration retains requested identity and encrypted route evidence.
GPS restoration can resume an existing foreground request. No network is needed.
Permission revocation/rejected service startup reports failure and needs owner
correction. Force-stop, Android user task-manager stop, reboot and manufacturer
battery kills are not promised to recover automatically; reopening is required.

## Verification scope

Independent source review found pending-start, mode-change, notification recovery,
nullability and replay ordering defects; fixed before final candidate validation.
JVM tests cover observation policy, gaps, inaccurate/duplicate fixes, false entry,
rapid reentry, sampling policy, plus existing session/journal/Wear suites.
Android instrumentation uses synthetic observations and real Android preferences
and Keystore without an Activity. It checks recreation, generation isolation,
wrong delivery, inaccurate fix, double outstanding, opt-out and encrypted journal
recovery. It does NOT emulate a physical GPS trip or prove Samsung battery behavior.

Required physical acceptance remains NOT TESTED: clock in/lock/swipe Activity,
Single and Double routes, Delivered requirements, native notification before
reopen, manual Back at Store, Clock Out, permission/GPS recovery, A→B transitions,
network-off return, Wear reconnection and in-place upgrade with existing data.

## Timing and performance

Acquisition uses provider timestamp. Observer stores first qualifying inside,
confirmation sample, wall-clock native confirmation, checkpoint persistence and
notification posting timestamps. Existing Web return diagnostics retain replay,
canonical persistence, button frame/eligibility and manual completion timestamps.
No backdating or formula changes. Requested sampling intervals are configuration,
not measured hardware rates. Battery use and physical 30–35s delay are unmeasured.
CI journal benchmarks exclude Android disk/Keystore; instrumentation covers actual
persistence but does not claim a battery improvement.

## Release

Publish only a prerelease candidate after signed build/JVM tests and instrumentation
pass. Certificate must match fdfd0db43b2d1ef9a7516aad5c78f62a16c1f6ae048eccb8c7024f3ceda5d4e1.
Main and the separate CSS-refactoring branch remain unchanged. Web patch and tests
are backed up in companion-web; actual publication must be reported separately.
