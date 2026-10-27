# Task timing integrity implementation plan

Goal: prevent reversed task boundaries, repair damaged live state explicitly, and release to the existing site.

Scope: existing PWA only; strict validation, IndexedDB, native ownership, protected Real geofence and user records remain authoritative. User explicitly requested implementation through deployment without a plan-review pause.

- [x] Open current Sites source; inspect task, delivery, carryout, native and persistence paths.
- [x] Reproduce display-clock rollback and pre-run GPS evidence with failing tests.
- [x] Centralise task open/close and delivery transition time; reject stale task generations and stale operational location samples.
- [x] Add explicit repair that preserves starts and valid neighbouring records, records uncertain ends as zero duration, audits original boundaries, and validates the whole candidate before persistence.
- [x] Add opt-in diagnostic recovery script for an old bundle still holding unsaved React state; delegate saving to that bundle's Retry Save.
- [x] Use ordered Real evidence in Hustle; separate pending-next-dispatch presentation; contain cooldown decoration and status labels.
- [x] Exercise actual Single/Double/Quick Task handlers, resume, duplicate signals, backup and IndexedDB round trips; run UTC and Europe/London subsets.
- [x] Compare broad test and type-check failures against the untouched production commit.
- [x] Bump web version and service-worker sequence; build Vinext and validate Sites artifact.
- [ ] Push exact source, save archive, deploy existing site and verify deployment status.

Review focus: stale React closures, delayed photo completion, carryout departure predating resumed work, repeated native actions, unknown historical end times. No unproven duration or GPS evidence may be introduced.
