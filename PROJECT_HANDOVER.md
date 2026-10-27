# Web 2.1.211 — early-dispatch GPS and carryout-start priority

- An eligible Order Dispatched event now wakes the existing GPS session even when the normal Delivery GPS toggle is off (subject to the device's location permission). It still creates no delivery and remains a separate Domino's early-dispatch comparison record.
- If the driver selects Single or Double before leaving carryout, the delivery begins normally at that tap. If they forget and first leave the armed carryout zone, the saved carryout departure time becomes the actual delivery/live timer start when they choose Single or Double; the notification receipt time never replaces that live start.
- The protected Real Hustle/car-park boundary, its timers and all recorded evidence remain unchanged.

# Web 2.1.210 — live carryout check and silent departure timer

- Settings → Store location & route evidence → Calibrated carryout zone now shows a live check card with Inside/Outside, waiting-GPS and GPS-unavailable states, the latest accuracy/time and a manual **Check now** button.
- After the assistant has first observed the driver in the carryout zone, the first observed exit saves a separate carryout departure timestamp. It creates no delivery. If Single or Double is tapped within 30 minutes, the normal delivery uses that saved timestamp as its live start; returning to the zone without choosing a delivery clears it.
- This is independent of the protected Real Hustle/car-park geofence and the separate Domino's early-dispatch record. It does not alter their GPS evidence or timing rules.

# Web 2.1.209 — doorway-safe carryout calibration

- Carryout calibration now treats the four readings as noisy samples of the tiny doorway/paved threshold, rather than rejecting them when normal phone GPS drift makes their literal rectangle too large.
- On completion it averages the four readings and saves one compact 16m × 16m carryout helper box. The assistant remains optional, requires entering it before a departure prompt, asks explicitly for Single or Double, and can auto-complete Back at Store after Delivered on a proven return.
- This is still completely separate from the protected 35m Real Hustle/car-park geofence, its thresholds, evidence, timings and existing behaviour.

# Web 2.1.208 — calibrated carryout departure and return assistant

- Added an optional four-corner carryout calibration wizard in Settings → Location → Store Location. Each point requires a fresh GPS fix of ±25m or better; the saved small box is entirely separate from the protected 35m Real Hustle geofence and the existing car-park behaviour.
- While clocked in with the app in the foreground, the assistant first observes the driver inside the calibrated box, then prompts for an explicit Single or Double choice after an observed departure. It never creates a delivery without that choice, and the normal early-dispatch queue attaches as usual.
- After Delivered, a proven outside → inside return to the calibrated box completes Back at Store automatically and writes an explicit activity note. The original Real/Hustle geofence, route evidence and existing automatic return recovery remain unchanged.

# Web 2.1.207 — next-delivery early dispatch queue

- An eligible **Order Dispatched** notification received while a delivery is already open is now saved for the *next* Single or Double run instead of being discarded.
- Each delivery can therefore carry its own early-dispatch timestamp. The already-running delivery is never rewritten, duplicate notifications are ignored while one next-delivery dispatch is queued, and no notification can create a delivery or change clock-out state.
- The live Hustle panel shows **Next dispatch ready** while the current run remains active. Starting the next delivery consumes that queued timestamp and keeps the normal GPS/geofence evidence flow intact.
- Queued dispatch data is migration-safe, included in Backup validation, and cleared if the shift is clocked out before the next run begins. Android/Wear changes are not needed because the existing trusted notification bridge carries this state.

# Web 2.1.206 — shared report timing accuracy and review signals

- Replaces the ambiguous, incorrect **Average Hustle** value with separately measured **Average hustle out**, **Average hustle in**, and **Average hustle combined**. Combined means the short store-side turnaround time: delivery started → GPS exit plus GPS return → Back at Store. Travel time remains explicitly labelled **Away from store**.
- Per-route timings now use the same terminology, including the combined calculation and the preserved total trip time.
- GPS evidence limitations now keep their readable issue message instead of serialising structured issue records as `[object Object]`. Older frozen reports with that legacy text show a safe plain-English fallback.
- Adds **Needs checking** to the report overview, counting routes with GPS gaps or missing store markers so evidence weaknesses are visible before scrolling into every route.
- New frozen reports use report format version 3. Existing reports remain immutable snapshots; create a new link to get the corrected measures.

# Web 2.1.197 — Wear OS settings section

Adds a standalone expandable Wear OS settings section above App status, after the existing app settings menu. Scoped to nine watch display/vibration/break/goal preferences. Reads actual watch values through the existing origin-restricted native bridge; no local PWA defaults sent to overwrite watch preferences. Incoming edits update controlled phone inputs. Phone native 2.2.59 + Wear 2.2.59 provide durable bidirectional per-key sync and peer acknowledgement; the UI reports waiting until the watch confirms. Browser-only use shows Android-app guidance; old native versions show update guidance; new phone awaiting first watch contact shows open-watch guidance.

Native canonical source remains traynor1987/shift-tracker-android main (not this checkout's older android-shell directory). New shared Kotlin sync implementation and merge tests live there. System permissions and favourite tasks stay watch-local. Existing shift/pay/GPS settings and three update channels are unchanged.

Validation: production build/artifact validation passed; focused trusted-origin/settings bridge test passed. TypeScript checking retains pre-existing errors elsewhere, with none in the new panel or added bridge code. Physical phone/watch offline editing, reconnect convergence and controls require device testing. No browser QA requested/performed.

# Domino's Shift Tracker — current project handover

## Web App 2.1.216 — resume and native GPS durability

- Resume skips route-expiry cloning/persistence when no route is due and memoises
  historical reporting projections, reducing first-paint work after backgrounding.
- Android GPS samples are acknowledged only after one validated IndexedDB save
  containing every mutation from that fix; a failed write leaves the encrypted
  native sample pending and forces the optimistic state to be re-saved on replay.
- Bad Delivery remains reversible and continues to preserve pay/count while
  excluding unreliable GPS and Hustle evidence.
- Android shell 2.2.68 adds bounded renderer recovery without stopping native
  tracking or clearing web storage, built by the existing signed-release workflow.

> Updated from the actual source checkout on 29 August 2026 (Europe/London).
>
> This file describes the live code state at the point of inspection. It deliberately distinguishes verified implementation from intended behaviour.

## Project purpose

Domino's Shift Tracker is James's local-first, mobile-first PWA for logging Domino's delivery-driver shifts. It records shifts, paid time, breaks, delivery runs, mileage, fuel reimbursement, task/cleaning work, payroll references and optional GPS delivery evidence. It is a personal record, not a Domino's system.

## Current release and verification

### Web App 2.1.77 — Settings isolation, editable reference radius and Android status

- Quick Tasks now shows only the custom-task management panel.
- Optional Hosted Recovery and Frozen Report Links are hidden from every Settings subpage except **Data & Backup**.
- The generic local-data footer remains on the main Settings page and is hidden from category subpages.
- The amber Domino's comparison radius is editable from 40–150m and resets to 75m. The protected Real Hustle centre/radius remains exactly `53.56845, -2.88802, 35m` and has no editing control.
- Each new delivery snapshots its Domino's comparison radius; existing delivery evidence and historical route reconstruction retain the radius recorded for that run.
- The Android stable manifest now identifies the signed, installed and real-device-verified **2.2.9 / version code 14** baseline. Version assessment distinguishes current, update available and installed-ahead states.
- Custom tasks, backups, existing shifts, protected Real GPS statistics and Android-native behaviour are otherwise unchanged.

### Web App 2.1.76 — custom Quick Tasks and clarity repairs

- Settings has a dedicated **Quick tasks** category. It can save up to 24 user-defined labels, rejects blanks/duplicates, and removes a label without changing existing shift history.
- Saved labels appear as **MY QUICK TASKS** beneath the existing built-in groups and use the existing stacked paid-work timer. No cleaning, delivery, GPS or payroll behaviour changed.
- `settings.customQuickTasks` is optional and backwards-compatible. Fresh/older data defaults to an empty list; migration trims and deduplicates labels; Full Backup validates and preserves the setting.
- History's Rota Comparison card now presents Scheduled, Actual and Punctuality in separate responsive cells instead of concatenated inline text.
- Trends now names the former Real/Domino's Hustle averages as **trip outside zone** and explicitly explains that each value is geofence exit to re-entry: outbound + customer + return. The calculation itself is unchanged.
- Release metadata is Web App **2.1.76** with service-worker cache sequence 70. This is a hosted-PWA change and does not require an Android APK rebuild.
- Verification: production build and Sites artifact validation passed; **325/325 application tests plus 1/1 rendered-artifact test passed** in `Europe/London`. Lint still reports the two pre-existing declaration-order errors in the native-GPS recovery code plus existing warnings; none are in this release's changed paths.

| Item | Verified status |
| --- | --- |
| Saved Sites version | Web App **2.1.77** |
| Latest source commit | Isolated Quick Tasks, added an editable Domino's-only reference radius and corrected Android 2.2.9 status. |
| Published/live | Web App **2.1.77** at `https://dominos-shift-tracker.traynor1987.chatgpt.site`. |
| App/package version | `2.0.0` |
| Build | Passed on 29 August 2026; validated Worker artifact and hosting manifest. |
| Tests | Passed: **326/326** application tests plus **1/1** rendered-artifact test in `Europe/London`. |
| Lint | Two pre-existing declaration-order errors in native-GPS recovery code and 28 existing warnings; no error in the 2.1.76 feature paths. |
| Strict TypeScript | Covered by the successful production build; no separate strict-only run recorded for 2.1.76. |

### Android release status — read this distinction carefully

- The installed and real-device-verified Samsung Fold client remains the signed **Android APK 2.2.6**.
- **Android 2.2.8 is a source/candidate version only** for the later rota-reminder native work. It has not been built, signed, installed or established as the stable APK in this workspace.
- Web App 2.1.69 is hosted PWA code. This History-layout repair does not change Android native source and does not require or justify an APK version increment.

Build 212 preserves the existing local-first architecture and data model. The protected `REAL_STATS_GEOFENCE` remains the existing 35m statistics boundary at `53.56845, -2.88802`; it is read-only in the UI and is not changed by map-pin editing. The separate default `STORE_DISPLAY_LOCATION` is `53.568186, -2.887791` (`Domino's Ormskirk`). Existing GPS samples, geofence timestamps, mileage and delivery durations are not rewritten. Build 186 prepares road intelligence from the complete saved GPS route and its expanded numeric corridor when evidence opens; map panning/zooming is visual-only. OSM context is cached by regional bounds with in-flight duplicate protection, negative-cache back-off and legacy signal-cache migration. Traffic signals tolerate GPS accuracy/junction offsets and queue approaches; a missing signal can be saved as a device-local `USER_CONFIRMED_LOCAL` correction without editing OSM or calling Google. Build 211 adds a live-only `UNDO LAST DELIVERED` action after at least one customer tap: it removes only the latest manual customer event, keeps the active timer/GPS route open, and leaves completed/historical activities untouched. Build 212 adds a driver-confirmed Google refresh prompt after the normal per-delivery two-call allowance: the checkbox permits up to one extra outbound and one extra return request for that delivery, bypasses the six-hour cache, and overwrites only the displayed Google benchmark. Global rolling limits remain hard. Existing mileage, task, report, cancellation, quick-task and customer-timing behaviour remains unchanged.

## Web App 2.1.69 missed-shift History action repair

- History gives its heading full width at Fold and phone sizes, then places **Add Missed Shift** and **Save Week** in a balanced two-column action row beneath it.
- Add Missed Shift uses a compact plus tile, a stable one-line label and the shorter helper **Enter a past shift**, preventing the tall word-stack shown in the Samsung Fold screenshot.
- The existing missed-shift flow is unchanged: it still validates clock-in, clock-out, role and note, creates a labelled manual completed shift, links a matching rota entry safely, validates the full candidate AppData and persists it through the authoritative IndexedDB save path before opening normal shift review.
- No AppData, IndexedDB, backup, payroll, rota, GPS or Android-native schema changed. Existing production records are untouched.
- Verification: **296/296 application tests plus 1/1 rendered-artifact test passed**; production build and Sites artifact validation passed; lint is **0 errors / 26 warnings**; strict TypeScript remains at the existing **111 errors**, with no new error in this change.

## Web App 2.1.62 IndexedDB primary storage

- `ShiftTrackerDB` version 1 is now the authoritative AppData store. Settings, shifts, payroll, rota/attendance, GPS routes, recovery generations and migration metadata use explicit object stores and related writes share one transaction.
- Existing valid `dominos-shift-tracker-v1` data migrates automatically through parse → compatibility migration → canonical validation → IndexedDB transaction → reconstructed read-back validation → migration-complete promotion. A failure at any stage leaves the original localStorage bytes untouched and allows retry.
- The original localStorage AppData remains indefinitely as a protected legacy migration recovery copy and is never rewritten after promotion. localStorage now receives only small bootstrap/revision metadata for the canonical database and cross-tab notification.
- GPS route evidence is stored separately by delivery activity ID. Unrelated shift/settings/payroll saves compare records and do not rewrite unchanged historical routes; delivery/shift deletion removes orphan route ownership in the same transaction.
- Up to three validated IndexedDB recovery generations are retained. High storage pressure may reduce only redundant generations beyond the protected newest two and clear reproducible provider/OSM caches; core data and retained GPS evidence are never auto-pruned.
- Settings reports storage usage/quota/health and whether persistent storage is granted. `navigator.storage.persist()` is requested once where supported; denial never blocks the app and is not described as a guarantee.
- Full Backup format 1, historical raw backups, privacy sanitisation and Android native restore reconciliation are unchanged logically. Restore commits IndexedDB before native stop/start side effects.
- Verification: production build and Sites artifact validation passed; **273/273 application tests plus 1/1 rendered-artifact test passed** in `Europe/London`; lint is **0 errors / 26 warnings**. Strict TypeScript reports **117 pre-existing errors**, with none in the new IndexedDB/storage modules.
- Android native source did not change. The real-device-verified signed APK remains **2.2.6**; the separate 2.2.8 reminder work is candidate source only and was not rebuilt for this storage release.

### IndexedDB real-device QA — Samsung Fold, 25 August 2026

- Web App 2.1.62 passed normal startup/migration with existing production data, repeated restarts, History/payroll/rota/attendance consistency, retained historical route evidence and healthy storage diagnostics.
- New shift, break, delivery, Delivered, Back at Store, Clock Out and Settings writes survived background/foreground and reopen. Active native GPS survived lock/background and force-stop recovery without duplicate deliveries or routes.
- Hosted Refresh App preserved IndexedDB. Full Backup export validated 12 shifts, 90 deliveries and 10,165 GPS points; current restore, older pre-IndexedDB backup compatibility, active-delivery restore and native GPS shutdown/reconciliation all passed.
- Persistent storage was not granted and normal saving continued correctly. No data loss, blank startup, duplicate delivery/route or false save-success behaviour was observed.
- Still pending: a future signed-APK in-place upgrade test, DevTools inspection of the exact object stores and retained legacy localStorage copy, controlled IndexedDB failure injection, and real-device triggering of Export Emergency Backup.
- The full QA record is retained at `docs/INDEXEDDB_REAL_DEVICE_QA.md`.

## Web App 2.1.63 next-shift home card

- The off-shift Shift screen now shows the next eligible working entry from the saved weekly rota directly beneath Last Shift, including date, start time, shift type and countdown.
- If the relevant rota week has not been added, that position asks the driver to add it and opens the existing rota editor. If the week exists but contains no future working entry, it offers a quiet rota-review action instead.
- This is a presentation-only reuse of the existing rota data and helpers. Shift, payroll, GPS, backup, IndexedDB and Android-native behaviour are unchanged; no APK rebuild is required.

## Web App 2.1.64 rota presentation

- The weekly rota is now a compact schedule board: each day is its own card, working days have a restrained blue treatment, today is labelled, and off days remain visually quiet.
- The week navigator shows the date range and scheduled-shift count. Working/off controls and time/type fields are smaller while retaining mobile touch targets, and the save controls stay reachable above the bottom navigation while scrolling.
- Rota records, attendance, reminders, clock-in matching and persistence are unchanged. No Android source or APK change is required.

## Web App 2.1.65 clock-out review and preparation outcomes

- Clock Out now presents two intentional paths: normal Clock Out preserves the existing completed-shift flow, while **Save time & review shift** commits the exact clock-out timestamp first and opens the completed shift’s Tasks screen.
- The review screen does not resume paid time or native GPS. It permits task completion/outcome corrections, notes and cleaning photo evidence, then closes via **Finish review** without changing the saved clock-out time.
- Delivery preparation adds **Prepare chicken** and **Prepare other**. Wedges, fries, cookies and chicken can be marked **Not required**; Prepare other begins each new delivery-day shift as Not required and can be returned to the required list.
- Existing saved preparation-rota records are retained. Migration only merges the two missing default definitions and adds them to an active eligible shift when absent.
- Android native source and the IndexedDB schema are unchanged; no APK rebuild is required.

## Web App 2.1.66 completed-shift unable outcomes

- History → completed shift → Task records now offers **Unable to complete** for incomplete tasks, using the same professional operational-reason list and required manager-on-shift record as the live Tasks workflow.
- Existing unable outcomes can be edited or returned to incomplete. Recording the outcome does not mark the task complete, restart paid time or change the saved clock-out timestamp.
- Existing saved task, photo, shift and IndexedDB schemas are unchanged. Android native source is unchanged and no APK rebuild is required.

## Web App 2.1.67 shift completion tools

- Every completed delivery retains **View Evidence** and **Save PDF**, including deliveries with one, expired or no usable GPS points. The report states exactly when a reliable map is unavailable while preserving every usable delivery timing.
- Completed shifts can reopen the post-clock-out Tasks review from History to add outcomes, notes and photo evidence. A derived **Review needed / Reviewed** state identifies applicable tasks that still lack a completion, unable or Not required outcome.
- History can add a missed completed shift through validated clock-in/out, role and note fields. Manual records are labelled and then open in the normal full Shift Detail editor; matching rota entries are linked safely.
- Rota working days accept a finish time and show exact scheduled hours plus estimated gross pay. Missing finish times remain explicit rather than being guessed.
- The Full Backup reminder now waits until 30 days, 10 completed shifts since the last backup, or 3 shifts when no backup has ever been made.
- Settings includes a read-only recovery readiness drill that validates canonical IndexedDB data and retained recovery generations without writing, damaging or restoring live records.
- Android native source and IndexedDB database schema version are unchanged; no APK rebuild is required.

## Web App 2.1.68 called-back shift restart

- History → the latest recently completed shift now offers **Restart shift** for up to 12 hours after clock-out when no other shift is active and its reimbursement has not been marked paid.
- Restarting keeps the same shift, rota link, delivery/task evidence, rates and reimbursement relationship. The saved clock-out becomes the start of a new closed unpaid break, the restart tap becomes its end, and a new final clock-out will be recorded later.
- The temporary clock-out timeline marker is replaced by the audited break record, preventing duplicate boundary markers. Existing breaks remain unchanged and paid time continues to deduct every recorded break.
- The complete candidate AppData is canonically validated before the IndexedDB save. A failed save retains the restarted in-memory state and uses the existing Save Protection warning.
- Android native source and IndexedDB schema version 1 are unchanged; no APK rebuild is required.

## Web App 2.1.61 save-recovery escape

- Fixed the Save Protection retry loop where a repeated storage failure appeared to make **Retry Save** do nothing. Every failed retry now visibly records its attempt time and directs the user to the rescue path.
- Added **Download Emergency Backup** directly inside the blocking warning. It validates and downloads the complete current in-memory AppData without first trying to update `lastBackupAt`, so a local persistence failure cannot prevent rescue of the live shift.
- Bounded only the separate last-known-good recovery copy to approximately 750,000 JSON characters. If duplicated completed-route samples exceed that budget, the recovery copy retains shift/pay/delivery summaries and route metadata but marks its duplicated detailed points unavailable. The authoritative primary dataset and Full Backup retain the original GPS points unchanged.
- Existing primary data is never deleted to make room, and active-shift route points are never removed from the recovery copy. No payroll, rota, mileage, GPS/geofence/Hustle calculation, backup schema or Android native behaviour changed. No migration or APK rebuild is required.
- Recommended next stability pass: migrate authoritative `AppData` from size-limited `localStorage` to transaction-safe IndexedDB using validate → write → read-back → promote migration, while retaining the original localStorage document until the IndexedDB copy is proven. Route points should then be stored separately per delivery so normal saves do not repeatedly serialise the entire GPS history. This is deliberately documented rather than rushed into the emergency release.

## Architecture

- **Framework/runtime:** Next.js 16.2.6, React 19.2.6, TypeScript 5.9.3, Vinext/Vite 8 and the Cloudflare-compatible Sites Worker runtime.
- **UI:** one main client component: `components/ShiftTrackerApp.tsx`; global CSS is `app/globals.css`.
- **Persistence:** `ShiftTrackerDB` IndexedDB version 1 is authoritative. The original valid `dominos-shift-tracker-v1` localStorage document is retained unchanged only as a protected legacy migration recovery copy; small revision/bootstrap markers remain in localStorage. There is no account system, cloud sync, D1 or R2 binding.
- **Photos:** cleaning-task proof photos are separate, device-local IndexedDB records (`shift-tracker-cleaning-photos`).
- **PWA:** manifest, service worker and install prompt are present. It is offline/local-first; app state belongs to the installed browser/device unless exported.
- **Backend routes:** the Sites Worker exposes server-only Nova and Google Geocoding proxy routes. They require deployed environment secrets; at this inspection the hosting environment has no configured variables.

## Important files

| File | Responsibility |
| --- | --- |
| `components/ShiftTrackerApp.tsx` | Main UI, state mutations, timers, GPS watcher, address workflow, settings, history, route-map UI. |
| `lib/domain.ts` | App data types, migrations, time/money calculations, GPS sampling, route/movement/customer/traffic analysis and privacy sanitisation. |
| `lib/storage.ts` | Transactional IndexedDB load/save/migration/recovery plus logical backup/download helpers. |
| `lib/googleRoutesService.ts` | Client-side Google Routes API key storage, request ledger, cache and hard circuit breakers. |
| `lib/googleAddressLookupService.ts` | Client-side Geocoding proxy caller, ledger, cache and hard circuit breakers. |
| `lib/novaVisionService.ts` | Client-side Nova proxy caller, image fingerprint cache and request limits. |
| `lib/osmRoadIntelligenceService.ts` | Privacy-safe Overpass road-context lookup/cache for complete GPS corridors; parses controls, crossings, calming, roundabouts, road metadata and restrictions; accepts GPS coordinates only. |
| `lib/photoStorage.ts` | IndexedDB cleaning-photo storage and expiry cleanup. |
| `lib/pdfReports.ts` | Browser-print delivery, shift and weekly GPS map reports. |
| `app/api/google/geocode/route.ts` | Server-only Google Geocoding proxy. |
| `app/api/nova/extract-delivery-address/route.ts` | Server-only OpenAI Responses API vision proxy. |
| `tests/domain.test.ts` | Core calculations, privacy sanitisation, GPS and Google safety fuse tests. |

## Data model

`AppData` contains `settings`, `shifts`, `payments`, optional `payrollSchedules`, cleaning/preparation rota snapshots and backup metadata.

- A `Shift` snapshots pay/fuel rates, role, task rota and its activities.
- A delivery is a `DeliveryEvent` plus a timed `ActivityRecord` (`single_delivery` or `double_delivery`).
- A delivery activity can contain geofence timestamps, GPS route evidence, customer events, route-point annotations, an optional expected-route snapshot and temporary/sanitised delivery destination data.
- A completed delivery can additionally contain an optional `customerWaitExplanation`: structured, local driver context (`recorded` or `skipped`, checkbox reasons, optional short note and saved time). It is explicitly not GPS, OSM, Google, mileage or timing evidence.
- Money is stored in integer pence; mileage is tenths of a mile.
- Settings hold two distinct concepts: `storeLatitude`, `storeLongitude`, `storeRadiusMetres` are the protected statistics boundary (normally `53.56845, -2.88802, 35m`), while `storeDisplayLatitude`, `storeDisplayLongitude`, `storeDisplayLabel` are the editable physical map pin (default `53.568186, -2.887791`, `Domino's Ormskirk`). The one-time migration recognizes Build 161's old-store point (`53.5669481, -2.8860588`) and returns it to the protected default without changing historical activity snapshots.

## Working now

### Shift, money and task tracking

- Clock in/out with role choice (Open, Second, Other/Later), accidental-clock-in cancellation window, live seconds and confirmations.
- Break recording, second-break recovery, six-hour/no-break review rules and historical correction.
- Single and Double delivery timers; Double records two individual deliveries; ten-second delivery cooldown.
- The Shift tab has an off-by-default **Walking delivery** switch. Turn it on before starting a Single or Double to apply pedestrian Google route estimates to that one run only; it resets after the delivery begins. Walking benchmarks never claim live traffic data, while the normal driving mode remains traffic-aware.
- Back at Store is blocked outside a confirmed store geofence when Location Assist is working, with a deliberate five-second manual override.
- Direct-mile and odometer-mile methods, wage and fuel reimbursement kept separate, reimbursement-payment tracking and payroll-period views.
- Cleaning/preparation rota, eligibility rules, task timers/segments, quick completion, task pause/resume around deliveries/breaks, task analytics and optional device-local photo proof.
- Short jobs use one stackable paid timer. The start dialog accepts a corrected start time, offers the latest Back at Store time, and clamps same-minute selections to the exact previous activity end so hidden seconds cannot make a valid visible minute appear to overlap.
- Short paid jobs are grouped into one stackable timer on every active shift (without changing cleaning compliance): customer/counter work such as taking customer orders, answering the phone, serving collection and taking payment; stock/makeline work such as getting stock from the chiller, putting stock away, restocking the makeline/boxes and refilling drinks or sauces; and shop-floor work such as making boxes, bagging/checking delivery bags, brushing up, wiping counters, emptying bins, doing oven and washing dishes.
- Operational allowances are presented as compact grouped rows with descriptions, units and a visible defaults note. Each numeric field keeps its draft while typing and commits a non-negative value on blur or Enter; blank/invalid edits revert to the prior value instead of writing zero. Reset still restores the documented defaults (5 comfort minutes/hour, 1 handling minute/order, 45 transition seconds, 1 return-reset minute/delivery, 15-minute/hour cap).
- A cleaning or preparation task can be marked **Completed by someone else** with a tick. This sets the task complete, preserves the completion timestamp, closes any open segment safely, and contributes zero driver cleaning duration. Existing timed and quick-complete semantics remain separate.
- The Tasks “Today” time summary is split into three explained sections: **Shift time** (paid time, deliveries and official breaks), **Store work** (cleaning, dishes, rush-ready and delivery preparation), and **Time check** (operational leeway, unallocated time and usable time after leeway). The explanatory copy is informational only; it does not change any calculations.
- The Tasks “Today” summary also shows four roll-ups: **Total shift time**, **Total delivery time**, **Total store work**, and **Time left to allocate** after delivery and store-work timers. Total store work uses cleaning + preparation + all other timed store tasks; dishes is a visible subset of cleaning and rush-ready is a visible subset of other store work, so the cards are not intended to be added together again.
- Historical Shift Activity now shows the same four time roll-ups as the live On Shift view. The old “Other paid time” leftover label has been removed; its underlying stored timestamps are untouched and the value is now clearly labelled **Time left to allocate**.
- Historical Shift Activity now also shows **Average delivery time** across completed Single/Double timers, **Average to customer** from explicit Delivered taps, and the recorded Customer 1/Customer 2 timings. Customer 1 is measured from saved GPS store exit (or delivery start when exit is unavailable); Customer 2 is measured from the Customer 1 Delivered tap. The active delivery action changes from `DELIVERED` to `RETURN TO STORE` after the final required customer (after customer 2 for a Double). No delivery is finalised until the existing geofence/return action succeeds.
- Dashboard, history, editable locked historical shift details, JSON backup/import, CSV export, and browser-print delivery/shift/week reports.

### GPS route-evidence pipeline

1. Starting a Single or Double starts an optional local route-evidence record and seeds the store-inside state.
2. While a delivery is open and the foreground PWA can obtain location, `watchPosition` samples high-accuracy GPS.
3. Valid samples are persisted to the delivery only at the configured movement/time threshold: Standard 40m/25s or High 20m/12s. Points with accuracy over 250m are rejected.
4. Samples contain latitude, longitude, timestamp, accuracy, optional speed and heading. Gaps, permission/unavailable/timeout/resume issues, approximate distance and stationary periods are recorded.
5. The 35m geofence uses hysteresis and conclusive-reading logic. Exit/entry events are saved separately and linked to the delivery.
6. `DELIVERED` saves a local GPS customer event (one per customer for a Double). A driver may alternatively mark a route point as the customer house; a plausible stop/turnaround is otherwise inferred from the route.
7. Back at Store finalises the route, calculates its retention expiry and calculates actual-vs-expected timing when an expected snapshot exists.
8. If the completed route records customer wait of at least three minutes, Back at Store first saves the entire trip and then opens the optional **Customer Wait Check**. It supports no-answer door/phone, slow answer, not ready, payment/collection or other reasons plus a short general note. `Skip for now` stores only that it was skipped; it can be added/edited later at the bottom of Delivery Route Evidence.
9. A route map and PDFs show the retained route. Expired route records retain metadata/counts but remove their point arrays.

Foreground/browser limitation: the watcher is stopped when the page is hidden and restarted on focus/visibility return. It is not native Android background GPS; locked-screen/background reliability still needs real-world testing and a future Capacitor/native implementation if required.

### Route maps and movement/traffic analysis

- Leaflet + OpenStreetMap tile maps remain implemented for live and historical route evidence. The settings card shows a fixed tile preview centred on the protected statistics boundary, with a separate physical-store marker. Settings → GPS & Routes → Store Location provides editable Store Map Pin label/coordinates, `ADJUST STORE MAP PIN` (interactive Leaflet map with drag/tap marker), `SET STORE PIN FROM CURRENT GPS` (accuracy confirmation), and `RESET`. These controls only change the physical pin. Route maps include the red physical STORE marker and the blue protected 35m REAL STATS GEOFENCE circle separately; historical maps use the corrected pin without rewriting route evidence.
- Google route snapshots use the physical store pin as the route origin/return destination. Store departure/return detection and all delivery-statistics analysis continue to use the activity's saved protected geofence centre/radius.
- Route distance is derived from retained GPS points; it does not overwrite manual work mileage.
- Movement classes are derived locally from GPS speed: free flow, moderate, slow, stop/start/heavy and stationary. The UI explicitly labels these as GPS-derived movement rather than confirmed traffic.
- The map/report includes outbound, customer, return, leave-store and entry-to-button timing when enough evidence exists.
- Customer-stop duration, moving/stationary time, average/median movement speed, GPS confidence, gaps and sampled-point count are calculated.
- The bottom of Delivery Route Evidence shows **Customer Wait Note** for a qualifying customer stop. Saved text is shown as `DRIVER NOTE`; it is kept separate from GPS/traffic labels and never changes original route statistics.
- Same-road outbound vs return comparison is implemented locally by matching sufficiently close GPS movement sections; it does not request Google.
- Manual route-point context markers exist for customer house, traffic light, road delay and other waiting.
- Traffic-light stop classification combines local stationary periods with nearby OSM traffic-signal nodes. Signal-queue/gridlock inference groups repeated slow/stationary approach movement to a mapped signal; both are evidence/inferences, not ground-truth traffic data.
- The historical shift editor has route cards, View Route and PDF actions; there is no separate aggregate time-of-day traffic-pattern analytics screen.

## OSM / Overpass road intelligence

**Status: IMPLEMENTED corridor road context; traffic conclusions remain GPS-derived/inferred.**

`lib/osmRoadIntelligenceService.ts` queries Overpass once for a padding-expanded numeric bounding box made from **all** recorded GPS route points. The corridor padding is clamped to 100–300m (the route modal requests 200m). It fetches traffic signals, stop signs, give-way controls, pedestrian crossings, traffic calming, roundabouts, common road classes, mapped speed metadata, one-way/access tags and turn-restriction relations. Way/relation centres are used as map context; no route geometry is invented. It keeps up to 16 browser-local regional context entries for 60 days, uses a ten-minute negative-cache hold while offline, shares identical in-flight corridor requests, and migrates older signal-only caches. Opening the same historical route from cache normally makes zero new OSM requests; map pan/zoom never triggers a fetch or reanalysis. Road context is loaded from the complete route before the evidence map renders and can be toggled visually without changing analysis.

Implemented:

- traffic-signal nodes/ways, with GPS-accuracy and junction-offset tolerant matching;
- stop signs, give-way controls, pedestrian crossings and traffic-calming markers;
- roundabouts, road classes and explicit mapped speed-limit metadata;
- one-way/access tags and turn-restriction context;
- complete-route GPS corridor / bounding-box query, regional cache, legacy migration, in-flight dedupe and temporary failure back-off;
- historical route analysis with no Google Routes call;
- direct signal-stop and downstream signal-queue analysis;
- visual-only `SHOW/HIDE ROAD FEATURES` map control with source-labelled OSM popups;
- API & CONNECTIONS settings now lists every OSM feature used when the toggle is ON, including the GPS-corridor/privacy and zero-Google boundary;
- OSM/local source labels, so a user-confirmed feature is not displayed as OpenStreetMap evidence;
- local event classification options and a device-local `TRAFFIC_SIGNAL` correction workflow (use stop location or pick a map position);
- Settings → GPS & Routes → Traffic classification → Local road corrections with reanalyse, view, edit and delete controls.

Still limited:

- road geometry is represented by OSM feature/way centres rather than a full routable graph;
- speed analytics use only explicit mph/km/h tags and do not infer units for bare OSM values;
- OSM road context is descriptive evidence. It does not claim live traffic or override GPS movement without a matching stop/approach pattern.

The OSM query API accepts no address strings and does not require a customer address. It does transmit a bounding box derived from route GPS coordinates to Overpass, so it is address-free but not location-free.

## Google Routes / traffic

**Status: IMPLEMENTED, opt-in and currently unconfigured per device unless a restricted key has been entered in that device's Settings.**

- Production calls use Google Maps JavaScript API's supported Routes library with `TRAFFIC_AWARE`, `durationMillis`, `staticDurationMillis` and `distanceMeters`. The previous direct browser call to Routes REST is retained only as an injected unit-test transport; it is not used by the PWA.
- The device-local API key remains stored under `shift-tracker-google-routes-api-key-v1` and excluded from `AppData` backups. It is client-visible by design, so Google Cloud must enable **Maps JavaScript API** and **Routes API**, restrict the key to the production website origin, and restrict its API permissions to those two APIs.
- Trigger is locked in the service and the UI now invokes it only after an explicit live `DELIVERED` action. The tap first requests a fresh high-accuracy GPS point, then waits for **two uncached same-origin connection-health responses ten seconds apart** before reserving either Google call. The connection gate waits for up to five minutes and makes no Google request itself; a timeout/cancel records that no Google call was sent. Rendering, settings, startup, delivery start, history and route viewing cannot spend Google Routes budget.
- A first Delivered point can make one outbound and one return `TRAFFIC_AWARE` snapshot. The result records traffic-aware duration, static duration, distance and a 120-second customer-service allowance. It never changes the delivery timer/mileage. If the driver reaches Back at Store before the network response returns, the completed snapshot is still attached to the delivery and compared with the confirmed return time; clock-out without a confirmed return remains unavailable.
- Results are cached locally for six hours by route fingerprint. The ledger reserves quota before network access, serialises reservations across tabs, has a clock-rollback safety block and never automatically retries a request after it has been sent. Build 200 postpones the first request until the local connection gate passes; Build 201 adds a manual recheck that performs only the same zero-cost local health probe. It cannot complete both required checks itself or reserve/consume Google capacity. Build 202 adds no request: it only presents the raw Google road ETA alongside a same-week, non-test GPS average for store departure and return hustle, and uses that combined figure for the displayed expected-versus-actual comparison.
- The current source hard limits are: **3,000 rolling 30 days**, **150 rolling 24 hours**, **2 network calls per delivery**. A driver-confirmed refresh can add **up to 2 extra calls for that delivery only** (one outbound and one return), once. The global rolling limits cannot be overridden. Usage warnings are Elevated at 2,000, High at 2,500, Critical at 2,800 and Locked at 3,000.
- A local request audit displays triggers, caller, result and a coordinate-based route fingerprint. The fingerprint uses rounded origin/destination coordinates, so it is not address text but is sensitive location metadata.
- Build 193/194 expands that audit into a detailed settings log. Each entry can show a stable outcome code, human meaning, network/cache state, request type, delivery ID, trigger, caller, endpoint, HTTP status, completion time, elapsed milliseconds, execution stage, retry count and the rounded-coordinate fingerprint. The summary separates completed results, final failures, incomplete/legacy rows and blocked/not-sent attempts. New safe stages distinguish browser/network exceptions, HTTP errors, unreadable responses, missing route data and saved results.
- The same page includes a diagnostic code dictionary covering `GOOGLE_API_ROUTE_COMPLETED`, `CACHE_HIT`, `NETWORK_REQUEST`, key/request/provider failures, no-usable-route, unavailable, missing-key, live-only and all app fuse blocks. No raw provider body, API key, address or image is written to the log.
- Provider failures are now kept as safe, actionable categories in the local audit and saved snapshot: invalid request/coordinates, rejected key or API permission, Google rate limiting, no usable route, or browser/provider unavailability. Raw Google error payloads are never stored. Invalid coordinates are rejected before a network reservation, and a failed request is never retried automatically.
- Settings → API & Connections → Google Routes includes an optional coordinate-only **TEST DELIVERY**. It requires a working clocked-in shift, Google Routes enabled and a saved key, then creates a visibly labelled test Single; the driver still taps Delivered, so the existing live path makes the normal outbound and return requests. It never calls Google merely from opening Settings, stores no customer address, and is excluded from delivery counts, reimbursement, operational allowances, tracked delivery/work totals, CSV exports and PDF delivery reports. The test remains visible in the active route log as `TEST ONLY` for inspection and may use the existing maximum of two Google calls for that delivery.
- When the normal two-call delivery allowance is exhausted, a live route view offers **UPDATE GOOGLE ROUTING**. The modal requires a checkbox confirming the extra use. After two stable connection checks, the refresh bypasses the route cache, records `manual_route_refresh` / `active_shift.route_refresh_confirmation` in the audit ledger, and replaces outbound, return, total and under/over Google benchmark values for that delivery. GPS route points, actual timer values, mileage and history are never overwritten. A second refresh is blocked locally.

Expected external Google Cloud limits (manually configured) are about 150/day and 10/minute. These are not provable from the source checkout; do not alter them during routine app work.

## Google address lookup / geocoding

**Status: IMPLEMENTED IN SOURCE, NOT CONFIGURED ON THE HOSTED SITE AT INSPECTION.**

- Uses Google Geocoding API through same-origin server route `/api/google/geocode`.
- The route reads `GOOGLE_GEOCODING_API_KEY` from server environment only; it does not expose the key to the browser or Settings.
- The PWA has a browser-local lookup ledger and 10-minute result cache. Ledger entries retain a hash fingerprint rather than the text address.
- Source hard limits: **5,000 rolling 30 days**, **150 rolling 24 hours**, **10 per minute**, **3 per delivery**. Limits are checked before the proxy/network call. Cache hits remain usable when the hard limit is locked.
- A Nova scan can start one lookup, while Start/Confirm & Start reuses that result rather than sending a duplicate request. A successful match is shown with an explicit “I confirm this is the correct destination” checkbox; coordinates are not applied to the new delivery until every shown match is accepted. Failed/manual lookups remain optional and never block the local timer.
- The hosting environment metadata contained no environment variables at inspection, so the live endpoint cannot successfully geocode until the protected secret is added and a deployment applies it.

## Nova / OpenAI vision

**Status: IMPLEMENTED IN SOURCE, NOT CONFIGURED ON THE HOSTED SITE AT INSPECTION.**

- Take Photo and Choose Screenshot are wired to resize the selected image in memory (maximum 1600px) and submit it to `/api/nova/extract-delivery-address`.
- The server route calls the OpenAI Responses API with a strict JSON schema and a narrow prompt to extract only house/name, street, locality, postcode, candidate full address, confidence and uncertainty; it tells the model to ignore customer names, phone numbers, payment/order/store details and not guess missing components.
- `OPENAI_API_KEY` and optional `OPENAI_ADDRESS_MODEL` are server environment values. No OpenAI secret is placed in browser JS, localStorage, IndexedDB or the Settings screen.
- Source-side PWA safety rules: **50 network scans/24 hours**, **500/30 days**, **2 per delivery**, serialised calls and a 15-minute fingerprint cache. The ledger holds image hashes and outcome metadata, not image bytes.
- The selected screenshot/photo is not persisted by the delivery-address flow. It is read/resized in memory and sent to the protected endpoint; the browser input is reset. The source has no server image store and no explicit server-side deletion call. The source cannot prove an external provider's retention/deletion policy. (Cleaning photo proof is a distinct optional IndexedDB feature.)
- The host currently has no environment variables, therefore Nova status should report missing configuration and scan attempts should safely fall back to manual entry/Skip Address.

## Delivery address and privacy lifecycle

### Text address / house number

- During an active delivery, `deliveryDestinations` can temporarily contain full text address, house number/name, street, locality, postcode and geocoded coordinates.
- The driver can paste/type, Take Photo, Choose Screenshot, Skip Address or Start Delivery. Skipping leaves route evidence active without an address.
- At `DELIVERED` (default) or Back at Store (user configurable), `sanitiseDeliveryDestinations()` removes `fullAddress`, house number/name and `destination` coordinates. Retained historical address detail follows the chosen setting: street + full postcode, street + postcode sector, street only, postcode sector only, or none.
- Startup also clears the Nova and Google-Geocoding short caches when there is no active precise destination. Cancelling a delivery removes its activity/event and its stored address data.
- CSV export does not include address or route coordinates. Google/Nova ledgers are not part of the `AppData` JSON backup. JSON backups now use a cloned, privacy-sanitised copy: active full address, house number/name and destination coordinates are excluded from the downloaded file while the live active-delivery state remains intact on the device.
- Customer wait notes are local structured driver context. The UI asks the driver not to enter names or addresses; they are not added to the Google/Nova/OSM ledgers or CSV export and do not call an external service.
- Nova's 15-minute local candidate cache can retain extracted address fields after a scan. Normal Delivered/Back at Store cleanup clears it, but the current Skip Address action does not explicitly clear it immediately; it expires on its own. This is a temporary-data cleanup gap.

### GPS coordinates / Delivered point

- Route points, inferred stops, manual Delivered events, user-selected customer points and Google expected-route customer coordinates are **not** removed by the text-address sanitiser.
- They remain in live `AppData` while route evidence is retained (default 90 days; configurable to 30 days or forever). Route expiry removes `routeEvidence.points`, stationary-stop coordinates, `customerEvents` and `expectedRoute.customer`; route counts/timing metadata remain.
- Historical maps, PDF maps and route analytics use this retained GPS evidence. This is intentional for route evidence, but it conflicts with the broader Settings wording that says exact destination coordinates are deleted. Treat it as a real privacy gap before claiming complete location erasure.
- Address strings do not flow to OSM. OSM receives a route-derived numeric bounding box; Google Geocoding receives the full pending address only through the protected server proxy; Google Routes receives origin/destination coordinates.

## API safety status

| Service | Hard app-side fuses | Cache / duplicate protection | Request records | Spend risk |
| --- | --- | --- | --- | --- |
| Google Routes | 3,000/30d; 150/24h; 2/delivery | 6h cache, browser queue/Web Locks/localStorage lease, two-pass 10-second stable-connection preflight (max 5m), live-delivery-only caller gate, no retry after send, clock rollback block | browser-local ledger | Client-side restricted key; cached/results/ledger location metadata remain local. |
| Google Geocoding | 5,000/30d; 150/24h; 10/min; 3/delivery | 10m cache, serial queue, pre-network reservation | browser-local hashed-query ledger | Hosted secret is currently absent. When configured, scans and Start Delivery trigger calls automatically within fuses. |
| Nova vision | 500/30d; 50/24h; 2/delivery | 15m image-fingerprint cache and serial queue | browser-local image-hash ledger | Hosted secret is currently absent. Images are sent to the server/OpenAI only on Take Photo/Choose Screenshot. |
| OSM/Overpass | No numeric request limiter | up to 16 regional context entries for 60 days; 10m failure back-off; in-flight dedupe | no ledger | Free external request, but route-bounds location disclosure and public-service availability should be considered. |

## Known risks and gaps found in source

1. **Route GPS remains foreground web GPS:** hiding/locking the PWA stops the watch. The app restarts it on return, but background/lock-screen evidence is not reliable enough to present as native tracking.
2. **OSM remains dependent on public map completeness:** missing/incorrect tags are covered by wider matching and local corrections, but OSM cannot be treated as ground truth or live traffic.
3. **Live Nova/Geocoding secrets are absent:** host environment metadata is empty, so those protected services are source-complete but non-functional until secrets are configured and deployed.
4. **No aggregate historical traffic-pattern analytics:** individual route analysis exists; time-of-day pattern reporting is absent.
5. **Lint warnings:** 29 warnings; most are unused symbols, image optimisation notices or effect dependency warnings. The build/test suite still passes, but dependency warnings are worth addressing carefully in a later focused stability pass.
6. **Old handover is stale:** `SHIFT_TRACKER_HANDOVER.md` describes a much earlier 1.6.5.0 implementation and says route maps/services do not exist. Do not use it as authoritative current state.
7. **Screenshot lifecycle is not end-to-end provable:** the app does not persist address-scan images, but it has no explicit external deletion operation after sending an image to Nova, and Skip Address leaves the short local Nova candidate cache until expiry.
8. **Route evidence still contains exact GPS while within its configured retention window:** the privacy-safe backup removes precise address fields, but intentionally preserves route evidence needed for local route history. Revisit this policy before promising complete coordinate erasure.

## Recommended next work (in order)

1. **Real-world verify Build 186.** Check complete-route OSM loading without moving the map, cached repeat opens, road-feature visibility/source labels, signal offset/queue matching and local correction reanalysis on the Android PWA; also re-check the existing time roll-ups, customer timings, Store Map Pin and protected boundary.
2. **Define the retained-coordinate policy.** Decide whether route points should remain exportable during their retention window or whether backups should omit route coordinates too.
3. **Configure and smoke-test protected services safely.** Add `OPENAI_API_KEY` and `GOOGLE_GEOCODING_API_KEY` as protected site secrets only, deploy once, and test one Nova scan plus one confirmed geocode while checking each ledger. Do not expose or paste secrets into the app.
4. **Real-world GPS reliability pass.** Test live foreground delivery, temporary signal loss, screen lock/background/resume, Delivered at customer and store re-entry. Record evidence of gaps before considering a native Android/Capacitor background-GPS layer.
5. **Deepen OSM matching carefully.** Add route-shape/heading matching and confidence explanations for road controls, while keeping corridor-only queries, caching, local corrections and zero-Google historical reanalysis.

## Safe continuation rules

- Preserve `dominos-shift-tracker-v1` and run `migrateAppData()` for all schema changes; do not reset local data.
- Preserve manual delivery timing/mileage as primary; GPS/API outputs are supplementary evidence.
- Do not make API calls from rendering, history, map opening, settings, retries or background effects.
- Do not weaken the Google Routes limits (3,000/30d, 150/24h, 2/delivery), current Geocoding limits, or Nova limits without an explicit billing/privacy review.
- Do not put OpenAI or Google Geocoding secrets into client code, local storage, IndexedDB, exports or Settings.
- Keep OSM address-free. Its road queries must accept only GPS/corridor geometry, never a customer address string.
- Before publishing further changes, run `npm test` and `npm run lint`; explicitly verify route/privacy behaviour with a real delivery before treating it as production-proven.

## Web App 2.1.11 / Android shell 2.2.0 integration audit

- Fixed the native GPS delivery seam without changing geofence, analytics or
  canonical ingestion: Android WebMessages arrive as JSON strings, and the PWA
  now parses them only after exact-origin and 64 KiB bounds checks, then applies
  the existing schema/range validation. Browser GPS remains unchanged outside
  the trusted shell and suppressed while the shell owns an active delivery.
- The full native diagnostic vocabulary is accepted. Service starting/active,
  waiting for fix and sample received keep native ownership; background grant
  guidance is informational; permission/provider/service failures remain hard
  states. Provider coordinates, timestamp and accuracy are not invented or
  rewritten.
- Route recording settings show the staged Android permission state and a
  user-initiated route to App Info for Android 11+ `Allow all the time`. This is
  capability only. Single/Double starts; Delivered continues; Back at Store or
  Cancel stops; idle never starts native collection.
- Existing PWA `<input type="file">` flows are unchanged. Android 2.2.0 now
  fulfils them with the external camera/document picker and a cache-only
  FileProvider, without CAMERA, READ_MEDIA or storage permissions. Existing
  cleaning-photo IndexedDB storage and retention are unchanged.
- Browser backup and CSV downloads are unchanged. In the exact-origin shell,
  export uses a named, size/MIME/filename-bounded message and Android's
  create-document picker. Import still uses the same hidden JSON input,
  `validateData`, migration, explicit restore confirmation and replacement.
  Photo blobs and separately stored API keys remain excluded from JSON backup.
- Production build and 90 tests pass. Lint has the repository's 28 existing
  warnings and no errors after documenting the stable native listener ref.
- Audit finding: OpenAI and Google geocoding secrets stay server-side, but the
  public API routes rely on browser-local usage fuses rather than server-side
  identity/quota enforcement. They resist accidental app overuse, not direct
  scripted abuse. Keep secrets server-side and treat app-owned authentication
  or hosting-level rate limiting as required before claiming abuse resistance.
  The user-entered Google Maps JavaScript key must remain origin/API restricted.

## Web App 2.1.21 / Android shell 2.2.6 viewport and resume follow-up

- Real Samsung Fold comparison confirmed that the trusted Android WebView can
  report a taller small viewport than the standalone/browser PWA and stretch
  the flexible Current Shift row. Only `.native-shell` now caps that row to the
  browser-sized responsive range; normal PWA CSS is unchanged and the native
  page retains scrolling above fixed navigation.
- Android 2.2.6 replaces the default white Activity/WebView canvas with the
  app's light/dark background, uses the existing launcher icon for Android 12+
  splash, and shows a subtle pulsing-icon overlay until the exact trusted page
  reports a committed/visually ready frame. It does not clear or reload PWA
  storage on an ordinary resume.
- The working native GPS, permission, foreground-service, encrypted recovery,
  exact-origin dispatch, canonical ingestion, camera, backup/restore and
  delivery lifecycle paths were not changed.
- Web production build and all 98 tests pass. Lint has the existing 28 warnings
  and no errors. Android XML/source contract checks pass; the next definitive
  Android compile remains the existing Java 17 GitHub Actions cloud build.

## Web App 2.1.22 native delivery-card and rapid re-entry guard

- Only inside the exact-origin trusted Android shell, the active Single
  delivery card uses a calmer dark-red treatment and a shorter responsive row.
  The ordinary browser/PWA card styling and layout are unchanged.
- A valid native GPS route point continues through canonical route storage, but
  an `inside` geofence candidate received less than 60 seconds after the saved
  confirmed store exit is ignored for return-state purposes. This prevents a
  brief fused-location boundary bounce from starting the return Hustle timer.
- The guard is native-sample-only, retains the original provider timestamp and
  accuracy, does not interpolate or discard route coordinates, and does not
  change browser `watchPosition`, geofence hysteresis, Delivered, Back at Store,
  Cancel, permissions, foreground service or the exact-origin bridge.
- The developer log records `NATIVE_REENTRY_GUARD_ACTIVE` when suppression is
  used. At exactly 60 seconds normal two-sample store-entry confirmation resumes.
- Production build and all 100 tests pass. Lint remains at the existing 28
  warnings with zero errors.

## Web App 2.1.23 APK-only delivery-card and expected-route follow-up

- The trusted Android shell delivery card has been raised from the overly
  compressed 2.1.22 size to a balanced medium height. Its calmer dark-red
  treatment remains, and ordinary browser/PWA dimensions and colours are
  unchanged.
- A native live route with a saved Delivered customer point and
  `GOOGLE_API_NOT_CONFIGURED` no longer headlines `Available after Delivered`.
  It explicitly confirms that Delivered GPS was saved and that Google Routes
  is not configured in the Android app's separate local settings.
- The APK-only route panel offers `SET UP ROUTING` while the restricted key or
  toggle is absent. Once configured, the same saved live delivery offers
  `TRY GOOGLE ROUTING`, which re-enters the existing two-check connection gate
  and normal request-limit path; rendering still cannot trigger Google calls.
- API keys remain excluded from backups and are not copied between Chrome and
  Android WebView storage. GPS evidence, native foreground tracking, geofence
  rules, request fuses and browser/PWA behaviour are unchanged.
- Production build and all 100 tests pass. Lint remains at the existing 28
  warnings with zero errors.

## Web App 2.1.24 APK-only Hustle Timing layout

- Only inside the exact-origin trusted Android shell, the live-delivery Hustle
  Timing row grows from the compressed 96px allocation to 132px (124px when a
  backup reminder is also present). The panel padding, timing cells, labels and
  primary values scale with that space instead of leaving a narrow letterbox.
- The Delivered/Return to Store action remains a separate final grid row and is
  never placed over the Hustle cells. Normal browser/PWA sizing and styling are
  unchanged.
- Hustle calculations, geofence timestamps, native GPS, the 60-second rapid
  re-entry guard and all delivery actions are unchanged; this is presentation
  only.
- Production build and all 100 tests pass. Lint remains at the existing 28
  warnings with zero errors.

## Web App 2.1.25 APK-only Hustle box space

- Only inside the exact-origin trusted Android shell, the Hustle Timing card
  uses a tighter header, smaller outer padding and a smaller header-to-grid gap.
  The reclaimed height is given to the three timing boxes so their primary
  values and supporting labels remain visible instead of clipping at the
  bottom.
- The Hustle row itself stays the same size introduced in 2.1.24. The separate
  Delivered/Return to Store row, normal browser/PWA layout, timing calculations,
  geofence state, native GPS and delivery actions are unchanged.
- Production build and all 100 tests pass. Lint remains at the existing 28
  warnings with zero errors.

## Web App 2.1.26 delivery deletion and beta-data boundary

- Shift Details now offers DELETE on each completed delivery run. A destructive
  confirmation modal requires the exact uppercase word `DELETE` before the
  permanent action unlocks; running deliveries cannot be removed through this
  history correction path.
- Deletion removes the delivery event and its linked store exit/entry markers,
  fuel reimbursement, Delivered/customer events, geofence/Hustle timestamps,
  GPS route and expected-route evidence as one record. Shift hours, breaks,
  cleaning records and manually entered work mileage remain untouched. A manual
  individual-delivery override is reduced by the deleted run's customer count.
- Settings → App & data has an `Include beta data` tick control. It defaults
  off. Shifts clocked in before 23 August 2026 00:00 Europe/London are retained
  but excluded from normal History, Dashboard/Hustle statistics, fuel totals,
  week PDFs and CSV exports. Turning the control on includes those records
  again.
- Full JSON backups always retain beta records regardless of the reporting
  switch, so this boundary cannot silently discard historical local data.
- Production build and all 104 tests pass. Lint remains at the existing 28
  warnings with zero errors.

## Web App 2.1.27 Today’s Deliveries deletion shortcut

- Tasks → Today’s Deliveries now exposes the same guarded DELETE action beside
  every completed delivery, including the newest run at the top of the list.
- The confirmation still requires typing the exact uppercase word `DELETE`.
  Active deliveries remain protected and cannot be removed from this list.
- Deletion continues through the existing domain operation, removing the run,
  linked fuel, Delivered/customer events, geofence/Hustle timestamps, GPS and
  expected-route evidence together while preserving shift hours, breaks,
  cleaning records and manually entered work mileage.
- Normal device-local persistence, backups, Android native GPS and bridge
  behaviour are unchanged.
- Production build and all 104 tests pass. Lint remains at the existing 28
  warnings with zero errors.

## Web App 2.1.28 beta-data switch styling

- Settings → App & data now presents `Include beta data` as a compact,
  right-aligned on/off switch instead of the oversized tick box.
- The entire row remains tappable and exposes the same pressed state for
  accessibility. Its default-off behaviour, 23 August 2026 boundary,
  reporting exclusions and full-backup retention are unchanged.
- Production build and all 104 tests pass. Lint remains at the existing 28
  warnings with zero errors.

## Web App 2.1.29 APK compact-layout resume fix

- The oversized APK-only Single/Double area was caused by the trusted-shell
  grid leaving its delivery row as `auto` while the Android WebView viewport
  could still stretch that row into all remaining space. The trusted Android
  shell now uses a bounded responsive delivery row and start alignment, keeping
  the Current Shift card and delivery controls in the compact control-surface
  layout shown by the PWA. Browser/PWA layout rules are unchanged.
- Exact-origin native-shell detection is now sticky after the injected bridge
  has been verified. A page-show or visible-resume event safely repeats the
  existing shell handshake, so an Android pause/resume cannot momentarily drop
  the `native-shell` layout class and fall back to the oversized design.
- This is hosted presentation/bridge-presence handling only. Shift data,
  breaks, GPS acquisition and ingestion, geofence rules, delivery actions,
  camera, backups/restores and Android permissions are unchanged.
- Production build and all 104 tests pass. Lint remains at the existing 28
  warnings with zero errors.

## Web App 2.1.30 APK Hustle space correction

- Only in the trusted Android shell, the idle/at-store Hustle Timing row now
  uses the same 132px allocation as the live-delivery layout (124px when the
  backup reminder is present). This uses the safe empty space above the fixed
  Shift Actions lip and gives the three timing cells room for their values and
  supporting labels.
- The compact Current Shift and Single/Double sizing from 2.1.29 is preserved.
  Browser/PWA layout, Hustle calculations, shift data, GPS, geofence behaviour,
  delivery actions and the Android shell itself are unchanged.
- Production build and all 104 tests pass. Lint remains at the existing 28
  warnings with zero errors.

## Web App 2.1.31 confirmed-return action fix

- Real-device evidence showed the trusted APK simultaneously displaying
  `INSIDE STORE GEOFENCE` and `AT STORE` while Return to Store was rejected by
  a stale live-provider state. The UI was correctly using the delivery's saved
  canonical `storeEntryAt`, but the final action still checked only the latest
  transient location state.
- A valid, observed and timestamped canonical store-entry event now remains
  sufficient for the normal Return to Store tap. The five-second GPS override
  remains required when neither a canonical store return nor a current
  confirmed-inside reading exists. The same rule protects the return-and-start-
  task path, keeping action state consistent with the visible geofence state.
- No coordinates are invented and no permission, GPS acquisition, geofence,
  delivery timing, PWA storage or Android service behaviour is changed.
- Production build and all 105 tests pass. Lint remains at the existing 28
  warnings with zero errors.

## Web App 2.1.32 beta Hustle quality control

- Enabling `Include beta data` now reveals a separate
  `Include unusual beta Hustle times` switch. The nested switch defaults off.
- The quality filter affects only beta Hustle averages, records and delivery-
  only Hustle history. It does not remove beta shifts or alter their hours,
  wages, deliveries, mileage, fuel, backups or restore data.
- A beta run is marked unusual only after at least five complete exit-and-
  return samples exist, and only when an exit or return delay is both at least
  60 seconds away from the robust median and at least three times higher or
  lower. Missing GPS is ignored, and production runs are never filtered.
- Users can explicitly include the unusual beta timings with the nested toggle.
  Its current detection count is shown in Settings so the behaviour is clear.
- Production build and all 106 tests pass. Lint remains at the existing 28
  warnings with zero errors.

## Web App 2.1.33 cleaning-status tick layout fix

- The green tick beside `No cleaning expected` now has a fixed 34px flex basis
  and square aspect ratio, so long copy, narrow viewports and larger text cannot
  squeeze it into a vertical pill.
- Cleaning eligibility, compliance calculations, optional-rota behaviour,
  tasks and existing shift data are unchanged.
- Production build and all 107 tests pass. Lint remains at the existing 28
  warnings with zero errors.

## Web App 2.1.34 OSM controls and map-marker declutter

### Audited feature classification

| Existing feature | Classification | Production dependency found |
| --- | --- | --- |
| Traffic signals | Optional | OSM signal-stop matching and queue context only. GPS movement and stationary evidence remain independent. |
| Stop signs and give-way controls | Optional | OSM junction context and marker display only. |
| Pedestrian crossings | Optional | OSM crossing context and marker display only. |
| Traffic calming and roundabouts | Optional | OSM calming/junction context and marker display only. |
| Road classes and mapped speed limits | Optional | OSM descriptive context/counts and marker popups only; not used for GPS timing or geofence logic. |
| One-way, access and turn restrictions | Optional | OSM descriptive road-control context and marker display only. |
| Complete-route corridor loading | Locked while master is ON | Shared, cache-safe input path required to obtain whichever optional OSM groups are enabled. It is OFF when the OSM master is OFF and is not a dependency of core Shift Tracker behaviour. |

- None of the listed OSM data groups is required by GPS route recording,
  native/browser GPS, the protected statistics geofence, exit/entry detection,
  Hustle timing, Delivered/customer timestamps, historical evidence, Leaflet
  rendering or OpenStreetMap base-map tiles.
- The existing single `OSM road intelligence` master switch is retained. When
  it is OFF, optional rows are visibly OFF and disabled, no optional Overpass
  request is started, and saved per-feature choices remain available for the
  next ON state.
- Per-feature settings are persisted in `AppData.settings`. Existing installs
  migrate to all optional OSM groups enabled, preserving previous behaviour.
- Corridor queries are built only for enabled feature groups. Cache keys track
  group coverage, compatible wider cached responses satisfy narrower requests,
  and switching a feature or the master OFF does not clear cached intelligence.
  The existing 60-day expiry, 16-entry bound, legacy migration, in-flight
  deduplication and ten-minute negative-cache back-off remain in place.
- Both the individual delivery map and the all-route summary now respect the
  master switch. This closes the previous summary path that could load OSM
  context even when the master was OFF.
- OSM road-feature markers, including traffic-signal icons, are hidden whenever
  an evidence map opens. One `SHOW ROAD FEATURES` control reveals the marker
  layer and changes to `HIDE ROAD FEATURES`; hiding it changes no analysis or
  cache state. GPS route lines, Delivered/customer markers, store/geofence
  milestones, route gaps and base-map tiles remain available by default.
- Privacy boundaries are unchanged: Overpass receives only numeric recorded-GPS
  corridor bounds. No customer name, address, house number, receipt text, API
  key or Google request is introduced.
- This is a hosted PWA-only change. No Android native source, GPS service,
  permissions or APK artifact changed, so no APK rebuild is required.
- Production build and all 113 tests pass. Lint has zero errors and the existing
  28 warnings.

## Web App 2.1.35 post-audit stability hardening

### Backup creation and restore

- Full JSON exports now use a versioned `dominos-shift-tracker-backup` envelope.
  It records the creation timestamp, Web App version, data-schema version,
  backup-format version, validation profile and counts for shifts, deliveries,
  activities, retained GPS points, payments, task snapshots and beta shifts.
- Export still runs the existing `prepareAppDataForBackup` privacy sanitiser
  before the file is created. Precise/temporary delivery destination fields are
  reduced according to the existing privacy setting; API keys, provider
  ledgers/caches, receipt images and cleaning-photo blobs remain outside
  `AppData` and are not added to the backup.
- The completion dialog explicitly confirms that the file was downloaded and
  shows record totals, the creation time, app version and format version.
  Download failures show a clear warning and do not advance `lastBackupAt`.
- Restore parsing, complete validation and migration happen against a separate
  candidate. Current local data is not written until validation succeeds and
  the user explicitly confirms the mobile preview. Cancelled or failed restore
  returns the exact existing dataset unchanged; no partial import path exists.
- The preview shows validation status, backup date/version, shift and delivery
  totals, retained GPS-point count, approximate shift date range and beta-data
  presence. Errors are limited to short record paths/messages and never expose
  raw JSON, addresses, keys or other large/sensitive payloads.
- Validation covers top-level schema; settings and enums; shifts, breaks,
  mileage and reimbursement links; deliveries and linked activities; Delivered
  events; GPS points, routes, gaps, issues and stops; Hustle/geofence timestamps;
  expected-route metadata; route annotations; customer-wait context; temporary
  or sanitised destinations; cleaning/task history and photo metadata; payments;
  payroll schedules; cleaning/preparation rotas; OSM/local road settings; beta
  flags; privacy/retention settings; duplicate identifiers; and declared backup
  counts. Unsupported format/schema versions and malformed nested records are
  rejected before any write.
- Backwards compatibility is deliberate: the prior raw `AppData` JSON export
  remains importable as a historical format, and known version-1 fields that
  existing migration code safely supplies (including older route status/count/
  retention metadata and newer optional settings) may be absent. Present fields
  must still be correctly typed and valid. Historical missing payment links are
  reported as compatibility warnings rather than used to lock out an otherwise
  valid older backup.
- Today-state device transfer keeps its existing narrow replacement semantics,
  but its candidate `AppData` now receives the same nested structural validation
  before it can be merged.

The versioned envelope and validation profile are the recovery-point foundation
for a future release. Automatic local snapshots were deliberately not added in
this pass: adding a second retention/storage lifecycle without recovery UX would
increase corruption and storage-pressure risk. A future design should create an
immutable, checksummed, bounded pre-restore snapshot, verify it before rotation,
and offer a dedicated recovery screen. Cloud backup, live sync, accounts, a
server database and cross-device conflict resolution remain explicitly deferred.

### Data-integrity audit

- Delivery-run deletion already removed the owning delivery event, GPS route,
  Delivered events, Hustle/geofence timestamps, expected-route snapshot and
  linked store exit/entry activities together. Shift hours, breaks, cleaning and
  manually entered work mileage remain intentionally untouched.
- One real referential gap was fixed surgically: deleting a paid delivery now
  preserves the actual amount received as historical fact while recalculating
  only that payment's expected entitlement. Deleting a shift now removes its ID
  from every directly linked payment, recalculates the remaining expected total,
  and removes a payment record only when no linked shift remains. Tests cover
  both paths.
- OSM corridor cache is regional rather than delivery-owned. Google/Geocoding
  and Nova request ledgers/caches are quota/audit records rather than route
  evidence. They are deliberately not deleted with a delivery or changed by
  backup restore, avoiding quota rollback and unrelated cache loss.

### Accessibility and mobile audit

- The existing UI already uses semantic buttons and labelled inputs for the
  audited settings/import paths; toggles expose native checked/disabled state,
  dialogs have names, and important backup status now includes text rather than
  colour alone.
- The bottom navigation now exposes the current page with `aria-current`. The
  safe default action in the destructive backup-restore preview receives focus.
- Dialog backdrops now include general top/bottom safe-area padding and can
  scroll; dialog bodies have a safe viewport maximum height. This addresses
  fixed-navigation/notch overlap without device-specific Fold/Samsung rules.
- A comprehensive focus-trap/return-focus abstraction for every legacy dialog
  was not introduced because the main client component contains many established
  modal paths and changing them together would be a broad behavioural refactor.
  Centralising dialogs behind a tested focus-management primitive is a future
  accessibility improvement.

### Maintainability audit and deliberate exclusions

- `components/ShiftTrackerApp.tsx` remains the principal high-risk module at
  more than 500KB and owns many cross-feature UI paths. Provider/cache logic and
  deletion/import actions are sensitive coupling points. The backup validator
  was therefore isolated in `lib/backup.ts`; no broad component, persistence,
  GPS or service refactor was attempted.
- Future work should first extract the backup/restore screens and modal focus
  primitive, then use behaviour-preserving seams for settings and route-evidence
  views. It should not rewrite GPS, geofence, delivery or payroll domains merely
  to reduce file size.
- Native Android GPS/service/permissions/bridge, browser GPS sampling, route
  recording, geofence calculations, store exit/entry, Hustle and Delivered
  timing, OSM intelligence, Google Address Validation, Nova Vision, wage/payroll,
  fuel formulas, cleaning rules, API limits, retention rules and beta filtering
  were not changed.
- Production build and all **125 tests** pass. Lint has **zero errors** and the
  existing **28 warnings**. No native source changed: **Android APK rebuild not
  required.**

## Web App 2.1.36 accessibility and mobile hardening

### Audit findings and safe fixes implemented

- The audit found 48 independently rendered `aria-modal` dialog paths in the
  main client component. Most had correct dialog semantics and an associated
  heading, but there was no common focus trap or focus restoration, 11 paths
  did not declare a name directly in their opening markup, and the full-screen
  photo viewer had no heading. A small presentation-only manager now watches
  the existing conditional dialogs without migrating or rewriting their
  business logic.
- When a dialog appears, focus moves to its explicit initial/autofocus target,
  first usable control or the dialog itself. Tab and Shift+Tab stay within the
  active/top dialog, and an attempted focus move into the background is returned
  to that dialog. Closing restores the still-connected opener; if it no longer
  exists after a state change, focus falls back to the current navigation item
  or the nearest sensible main-page control.
- Existing headings are associated automatically when a legacy dialog lacks an
  explicit `aria-labelledby`. A heading-free image viewer uses its image
  description, and an otherwise unnamed icon-only `×` button receives “Close
  dialog”. This avoids visible UI clutter and leaves already-correct explicit
  names untouched.
- Escape is deliberately conservative: it works for an explicit safe dismiss
  target or a dialog with one clearly informational action such as `OK`, `GOT
  IT` or `CLOSE PHOTO`. It does not bypass restore, deletion, clock-out, payroll
  or other multi-action confirmations.
- Application-styled settings toggles now expose `aria-pressed` from their real
  visual state and acquire their row's feature name when needed. Native
  `disabled` remains the authoritative disabled/locked state. OSM settings and
  request behaviour were not changed.
- Historical custom collapsible section headers now expose and update
  `aria-expanded`; their existing Enter/Space activation is retained. Native
  `<details>/<summary>` sections already expose expanded state and were left
  alone. Main navigation already exposes `aria-current`, and the global visible
  focus outline remains intact.
- Status audit found the important shift, GPS, delivery, warning, success,
  locked-setting, OSM and API states already combine readable text with their
  existing colours/icons. No theme redesign was required.
- The genuinely small priority targets were raised to at least 44px: period
  arrows, Hustle navigation/close, route and geofence modal close controls,
  route-map actions, settings back controls and break-correction actions.
  Primary shift/delivery/navigation/modal actions were already suitably sized.

### Mobile, safe-area and large-text findings

- All normal main tabs already use bottom content padding equal to the fixed
  navigation plus `safe-area-inset-bottom`; this general solution remains in
  place for Shift, Tasks, Dashboard, History, Fuel and Settings.
- The live Shift layout previously exposed its inner overflow fallback only in
  the trusted Android shell. The same contained scrolling safety net now applies
  to browser/PWA mode, so enlarged text or an unusual short viewport can still
  reach content above fixed navigation without changing the normal fitted
  control-surface layout.
- Dialogs, route reports and map-pin dialogs retain `svh` fallback sizing and
  now prefer `dvh` where supported. Dialog inputs have scroll margin for the
  software keyboard, long dialog bodies contain their own scrolling, headings
  wrap rather than disappear, action labels may wrap, and safe-area padding is
  retained. No device-specific Samsung/Fold dimensions or fragile visual
  viewport JavaScript were added.
- Bottom-navigation labels now tolerate constrained width and wrapping while
  preserving the existing six-item visual design. No global font reduction was
  used.

### Deliberately deferred

- The 48 legacy dialog render paths were not structurally migrated into a new
  shared React component. The focus manager is an incremental foundation; a
  wholesale JSX migration, background `inert` ownership and central dialog
  state architecture would be a broad regression risk in the 500KB+ main
  component and remain future work.
- Complex delivery evidence, GPS/history and route workflows received the
  shared keyboard presentation behaviour only. Their structure and underlying
  state transitions were not refactored.
- Real-device validation of TalkBack, Android normal/large/maximum practical
  font scaling, keyboard resize behaviour and unusual device aspect ratios is
  still required after deployment. Desktop screen-reader combinations should
  also be sampled in a later dedicated assistive-technology pass.
- Large-scale component decomposition remains separate future maintainability
  work. No backup, data, GPS, geofence, Hustle, Delivered, OSM, Google, Nova,
  payroll, wage, fuel, cleaning, limits, retention or beta semantics changed.

### Verification and release

- Added eight targeted accessibility/source-contract tests covering focus order
  wrapping, initial focus, trapping and restoration contracts, conservative
  Escape handling, accessible dialog naming, icon-only close naming, toggle and
  locked state semantics, expandable state, keyboard activation, safe-area
  padding, dynamic viewport sizing, large-text scrolling and touch targets.
- Production build passed and the generated Sites Worker/hosting manifest was
  validated. Full automated results: **133/133 tests passed**. Lint: **zero
  errors**, with the same **28 existing warnings** from legacy unused symbols,
  image optimisation and hook dependency findings.
- No native Android source or dependency changed. **Android APK rebuild not
  required.**

## Web App 2.1.37 report return and dark-mode contrast fix

- PDF/report HTML now carries the exact Shift Tracker URL that launched it and
  shows a sticky **BACK TO SHIFT TRACKER** action above every delivery, shift
  and weekly report. In a genuine separate window it focuses/closes back to the
  opener; when Android WebView replaces the app view, it navigates directly
  back to the tracker instead. The action is excluded from print/PDF output.
- Android Settings now explicitly keeps the **What’s changed** heading and
  other non-accent changelog headings light in explicit and system dark mode.
  The current-release accent remains unchanged.
- Added two source-contract tests for the report escape route/print exclusion
  and both dark-mode paths. No report data, GPS evidence, PDF content, stored
  data or Android native source changed.
- Production build passed. Full automated results: **135/135 tests passed**.
  Lint remains **zero errors** with the same **28 existing warnings**.
- **Android APK rebuild not required.**

## Web App 2.1.38 Tasks screen design and organisation pass

### Audit and hierarchy

- Audited the production `TasksPage` source rather than relying on screenshots. The Today tab contains the current shift/time summary, delivery history, other-work history, cleaning responsibility and override controls, cleaning progress, all Quick Task groups and their stacked timer, Rush Prep, Other Paid Work, the cleaning/preparation rota, task timers, quick completion, someone-else completion, notes, photos and the existing task/delivery confirmation dialogs. The Analytics tab and all of its calculations were left unchanged.
- The default Today source and focus order is now: compact current status, Quick Tasks, Cleaning, Timed Work, then Today’s Breakdown. This places current/actionable information before lower-priority history and analysis without CSS-only visual reordering.
- The compact current-status card reuses existing cleaning summary, completed count, store-work time and active timer values. Its `RUNNING`, `ACTION` and `CLEAR` text means status is not conveyed by colour alone.

### Presentation changes

- Quick Tasks remain immediately below current status. Every existing group, button label, disabled state, stacked-timer behaviour, start-time confirmation and finish action is retained, with the existing touch-friendly controls unchanged.
- Cleaning now has one consistent area. Assigned cleaning keeps its progress and actions prominent; unassigned cleaning uses quieter spacing while preserving role selection, Auto/Yes/No override and the existing optional rota access.
- Rush Prep and Other Paid Work now sit under a shared **Timed Work** heading. They remain separate controls and continue to use their existing independent activity names and handlers. Idle cards are visually quieter; a running timer receives the existing active treatment plus a readable `RUNNING` label.
- The large time analysis, today’s delivery/GPS history and other paid-work history are grouped under a native, keyboard-operable **TODAY’S BREAKDOWN** disclosure, collapsed by default. Expanding it restores every existing total, explanatory note, map/delete action and detailed category value. No information was removed.
- Removed the previous CSS `order` rules so visual order and keyboard/screen-reader order remain aligned. Added responsive two-column compact status cells on narrow screens, wrapping-safe headings, native focus indication and retained the application-wide fixed-navigation/safe-area bottom clearance.

### Behaviour and safety

- No feature was added. No existing information or action was removed. No task calculations, task timing, cleaning assignment/eligibility, delivery, GPS, geofence, OSM, Google, Nova, payroll, wage, fuel, backup, storage or native Android behaviour changed.
- No stored schema or existing data semantics changed. The release is a hosted-PWA JSX/CSS presentation update only.
- Added six Tasks layout/source-contract tests covering action-first section order, Quick Task handlers and states, cleaning controls, separate timed-work handlers, collapsed native disclosure semantics, retained detail labels, responsive compact layout and safe-area reachability.

### Verification and release

- Targeted Tasks tests passed: **6/6**.
- Production build passed and the Sites artifact validator confirmed the ESM Worker entrypoint and hosting manifest.
- Full automated suite: **140/140 tests passed**.
- Lint: **zero errors**, with the same **28 existing warnings** from the pre-existing large component, hook dependency, image and unused-symbol findings.
- No native Android source or dependency changed. **Android APK rebuild not required.**

## Web App 2.1.39 GPS mileage and shift-task workflow

### GPS mileage prefill

- The existing live **MILES** figure and final shift check now share one delivery-route mileage helper. It totals saved, real driving delivery `routeEvidence.distanceMetres`, excludes walking deliveries and diagnostic/test activities, ignores totals below 80 metres as GPS noise, then rounds to the existing one-decimal-mile storage format.
- At clock-out the GPS total prefills blank direct mileage. In odometer mode it can prefill the end reading only when a valid start reading already exists. It never overwrites mileage already entered by the user, remains visibly editable and is still confirmed through the existing mileage step.
- No GPS sampling, ingestion, native location service, geofence, route recording, delivery or Hustle calculation changed. This release only consumes the existing saved route-distance evidence.

### Cleaning outcomes and first shift task

- Cleaning/preparation task records can now be documented as **Unable to complete** with a controlled professional reason and a required manager-on-shift name. Available reasons cover store workload, reassignment to preparation/other duties, manager direction, equipment/safety, the shift ending, and another operational reason.
- An unavailable outcome does not mark a task completed or add completed-cleaning credit. It is retained in task history and backups, displayed with its reason and manager, excluded from the clock-out count of unaddressed tasks, and can be returned to the rota. Backup validation accepts complete new records while continuing to support older records where these optional fields do not exist.
- Newly created shifts now show a one-time **What are you starting first?** prompt immediately after clock-in. It offers the cleaning tasks assigned for that day, the existing **Getting rush ready** timer and **Skip for now**. Choosing a task starts the existing timer path; Skip records no task. Migrated/current historical shifts are marked as already handled so the prompt is never shown retroactively.

### Presentation, compatibility and safety

- Settings now uses a compact, visible **BETA** stamp in both Beta-data controls and consistent Beta casing in the supporting copy.
- Existing shift and backup records remain backwards compatible. No data is deleted or silently migrated to a different meaning.
- No Android native source, GPS/geofence logic, cleaning eligibility, delivery logic, mileage storage format, payroll, fuel, OSM, Google or Nova implementation changed.
- Targeted validation covered GPS filtering/prefill, migration, unavailable outcomes, backup acceptance/rejection, the first-task prompt and BETA presentation.
- Production build passed and the generated Sites Worker/hosting manifest was validated. Full automated suite: **149/149 tests passed**. Lint: **zero errors**, with the same **28 existing warnings** from legacy unused symbols, image optimisation and hook dependency findings.
- **Android APK rebuild not required.**

## Web App 2.1.40 payroll calendar and rollover fix

### Audit findings

- The Dashboard countdown previously subtracted local midnight from a date parsed at local noon and applied `Math.ceil`. On the cut-off date that remaining half-day rounded up to `1`, producing both the off-by-one result and the fixed plural wording `1 days until cut-off`.
- The displayed payroll record was selected by the calendar month currently shown on the Dashboard, not by whether the configured period start/cut-off dates contained today. Consequently the 27 July–23 August record could remain presented after the next period had started.
- Existing `PayrollSchedule` records already retain period start, cut-off, payday, four/five-week state and `paidAt`. The fix uses that existing structure; it does not replace the payroll schema or rewrite shifts.

### Date and period behaviour

- Added isolated date-only payroll helpers. The user's local year/month/day creates the current calendar key; comparisons use calendar ordinals, so time-of-day, UTC timestamp parsing and 23/25-hour daylight-saving days cannot change the day count.
- Countdown wording is now `X days until cut-off`, `1 day until cut-off`, or `Cut-off today`. A passed cut-off returns no countdown and cannot produce zero or a negative display. Payday wording receives the same singular/today/passed safety.
- On 23 August 2026, 27 July–23 August remains the active period. On 24 August the configured four-week cycle derives 24 August–20 September with payday 29 September. Successors are calculated from the stored period length/dates rather than hard-coding those examples, and reopening after several days can advance through more than one elapsed cycle safely.
- Derived successor schedules are saved as ordinary compatible payroll records. The completed predecessor is never deleted, merged or marked paid automatically.

### Active, awaiting and paid records

- The existing Payroll card keeps the active period prominent. Completed unpaid periods appear in a compact **AWAITING PAYMENT** row with their period and expected payday.
- **MARK PAY RECEIVED** targets the selected completed period only. It records `paidAt` without changing the active period and no longer makes creation of the next cycle depend on payment confirmation.
- A collapsed Payroll History list retains completed periods, period boundaries, expected payday, paid/awaiting state, received date, shift count, paid hours, gross estimated wages plus delivery/fuel reimbursement, and the existing date editor.
- Payroll totals continue to select completed shifts by their immutable clock-in timestamps inside each period's local start/end boundaries. Rollover does not move old shifts into the new period. No wage, fuel, reimbursement, deduction or adjustment calculation changed.

### Compatibility and verification

- No stored payroll data required migration. Existing schedules remain valid; the only new persisted data is a successor schedule in the same pre-existing format when a configured cycle rolls forward.
- Backup/export/import validation is unchanged and remains compatible. Added coverage confirms active, awaiting and paid schedule records survive backup validation with their payment timestamps intact.
- Focused payroll/backup tests passed **20/20**. Full automated suite passed **157/157**. Production build and Sites artifact validation passed. Lint remains **zero errors** with the same **28 existing warnings**.
- No GPS, geofence, Hustle, delivery, cleaning, Android bridge or native source changed. The same local-date logic runs in the browser PWA and Android WebView. **Android APK rebuild not required.**

## Web App 2.1.41 additive dual-geofence Hustle comparison

### Architecture audit and preserved operational path

- The canonical delivery GPS entry point is `applyLocationReading` in `components/ShiftTrackerApp.tsx`. Browser `watchPosition`, fresh PWA samples and trusted native foreground-service messages already converge there. This release does not add another GPS watcher or native service.
- `REAL_STATS_GEOFENCE` remains exactly `53.56845, -2.88802`, radius `35m`. Its existing presence refs, accuracy limit, hysteresis, consecutive-sample confirmation, native 60-second re-entry guard, transfer guard, operational `locationState`, vibration, chime and `store_exit`/`store_entry` activities remain the only drivers of live return/completion behaviour.
- Added `DOMINOS_REFERENCE_GEOFENCE` at `53.56822592818352, -2.887807336362812`, radius `75m`. It consumes the same accepted canonical fixes through a pure reusable evaluator, but keeps its own presence, pending-confirmation, last-sample and exit state. Its transitions never call the chime, vibrate, change Back at Store availability or append operational store-transition activities.
- Single/Double, Delivered, Back at Store, native/background GPS, browser duplication prevention, geofence completion checks, Expected Delivery road routing and route sampling were not replaced or refactored.

### Evidence, analytics and UI

- New delivery records can retain independent Domino's exit/entry timestamps, observed/unobserved flags, started-outside state and the fixed boundary snapshot. Existing Real timestamp fields and meanings are unchanged.
- `deliveryGeofenceDurations`, weekly Hustle allowance and best-record aggregation accept a complete source (`real` or `dominos`) and default to `real` for backwards compatibility. A calculation never combines an exit from one boundary with an entry from the other.
- Dashboard Hustle performance now has a segmented **REAL HUSTLE | DOMINO'S HUSTLE** selector, persisted in Settings. Day/week/month/overall averages, best records, history and individual delivery timing use the selected dataset and identify it visibly.
- Delivery evidence includes a compact expandable comparison showing both boundary exit/entry timestamps. Its route map displays a solid blue Real 35m circle and a dashed amber Domino's Reference 75m circle. The Settings map and reference copy explain that the 75m boundary is this app's comparison reference, not proof of every corporate metric.
- Expected Delivery Time keeps **ROAD ONLY | WITH HUSTLE** unchanged. ROAD ONLY adds no Hustle. WITH HUSTLE uses the selected complete weekly Real or Domino's dataset and labels the source; Google road snapshots and request limits are unchanged.

### Historical data, storage and backup compatibility

- Old delivery records are not rewritten and Real Hustle is never copied into Domino's fields. When retained route points contain a conclusive inside → outside → inside sequence with the existing accuracy, hysteresis, confirmation, gap and rapid-re-entry safeguards, Domino's evidence is derived locally and labelled as reconstructed. If that sequence is missing, expired or insufficient, the UI reports **Not recorded**.
- No destructive local-data migration is required. Migration only supplies the backwards-compatible Settings default `hustleStatsSource: "real"`; existing activities remain unchanged with optional new fields absent.
- Backup validation accepts and validates the new optional timestamps, booleans, coordinates/radius and source enum. Backups from releases before 2.1.41 remain valid and restore with Real Hustle selected. Today-state transfer resumes Real and Domino's presence independently.

### Verification and release safety

- Focused coverage exercises fixed coordinates, independent exit/return order, boundary confirmation/bounce behaviour, rapid re-entry, non-mixing durations, historical reconstruction/insufficient evidence, selected records, active-delivery recovery, old/new backups, state transfer, one canonical watcher, no comparison chime/notification path, map/evidence labels and Expected Delivery source wiring.
- Full automated suite: **169/169 tests passed**. Production build and the Sites Worker/hosting artifact validation passed. Lint: **zero errors** with the same **28 existing warnings**.
- No Android native source or dependency changed. Native foreground GPS remains canonical while the WebView is backgrounded/locked, and both boundary evaluators consume its existing messages. **Android APK rebuild not required.**

## Web App 2.1.42 post-audit repair and data-safety hardening

### Scope audited

- Re-traced startup persistence, migrations, backup validation/import/export, History delivery correction, address validation and Nova receipt-address handling, individual shift PDFs, History/CSV Hustle calculations, native bridge restore coordination and the production service worker from the current 2.1.41 source.
- Reused the existing `AppData`, migration, delivery-deletion, reimbursement, privacy, native bridge and route/mileage helpers. GPS ingestion, both geofence evaluators, Hustle formulas, payroll, cleaning, wage/fuel logic, OSM, Google Routes and Nova service behaviour were not redesigned.

### Emergency local-data protection

- Startup now distinguishes a fresh/valid load from a failed parse, schema check or migration. A failed primary value is left byte-for-byte untouched; the app enters a recovery screen and cannot auto-save an empty dataset over it.
- Added separate local-only versioned sidecars: `dominos-shift-tracker-v1-recovery-v2`, `dominos-shift-tracker-v1-failed-source-v1` and `dominos-shift-tracker-v1-revision-v1`. They do not change the primary `AppData` key or any backup format.
- A validated previous primary is retained as a last-known-good recovery point before replacement. Recovery snapshots are refreshed at a bounded interval to limit write amplification, apply the same address privacy reduction as portable backups, and are never populated from invalid data. Successful startup also prunes route points from the physical recovery sidecar once their existing retention boundary passes. A failed primary can be exported, a validated recovery can be explicitly restored, and **Start fresh** requires a second destructive confirmation.
- Important saves now validate, serialise, write and read back through one guarded persistence path. Quota/storage/serialisation/verification failures keep the current in-memory state open, preserve the prior recovery copy and show a retry warning. Exact primary-value comparison plus the browser `storage` event stops a stale tab silently replacing a newer tab's data.

### Integrity, backup and runtime repairs

- History Single/Double reductions now use the canonical delivery deletion behaviour. The linked event, activity, route, customer, Real/Domino geofence, Hustle and related delivery-owned evidence are removed together; payment expectations are recomputed. The complete candidate dataset is validated before the corrected shift replaces the original.
- Full Backup now validates the exact privacy-sanitised final document with the import validator before serialisation/download or `lastBackupAt` success. Existing route/geofence evidence and compatible old backup formats remain supported.
- Validation now accepts only the app's supported ISO timestamp form and rejects impossible calendar dates/times, reversed shift/break/activity/task/segment relationships, overlapping breaks, decreasing odometer readings, invalid payroll ordering, duplicated/overlapping payroll periods and straightforward containment/link violations. Migration still runs before compatibility-sensitive final rules, while present GPS route evidence is checked before migration can discard a malformed point. Existing and newly edited History records align their clock-in/out timeline markers to their shift boundaries before validation/export.
- Manual and Nova-derived delivery addresses now share an explicit, tested address-resolution helper and use the `ActiveShift` Settings prop, removing the undefined `data` runtime path. Blank, skipped, successful, failed and disabled validation paths remain startable under the existing privacy rules.
- Individual shift PDF generation now calls the existing canonical metres-to-miles formatter, so a shift containing delivery evidence no longer references an undefined function. The report toolbar also respects viewport safe areas, printing is idempotent, and repeated customer text labels no longer obscure the route.
- Standard History and CSV timing calculations now request **Real Hustle** explicitly. Array indexes can no longer be passed accidentally as a Hustle source.
- Full restore plans native tracking against the operational open delivery. The validated replacement is saved before bridge side effects; stale native tracking is stopped when necessary, late stop acknowledgements cannot clear the restored delivery's return guard, bridge write failures are contained, state refs are reseeded, and only the restored active delivery is resumed. The same canonical native/browser GPS ownership rules and single watcher remain in place.
- Service-worker v42 uses navigation-only HTML fallback, network-only API/provider requests, successful suitable same-origin caching, an exact version-gated asset prewarm and one retained previous app cache. Failed or uncached JS/CSS/assets never receive HTML (including server 200/404 shell responses); an old hashed asset may use its exact retained copy on a network error or server 404. A failed new core install leaves the previous working cache intact.

### Compatibility, deliberate deferrals and verification

- No `AppData` schema migration was required. Existing local data and backup format 1 remain compatible. The three recovery/revision sidecars are local persistence metadata only and are absent from exports.
- No cloud sync, account system, database, broad component refactor, payroll rule change, GPS/geofence formula change or new product feature was added.
- The APK-only slow Real-geofence return issue was deliberately not changed. The repository's old embedded Android 2.1.0 workspace was not treated as the authoritative installed source, no native file changed and no APK was rebuilt. The next native pass remains blocked on recovering/verifying the exact installed APK source/build lineage and obtaining a focused return-entry reproduction/log.
- Full suite: **205/205 application tests passed**, plus **1/1 rendered-artifact test**. Production build and Sites artifact validation passed. Lint: **0 errors / 28 existing warnings**.
- Strict TypeScript was reproduced at **150 errors before** and **121 errors after**. No `any`, `@ts-ignore` or rule disable was added. The remaining count is 92 production UI/library typing errors, 26 test-fixture typing errors and 3 Cloudflare worker/environment declaration errors; the modified storage/address/PDF/restore modules have no remaining strict errors.
- **Android APK rebuild not required.**

## Web App 2.1.43 emergency backup compatibility repair

### Regression repaired

- Web App 2.1.42 could reject a Full Backup with `activity falls outside its shift` when a legitimate historical activity or task segment retained its recorded seconds after the minute-precision History editor had saved the visible clock-out minute.
- Backup validation now accepts only the mechanically explainable end-boundary difference: up to 59.999 seconds after a minute-aligned historical clock-out. Activity starts, canonical break records, delivery events, reversed times and records one full minute or more outside the shift remain strict validation failures. Existing timestamps are preserved exactly; no evidence is clamped, deleted or fabricated.
- Where the minute-edit compatibility rule does not already apply, a separate five-second allowance preserves an old instantaneous store-entry/exit marker that an already in-flight GPS callback could commit immediately after clock-out. New Real and Domino’s geofence commits now re-check that both the shift and delivery are still open before writing, without changing either geofence formula, GPS source, watcher, transition logic or chime behaviour.
- Opening a shift in History no longer silently removes seconds from clock-in, clock-out or break timestamps. The controls remain minute-based visually, while the stored precision stays unchanged unless that field is actually edited.
- Backup envelope counts are checked against the exact pre-migration document they describe. Compatibility migration may still add supported defaults on restore without creating a false count mismatch. Malformed nested records are caught and reported rather than throwing during count verification.
- A completed shift can no longer import with a still-open break, timed activity, activity segment, active task or task segment. Active/open shifts continue to back up normally; the rule prevents completed historical duration totals growing against the current time.

### Compatibility and safety

- No `AppData` or backup-format migration was added. Existing shifts, deliveries, route/geofence evidence, payroll, cleaning/task records, settings and recovery sidecars retain their current storage meaning.
- No Android/native source changed and no APK was rebuilt. This is a hosted PWA repair only.
- Targeted executable tests cover the reported 1–59 second historical activity/segment case, the one-minute rejection boundary, strict starts/breaks/delivery events, legacy late geofence markers, closed-delivery geofence guards, pre-migration count verification and malformed nested count input.
- Full automated suite: **215/215 application tests passed**, plus **1/1 rendered-artifact test**. Production build and Sites artifact validation passed. Lint: **0 errors / 28 existing warnings**. Strict TypeScript remains **121 errors**, unchanged from 2.1.42 and outside the modified repair paths.
- **Android APK rebuild not required.**

## Web App 2.1.44 browser/PWA backup-import consistency repair

### Root cause audit

- The Android shell has no separate Full Backup importer and does not bypass web validation. Its bridge is used only when saving/exporting a file. APK WebView, installed PWA and ordinary browser imports all originate from the same hidden file input and must end in `validateBackupDocument`.
- The reported wording can only be produced at the backup-envelope signature stage: the object parsed by that running client did not expose the exact Full Backup `kind`. This was not a nested-schema failure and globally weakening validation would have hidden the real mismatch.
- Two client-boundary defects made browser diagnosis and consistency unsafe: import relied directly on `File.text()` with no explicit byte/encoding stage, while an installed PWA could continue executing its old JavaScript after a replacement service worker claimed the page. The service worker prewarm was also posted only to the currently active worker, so a newly installing/waiting worker could miss the current asset list. The APK's normal hosted refresh made it much less likely to retain that stale running importer.
- The old UI collapsed a wrong JSON type, unsupported encoding, malformed JSON, stale importer and genuine validation rejection into broad messages. It therefore could not distinguish a Full Backup from the adjacent Today’s State JSON workflow safely.

### Repair

- Added one environment-neutral byte pipeline for Android WebView, installed PWA and browser files: `arrayBuffer` → explicit UTF-8/UTF-8 BOM/UTF-16 decoding → `JSON.parse` → the existing canonical `validateBackupDocument`. Filename and MIME are diagnostic metadata only and never decide acceptance.
- Safe import diagnostics record only client class, byte count, decoding/parse/validation stage, generic reason code, recognised document class, format number and syntactically safe app version. They never record file names, backup contents, addresses, GPS coordinates, API keys or arbitrary JSON values.
- A Today’s State file selected under Full Backup now receives an accurate instruction to use **Import Today’s State**. It remains rejected by the Full Backup validator; the two replacement semantics are not merged.
- Added an uncached published-version check before import. A stale installed client is stopped before it reads the file and is directed through Refresh App. Service-worker controller replacement now reloads the already-open document exactly once, and the current asset manifest is sent to active, waiting and installing workers. `version.json` remains network-only through the service worker so an obsolete cache cannot claim to be current.
- Backup format 1, supported raw historical backups, nested/relationship validation, transaction-like preview/confirmation, failed/cancelled import protection, privacy sanitisation and the 2.1.43 sub-minute historical compatibility rule are unchanged.

### Compatibility and verification

- No `AppData`, backup-format, localStorage or Android/native migration was added. No Android source changed and no APK was rebuilt.
- Executable regression coverage sends byte-identical current backups through Android-WebView, installed-PWA and browser client labels; exercises supported historical JSON, actual browser `File` objects, filename/MIME independence, UTF-8 BOM, UTF-16, invalid JSON, non-Shift-Tracker JSON, Today’s State classification, unchanged data after failure and uncached stale-version detection. Existing service-worker upgrade/offline and complete backup suites remain active.
- Full automated suite: **224/224 application tests passed**, plus **1/1 rendered-artifact test**. Production build and Sites artifact validation passed. Lint: **0 errors / 28 existing warnings**. Strict TypeScript remains **121 errors**, unchanged; no new strict error was introduced in the new import/version modules.
- **Android APK rebuild not required.**

## Web App 2.1.45 Real geofence state/ownership repair

### Confirmed root cause

- The operational Real presence evaluator was held in component-global refs rather than being owned by an active delivery ID. Real state also lacked the per-delivery reload recovery already used by the comparison boundary.
- A first outside baseline after an unknown/reloaded state could be followed by an inside transition that wrote `storeEntryAt` even though the current delivery had no `storeExitAt`. A later exit could then be recorded after that stale/invalid entry.
- `hasConfirmedStoreReturn` checked entry alone, and the live UI treated any saved entry as stronger than later outside GPS. This produced the impossible sequence seen on-device: an entry before exit, **AT STORE** while miles away, and a growing Back-at-Store value for the wrong phase.

### Repair and preserved behaviour

- Real evaluator state now has an explicit current-delivery owner. Single/Double starts reset only transient evaluator/candidate state; completed delivery evidence remains untouched. Reload/restore reconstructs state only from that active delivery's saved evidence or retained canonical route.
- The protected Real centre and radius remain exactly `53.56845, -2.88802` and `35m`. Stored/imported display or legacy settings can no longer move the operational boundary. Entry occurs at 35m; exit retains the existing outer threshold at approximately 47m.
- An uncertain transition retains the first credible candidate provider timestamp and uses a later sample only as confirmation. Out-of-order provider samples are ignored. A Real entry is rejected unless the same delivery owns an earlier observed Real exit and entry is not earlier than exit.
- Real return/Back-at-Store Hustle now requires a complete ordered exit → entry sequence from the same delivery. Current live OUTSIDE state overrides invalid earlier entry evidence, so **AT STORE** cannot remain displayed while accepted current GPS says outside.
- **Back at Store cannot be completed or GPS-overridden before every required Delivered tap.** GPS evidence continues recording independently, but the operational return action is disabled until the Single customer or both Double customers are marked Delivered.
- Android bridge reconciliation accepts native ownership only after a positive delivery-ID acknowledgement or a canonical sample. A seven-second watchdog re-enables browser GPS on a visible client when native start is not confirmed. Stale delivery IDs/samples are stopped and cannot mutate a newer delivery. Terminal completion, cancellation and clock-out paths stop native tracking.
- The newer Android working source adds a pure protected-centre sampling policy, delivery-ID reporting, stale-session provider timestamp rejection and a targeted near-store request profile (2s desired / 1s minimum / 0m displacement / 2s maximum batching within 250m). Ordinary route sampling retains the existing battery-conscious 5s / 2s / 5m / 10s profile. This source lineage is not yet verified against the installed APK and no update-safe APK is claimed.

### Verification and remaining native gate

- Executable regression coverage starts inside, exits beyond 47m, remains outside beyond 0.25 miles and 1 mile with no entry/Hustle, returns at 35m with uncertain confirmation retaining the first timestamp, then computes Back-at-Store from that current delivery only. Additional coverage prevents previous-delivery entry inheritance and requires all Delivered taps.
- Full hosted suite: **228/228 application tests passed**, plus **1/1 rendered-artifact test**. Production build and Sites artifact validation passed. Lint: **0 errors / 28 existing warnings**. Strict TypeScript remains **121 existing errors** outside this scoped repair.
- Android candidate JVM tests were added, but this checkout has no Gradle wrapper, installed Gradle, Android SDK build path or signing identity. The candidate native source therefore has not been compiled into an APK here. The only two source trees found are embedded 2.1.0 and the dirty newer 2.2.4 working tree; installed 2.2.5/2.2.6 lineage and signing compatibility remain unverified.
- No `AppData` or backup migration is required. Existing shifts, history, route points, historical Real/Domino evidence, payroll, cleaning and backup format remain compatible.

## Web App 2.1.46 beta cutoff correction

- Settings now correctly states that retained Beta data covers shifts dated on or before **23 August 2026**.
- The underlying reporting boundary was moved with the wording: shifts before **24 August 2026 00:00 Europe/London** are Beta records, while shifts from that local midnight onward are live records.
- The same reporting filter now explicitly drives Tasks cleaning analytics as well as Dashboard cleaning totals/compliance, so Beta cleaning records are excluded whenever Include Beta data is off.
- The change only reclassifies reporting visibility. No shift is modified, migrated or deleted; Full Backup continues to retain every record and the existing Include Beta data control remains unchanged.
- Boundary regression coverage verifies the last millisecond of 23 August remains Beta and local midnight on 24 August starts live reporting. No Android/native source or storage format changed; an APK rebuild is not required.

## Web App 2.1.47 separate Beta cleaning control

- When Include Beta data is on, Settings now exposes a second default-off **Include Beta cleaning records** switch alongside the existing unusual Beta Hustle switch.
- Beta shifts may contribute to wages, deliveries and general reporting without contributing incomplete early cleaning checklists to cleaning compliance, Tasks cleaning analytics or Dashboard cleaning statistics.
- Turning the cleaning switch on deliberately includes those retained Beta cleaning records. Turning the main Beta switch off always excludes them regardless of the saved child setting.
- The optional setting is migrated safely to off for existing local data and old backups. Full backups preserve the choice without changing or deleting any shifts or task records.
- Executable coverage verifies the independent master/cleaning combinations, aggregate cleaning totals, migration default and backup round trip. No native Android code or storage schema version changed; an APK rebuild is not required.

## Web App 2.1.48 Expected Delivery Time Beta-Hustle consistency

- The locally averaged weekly allowance used by **WITH HUSTLE** now uses the same Beta and unusual-Beta filtering as Hustle analytics.
- Include Beta data off excludes every Beta run. Include Beta data on with unusual Beta Hustle off keeps Beta runs but removes only those already identified as unusual. Enabling the unusual Beta Hustle switch deliberately restores them to the weekly allowance.
- **ROAD ONLY**, the saved Google traffic-aware route snapshot, Google request limits/cache and API usage are unchanged. This repair only changes which already-recorded local Hustle samples are averaged on top of road time.
- The selected complete Real or Domino's Hustle source continues to be used without mixing boundaries. No stored delivery, route evidence or backup data is modified; no Android APK rebuild is required.
- Store Location's map-context heading and both geofence labels/values now use theme-aware ink in explicit and system dark mode. This is presentation-only: map tiles, display pin, protected Real boundary and Domino's reference boundary are unchanged.

## Web App 2.1.49 professional Settings hierarchy

- The Android-style main Settings page now uses one compact grouped list with restrained category icons, dividers and a clearer text hierarchy instead of seven oversized standalone cards.
- The GPS & Routes submenu uses the same grouped-row language, while every subpage now shares consistent panel borders, padding, inputs, section dividers and blue active switches.
- Explicit light, explicit dark and system dark modes all use the existing theme tokens. Tap targets remain at least 44px and large text can still wrap and grow rows.
- This is presentation-only. No Settings keys, saved values, control actions, GPS/geofence logic, payroll, cleaning, API behaviour, backup format or local user data changed. Android APK rebuild is not required.

## Web App 2.1.55 multiple cleaning-photo repair

- Root cause was a combination of storage and presentation faults: every IndexedDB photo operation opened a connection that was never closed, each high/compressed variant used a separate transaction, and failures were sent to a toast layered underneath the still-open photo modal.
- IndexedDB operations now resolve only after transaction completion and always close their database connection. Each high-quality/compressed pair is written atomically in one transaction, preventing a half-saved attachment.
- Multi-select images are prepared and saved sequentially instead of holding every processed photo in memory at once. The fallback decoder no longer calls unavailable `createImageBitmap`, and decoded resources are released after processing.
- The photo dialog stays open during processing, disables repeat taps and shows a visible in-dialog success/failure explanation. Photos already saved before a later selected file fails remain attached and are reported accurately. General toasts now layer above ordinary dialogs.
- Existing photo metadata, expiry periods, cleaning completion, notes, backups and local user data remain compatible. No data migration or Android APK rebuild is required.
- Verification: **249/249 tests passed**, including an executable atomic IndexedDB pair-write/connection-close test; production build and typecheck passed; lint remains at **0 errors / 28 existing warnings**.

## Web App 2.1.57 punctuality grace and late context

- The default and current-device punctuality grace period is now 10 minutes. Clock-ins from the scheduled start through 10 minutes after it classify as **On time** while retaining and displaying the exact clock-in difference.
- Clock In now opens a focused **Punctuality Check** only when the driver is more than the configured grace period late. It records one professional reason: traffic/road delay, public transport, vehicle issue, weather/road conditions, personal emergency, manager-requested delayed start, rota change or Other. Other requires a brief note.
- Late context is stored on the linked shift, shown in History detail and preserved by Full Backup validation. It never changes the actual clock-in timestamp, paid time, wages, payroll or rota snapshot.
- A settings-revision 7 migration applies the agreed 10-minute classification to existing scheduled shifts that used the earlier zero-minute default. It does not change their clock-in timestamps or other stored evidence. Backups without late context remain compatible.
- Unscheduled and 15+ minute early starts retain the existing area-manager approval flow. Rota notifications, cleaning, GPS, geofences, Hustle and Android native behaviour are unchanged; APK rebuild not required.
- Verification: **255/255 application tests plus 1/1 rendered-artifact test passed** with the UK timezone; production build and Sites artifact validation passed; lint remains **0 errors / 28 existing warnings**.

## Web App 2.1.60 professional Dashboard hierarchy

- Reorganised the existing Dashboard into five scannable priority zones: **Your day**, **Work summary**, **Pay**, **Performance** and **Store tools**. Current schedule/shift information remains first; the shelf-life reference now sits at the bottom where it no longer interrupts pay and performance reporting.
- Replaced the two consecutive full Week and Month cards with one accessible Week/Month segmented summary. Both periods, date navigation, totals and activity details remain available; the change is presentation-only.
- Payroll, awaiting-payment actions, Hustle source/range controls, Hustle history, all-time totals, geofence analytics and the complete store shelf-life guide all remain available with their existing behaviour.
- Added clear section headings, restrained separators, consistent spacing and a responsive two-column current-day treatment on wider screens. Mobile cards remain one-column with 36–44px controls and dark mode continues to use existing application tokens.
- No calculations, payroll rules, rota matching, GPS/geofence/Hustle logic, stored-data schema, backup format or Android native behaviour changed. No migration or Android APK rebuild is required.
- Verification: **261/261 application tests plus 1/1 rendered-artifact test passed**; production build passed; lint remains **0 errors / 28 existing warnings**. Strict TypeScript remains at the unchanged **120 pre-existing errors** and this Dashboard pass introduced none.

## Web App 2.1.58 Dashboard shelf-life guide

- Embedded the supplied **Campaign 4 Shelf Life Chart - All Stores** as a compact, collapsed Dashboard reference. The complete chart is separated into Defrosted/Frozen Before Use, Chilled Items, Chilled-Ambient Before Use, Ambient Items and original-packaging reference rules.
- The calculation anchor is the user's current local day whenever the Dashboard is opened. Day-based lives are inclusive: today is day 1, so a seven-day life opened on 25 August ends on 31 August. Calendar-day calculations use local midday to remain stable through Europe/London daylight-saving changes.
- True hour-based rules remain elapsed-hour calculations from the current time; they are not incorrectly rounded into calendar days. Multi-stage rules such as Bacon, Mac'n'Cheese, Garlic Butter, Double Decadence and ambient-use sauces show each independent period.
- The guide retains the source chart's categories, storage notes, pack-date rules and Campaign 4 validity date. It also warns that calculated dates cannot extend the original unopened use-by/best-before date and that current DPG guidance takes precedence.
- Tasks and Rota now have distinct keyed page roots. This prevents completed preparation-card DOM from being reconciled into the Rota/punctuality view during page changes; task data and preparation logic are unchanged.
- No stored-data schema, rota, cleaning/preparation timing, payroll, GPS, geofence, Hustle, backup or Android native behaviour changed. No data migration or Android APK rebuild is required.
- Verification: **260/260 application tests plus 1/1 rendered-artifact test passed**; production build and Sites artifact validation passed; lint is **0 errors**. Strict TypeScript remains at the unchanged **120 pre-existing errors** outside this feature.

## Web App 2.1.59 store shelf-life product selection

- Dashboard Shelf-life Date Guide now has an accessible **Choose products** mode. Every calculated product and original-packaging reference can be ticked or unticked, with Tick All and Untick All shortcuts.
- Unticked products are removed only from the normal guide. They are never deleted from the Campaign 4 source catalogue and can be restored at any time; if everything is unticked, the guide shows a clear empty state and a direct route back to product selection.
- The selection persists in `settings.shelfLifeHiddenProductIds`, is bounded and validated, and is included in Full Backup/Restore. Historical backups and existing local data default to no hidden products, so all products remain visible until the user deliberately changes the list.
- Hiding products is presentation-only. Shelf-life calculations, day-one inclusion, hour-based rules, tasks/preparation, cleaning, payroll, GPS, Hustle and Android native behaviour are unchanged. Android APK rebuild not required.
- Verification: **261/261 application tests plus 1/1 rendered-artifact test passed**; production build and Sites artifact validation passed; lint remains **0 errors / 28 existing warnings**. Strict TypeScript remains at the unchanged **120 pre-existing errors**, with none introduced by the shelf-life selection files.

## Web App 2.1.56 Google route retry cooldown

- Unavailable Expected Delivery Time snapshots now expose a compact retry control in delivery evidence.
- The control remains disabled for ten minutes from the saved failure timestamp and displays the remaining whole minutes; it then becomes **Retry Google Routing**.
- Retrying is an explicit, audited one-off action. It keeps the existing rolling Google limits and per-delivery override limit, performs the existing two stable connection checks ten seconds apart, and does not automatically loop.
- The retry reuses the saved coordinate-only customer point and existing store display pin. It never sends a customer name or text address.
- A successful retry replaces only the Google outbound, return and expected-total snapshot. GPS evidence, Real/Domino's geofence evidence, actual delivery timestamps, mileage, Hustle and payroll remain unchanged.
- Missing Google setup opens the existing API settings instead of pretending a retry was sent. Hard/daily/used-override safety-limit results never expose another retry.
- The control is available from current-shift task evidence and historical Shift detail evidence; historical detail state reconciles the updated snapshot without discarding unsaved History edits.
- Added executable cooldown tests for the exact ten-minute boundary, missing customer evidence and non-retryable safety-limit outcomes.
- No data migration or backup-format change. Android APK rebuild not required.
- Verification: **252/252 tests passed** with the UK timezone used by the rota contract; production build and Sites artifact validation passed; lint remains **0 errors / 28 existing warnings**. Strict TypeScript reports **120 pre-existing errors** outside this scoped change, down from 121 after narrowing the existing route-customer call safely.

## Web App 2.1.54 clock-in approval safeguard

- Clock In now checks the dated rota before starting a shift. A day without an unlinked Working entry is treated as unscheduled; a scheduled start exactly 15 minutes or more early is treated as early. Starts up to 14 minutes early and all on-time/late starts continue through the normal role flow.
- Unscheduled/early starts open a blocking, accessible confirmation before the existing role and mileage choices. The user must enter the approving manager's name and tick **Area manager approval confirmed**; cancelling leaves the app off shift.
- The resulting shift stores optional `clockInApproval` evidence: reason, approving manager, confirmation, recorded time and the scheduled start/minutes early where applicable. History detail displays the evidence, and Full Backup validates and preserves it. Existing shifts/backups without the optional field remain valid; no migration is required.
- Actual clock-in time remains authoritative for wages and attendance. Rota linking, punctuality calculation, cleaning responsibility, GPS, payroll, notifications and Android native behaviour are unchanged. Android APK rebuild is not required.

## Web App 2.1.53 rota editor visual repair

- Fixed missing design-token aliases that made the selected Working/Off state, Add Rota action and several weekly-editor surfaces render transparent or white-on-white.
- Working/Off is now a clear two-button segmented control. Selecting Working reveals usable Start Time and Shift Type controls with explicit mobile-safe input styling.
- Week navigation and Copy/Clear/Save actions now use visible borders, backgrounds, contrast and 44px+ targets in light and dark mode.
- The Shift reminder is compact and only appears while off shift. It is deliberately omitted once clocked in so the fixed live-shift layout cannot be stretched or push delivery controls behind navigation.
- Rota page navigation resets to the top when opened, preventing the page title from reopening underneath the system/status area.
- No rota data, attendance, notification, payroll, GPS, cleaning, backup or Android behaviour changed. No data migration or APK rebuild is required.

## Web App 2.1.52 rota discoverability

- Dashboard always exposes the weekly Rota: a scheduled shift remains the compact Next Shift card, while an empty/futureless schedule shows an Open Rota card.
- The Shift tab now shows a compact Add Rota reminder, matching the backup-reminder pattern, whenever the relevant week has not been saved. Monday–Saturday targets the current week; Sunday targets the following week.
- Saving even an all-Off rota counts as completing the week and removes the reminder. The Sunday prompt and Shift reminder both open the correct week directly.
- Schedule Settings now has a permanent View or edit schedule action above reminder preferences.
- No rota, clock-in, attendance, payroll, GPS, backup, notification or Android logic changed. No data migration and no Android APK rebuild are required.

## Web App 2.1.51 weekly rota, attendance and native reminders

- Added local-only `rotaWeeks` with seven dated entries per Monday-starting week. Working/Off, local wall-clock start, R/L/Close/Custom, optional custom end, attendance outcome and shift link remain separate from actual worked/payroll records.
- Clock In links the matching dated rota entry once and snapshots scheduled date/start/type/label/end plus the then-current tolerance onto the shift. Later rota edits cannot rewrite historical punctuality.
- Dashboard shows a compact Next Shift/Shift Today countdown. The dedicated Rota screen supports current/next/previous weeks, Copy Previous Week, confirmed clearing, historical actual results and monthly attendance summary.
- Absence review begins only after an unworked scheduled local day has ended. Sick, holiday, authorised absence, store cancellation, swap, forgot-to-track and other are schedule records only and never create pay, hours, fuel, mileage or delivery statistics.
- Settings adds a default-zero punctuality tolerance and native reminder controls. Morning (08:00), one hour, fifteen minutes and missing-next-week Sunday (18:00) reminders are independently configurable.
- PWA reminder planning is implemented. The corresponding Android **2.2.8 candidate source** (described as versionCode 13 in that candidate lineage) stores only safe reminder metadata, uses inexact `AlarmManager.setAndAllowWhileIdle`, replaces obsolete alarms, reschedules after reboot/package update and never interacts with the delivery GPS foreground service. It is not the installed stable APK; the verified Fold installation remains 2.2.6.
- Full Backup includes rota, attendance, shift schedule snapshots and preferences. Schema stays version 1; older backups initialise an empty rota without inferring historical schedules. OS alarm IDs are not backed up and future alarms rebuild from restored data.
- Protected systems deliberately unchanged: worked time, payroll, fuel, mileage, cleaning, GPS watchers, Real/Domino’s geofences, Hustle, route evidence and Android GPS recovery.

## Web App 2.1.50 Data & backup subcategory

- **Data, backup & Beta records** is now the final main Settings category.
- Beta reporting controls, today's device transfer, full backup export/import and CSV export moved intact into that subpage.
- The main Settings page's App panel now contains only native/PWA installation status and Refresh App, substantially shortening the default page.
- Export, import, validation, sanitisation, Beta filtering and local-data behaviour are unchanged. No stored-data migration or Android APK rebuild is required.


## 2.1.198 — Wear insights controls
Phone Wear OS settings now synchronise main timer/stat selection, break progress ring and shift battery tracking. Requires phone and watch 2.2.60. Break countdown overrides main timer choice; battery reports remain watch-local whole-watch observations.


## 2.1.199 — Watch hold-to-confirm
Optional hold_actions synced control for Delivered/Back at Store, shown when supplied by native 2.2.62. Older native settings payloads remain compatible.


## Web 2.1.201 — dispatch settings organisation
Moved automatic dispatch timer into Notifications & native features. Accessible ON/OFF switch persists automaticDispatchTimer; false gates notification-triggered timer creation, while manual dispatch and running timers are unchanged. Undefined preserves existing permission-enabled behaviour. Enabling requests notification access only when missing. Removed standalone main-settings card.


## Web 2.1.202 — dispatch switch state
Automatic dispatch toggle uses saved preference only, so it remains ON visually after enabling even while Android notification access is pending. New setting defaults false; the status line independently explains Android access. Turning ON requests access only when missing.


## Web 2.1.204 — smart shift-review wizard
History → Shift checks now offers a guided repair wizard for every shift marked Review. It identifies missing break evidence and unfinished cleaning/preparation outcomes separately, explains what triggered the flag, validates any reconstructed break against the saved shift boundaries, and requires an explicit truthful outcome for every unresolved task. Repairs preserve recorded pay, clock times, deliveries, mileage and GPS; each repaired shift passes the existing structural validator, saves locally and queues the normal encrypted hosted checkpoint. The full Shift editor remains available from every wizard step for corrections outside the safe guided choices.


## Web 2.1.205 — wizard unable-outcome validation
The guided shift-review wizard now collects the manager on duty whenever **Shift ended before it was done** is selected. It reuses the shift's saved manager when available, validates the field before saving, and records the complete documented unable outcome expected by backup validation instead of exposing an internal validation path.
