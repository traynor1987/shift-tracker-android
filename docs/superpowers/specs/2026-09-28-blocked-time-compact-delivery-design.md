# Blocked Time and Compact Active Delivery Design

## Scope

Extend the current Shift Tracker implementation in place. Preserve the hardened persistence, resume, GPS, geofence, delivery timing, and native/Wear ownership paths.

## Blocked Time

- Store Blocked Time as a normal persisted `ActivityRecord` with a distinct `blocked_time` activity type, an absolute ISO start, an optional ISO end, a stable reason code, and an optional note.
- Treat it as paid time: it is neither a break nor productive work. Reporting subtracts it from unallocated paid time and exposes it separately, but never adds it to cleaning, preparation, other-task, or delivery totals.
- Starting Blocked Time is unavailable during a delivery or break. If cleaning/preparation/named work is active, close that work at the same transition timestamp and retain its existing resumable state. Quick-task work is ended at the transition.
- Starting a delivery, break, or productive task closes the active Blocked Time at that action's canonical timestamp before starting the new activity. The transition is atomic in the existing `commit` path, so no overlap is persisted.
- The live timer is derived from the persisted start timestamp, not an interval counter. Process recreation and resume therefore reconstruct it from saved shift data.
- Local UI uses the requested private reason labels. Professional reports map `idiot_in_charge` to `Management blocked`; they never emit the private wording.

## Active-delivery density

- Keep all summary information but apply an explicit active-delivery layout class instead of relying on multiple late `:has()` overrides.
- Remove the duplicate Return-to-Store control from the delivery card. The bottom action row becomes the single primary control and retains the existing hold-to-override behaviour once all customers are delivered.
- Keep geofence status in the delivery card and render the GPS-map launcher as a compact evidence row.
- Reduce active-only padding, gaps, and minimum row heights while retaining at least 44px interactive targets.
- Keep Hustle calculations and content unchanged; compact only its active-delivery presentation.
- Reserve bottom-nav/safe-area space through the existing viewport shell and allow safety scrolling only when text scaling or a genuinely smaller viewport requires it.

## Compatibility

- Older shifts without Blocked Time continue to validate and report zero blocked duration.
- Backup validation remains strict and validates the new reason/timestamp fields.
- Android/Wear delivery actions keep using the same canonical PWA state and transition handlers.

