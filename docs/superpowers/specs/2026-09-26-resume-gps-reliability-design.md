# Shift Tracker Resume and GPS Reliability Design

## Purpose

Stop the installed Shift Tracker from freezing or presenting stale delivery state after background/resume, and prevent native GPS samples from being discarded before their route evidence is durably saved. Preserve the existing local-first app, stored shifts/deliveries/routes, timing semantics, and strict validation.

## Evidence and diagnosis

The supplied device screenshots show an active delivery first displayed at 00:00:50 with a two-delivery shift count, then later at 00:12:31 with 114 GPS points and 3.37 mi. Hustle changes from “Detecting exit…” to a measured leave-store interval after the lag. This is consistent with delayed UI rendering and delayed processing, though it does not establish the exact trigger on the handset.

The current source has two avoidable main-thread workloads: resume route cleanup clones all AppData before checking whether any route needs cleanup; and the root component recalculates expected Hustle projections during its one-second clock renders. The current native sample bridge acknowledges after PWA ingestion requests an asynchronous save, rather than after IndexedDB confirms that write. The Android shell retries a blank WebView URL and handles renderer exit, but does not currently recover a renderer that remains present and becomes unresponsive.

## Design

### PWA render and resume workload

- Check route expiry against current data before cloning. Clone only when cleanup is required, and prevent duplicate `pageshow`/visibility cleanup from doing the same work concurrently.
- Memoize historical reporting and expected-Hustle projections by their actual data/preferences dependencies so one-second clock updates do not traverse delivery history again.
- Filter to eligible completed single/double deliveries before computing route/geofence timing for beta-Hustle outlier analysis.
- Do not change delivery timers, GPS thresholds, geofences, Hustle formulas, route retention policy, or stored data.

### Native GPS durability

- Make PWA ingestion expose completion for each native sample. An accepted route point is acknowledged only after the canonical IndexedDB transaction succeeds.
- If persistence fails, retain the encrypted Android sample and show/use existing Save Protection behavior; retry from the preserved queue when the page reconnects.
- Explicitly rejected stale, duplicate, non-live, or wrong-delivery samples may still be acknowledged after the rejection is recorded, because they were deliberately not eligible to mutate canonical data.
- Continue matching every sample to its delivery ID at application time. Never attach queued samples to a newer delivery.
- Preserve native encrypted queue limits, native GPS ownership, and existing browser fallback rules. No coordinate, milestone, or timing is fabricated.

### Android WebView recovery

- Detect WebView renderer unresponsiveness using Android's renderer lifecycle callbacks and bounded page-readiness monitoring.
- Recover only the unresponsive/failed WebView, with a single bounded recovery attempt per incident and a clear retry surface if recovery fails. Avoid reload loops and avoid reloading a healthy active page.
- Keep the separate native foreground GPS service running during WebView recovery; retain queued samples until the PWA durably accepts them.
- Keep the current trusted origin and WebView storage profile. Do not clear WebView data, IndexedDB, caches, or local storage.

## Compatibility and data safety

- No AppData or backup schema migration is expected.
- Existing shifts, tasks, deliveries, routes, settings and backups remain untouched except normal new route samples and existing expiry cleanup when genuinely due.
- Invalid task timestamps continue to fail strict validation; this work does not weaken or bypass validation.
- Protected Real delivery timing remains independent from comparison/early-dispatch timing.
- Single/Double, Quick Tasks, resumable tasks, Stock Run, dispatch-early, Back at Store, Wear actions and native GPS ownership must retain current behavior.

## Verification

- Add deterministic tests proving Hustle projections do not recompute from clock-only renders and that resume cleanup does not clone data when no route is expired.
- Add native sample ingestion tests: accepted point remains pending until IndexedDB commit resolves; commit failure keeps it pending; stale/duplicate/wrong-delivery points cannot mutate another run; retry is idempotent.
- Add Android lifecycle tests for unresponsive renderer recovery, no reload of responsive pages, one recovery per incident, and preserving GPS service/sample journal state.
- Run focused PWA/domain/storage/backup tests, persistence failure tests, Europe/London timezone test subset, production Vinext build, Sites artifact validation, and Android JVM/build workflow checks available from the supplied 2.2.9 source.
- Publish the verified PWA to the existing Shift Tracker Site. Any Android shell change must use the existing permanent signing identity, increment version code beyond 14, and preserve package identity.

## Non-goals

- No redesign of Shift or Hustle screens.
- No deletion/reset of any local data.
- No unrelated GPS, timing, payroll, task, Wear, or Android notification changes.
- No claim that a code-level recovery replaces physical acceptance on the Fold.
