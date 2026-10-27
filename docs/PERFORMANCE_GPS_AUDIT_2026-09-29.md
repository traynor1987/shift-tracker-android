# Performance and GPS audit — 29 September 2026

## Source and scope

- Web baseline: production Web App 2.1.227, Sites version 476, commit `9e4dfc18dd27ad2d6309d6e3ed7f6f1b7fde67c6`.
- Native baseline: `traynor1987/shift-tracker-android` main and published Android/Wear 2.2.69, commit `3cfea336b0a993fe16951a7601c61b8e311d946c`.
- The attached 2.2.9 ZIP and older handovers are historical sources. The small Android skeleton in the web repository is also not the current signed application.
- Physical screenshots show delayed screen/GPS catch-up. They establish a symptom; they do not establish handset CPU time, provider errors, or the exact trigger.

## Confirmed defects and fixes

| Priority | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| High | GPS saves deserialize full recovery generations on every write | `putCanonical` called recovery-store `getAll` unconditionally; regression reproduced three unnecessary reads across three ordinary saves | Read and prune recovery generations only when inserting a new recovery snapshot. Retention remains three and transaction protection remains intact |
| High | Native journal encryption, disk writes, acknowledgements and diagnostic queue counting share Android's UI thread | Provider callback explicitly uses `Looper.getMainLooper`; callbacks directly invoked journal append/read/write; bridge acknowledgements also ran on the main thread | Order journal operations on one process-wide serial worker; post state and WebView delivery back to the UI thread; use cached queue count in diagnostics |
| High | Web GPS health measures retained route points instead of provider fixes | Standard route sampling permits a 25-second interval; the web watchdog uses the same 25-second cutoff; route recording may be disabled | Track latest valid native provider timestamp by current delivery ID independently of route retention and geofence certainty |
| High | Two watchdogs can compete over the same native delivery session | Web watchdog could stop/start at 25 seconds while current Android service owns 60-second recovery | Detect the native watchdog diagnostic capability, use its health window, and leave automatic provider recovery with that service. Existing manual retry remains available |
| Medium | A large native replay can issue all messages in one UI turn | `flushPendingSamples` synchronously iterated the whole encrypted recovery snapshot | Read on the journal worker and offer at most 16 replay points per UI turn, yielding between turns |
| Medium | The previous route checkpoint throttle could defer an automatic return milestone | Auto-return uses the location ingestion commit | Detect Back at Store and observed store crossings using the active run only, and checkpoint those immediately after local persistence |
| Diagnostic gap | Existing logs did not distinguish save time, queue time and foreground JavaScript stalls | Export held event text and native status, with no stage timings | Export bounded numeric aggregates for local save, queue wait, ingestion, queue depth and foreground timer gaps. No coordinates or customer data are added |

## Benchmark

Command: `node --experimental-strip-types scripts/benchmark-storage.mjs`.

Baseline used an unchanged copy of the 2.1.227 storage module. Both runs used Node and fake-indexeddb, 12 synthetic shifts, 12,000 route points, three retained recovery generations and 20 ordinary saves. This isolates storage work; it is not an Android/Fold performance claim.

| Measurement | Baseline | Fixed |
| --- | ---: | ---: |
| Recovery-store full reads across 20 saves | 20 | 0 |
| Median save | 83 ms | 52 ms |
| 95th percentile save | 98 ms | 63 ms |

## GPS and lifecycle rules retained

- Android remains the foreground/background delivery provider; browser GPS remains the existing fallback.
- Provider timestamps and accuracy remain real; replay does not invent crossings, locations or elapsed time.
- The Real 35m boundary and 65m geofence accuracy limit are unchanged. A valid route fix can be too uncertain for a geofence decision; that does not mean the provider stopped.
- Native recovery samples remain encrypted and are acknowledged only after durable canonical persistence or an intentional rejection.
- Native queued writes finish independently of Activity/WebView replacement. Results from a previous delivery session cannot update the current service session.
- IndexedDB candidate validation, transaction revision conflict checks, save protection, recovery snapshots, Management Blocked and task transitions remain in place.

## Remaining performance risks

- The main React component is still very large. Canonical saves still validate/snapshot AppData and compare historical routes; those costs grow with retained data. This audit removes confirmed avoidable recovery reads rather than weakening validation.
- Android route-mode sampling uses movement filtering; a stationary handset can legitimately receive fewer fixes. The native watchdog remains responsible for its provider stream.
- Battery restrictions, permissions, provider availability and a killed WebView can only be confirmed on the device. A successful synthetic benchmark and CI build do not prove every physical freeze resolved.
- Performance aggregates describe the current page session and reset when the page is replaced. Export diagnostics after a recovered stall, before refreshing, when possible.

## Physical acceptance

1. Install the new signed Android release through the existing updater and refresh Web App 2.1.228.
2. Start a real delivery, background the app, lock the screen, and resume after several minutes. Verify the timer immediately shows elapsed wall time and route evidence catches up while controls stay usable.
3. Remain stationary briefly outside the store; verify no competing web stop/start resets the native delivery.
4. Test Delivered and Back at Store, task resume and the blocked-time continuation prompt.
5. If a stall recurs, export the existing Developer Console log after recovery. Its performance section distinguishes frontend gaps, local-save delays and replay queue delays; native diagnostics retain provider/journal status.

## Verification record

- Final web suite: 470 tests, 456 passed, 14 existing UI source-shape failures matching the baseline; rendered-artifact test passed. All added regression tests passed.
- Production build and Sites artifact validation passed.
- Strict TypeScript comparison: baseline and changed main component each report the same 55 existing errors; no new component error and no error in the changed storage, GPS, checkpoint or diagnostics modules.
- Android commit `1d0f29a26b262f48b23de8671361d8e1a62d533a` passed debug CI and the signed native tests/build/signature checks before promotion to main. Release version is Android/Wear 2.2.70, versionCode 75. The existing signed-release workflow publishes it after final main checks.
