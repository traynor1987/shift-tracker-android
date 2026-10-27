# Shift Tracker Resume and GPS Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the existing Shift Tracker responsive after background/resume and ensure native GPS samples are retained until accepted route data is durably saved.

**Architecture:** Keep existing PWA/IndexedDB ownership and Android's encrypted GPS recovery journal. Reduce unnecessary render/resume work, make native ingestion completion await canonical persistence, and add bounded Android WebView renderer recovery without clearing WebView storage or stopping the GPS service.

**Tech Stack:** React 19, TypeScript, IndexedDB, Android WebView, Kotlin, AndroidX WebKit, Node test runner, Vinext/Sites.

**Spec:** `docs/superpowers/specs/2026-09-26-resume-gps-reliability-design.md`

## Global Constraints

- Preserve all shifts, tasks, deliveries, routes, settings, photos, backups, IndexedDB and WebView storage.
- Keep strict validation and existing delivery/GPS/Hustle timing semantics.
- Never acknowledge an accepted native route sample until its canonical IndexedDB transaction succeeds.
- A stale, duplicate, or wrong-delivery sample must never mutate a newer delivery.
- Web release version advances from 2.1.214 and service-worker cache sequence advances.
- If Android native source changes, retain package ID `site.chatgpt.traynor1987.dominosshifttracker.stable`, use version code greater than 14, and use the existing signing identity.
- Publish only to `https://dominos-shift-tracker.traynor1987.chatgpt.site` after production build and Sites artifact validation pass.

## Review Focus

- A visibilitychange/pageshow pair arrives while there are no expired routes: test proves no full AppData clone or save occurs.
- Clock-only renders with unchanged AppData: test proves analytics projection is reused and no history timing recalculation runs.
- Accepted native sample persistence rejects: test proves the Android journal retains it and retries do not duplicate a route point.
- A queued sample belongs to a prior delivery: test proves it is rejected without mutating the new delivery.
- A responsive page resumes slowly on a weak connection: Android test proves recovery does not reload a healthy page or clear state.

---

### Task 1: Remove avoidable history work from PWA renders and resume cleanup

**Files:**
- Modify: `components/ShiftTrackerApp.tsx`
- Modify: `lib/domain.ts`
- Test: `tests/domain.test.ts`
- Test: `tests/serviceWorker.test.ts` only if an existing lifecycle contract must be pinned

**Interfaces:**
- Consumes: existing `expectedDeliveryHustleShifts(data)`, `reportingShifts(data)`, and `cleanupExpiredRoutes(data, now)` behavior.
- Produces: `hasExpiredRoutes(data: AppData, now?: Date): boolean`, `cleanupExpiredRoutesIfNeeded(data: AppData, now?: Date): AppData` (same input object when no work is due), and stable memoized reporting/Hustle projections in the root component.

- [ ] Add `tests/domain.test.ts` cases named `route cleanup preflight returns the same AppData when no route is expired` and `route cleanup copy expires only routes at or before the exact boundary`; assert reference identity for no-op and preservation of all non-expired records.
- [ ] Run the targeted domain tests and confirm the missing preflight behavior fails.
- [ ] Add `questionable beta Hustle analysis calculates route timings only for completed single/double deliveries` in `tests/domain.test.ts`, preserving existing eligible-delivery results.
- [ ] Memoize reporting/Hustle projections so clock-only renders with the same data/settings references reuse their results.
- [ ] Update resume cleanup to call `cleanupExpiredRoutesIfNeeded`; save only when the returned AppData is a new object. Let queued React state updaters receive the latest state so paired lifecycle events do not duplicate expiry work.
- [ ] Run `node --experimental-strip-types --test tests/domain.test.ts tests/serviceWorker.test.ts` and verify all pass.
- [ ] Commit the PWA performance change.

### Task 2: Tie native sample acknowledgement to durable PWA persistence

**Files:**
- Modify: `components/ShiftTrackerApp.tsx`
- Modify: `lib/nativeBridge.ts` if acknowledgement sequencing needs a typed bridge helper
- Modify: `lib/indexedDbStorage.ts` only if the current save promise does not already resolve on transaction completion
- Test: `tests/nativeBridge.test.ts`
- Test: `tests/indexedDbStorage.test.ts`

**Interfaces:**
- Consumes: existing `applyLocationReading(position, deliveryId)`, `saveData(draft)`, and `acknowledgeNativeLocationSample(sampleId)`.
- Produces: a sample-processing result distinguishing `persisted` from deliberately `rejected`, and a promise that resolves only after required canonical persistence succeeds.

- [ ] Extract the acknowledgement decision into `lib/nativeLocationSync.ts` as `flushNativeSamples(samples, ingest, acknowledge): Promise<void>`. Add failing tests named `native sample acknowledgement waits for persisted ingestion`, `native sample remains pending when persistence fails`, and `native replay rejects a previous delivery without mutating the active delivery` in `tests/nativeBridge.test.ts`.
- [ ] Run the targeted tests and confirm accepted samples are currently acknowledged before the durable transaction resolves.
- [ ] Make native sample ingestion return a discriminated result (`persisted` or `rejected`) and await every AppData save caused by that sample before resolving `ingest`; a thrown storage error stops the batch and leaves the sample unacknowledged.
- [ ] Keep intentional stale, duplicate, non-live, and wrong-delivery rejection behavior explicit and diagnostic; do not apply rejected points to another delivery.
- [ ] Add `native sample replay after a successful commit is idempotent` coverage proving a retained sample can be replayed without duplicate route points.
- [ ] Run `node --experimental-strip-types --test tests/nativeBridge.test.ts tests/indexedDbStorage.test.ts tests/storage.test.ts tests/backup.test.ts` and verify all pass.
- [ ] Commit the durability change.

### Task 3: Recover an unresponsive Android renderer without disturbing GPS or storage

**Files:**
- Modify: supplied Android shell `android-shell/app/src/main/java/site/chatgpt/traynor1987/dominosshifttracker/MainActivity.kt`
- Modify: supplied Android shell `android-shell/app/build.gradle.kts` only if required by the installed AndroidX WebKit APIs
- Test: Android JVM tests under `android-shell/app/src/test/java/site/chatgpt/traynor1987/dominosshifttracker/`
- Modify: Android version to `2.3.0` / version code `15` if a native source change is ready for an in-place signed release

**Interfaces:**
- Consumes: current exact-origin `WebView`, existing `onRenderProcessGone` recreation, and independent foreground `DeliveryLocationService` plus encrypted `NativeSampleStore`.
- Produces: bounded renderer-unresponsive recovery that recreates/reloads only the WebView and never stops GPS or clears app/WebView data.

- [ ] Extract a pure `RendererRecoveryPolicy` from `MainActivity.kt` and add failing JVM tests named `responsive renderer is not recreated`, `unresponsive renderer recovers once per incident`, `recovery failure exposes retry without a loop`, and `renderer recovery never stops the native location service`.
- [ ] Confirm the failures represent missing renderer-unresponsive recovery behavior.
- [ ] Use the existing `androidx.webkit:webkit:1.12.1` APIs to observe renderer unresponsiveness and route recovery through the existing WebView recreation path; keep a visible retry path after one failed recovery.
- [ ] Do not reload a healthy page simply because page readiness is slow; do not clear cookies, cache, IndexedDB, localStorage, or WebView history.
- [ ] Bump native version only if native code is changed; preserve the stable package and signing setup.
- [ ] Run `gradle --no-daemon :app:testDebugUnitTest :app:assembleRelease` in the Android project and run the signed build workflow if its source repository and signing secrets are available. The supplied Android archive has no `.git` remote metadata; locate the authoritative origin before claiming a pushed APK. If unavailable, retain a reviewable native source patch and report that APK publication is blocked.
- [ ] Commit native source in its authoritative Android repository when its origin is confirmed.

### Task 4: Integrated verification and release

**Files:**
- Modify: `lib/nativeBridge.ts` (web version)
- Modify: `public/version.json`
- Modify: `public/sw.js` (web version and cache sequence)
- Modify: current handover/changelog
- Verify: current Sites hosting project and production artifact

- [ ] Increment the web version consistently from `2.1.214` and advance the service-worker cache sequence.
- [ ] Run focused tests from Tasks 1–3 and the full critical PWA test set with `TZ=Europe/London`.
- [ ] Run `npm run build` and `npm run validate:artifact`.
- [ ] Verify the existing hosting project identity and publish the built artifact to the existing Shift Tracker URL only.
- [ ] Confirm published Site version and run a final source/status check; report any Android publication blocker separately and precisely.
- [ ] Commit the exact verified PWA source used for deployment and publish through the existing Sites project; update handover with test results, versions and native acceptance requirements. The imported PWA checkout currently has no Git remote, so do not claim a remote push unless its authoritative remote is established.

## Plan review

- **Spec coverage:** PWA render/resume workload is Task 1; durable GPS acknowledgement is Task 2; renderer recovery is Task 3; compatibility and deployment verification are Task 4.
- **Step scan:** Each task uses a failing test before production changes and names focused verification commands.
- **Type consistency:** Task 2 retains the existing native acknowledgement API and adds a typed result at the PWA ingestion boundary; no AppData schema changes are planned.
- **Review focus:** All five listed input cases are assigned regression coverage in Tasks 1–3.
- **Proportion:** Four tasks cover three implementation surfaces and one release gate; no unrelated refactor is included.
