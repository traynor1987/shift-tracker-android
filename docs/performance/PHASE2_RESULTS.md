# Phase 2 verified engineering results — 13 October 2026

Scope: continue Phase 1 from web1013bed / native36bb1a1; no replacement app, production data reset, pay change, geofence change or invented evidence. Web2.1.235 and Android/Wear2.2.72/code77 are the release candidates. Native6211d15066a4aaea89eff30956966d9c72fd99fb passed signing/publication.

## Implementation and verification

- P1: root wall-clock subscriptions15s; dedicated Dashboard live text boundaries1s; mounted delivery/task screens1s. Hidden clocks pause; wall timestamps catch up on resume; same-timestamp wake events coalesce. No interval drift accumulator. Action handlers read current time. Full React commit/frame profiling unavailable.
- P2: completed history, multiple payroll periods and weekly Hustle summaries reuse results; relevant edits invalidate. Existing payment/mileage rules unchanged. Value-key validation still scans relevant completed timing fields on data changes.
- P3: one queued immutable AppData clone instead of two; redundant route clone removed; changed route point count avoids full string comparisons; equal-length edits retain full comparison. Transactions, revision conflicts and validated recovery generations remain authoritative.
- P4: encrypted format unchanged; one process-wide journal index; commit-before-cache publication; exact acknowledgements; no duplicate/absent-ack writes or silent capacity eviction. Old unacknowledged delivery rows survive a new session and remain tagged until explicit acknowledgement. Full encrypted snapshot writes remain O(n).
- P5: accepted-fix watchdog; ordered replay before live dispatch; generation-fenced callbacks; web ingestion reads latest canonical session rather than captured React state. Carryout boundaries and fresh-observation contracts unchanged. No automatic reboot/force-stop recovery added: existing scope is process reclaim/restart. Watch compatibility verified by JVM tests/build, not physical reconnection.
- P6: lazy evidence map and PDF reports; synchronous popup reservation; versioned complete offline asset list. Worker waits for all assets before activation and retains previous cache on failed installation. Build cleans only generated dist so obsolete hashed assets cannot inflate or contaminate release precache.
- P7: fixed numeric allowlist, bounded aggregates,30-minute inactivity expiration; no IDs/coordinates/customer addresses. One visible event-loop probe; hidden sleep excluded. Unsupported memory readings omitted. Definitions included in diagnostic export.

Final checks: strict TypeScript PASS; full Europe/London suite567 TypeScript +1 rendered production HTML =568 passed,0failed/cancelled/skipped; production build/artifact validation PASS. ESLint0errors/36warnings (baseline33). Phase1 and11return-recovery tests pass. Native exact downloaded JUnit XML:58app +34Wear =92executed,0skipped/failed/errors. Wear lint, release/debug builds and package/signing guards passed. Device/emulator instrumentation NOT RUN.

## Executed benchmarks

Raw numbers and repeatable scripts are included alongside this file. Synthetic records only; no production records were read.

| Scenario | Before | After | Measurement scope |
|---|---:|---:|---|
| Ordinary save,10shifts/100points |10.144ms|7.738ms|Mean5writes; fake IndexedDB; recovery generation excluded|
| Long routes,10shifts/5,000points each|250.236ms|176.062ms|Same ordinary write benchmark|
| Large history,150shifts/500points each|411.030ms|291.804ms|Same artificial history benchmark|
| 30-minute replay,180samples|2.137ms|1.731ms|Mean save; injected abort/reload retained90points; resumed179successful writes|
| Weekly allowance,500shifts/10,000runs,60calls|739.957ms|256.912ms|Production Phase1 function vs value cache; same synthetic data|
| Three historical periods,60clock-only renders|924.744ms|14.149ms|60recomputations vs one unchanged memo generation|
| One-minute root clock updates|60|4|Production clock notification simulation; live screen remains60|
|50rapid resume cycles|200root updates|50notifications|Actual old timer effect vs new clock engine; no phone lock test|
|200tab subscription swaps|200root updates|13notifications|Controlled lifecycle simulation; not full UI navigation|
|100monitor mount/unmount cycles|—|0listeners left|Production monitor cleanup simulation|
|Native journal,1,000rows/100appends/100acks|211.118ms|18.820ms|Actual Kotlin cached algorithm; deterministic UTF8 storage, excludes crypto/fsync|
|Native journal full reads|400|1|Same benchmark;200writes retained in both|
|Weak/interrupted/offline probes|Correct rejection|Correct rejection|Actual unchanged production probe under controlled responses; no speed improvement claimed|
|Main minified JavaScript|972,041bytes|903,631bytes|Fresh production artifact;7.04%smaller|
|Initial JavaScript closure|1,243,440bytes|1,175,043bytes|5.50%smaller; per-file gzip332,118→315,200bytes|
|Initial CSS|542,445bytes|542,472bytes|Effectively unchanged; CSS remains a loading bottleneck|

## Metrics in exported diagnostics

`local_save` includes queue wait. `persistence_snapshot`, `persistence_validation`, `persistence_split`, `persistence_compare`, `persistence_queue_wait`, `persistence_write` and `persistence_transaction` separate snapshot/preparation/queue/write costs. Queue depth is a count, not milliseconds. `main_thread_stall` is delay beyond the one-second foreground probe; it is not proof of a specific root cause. `gps_callback_age` is raw provider timestamp age; `gps_accepted_fix_age` is useful accepted fix age. `native_journal_backlog` counts unacknowledged evidence. `replay_duration` includes web ingestion/persistence drain. `resume_reconciliation` measures hello-to-trusted-ready handshake, with replay measured separately. `visual_tick` counts notifications; `timer_render` measures live text formatting only, not React commits. `memory_used_mb` is optional JavaScript heap use, not Android system memory pressure. Native numeric journal/read/write/dispatch counters are explicitly allowlisted.

## Acceptance limits and remaining bottlenecks

Physical acceptance NOT TESTED. No owner driving, locked-screen GPS, real Android process kill/reboot, watch reconnection, real radio interruption, browser popup or WebView frame/memory acceptance claim. Simulated interruption is not physical device termination.

Live delivery/task screen boundaries still render every second, advanced settings remains eager, the main JS chunk is still large, full-data canonical/recovery validation and encrypted snapshot writes remain O(n). Offline installation now caches all deferred assets, so initial execution gets lighter without claiming lower total offline installation bytes.Lint reports36warnings versus the baseline33. No claim that these optimisations alone fix the owner's historical freezes.
