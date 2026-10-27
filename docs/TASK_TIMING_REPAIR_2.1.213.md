# Web 2.1.213 — task timing production regression

Inspected production source: f8058819c25f6d2968b4bec7a6aac8acb56203e0 (Sites 460, web 2.1.212).

## Root cause and scope

`addDelivery` sampled `now.getTime()` from the display-clock React state, while task start/resume used a fresh `new Date()`. A task opened between display ticks could therefore be closed earlier than its start. The actual old Single handler reproduces the invalid segment under a fixed clock. Independently, a pending carryout departure timestamp was reused to close current work without checking whether that work started after the departure. The exact cause of the owner's particular historical boundary cannot be proven without their live data.

All live task segment starts/closes now use canonical helpers; delivery action time uses Date.now(), and carryout evidence is accepted only within the latest work boundary. Stale task generations are rejected against current React state, operational carryout samples must be fresh and ordered, and repeated task starts/closes are idempotent. Existing native action identity/revision/deduplication checks remain in place. Native/GPS start and delivery-to-task reset effects are gated on an accepted transition and re-check current committed ownership before running. An independent reviewer identified this additional race; three regression tests now cover it, and follow-up review found no remaining critical/important issue. Early dispatch remains Domino's comparison data, separate from Real start and task timing.

Hustle previously clamped an exit before this run to 0 while allowing its entry to contribute a long return delay. It now uses one ordered evidence calculation; old GPS transitions cannot attach before the new Real run. Pending dispatch no longer displays the previous run's metrics as the pending run. Cooldown pseudo-elements are contained even if the disabled state changes; long status pills cannot stretch the card. The owner's exact translucent screenshot was not supplied or reproduced; the containment fix is defensive, not a claimed visual reproduction.

## Repair

Save Protection offers REPAIR AND SAVE. It clones current memory, adjusts only reversed task segment ends (including mirrored task activity segments/invalid matching task-activity ends), preserves starts and valid surrounding history, and writes original boundaries plus an explicit unknown-duration explanation into task notes. The fallback is end=start (0s), never an invented long duration. The whole candidate must pass the unchanged AppData validator before the existing IndexedDB saver runs. Failed validation leaves the original state unchanged; failed persistence keeps repaired memory open. A successful repair queues the existing hosted checkpoint path. Full Backup uses its unchanged validator.

## Already-open old app: do not refresh first

Publishing cannot inject React code into a page already executing the old bundle. The release includes an optional `task-timing-recovery.js` helper for an attached browser/WebView debugging console. It runs only on the existing production origin, refuses ambiguous state, displays an explicit REPAIR CURRENT SHIFT action, validates the full candidate, and updates the live AppData hook without touching storage. It does not transmit AppData. Close its panel, use the old app's RETRY SAVE, then export Full Backup. Refresh/update only after those succeed.

In the debugging console attached to the **existing open page**, load:

```js
const repairScript = document.createElement('script');
repairScript.src = '/task-timing-recovery.js?v=2.1.213';
document.head.append(repairScript);
```

Do not run this in a newly opened tab: that tab does not hold the stranded memory. Availability of Android WebView debugging depends on the installed native build. This session has no connection to the owner's live phone/WebView, so actual device repair/save is not claimed.

## Verification

- Critical domain/task/delivery, persistence, backup, hosted-checkpoint, restore and Wear subset: 236/236 in Europe/London.
- UTC focused domain/task/persistence/backup and live-recovery subset: 213/213.
- Production Vinext build, standalone recovery-script build, Sites artifact validation and rendered HTML test: passed.
- Full Europe/London npm test: 369/401 application tests pass; 32 failures match the untouched production baseline exactly (baseline 346/378). No new failure names.
- Full default-runtime suite (Asia/Kuala_Lumpur) has seven additional existing timezone-assumption failures. The untouched UTC baseline has six; the relevant explicit UTC subset passes.
- Strict TypeScript: 137 pre-existing errors both before/after; no new diagnostics at the comparison point. New helper/script/test lint is clean.
- Existing Android/Wear native source, storage schema and backup validator were not modified.

## Exact changed files

- `app/globals.css`
- `components/ShiftTrackerApp.tsx`
- `lib/domain.ts`
- `lib/taskTiming.ts`
- `lib/nativeBridge.ts`
- `public/version.json`
- `public/sw.js`
- `scripts/build-verified.sh`
- `scripts/build-task-recovery.mjs`
- `scripts/live-task-repair.ts`
- `tests/taskHandlers.test.ts`
- `tests/taskTiming.test.ts`
- `tests/taskTransitions.test.ts`
- `tests/liveTaskRecovery.test.ts`
- `docs/superpowers/plans/2026-09-24-task-timing-repair.md`
- `docs/TASK_TIMING_REPAIR_2.1.213.md`

## Pre-existing London suite failures

- CACHE_URLS is version-gated and accepts only successful same-origin static assets
- Dashboard has a priority hierarchy and Tasks/Rota pages have isolated identities
- Delivered preserves its tap but never attaches a stale native customer coordinate
- Delivered still queues Google from retained GPS when the exact native sample is stale
- Each saved delivery run shows its reimbursement against GPS-based Corsa fuel cost
- History task editor can add, retain and delete photo proof
- Hustle UI and Expected Delivery Time expose one complete selected dataset
- OSM settings retain one master and expose persisted optional controls
- Startup prompts belong to rota settings and version details stay on main Settings
- a recent completed shift can restart with its clock-out gap preserved as a break
- a server 404 for an old hashed asset uses the retained exact asset, never HTML
- active delivery keeps Hustle and its action row above the fixed navigation
- all live delivery terminal routes refresh the native companion, while clock-out clears it
- an older worker never deletes a cache belonging to a future release
- application-style toggles expose pressed and disabled state
- completed shift review can record, edit and clear unable outcomes
- delivery deletion and beta inclusion retain explicit safety gates
- delivery preparation supports not-required outcomes
- dialogs gain an accessible title association and icon close buttons gain a name
- dual geofences share the existing canonical GPS ingestion path
- failed assets and API/provider requests never receive app-shell HTML
- history supports validated manual missed shifts
- idle and task companion snapshots cannot retain a delivery geofence label
- master OFF stops optional route-summary requests without touching GPS evidence
- multi-photo UI saves each selection sequentially and reports per-photo progress
- native re-entry, delivery sizing and Google setup recovery stay trusted-shell-only
- off-shift home places the next rota shift after Last Shift and keeps the missing-rota fallback
- open Shift Actions keeps its drag handle above the controls and closes from the same handle
- partial and absent GPS evidence retain report actions
- post-clock-out task review supports evidence, notes and documented outcomes
- runtime caching stores only successful suitable same-origin responses
- upgrade activation retains the current and newest previous app cache only
