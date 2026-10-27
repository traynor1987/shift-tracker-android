# Shift Tracker — Project Handover

> **PROJECT:** Shift Tracker  
> **HANDOVER VERSION:** 1  
> **GENERATED:** 2026-08-13T10:10:00+01:00 (Europe/London)  
> **CURRENT APP VERSION:** 1.6.5.0 in the Settings/About UI; `package.json` version 0.1.0. The runtime implementation was inspected after Sites version 38.
> **DATABASE VERSION:** No database is used. Persistent data is a localStorage `AppData` envelope with `version: 1` and `settingsRevision: 3`.  
> **LAST MAJOR CHANGE:** Automatic GPS exit baseline: Single/Double seeds the expected inside-store state so rapid departures are detected without another action; Hustle wording now explicitly describes automatic GPS detection.
> **CURRENT PRODUCTION SITE:** `https://dominos-shift-tracker.traynor1987.chatgpt.site`  
> **SOURCE REVISION INSPECTED:** `62e55ce90df60b86594b10bee0e2569235cdaa11`

This file is the authoritative continuation handover for the current Shift Tracker project. It documents the application as implemented at the source revision above. It is not a copy of the original feature request.

The current code remains the ultimate source of truth. If this file and the code disagree, investigate the discrepancy before changing either.

---

## 1. Project overview

Shift Tracker is a local-first, mobile-first personal workforce tracker for James's UK Domino's delivery-driver shifts. It records when a shift happened, paid time after unpaid breaks, estimated gross wages, delivery runs, individual customer deliveries, fuel reimbursement, mileage, cleaning/task activity, payroll reference dates, reimbursement payments, and optional store-geofence delivery timing.

It is deliberately a personal tracker rather than an official Domino's system. It has no Domino's logo, no employer integration, no customer data, no account system in the application, no cloud application database, no route map, and no background server.

### Current technology

- Next.js 16.2.6 application code with React 19.2.6 and TypeScript 5.9.3.
- Built and hosted through Vinext 0.0.50, Vite 8.0.13, and the Cloudflare Worker-compatible Sites runtime.
- The entire interactive application is a single client component rendered on the `/` route.
- CSS is maintained in one global stylesheet. Tailwind CSS is imported, but the UI is primarily hand-authored CSS classes and CSS custom properties rather than a Tailwind component system.
- Node.js 22.13 or later is required for the project scripts.
- Drizzle/D1 dependencies and starter scaffolding are present, but they are **not used by Shift Tracker**. The hosting manifest has `d1: null`, `r2: null`, and `db/schema.ts` exports no tables.

### Mobile/PWA operation

- The app has a Web App Manifest, standalone display mode, maskable icons, Android-oriented theme colours, a service worker, an install control, and safe-area-aware layouts.
- The live Shift screen is intentionally a fixed-height control surface so its core controls fit without page scrolling. Other pages scroll normally.
- Actual timestamps are persisted. Live counters are derived from timestamps every second; they do not depend on an uninterrupted JavaScript interval.
- The installed-app check uses standalone display mode, the iOS `navigator.standalone` flag, and a local installed marker.
- The service worker currently uses a network-first strategy with cache fallback. It caches the app shell, manifest, install script, icons, and runtime resources reported after load.
- Core tracking is intended to remain usable after the app has been loaded/cached and the phone is offline.

### Persistence architecture

- All app data is stored as one JSON document in browser localStorage under `dominos-shift-tracker-v1`.
- Every important action clones the current `AppData`, mutates the clone, and immediately writes the complete document back to localStorage.
- No IndexedDB object stores, SQL tables, server APIs, or cloud sync exist.
- Data therefore belongs to that browser/PWA installation. It does not automatically appear on another device and can be lost if browser storage is cleared without a JSON backup.
- Historical shifts snapshot their wage and reimbursement rates, cleaning eligibility, daily task definitions, delivery events, and activity records. Current settings should not rewrite history.

### Major architectural decisions

1. **Local-first and timestamp-based:** duration is calculated from stored ISO timestamps, including after reload or phone lock.
2. **Money is integer pennies:** wages and fuel reimbursement rates/amounts are stored as integers to avoid floating-point display errors.
3. **Mileage is integer tenths:** readings and direct miles are stored in tenths of a mile.
4. **One active timed activity:** delivery, cleaning, break, and other timed work are coordinated to avoid overlapping tracked time.
5. **Snapshot historical context:** a new shift copies the current hourly rate, fuel rates, cleaning rota for that weekday, role-derived responsibility, and later the delivery geofence configuration used for a timed delivery.
6. **GPS is optional assistance:** manual delivery timing always works. No route or breadcrumb history is stored.
7. **Safe incomplete clock-out:** a six-hour-or-longer shift with no break can be clocked out and safely persisted as incomplete, but it cannot be finalised without a no-break reason or edited break times.

### Important dependencies

| Dependency | Purpose in this project |
|---|---|
| `next`, `react`, `react-dom` | Application and component runtime |
| `vinext`, `vite`, Cloudflare Vite plugin | Worker-compatible build and Sites hosting |
| `typescript` | Types and tests |
| `drizzle-orm`, `drizzle-kit` | Present from starter; not used by Shift Tracker data |
| Native browser APIs | localStorage, service workers, Geolocation, Vibration, Blob downloads, PWA install event |

---

## 2. Current implemented features

### Shift lifecycle

- Large Clock In flow.
- Clock-in immediately records a new shift and persists it.
- Clock-in asks for the driver role: Open Driver, Second Driver, or Other/Later Driver.
- If Mileage Entry is set to Ask Each Shift, clock-in also asks for Direct Miles or Odometer.
- Only one active shift is selected by the application; attempting another clock-in is blocked.
- An accidental clock-in can be cancelled, with confirmation, during the first five minutes.
- Live elapsed shift time includes seconds.
- Live paid time, deliveries, miles, fuel reimbursement, and estimated wages are displayed.
- Clock Out always requires in-app confirmation.
- Clocking out while another timed activity is active offers activity-specific choices.
- Completed shifts open directly into the Shift Details editor/summary.
- Six-hour no-break shifts are saved as incomplete until their details are resolved.
- The off-shift screen links back to incomplete shifts so an interrupted/crashed summary can be finished later.

### Breaks

- Multiple unpaid breaks per shift.
- Start Break requires an in-app confirmation.
- End Break requires an in-app confirmation.
- A cleaning task can be paused automatically before a break.
- Starting a further break shows a second-break warning.
- If the previous break ended less than two minutes ago, the app offers Resume Previous Break or Delete Previous Break as mistake-recovery actions.
- Active-break time and paid-time calculations recover from timestamps after reload.
- Clocking out while on break ends the current break at the clock-out timestamp.
- Historical breaks can be added, removed, and edited with validation.
- Shift Detail uses minute precision deliberately; hidden seconds are removed from editor values so displayed and calculated edit results agree.

### Six-hour break audit

- A shift under six hours does not require break details.
- From 5h55m through 5h59m59s with no break, Clock Out asks the user to review the actual clock-in time.
- At six hours or more with no break, the shift is stored as `reviewStatus: "incomplete"` until a no-break record is completed or valid break times are added.
- Available no-break reasons are:
  - Break was not required for this shift length
  - Manager did not allow a break
  - No cover was available
  - Shift workload prevented a break
  - Asked to continue working
  - Chose not to take a break
  - Other work-related reason
- An optional note is supported; a note is mandatory for Other work-related reason.
- A Potential wage deduction expected flag can be set.
- History classifies completed records as Clear, Needs Review, or Deduction Concern.

### Wages

- Default hourly rate: £12.96 per paid hour.
- Paid time excludes breaks.
- Current estimated wages update continuously, including during the first minute.
- Each shift saves its hourly rate. Changing Settings does not recalculate old shifts.
- Shift details allow a historical hourly-rate correction.
- Gross wages and fuel reimbursement are kept separate in labels and calculations.
- The summary may show an Expected total payment, but explicitly itemises wages plus fuel reimbursement.
- Tax, National Insurance, pension, and net-pay calculations are not implemented.

### Deliveries and fuel reimbursement

- Single Delivery records one run, one individual delivery, and the shift's saved single reimbursement rate (default £1.00).
- Double Delivery records one run, two individual deliveries, and the shift's saved double reimbursement rate (default £1.50).
- Every new Single/Double action creates both a `DeliveryEvent` and a timed delivery `ActivityRecord`.
- A live delivery card replaces the normal Single/Double controls until Back at Store is pressed.
- Delivery activity survives reload because its start is stored immediately and its timer is derived from that timestamp.
- Back at Store records the manual completion timestamp and ends the timed activity.
- Cancel Delivery requires confirmation and removes the delivery, its linked activity/geofence events, and its reimbursement.
- A ten-second timestamp-based cooldown disables both Single and Double buttons after a delivery is recorded and visually refills the buttons.
- Undo Last Delivery exists. A second undo within two minutes requires confirmation and offers Restore Previous Delivery.
- Delivery counts, rates, individual-delivery override, and timed/geofence timestamps can be corrected in historical Shift Details.
- Fuel reimbursement earned by shifts remains separate from wages and is tracked as Awaiting or Paid.

### Mileage

- Direct Miles and Odometer methods are implemented.
- Direct Miles is the default.
- Ask Each Shift is available in Settings and adds a clock-in mileage choice.
- Odometer work miles are Ending Odometer minus Starting Odometer.
- Invalid negative odometer differences are rejected in Shift Details.
- Inputs accept one decimal place and either a decimal point or comma while typing.
- Mileage can be changed during an active shift and corrected later.

### Cleaning and other paid tasks

- Dedicated Tasks bottom-navigation tab plus an active-shift Tasks shortcut.
- Role/time-based cleaning responsibility and Auto/Yes/No manual override.
- Today's rota can be viewed while off shift, but paid task timing requires an active shift.
- Eligible shifts display completion count, percentage, and tracked cleaning time.
- Ineligible shifts display Not required and are excluded from compliance statistics.
- Task cards collapse instructions and expose Start, Quick Complete, Pause, Resume, Complete, Cancel, and optional note controls.
- Timed cleaning is stored as one or more non-overlapping activity segments.
- Quick Complete stores a completion timestamp and explicitly reports Duration not tracked.
- Delivery can pause active cleaning; Back at Store then offers to resume the interrupted task.
- A break can pause active cleaning; after the break the pending-resume modal is shown.
- Other Paid Work can time a named non-rota task.
- Cleaning analytics support This Week, This Month, and All Time.
- Task-level analytics show completion count and average/fastest/longest duration from timed completions only.
- The rota is editable in Settings: add, edit, delete, reorder, move to another weekday, duplicate, disable/re-enable, expected duration, area, description, and rota notes.
- Each shift stores a snapshot, so later rota edits do not rewrite old shifts.

### Activity timeline

- Clock In/Out, deliveries, cleaning activities, breaks, other tasks, Store Exit, and Store Entry are stored as activity records.
- Activity records continue to be stored, but the compact Shift Log was removed from the bottom of the active Shift screen to simplify the fixed phone layout.
- Duration is calculated from the activity timestamps or summed cleaning segments.
- Geofence events are separate compact timeline records linked to the delivery event.
- Historical Shift Details show activity totals and editable delivery/task timing sections, but there is currently no dedicated full timeline view in Shift Details.

### Geofence and Hustle

- Optional Location Assist is implemented with the default store position and radius.
- It starts browser geolocation monitoring during an active delivery after the in-app explanation/permission flow.
- It records sufficiently confident inside-to-outside and outside-to-inside transitions.
- It never creates a delivery from movement.
- It never automatically ends the delivery when the store is re-entered.
- It stores timestamps and confidence metadata, not a route.
- The delivery timer starts immediately when a Single/Double is added; Back at Store is the only manual completion action.
- A confirmed Cancel delivery safety action is available only for the first five minutes of a delivery.
- Pre-departure, observed Hustle, return delay, and total activity timing are shown in Shift Details.
- Dashboard Hustle analytics include single, double, all-trip averages, total Hustle, average pre-departure, average return delay, and longest return delay.
- CSV export includes geofence timing fields.

### Fuel reimbursement payment tracking

- Awaiting fuel entitlement is totalled separately from wages.
- Unpaid shifts are grouped into Monday-Sunday earning cycles.
- A cycle is expected on the configured payment weekday in the following week; default Wednesday.
- The user manually records a payment. Wednesday passing never marks it paid automatically.
- Actual received amount can differ from expected entitlement.
- Underpayments are flagged red; overpayments are noted.
- Payment records link to the covered shifts.
- A payment can be reversed, returning linked shifts to Awaiting.

### Dashboard and payroll references

- Today card when a shift exists today.
- Navigable week and month cards with previous/current period controls.
- Paid hours, wages, deliveries, runs, miles, fuel earned, and current fuel awaiting.
- Expandable tracked-delivery and cleaning details.
- All-time averages for deliveries/hour, deliveries/shift, miles/shift, singles, doubles, total shifts, tracked trips, and cleaning compliance.
- Payroll period start, cut-off, payday, four/five-week indicator, countdowns, and Mark Pay Received confirmation.
- After pay is marked received, the next cycle's pre-filled dates are offered for editing.
- Default placeholder schedule uses the 23rd as cut-off, 27 days earlier as a four-week start, and the 1st of the following month as payday.

### History and editing

- Completed shifts are newest first.
- Clear/Review/Concern totals, filters, colour markers, and key.
- Summary card shows paid time, deliveries, miles, estimated wages, and fuel reimbursement.
- Shift Details edits clock-in/out, breaks, driver role, cleaning override, no-break record, counts, rates, manual individual-delivery count, delivery/geofence timestamps, cleaning records/segments/notes, mileage, and hourly rate.
- Validation protects time ordering and boundaries.
- Historical shifts are locked by default. The user must unlock a shift before the Delete button appears, then confirm deletion in an in-app modal.

### Backup, export, import, updates, and PWA

- Export Backup downloads the whole `AppData` document as formatted JSON with a timestamp-unique filename.
- Successful backup displays an in-app confirmation with filename and time.
- After one day without a backup, the main screen displays a backup reminder.
- Import Backup parses and validates a JSON file, shows the contained shift count, and requires confirmation before replacing local data.
- Export CSV produces UTF-8 BOM-prefixed, spreadsheet-friendly shift history.
- Refresh App updates the service-worker registration, shows a short loading state, and reloads.
- Install PWA is hidden when the app believes it is installed.
- All destructive/important application confirmations use in-app modals. The browser may still show its own native install, download, file-picker, and location-permission UI because those are controlled by Android/Chrome.

---

## 3. Business rules and calculations

### Time

```text
Shift duration = clock-out timestamp - clock-in timestamp
Break duration = sum(max(0, break end - break start)), capped at clock-out/current time
Paid time = max(0, shift duration - break duration)
```

An open break uses the current time while active. A completed shift uses clock-out as the cap.

### Wages

```text
Gross wages in pennies = round(paid milliseconds × saved hourly-rate pennies / 3,600,000)
```

Default saved hourly rate is 1,296 pence (£12.96).

Verified example:

```text
5 paid hours × £12.96 = £64.80
```

Fuel reimbursement is never part of this formula.

### Deliveries

```text
Singles = count(delivery events where type = single)
Doubles = count(delivery events where type = double)
Runs = Singles + Doubles
Derived individual deliveries = Singles + (2 × Doubles)
Individual deliveries = manualDeliveryCount when present; otherwise derived count
Fuel reimbursement = sum(each DeliveryEvent.reimbursementPence)
Deliveries per paid hour = individual deliveries / paid hours
```

Default reimbursement:

```text
Single = 1 run + 1 customer delivery + £1.00 fuel reimbursement
Double = 1 run + 2 customer deliveries + £1.50 fuel reimbursement
```

Verified example:

```text
8 singles + 3 doubles
= 11 runs
= 14 customer deliveries
= £12.50 fuel reimbursement
```

The reimbursement amount is copied into each event when recorded. Historical totals therefore retain the event's saved amount.

### Mileage

```text
Direct method: directTenths / 10
Odometer method: (endTenths - startTenths) / 10
```

If either odometer value is missing, or end is below start, work miles is unavailable.

### Fuel payment cycles

For a shift date:

1. Find the Monday of that shift's Monday-Sunday week.
2. Move to the configured payment weekday in the following week.
3. Group all unpaid shifts with the same resulting date.

Payment status changes only through manual confirmation or reversal.

### Six-hour rule as implemented

- `< 5h55m`: no break review prompt.
- `5h55m` through `< 6h`: clock-in review prompt if no break.
- `>= 6h` with a recorded break: complete normally.
- `>= 6h` with no break: clock-out is saved, but Shift Details require a no-break reason or added break times before the record becomes complete.

---

## 4. Cleaning rules and current rota

### Eligibility

Automatic cleaning responsibility is:

| Driver role | Clock-in condition | Cleaning required |
|---|---|---|
| Open Driver | Any time | Yes |
| Second Driver | Before 13:00 local time | Yes |
| Second Driver | 13:00 or later | No |
| Other/Later Driver | Any time | No |

`cleaningOverride` can be `null` (Automatic), `true` (Required Today), or `false` (Not Required). A non-null override wins over the role/time rule.

Changing role/override recalculates responsibility immediately. It does not delete existing task snapshots, task segments, completed work, notes, or timeline activity.

For a cleaning-ineligible shift:

- The active shift says Not required for this shift rather than `0 / N` failed.
- The Tasks page can still reveal the rota for reference.
- Cleaning cannot be logged unless responsibility is changed to Required.
- Clock-out does not warn about incomplete rota tasks.
- `periodTotals` and Cleaning Analytics exclude the shift entirely from cleaning compliance, task expected counts, and tracked-cleaning totals.

### Delivery-day labels

Default stock-delivery days are Tuesday, Thursday, and Saturday (`[2, 4, 6]`, JavaScript weekday numbering). These labels are independent of personal cleaning responsibility. A Delivery Day does not make cleaning required.

### Current seeded weekly rota

The rota lives in `CLEANING_ROTA` and is copied into editable `AppData.cleaningRota` on first use. Enabled tasks for the shift's weekday are snapshotted when a shift is created.

#### Monday

1. **CUSTOMER AREA** — Windows, skirting and frames. Walls, floors, menu holder and card machine free of debris.
2. **MAKELINE AREA** — Walls cleaned including skirting, sellotape removed, picture frames and posters cleaned.
3. **MAKELINE AREA — FLOORS** — Deep clean floors using degreaser, scrubbing brush, hot water and wet floor sign, including behind makeline.
4. **MAKELINE AREA — DEEP CLEAN** — Remove shelves; clean fridge seals, outside and top shelf, keyboard holder and herbs container.
5. **TOP OVEN** — Clean surface and glass.

#### Tuesday — Delivery Day

1. **CUSTOMER AREA** — Windows, skirting and frames. Walls, floors, menu holder and card machine free of debris.
2. **OFFICE** — Walls cleaned including skirting, sellotape removed, picture frames and posters cleaned.
3. **OFFICE & STORAGE AREA — FLOORS** — Deep clean floors using degreaser, scrubbing brush, hot water and wet floor sign.
4. **OVEN HOOD** — Remove and clean filters. Deep clean top of oven and hood including lights.
5. **CUT TABLE** — Empty underneath, clean out and check dip dates.
6. **BINS** — Clean bins and bin lids inside and out.

#### Wednesday

1. **CUSTOMER AREA** — Windows, skirting and frames. Walls, floors, menu holder and card machine free of debris.
2. **BACK OF HOUSE** — Walls cleaned including skirting, sellotape removed, picture frames and posters cleaned.
3. **BACK OF HOUSE — FLOORS** — Deep clean floors using degreaser, scrubbing brush, hot water and wet floor sign.
4. **WALK IN** — Deep clean floor, walls and shelves. Ensure fridge fans are clean.
5. **SIGNAGE** — Clean signs, posters and banners inside and outside.

#### Thursday — Delivery Day

1. **CUSTOMER AREA** — Windows, skirting and frames. Walls, floors, menu holder and card machine free of debris.
2. **ASHTRAY** — Empty ashtrays.
3. **SINK AREA** — Deep clean sink area including shelving, walls and floors under sink.
4. **HOT BAGS** — Dismantle hot bag shelving and deep clean.
5. **BOTTOM OVEN** — Clean surface and glass.

#### Friday

1. **CUSTOMER AREA** — Windows, skirting and frames. Walls, floors, menu holder and card machine free of debris.
2. **FLY CATCHER** — Clear and clean fly catcher.
3. **BINS** — Clean bins and bin lids inside and out.
4. **ICE CREAM FREEZER** — Deep clean shelves, glass and seals, clean motor filters, rotate stock and check dates.
5. **AIR CON & HEATER** — Air conditioning: Remove and clean filters. Heater: Brush and remove debris.

#### Saturday — Delivery Day

1. **CUSTOMER AREA** — Windows, skirting and frames. Walls, floors, menu holder and card machine free of debris.
2. **OFFICE** — Clean shelves and organise paperwork.
3. **COKE FRIDGE** — Deep clean shelves, glass and seals, clean motor filters, rotate stock and check dates.
4. **FIRE EXTINGUISHER** — Check dates. Clean stands and tanks plus surrounding wall and floor.
5. **FRONT COUNTER** — Deep clean keyboards, screens and phones. Organise cupboards and shelves.

#### Sunday

1. **CUSTOMER AREA** — Windows, skirting and frames. Walls, floors, menu holder and card machine free of debris.
2. **DRIVER MAP / HOT BAGS / FRIDGES** — Walls cleaned including skirting, sellotape removed, picture frames and posters cleaned.
3. **FRONT OF SHOP & CUSTOMER AREA — FLOORS** — Deep clean floors using degreaser, scrubbing brush, hot water and wet floor sign.
4. **STORAGE AREAS** — Clean dunnage racks and box storage and check dip dates.
5. **HOT RACK** — Deep clean top shelf and floor underneath. Check dip dates.

---

## 5. Delivery workflow

### Single Delivery

When pressed during a working shift with no conflicting timed activity and no cooldown:

1. Create a `DeliveryEvent` with type `single`, exact timestamp, saved single reimbursement amount, and a link to a new activity.
2. Create a `single_delivery` `ActivityRecord` with the same start timestamp, one customer delivery, no end timestamp, and a snapshot of the current geofence settings.
3. Persist the whole dataset immediately.
4. Replace the normal buttons with the active delivery card and live timer.
5. Start Location Assist when enabled/allowed.

### Double Delivery

The same sequence occurs with type `double`, two customer deliveries, and the saved double reimbursement amount. It is one trip/timer, not two timers.

### Cleaning conflict

If a cleaning task is active, pressing Single/Double opens an in-app prompt. Pause Cleaning & Start Delivery:

- closes the current cleaning segment at the delivery timestamp,
- marks the task paused,
- stores `pendingResumeTaskId`,
- ends the open cleaning activity record,
- starts the delivery.

After Back at Store, the app asks whether to resume the interrupted cleaning task. A resumed task starts a new segment, so delivery time is not counted as cleaning time.

### Back at Store

Pressing Back at Store:

- sets the delivery activity's `end`,
- sets `backAtStoreAt` to the same exact timestamp,
- leaves the `DeliveryEvent`, counters, and reimbursement intact,
- persists immediately,
- returns the active screen to its ready state.

Store-entry GPS does **not** invoke this action automatically.

### Cancellation and corrections

- Cancel Delivery requires confirmation and removes the current delivery event plus every activity sharing its delivery link.
- Undo is only available after the active delivery is finished/cancelled.
- A restored undo recreates the counter/reimbursement event but deliberately does not invent a duration/activity.
- Historical count edits can add/remove `DeliveryEvent` records. Newly added historical events have no activity timing.
- Historical activity editor validates that delivery start/end are within the shift and that Delivery Start → Left Store → Entered Store → Back at Store are chronological.

### Break interaction

- A delivery cannot start while the shift status is Break.
- The user must end the break first.
- Clock Out while a delivery is active offers Back at Store & Clock Out or Clock Out Anyway. The latter ends the activity at clock-out and adds a note that return was not confirmed.

---

## 6. Store geofence system

### Defaults

```text
Name: STORE (UI concept; no separate persisted name field)
Latitude: 53.56845
Longitude: -2.88802
Displayed/configured radius: 35 metres
Location Assist default: ON
```

### Monitoring lifecycle

- On first relevant use, the app explains in-app that location is used during active deliveries and that the route is not recorded/uploaded.
- Android/Chrome then controls the native permission prompt.
- A previously explained/allowed setup may request one low-frequency location reading at clock-in to initialise At Store/Away state; this creates no delivery or geofence event.
- High-accuracy `watchPosition` runs only while a delivery activity is open.
- Watch options: high accuracy, maximum cached age 8 seconds, 20-second timeout.
- Monitoring stops when the delivery ends, Location Assist is disabled, no shift is active, or clock-out completes.
- When the page becomes visible again, it restarts/continues the watch and requests a fresh high-accuracy reading.

### Privacy

The application does not persist raw sample coordinates, customer locations, routes, speed, or breadcrumbs. It stores only:

- the delivery's configured geofence latitude/longitude/radius snapshot,
- optional crossing timestamps,
- observed/unobserved flags,
- optional last useful accuracy value,
- whether the delivery began while already believed outside.

### Detection and noise control

- Distance is calculated with a Haversine/great-circle formula.
- A location sample with reported accuracy worse than 65 metres is treated as Searching, not as a crossing.
- The configured radius remains 35m, but hysteresis uses:
  - enter threshold: `max(5m, radius - 7m)`; default 28m,
  - exit threshold: `radius + 12m`; default 47m.
- The first stable state requires one accepted sample.
- A later state change requires two accepted samples for the same candidate state.
- This prevents rapid inside/outside flapping near the boundary.

### Observed exits/entries

For a continuous accepted sample stream:

- Inside → Outside sets `storeExitAt`, `storeExitObserved: true`, stores accuracy, and appends a Store Exit timeline event.
- Outside → Inside sets `storeEntryAt`, `storeEntryObserved: true`, stores accuracy, appends a Store Entry event, changes the card to Returned to Store, and requests a short vibration when supported.

### Suspension/background limitation

A PWA/browser cannot guarantee Android background geolocation. If the gap between accepted samples is over 60 seconds and the state changed:

- the app marks the crossing as unobserved,
- appends a timeline event saying exact time unavailable,
- does not fabricate `storeExitAt`/`storeEntryAt`,
- does not calculate exact Hustle for that crossing.

The delivery timer and manual Back at Store still work.

### Permission/failure handling

- Denied permission produces Location Permission Required and stops the watch.
- Other failures produce GPS Unavailable.
- Poor accuracy remains GPS Searching.
- Disabling Location Assist produces Location Assist Off.
- None of these blocks Single, Double, Cancel Delivery, or Back at Store.

### Manual completion

- Starting a Single/Double is the manual delivery-timer start; there is no separate Mark as left store control.
- Back at Store is the only manual return/completion action; there is no separate Mark as returned control.
- Historical Shift Details can edit Left Store, Entered Store, and Back at Store when corrections are needed.
- Manual/edited crossings are explicitly not considered observed GPS crossings for exact Hustle analytics.

---

## 7. Hustle timing

For a timed delivery:

```text
DELIVERY STARTED = ActivityRecord.start
LEFT STORE / HUSTLE START = storeExitAt
ENTERED STORE / HUSTLE END = storeEntryAt
BACK AT STORE = backAtStoreAt, falling back to ActivityRecord.end for legacy timed trips
```

Calculations:

```text
Pre-departure = Left Store - Delivery Started
Hustle = Entered Store - Left Store
Return delay = Back at Store - Entered Store
Total delivery activity = Back at Store - Delivery Started
```

Exact Hustle is returned only if both the exit and entry timestamps exist **and** both `storeExitObserved` and `storeEntryObserved` are true. Manual timestamps may still display as manually recorded, but they are excluded from observed Hustle analytics.

Example:

```text
Delivery started 18:02
Left store      18:04
Entered store   18:17
Back at store   18:22

Pre-departure   2m
Hustle          13m
Return delay    5m
Total activity  20m
```

Re-entering the geofence changes the active delivery card to Returned to Store but leaves the delivery open. Only the user pressing Back at Store records operational completion and return delay.

---

## 8. Activity timeline

### Supported types

`ActivityType` is currently:

```text
clock_in
clock_out
single_delivery
double_delivery
cleaning_task
break
other_task
store_exit
store_entry
```

### Stored information

Every `ActivityRecord` has ID, shift ID, type, start, and nullable end. Optional fields add task links/names, notes, delivery link/count, tracked/untracked flag, task segments, and geofence facts.

### Timeline creation

- Clock-in/out create zero-duration untracked event records.
- Start Break creates a tracked activity; End Break normally closes it.
- Delivery start creates an open tracked activity; Back at Store closes it.
- Cleaning start/resume creates a cleaning activity. The task's segment array is authoritative for total active cleaning time.
- Quick Complete creates an untracked zero-duration cleaning event.
- Other Task creates an open tracked activity and closes it on Finish.
- Geofence crossings append separate untracked marker events linked to the delivery event.

### Duration rules

- A segmented activity sums `max(0, segment end/current time - segment start)`.
- An untracked activity (`tracked: false`) reports zero.
- Other timed activity uses `max(0, end/current time - start)`.
- Task total is always the sum of active task segments, so paused time and delivery interruptions are excluded.

### Overlap prevention

`activeTimedActivity()` searches for an open delivery, active cleaning task, open break, then open other task. Start actions check this state. The UI either blocks the new action or offers an explicit transition such as Pause Cleaning & Start Delivery, Back at Store & Start Task, Pause Task & Start Break, or Finish/Stop at Clock Out.

---

## 9. Actual persistent data model

### Storage locations

| Storage | Key/name | Contents |
|---|---|---|
| localStorage | `dominos-shift-tracker-v1` | Entire `AppData` JSON document |
| localStorage | `shift-tracker-pwa-installed` | UI hint that installation completed |
| localStorage | `shift-tracker-location-explained` | One-time Location Assist explanation accepted |
| Cache Storage | `shift-tracker-v23` | PWA app-shell/runtime GET responses |
| D1 | None | Hosting manifest is `d1: null`; schema empty |
| IndexedDB | None | Not used |

There are no object stores, primary-key indexes, or SQL relationships. All relationships are ID fields inside the single JSON document.

### `AppData`

```ts
interface AppData {
  version: 1;
  settings: Settings;
  shifts: Shift[];
  payments: ReimbursementPayment[];
  payrollSchedules?: PayrollSchedule[];
  lastBackupAt?: string | null;
  settingsRevision?: number;
  cleaningRota?: CleaningTaskDefinition[];
}
```

Current new-data defaults: empty shifts/payments/payroll, `lastBackupAt: null`, `settingsRevision: 3`, and a deep copy of the seeded rota.

### `Settings`

```ts
interface Settings {
  hourlyRatePence: number;
  singleRatePence: number;
  doubleRatePence: number;
  paymentDay: number;                 // JS weekday: 0 Sunday ... 6 Saturday
  mileagePreference: "direct" | "odometer" | "ask";
  theme: "system" | "light" | "dark";
  deliveryDays?: number[];
  locationAssistEnabled?: boolean;
  storeLatitude?: number;
  storeLongitude?: number;
  storeRadiusMetres?: number;
}
```

### `Shift`

```ts
interface Shift {
  id: string;
  status: "working" | "break" | "completed";
  clockIn: string;                    // ISO timestamp
  clockOut: string | null;
  breaks: BreakPeriod[];
  deliveries: DeliveryEvent[];
  mileage: Mileage;
  hourlyRatePence: number;
  singleRatePence: number;
  doubleRatePence: number;
  manualDeliveryCount: number | null;
  reimbursementStatus: "awaiting" | "paid";
  reimbursementPaymentId: string | null;
  noBreakRecord?: NoBreakRecord | null;
  reviewStatus?: "incomplete" | "complete";
  isLocked?: boolean;
  role?: "open" | "second" | "other";
  cleaningOverride?: boolean | null;
  cleaningRequired?: boolean;
  taskSnapshot?: ShiftTaskRecord[];
  activities?: ActivityRecord[];
  pendingResumeTaskId?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Rates on Shift are historical snapshots. `taskSnapshot` is the weekday rota snapshot. `pendingResumeTaskId` links to a paused task interrupted by a delivery/break.

### `BreakPeriod`

```ts
interface BreakPeriod {
  id: string;
  start: string;
  end: string | null;
}
```

### `NoBreakRecord`

```ts
interface NoBreakRecord {
  expectedDeduction: boolean;
  reason: string;
  note?: string;
  recordedAt: string;
}
```

### `DeliveryEvent`

```ts
interface DeliveryEvent {
  id: string;
  type: "single" | "double";
  timestamp: string;
  reimbursementPence: number;
  activityId?: string;
}
```

`activityId` points to the timed delivery `ActivityRecord.id`. That activity stores the reciprocal `deliveryEventId`. Legacy/manually restored events may have no activity.

### `Mileage`

```ts
interface Mileage {
  method: "odometer" | "direct";
  startTenths: number | null;
  endTenths: number | null;
  directTenths: number | null;
}
```

### `ActivityRecord`

```ts
interface ActivityRecord {
  id: string;
  shiftId: string;
  type: ActivityType;
  start: string;
  end: string | null;
  taskId?: string;
  taskName?: string;
  notes?: string;
  deliveryEventId?: string;
  customerDeliveries?: number;
  tracked?: boolean;
  segments?: ActivitySegment[];
  storeExitAt?: string | null;
  storeEntryAt?: string | null;
  backAtStoreAt?: string | null;
  storeExitObserved?: boolean;
  storeEntryObserved?: boolean;
  storeExitUnobserved?: boolean;
  storeEntryUnobserved?: boolean;
  locationAssistEnabled?: boolean;
  geofenceLatitude?: number;
  geofenceLongitude?: number;
  geofenceRadius?: number;
  locationAccuracy?: number | null;
  startedOutsideStore?: boolean;
}

interface ActivitySegment {
  start: string;
  end: string | null;
}
```

No actual sampled device latitude/longitude is stored. The geofence latitude/longitude are the configured store position snapshotted for context.

### `CleaningTaskDefinition`

```ts
interface CleaningTaskDefinition {
  id: string;
  name: string;
  area: string;
  description: string;
  weekday: number;
  enabled: boolean;
  order: number;
  expectedMinutes?: number | null;
  notes?: string;
}
```

### `ShiftTaskRecord`

```ts
interface ShiftTaskRecord extends CleaningTaskDefinition {
  sourceTaskId: string;
  status: "not_started" | "active" | "paused" | "complete";
  segments: ActivitySegment[];
  completedAt: string | null;
  quickCompleted: boolean;
  shiftNotes?: string;
}
```

`sourceTaskId` identifies the rota definition from which the historical snapshot was created. The snapshot has its own generated `id`.

### `ReimbursementPayment`

```ts
interface ReimbursementPayment {
  id: string;
  date: string;
  amountPence: number;                // actual received
  expectedAmountPence?: number;       // entitlement at recording time
  shiftIds: string[];
  reversedAt: string | null;
}
```

Each linked Shift stores the payment's ID in `reimbursementPaymentId` while paid.

### `PayrollSchedule`

```ts
interface PayrollSchedule {
  monthKey: string;                   // e.g. 2026-08
  periodStartDate?: string;           // YYYY-MM-DD
  cutoffDate: string;
  paydayDate: string;
  isFiveWeekPay?: boolean;
  paidAt: string | null;
}
```

### IDs

General IDs use the current epoch in base 36 plus random base-36 characters. They are unique enough for personal local data but are not database-generated UUIDs.

---

## 10. Data migrations and compatibility

### Current versions

- `AppData.version`: 1
- `settingsRevision`: 3
- localStorage key suffix: v1
- service-worker cache: v19
- These are separate version concepts and must not be conflated.

### `migrateAppData()` behaviour

On every app load, validated data is cloned, migrated, immediately saved, and placed into React state.

Current migration/repair behaviour:

- If settings revision is below 1 and mileage preference is legacy `ask`, it resets once to Direct. After migration, the user may select Ask Each Shift normally.
- Adds `isLocked: true` to old shifts.
- Adds empty `activities` and `taskSnapshot` arrays when absent.
- Adds `cleaningOverride: null` and `pendingResumeTaskId: null` when absent.
- Adds empty payroll schedules.
- Copies actual amount to `expectedAmountPence` for old payment records.
- Restores default delivery days when absent.
- Adds Location Assist and default store geofence settings when absent/invalid.
- Restores the full seeded cleaning rota when absent.
- Sets `settingsRevision` to at least 3.

### Historical compatibility

- Older shifts remain valid without role, tasks, activities, or geofence fields.
- Old delivery events retain their counts/reimbursement but show timing/geofence information as Not tracked.
- No delivery duration, cleaning duration, or GPS crossing is invented during migration.
- Historical rates remain on the Shift object.
- Historical rota records remain in `taskSnapshot` and are not regenerated from current Settings.

### Do not change casually

- Do not rename the localStorage key without a migration that reads the old key.
- Do not bump/remove `AppData.version` without supporting previous exports.
- Do not turn optional historical fields into required fields without migration/default handling.
- Do not replace localStorage with IndexedDB/D1 by simply switching writers; a dual-read/migrate/verify path would be required.
- Do not regenerate `taskSnapshot` or delivery activity from current definitions.
- Do not mark manual/legacy geofence times as observed.

---

## 11. File/code map

| File | Purpose and important contents |
|---|---|
| `components/ShiftTrackerApp.tsx` | Main client application, all page routing/state, immediate persistence commits, shift/break/delivery/task/geofence actions, modals, dashboard, history, fuel, settings, and shift editor |
| `lib/domain.ts` | Authoritative types, defaults, seeded cleaning rota, migrations, calculations, activity/geofence helpers, data validation |
| `lib/storage.ts` | localStorage key/read/write, backup filename, Blob download helper |
| `app/globals.css` | Complete design system and responsive/fixed active-shift layouts |
| `app/page.tsx` | Renders `ShiftTrackerApp` on the only route |
| `app/layout.tsx` | Metadata, viewport, theme colours, manifest link, early PWA install script |
| `public/manifest.webmanifest` | Install metadata, icons, standalone display |
| `public/sw.js` | Network-first service worker and cache v19 |
| `public/pwa-register.js` | Captures Chrome's one-shot `beforeinstallprompt` before React hydration |
| `public/icons/*` | Current diagonal red/blue clock app icons |
| `tests/domain.test.ts` | Calculation/migration/geofence/timed-work regression tests |
| `tests/storage.test.ts` | Backup filename and real downloadable-anchor tests |
| `tests/rendered-html.test.mjs` | Built worker HTML/manifest/install-script checks |
| `package.json` | Runtime versions and build/test scripts |
| `.openai/hosting.json` | Sites project identity; no D1 or R2 bindings |
| `db/schema.ts`, `db/index.ts` | Unused starter D1 scaffolding; not Shift Tracker persistence |
| `worker/index.ts`, `vite.config.ts`, `build/*`, `scripts/*` | Vinext/Sites build and hosting infrastructure |

### First files a future developer should inspect

1. `SHIFT_TRACKER_HANDOVER.md`
2. `lib/domain.ts`
3. `lib/storage.ts`
4. `components/ShiftTrackerApp.tsx`
5. `app/globals.css`
6. `tests/domain.test.ts` and `tests/storage.test.ts`

---

## 12. UI/design system

### Visual language

- Premium personal workforce tracker, not corporate Domino's UI.
- Warm cream/light background and near-black dark background.
- Large rounded surfaces, 18-24px card radii, restrained shadows, large touch targets.
- Geist font family with bold numeric emphasis and uppercase letter-spaced eyebrow labels.
- Original diagonal blue/red clock icon.
- Single delivery uses app red `#e23b45`; Double uses app blue `#1677d2`.
- Green communicates working/clear/paid-success state; amber communicates breaks/review; red communicates destructive/deduction concern.

### Theme tokens

Light core values include:

```text
background #f4f0e8
surface    #fffdf8
ink        #1b1917
red        #d54936 (action Single uses #e23b45)
blue       #18758b (action Double uses #1677d2)
green      #20755c
amber      #bc7620
```

Dark mode switches to `#11100f` background, `#1c1a18` surface, warm off-white text, and brighter status colours. Theme can follow system or be forced light/dark.

### Navigation

Six-item fixed bottom navigation:

1. Shift
2. Tasks
3. Dashboard
4. History
5. Fuel
6. Settings

The active shift also exposes a Tasks pill in the top bar.

### Mobile/Fold layout

- Uses `100svh`, safe-area insets, and fixed bottom navigation.
- Active Shift is non-scrolling and uses a grid of summary, delivery, cleaning, mileage, actions, and latest-log rows.
- At low screen heights, cards/buttons tighten while remaining touch-oriented.
- Below 390px, top-bar copy and mileage layout simplify.
- Historical detail forms collapse to one column below 600px.
- Desktop increases content spacing and button height but retains the same component hierarchy.
- Avoid adding content to the active fixed grid without testing normal Android portrait, Fold outer display, Fold inner display, large font, keyboard-open mileage input, and backup-reminder states.

### Interaction principles

- Common positive actions are one tap where safe.
- Destructive/corrective actions use in-app modal confirmation.
- No pull-to-refresh; Settings has Refresh App.
- Every important action displays a toast or a visible state change.
- Animations are short and functional; reduced-motion is respected.

---

## 13. Current configurable settings and defaults

| Setting | Default | Historical effect |
|---|---:|---|
| Hourly wage | £12.96 | Copied to new Shift; old shifts unchanged |
| Single reimbursement | £1.00 | Copied to new Shift/events; old events unchanged |
| Double reimbursement | £1.50 | Copied to new Shift/events; old events unchanged |
| Fuel payment day | Wednesday (`3`) | Re-groups current unpaid shifts for display; payment records retain saved links/amounts |
| Mileage entry | Direct Miles | Selects new-shift method; Ask adds clock-in choice |
| Theme | System | UI only |
| Delivery days | Tuesday, Thursday, Saturday | Current/future labels; shift task history unchanged |
| Location Assist | On | Used for active deliveries |
| Store latitude | 53.56845 | Snapshotted into new delivery activities |
| Store longitude | -2.88802 | Snapshotted into new delivery activities |
| Store radius | 35m, minimum UI value 10m | Snapshotted into new delivery activities |
| Cleaning rota | Seeded Monday-Sunday list | New shifts snapshot current enabled weekday tasks |
| Rota task fields | Name, area, instructions, weekday, enabled, order, expected minutes, notes | Existing `taskSnapshot` unchanged |
| Payroll schedules | None initially; per-month user entry | Stored per `monthKey` |

Settings also provide Test Current Location, Install PWA, Refresh App, Export Backup, Import Backup, and Export CSV actions.

---

## 14. Backup, restore, and CSV

### JSON export

- Exports the complete in-memory `AppData`, including settings, all shifts, break/no-break data, deliveries, task snapshots, activities/geofence facts, payments, payroll schedules, cleaning rota, and backup timestamp.
- Updates and persists `lastBackupAt` before/with the download.
- Filename format: `shift-tracker-backup-<full-ISO-with-safe-hyphens>.json`.
- Browser/Android controls the actual download destination and may show native download UI.

### JSON import

1. Native file picker selects a JSON file.
2. File is parsed.
3. `validateData()` performs basic envelope and shift checks.
4. `migrateAppData()` repairs older compatible shapes.
5. In-app modal states how many shifts are present and warns that current local data will be replaced.
6. Confirm replaces the complete localStorage document.

Important limitation: validation is intentionally/basic currently and does not exhaustively type-check every nested activity, task, payment, schedule, or setting field.

### CSV export

Only completed shifts are exported. Current columns include:

- Date, Clock In, Clock Out, Shift/Break duration, Paid Hours
- Hourly Rate, Gross Wages
- Singles, Doubles, Runs, Individual Deliveries, Deliveries/Hour
- Work Miles
- Fuel Reimbursement, status, paid date
- Shift Role, Cleaning Required, cleaning completed/available/tracked hours
- Tracked Delivery Hours, Average Trip
- Observed Hustle Hours, average Hustle/pre-departure/return delay
- Shift Review Status, potential deduction flag, no-break reason/note

It uses CSV escaping and a UTF-8 BOM for Google Sheets/Excel compatibility.

---

## 15. KNOWN BUGS / ISSUES

1. **Clock-out while on an active break does not close the linked break `ActivityRecord`.** The `BreakPeriod.end` is set at clock-out, so paid-time calculations are correct, but the matching timeline activity remains open. This can make that timeline event's derived duration continue growing if rendered later. Fix by closing the matching break activity in `clockOut()` using the same timestamp, with a migration/repair only if historical open break activities need correction.
2. **Full historical timeline UI is not wired.** `LiveTimeline` supports a `full` option, but Shift Details never renders it and there is no View Full Timeline action. Historical details instead expose summaries plus delivery/task editors.
3. **Historical delivery count edits and timed activity records can diverge.** Increasing/decreasing Singles/Doubles edits `DeliveryEvent[]` but does not create/delete corresponding timed `ActivityRecord`s. This is intentional for not inventing time, but the UI should eventually make the distinction clearer and offer linked activity management.
4. **Backup validation is shallow.** A malicious or deeply malformed JSON file may pass the basic envelope check and fail later. Import needs full nested schema validation before this should be considered robust against arbitrary files.
5. **No transactional storage.** The complete dataset is rewritten as one localStorage string. It is appropriate for current personal-scale data but has no transaction, quota management, or partial-write recovery.
6. **No cloud/device sync.** This is intentional but means browser/PWA storage clearing is a real loss risk without backup.
7. **PWA background GPS is not guaranteed.** Android may suspend browser geolocation while the PWA is backgrounded or the screen is locked. The current gap logic honestly marks exact crossing time unavailable.
8. **Geofence needs continued real-device testing.** Unit tests cover distance/hysteresis and timing reconciliation, but actual accuracy, store walls, Android battery optimisation, and browser suspension vary.
9. **PWA installation remains browser-controlled.** The in-app button can request installation only after Chrome supplies `beforeinstallprompt`; Chrome may still show native installation/download dialogs.
10. **Fixed active viewport may be sensitive to accessibility font scaling or unusual browser chrome.** Version 37 fixed known clipping, but large text, keyboard-open state, and very short outer-display heights require regression checks.
11. **`Other paid time` label currently shows untracked paid time.** `trackedActivityTotals()` separately calculates `otherTaskMs`, but Shift Details displays `untrackedPaidMs` under Other paid time. Consider renaming to Untracked paid time or explicitly adding tracked Other Task time.
12. **Location Assist only continuously watches during an active delivery.** It may take a one-off reading at clock-in after consent, but does not continuously maintain At Store/Away all shift. This is a privacy/battery decision and differs from a native all-shift geofence.
13. **Manual/edited geofence crossings are excluded from exact Hustle analytics.** This is intentional honesty, but the history strip saying Manually recorded is the only distinction.
14. **Automated UI coverage is limited.** Current tests are calculation/storage/build tests; they do not automate every modal, touchscreen flow, service-worker offline reload, or real geolocation permission path.
15. **Version identifiers are inconsistent by design/history.** About says 1.6.0.0, Sites is version 38, `package.json` says 0.1.0, AppData is v1, and service worker cache is v19. Future releases should update a single app-version constant and document the other technical versions separately.

---

## 16. PLANNED / REQUESTED BUT NOT YET IMPLEMENTED

The following are not complete current features and must not be described as implemented:

- Guaranteed native Android background geofencing while the app is suspended/phone locked. A PWA cannot promise this.
- Full route tracking, route maps, customer GPS, breadcrumb history, speed tracking, customer geofences, and navigation. These were explicitly out of scope.
- Automatic delivery creation from leaving the store. Explicitly prohibited and not implemented.
- Automatic Back at Store from GPS entry. Explicitly prohibited and not implemented.
- System notifications for geofence entry. Only optional vibration is implemented.
- A dedicated full historical activity-timeline viewer with per-activity delete/edit controls.
- Exhaustive schema validation for imports.
- IndexedDB, D1, cloud sync, accounts, login, or multi-device data.
- Tax, National Insurance, pension, net-pay, or payslip reconciliation.
- Direct employer/rota/payroll integration.
- Historical geofence or task durations for old shifts. They intentionally remain Not tracked.

---

## 17. Important do-not-break rules

> [!CAUTION]
> These are non-negotiable continuity rules unless James explicitly changes them.

- **DO NOT wipe, replace, or ignore existing user data.**
- **DO NOT rebuild the application from scratch unless explicitly instructed.**
- **DO NOT change wage calculations accidentally.** Paid time is shift duration minus unpaid breaks; wages use the shift's saved hourly rate.
- **DO NOT include fuel reimbursement as wages.** It is a separate entitlement/payment stream.
- **DO NOT change Single/Double semantics accidentally.** Single = one run/one delivery/default £1. Double = one run/two deliveries/default £1.50.
- **DO NOT rewrite historical shifts from current settings.** Preserve saved rates, events, task snapshots, role/override, and geofence configuration.
- **DO NOT fabricate historical delivery, task, GPS, exit, entry, or Hustle timestamps.**
- **DO NOT make GPS mandatory.** Manual Single/Double/Back at Store must always work.
- **DO NOT let GPS automatically create or finish a delivery.**
- **DO NOT store routes or raw location samples without an explicit new decision and privacy review.**
- **DO NOT make cleaning mandatory on ineligible shifts.** Open, or Second before 13:00, or explicit override only.
- **DO NOT count cleaning-ineligible shifts as failed compliance.**
- **DO NOT equate Delivery Day with cleaning responsibility.**
- **DO NOT remove local-first/offline/PWA behaviour.**
- **DO NOT unnecessarily redesign the established UI or reduce touch target sizes.**
- **DO NOT silently change localStorage keys or persistent interfaces.** Use safe versioned migration and backup compatibility.
- **DO NOT delete historical cleaning work when role/responsibility changes.**
- **DO NOT mark reimbursement paid automatically because a date passed.**
- **DO NOT delete a locked shift or bypass the confirmation flow.**
- **DO NOT restore browser pull-to-refresh on the active control surface without explicit instruction.**

---

## 18. Current project status

### Complete and working

- Core local shift clock-in/out and timestamp recovery.
- Multiple unpaid breaks and wage calculations.
- Single/Double counters, reimbursements, timers, cooldown, cancellation, and undo safeguard.
- Direct/odometer/ask mileage.
- Shift history, lock/delete safeguard, extensive historical editor.
- Six-hour break audit and incomplete-shift recovery.
- Fuel cycle grouping, actual-vs-expected payment reconciliation, and reversal.
- Dashboard period navigation, averages, and payroll-date references.
- Role-based cleaning eligibility, weekday rota snapshots, task timing/pause/resume/quick complete, rota editing, and eligible-only analytics.
- Timed delivery/cleaning interruption workflow.
- Activity records and compact live shift log.
- Optional store geofence, simplified manual delivery completion, observed Hustle calculations, and analytics.
- JSON backup/import, CSV export, backup reminders.
- Installable/offline-capable PWA structure and light/dark/system themes.

### Working but needs more testing

- Real Android geofence behaviour across lock/background/battery conditions.
- Offline reload after service-worker updates on different Chrome versions.
- PWA install-state detection after Android launcher/browser updates.
- Fixed-height active UI across Fold outer/inner displays, accessibility font scaling, and keyboard states.
- Long-lived localStorage performance with a large number of shifts/activity records.
- All modal combinations around clock-out with delivery/cleaning/break and six-hour review.
- Import/restore with genuinely old backups from before tasks/geofence.

### Partially implemented

- Activity timeline: data and compact active log exist; no dedicated full historical timeline view.
- Historical delivery editing: timestamp fields exist, but count/activity relationship management is partial.
- Store presence during a shift: initial/active-delivery readings exist; continuous all-shift presence is intentionally absent.

### Not implemented

- Native guaranteed background geofencing.
- Route/customer tracking.
- Cloud sync/accounts/database.
- Tax/net-pay calculations.
- Full nested import schema validation.

### Known bugs

- Open break `ActivityRecord` not closed by direct Clock Out while on break.
- Other paid time label/data mismatch described above.

### Current automated verification

- Production build succeeds.
- Sites artifact validation succeeds.
- 24 automated tests pass at this handover revision.
- Tests cover wage examples, delivery/reimbursement examples, breaks, mileage, six-hour boundaries, rate snapshots, fuel cycles, cooldown, cleaning eligibility/migration, timed cleaning interruption, geofence hysteresis/Hustle, backup download, and built PWA metadata.

---

## 19. Regression-test checklist

### Before testing

- [ ] Export a real JSON backup.
- [ ] Note current Settings and shift count.
- [ ] Test in both light and dark mode.
- [ ] Test normal browser and installed PWA where possible.

### Core shift

- [ ] Clock In asks driver role and records the exact time.
- [ ] Accidental Clock In can be cancelled within five minutes and not afterwards.
- [ ] Reload during an active shift restores the same shift and correct elapsed seconds/wages.
- [ ] Two active shifts cannot be created.
- [ ] Clock Out confirmation appears.
- [ ] Under-six-hour shift with no break completes without no-break questions.
- [ ] 5h55m-5h59m shift asks to review clock-in time.
- [ ] Six-hour-or-longer no-break shift is saved incomplete and appears under Clock In after relaunch.
- [ ] Incomplete shift cannot be finalised without a reason or valid break.

### Breaks

- [ ] Start Break confirmation appears and paid time stops.
- [ ] Reload on break restores correct break elapsed time.
- [ ] End Break confirmation appears and paid time resumes.
- [ ] Multiple breaks sum correctly.
- [ ] Second break warning appears.
- [ ] Within two minutes, Resume Previous Break and Delete Previous Break work.
- [ ] Clock Out on break ends the BreakPeriod at clock-out.
- [ ] After fixing the known bug, confirm linked break ActivityRecord also ends at clock-out.

### Wages and mileage

- [ ] Five paid hours at £12.96 produces £64.80.
- [ ] Changing current hourly rate affects new shifts only.
- [ ] Direct mileage accepts `42.3` and `42,3` and persists.
- [ ] Odometer 4100.2 → 4142.5 produces 42.3 miles.
- [ ] End below start is rejected on historical save.
- [ ] Ask Each Shift asks and respects both choices.

### Deliveries

- [ ] Single creates one run/one delivery/£1.00 and starts a timer.
- [ ] Double creates one run/two deliveries/£1.50 and starts one timer.
- [ ] Eight singles + three doubles produces 11 runs/14 deliveries/£12.50.
- [ ] Both buttons enter the 10-second cooldown after a delivery starts.
- [ ] Reload during delivery restores Delivery in Progress and correct elapsed time.
- [ ] Back at Store ends the timed activity but preserves count/reimbursement.
- [ ] Cancel Delivery confirmation removes count, reimbursement, activity, and geofence markers.
- [ ] Undo removes the last completed delivery.
- [ ] Second undo within two minutes asks and Restore Previous Delivery works.
- [ ] Delivery cannot start on break.

### Cleaning/tasks

- [ ] Open Driver requires cleaning regardless of clock-in time.
- [ ] Second Driver at 12:59 requires cleaning.
- [ ] Second Driver at 13:00 does not require cleaning.
- [ ] Other/Later Driver does not require cleaning.
- [ ] Auto/Yes/No override works and does not erase recorded work.
- [ ] Ineligible shift does not show failed `0 / N` or affect compliance.
- [ ] Tuesday/Thursday/Saturday show Delivery Day independently.
- [ ] Start/Pause/Resume/Complete task sums only active segments.
- [ ] Quick Complete reports Duration not tracked.
- [ ] Task notes persist.
- [ ] Off-shift task start redirects to Clock In.
- [ ] Rota add/edit/move/duplicate/disable/delete affects future snapshots only.

### Cleaning interrupted by delivery

- [ ] Start a cleaning task and record its elapsed time.
- [ ] Press Single/Double and choose Pause Cleaning & Start Delivery.
- [ ] Confirm cleaning segment stops at delivery start.
- [ ] Back at Store offers Resume Task.
- [ ] Resume and complete task.
- [ ] Confirm delivery duration is excluded from cleaning total.

### Location/geofence/Hustle

- [ ] Location Assist explanation is in-app.
- [ ] Deny Android location permission; manual delivery remains fully usable.
- [ ] Test Current Location reports inside/outside/boundary plus accuracy.
- [ ] Begin delivery while inside; stable exit records Left Store only after confidence checks.
- [ ] One inaccurate sample does not cause exit.
- [ ] Stable re-entry records Entered Store, optional vibration, and Returned state.
- [ ] Re-entry does not automatically press Back at Store.
- [ ] Back at Store records return delay.
- [ ] Exact observed example reconciles Pre-departure + Hustle + Return Delay to Total Activity.
- [ ] Start delivery while already outside; no fabricated earlier exit.
- [ ] Suspend app long enough to create >60s sample gap; exact crossing is unavailable, not invented.
- [ ] Single/Double starts the manual delivery timer without asking for a separate left-store action.
- [ ] Back at Store is the only manual return/completion action.
- [ ] Cancel delivery requires confirmation and disappears five minutes after delivery start.
- [ ] Reload during active delivery retains activity and obtains a fresh reading.
- [ ] Clock Out stops monitoring.

### History/fuel/dashboard

- [ ] History counts/filters Clear, Review, and Concern correctly.
- [ ] Locked shift hides deletion.
- [ ] Unlock + Delete still requires confirmation.
- [ ] Historical time/rate/mileage/delivery/task/geofence edits validate and recalculate.
- [ ] Monday-Sunday fuel shifts group into the following configured Wednesday.
- [ ] Recording exact payment marks linked shifts Paid.
- [ ] Underpayment flags red; overpayment notes difference.
- [ ] Reverse payment returns shifts to Awaiting.
- [ ] Week/month arrows show the right periods/totals.
- [ ] Payroll date edit, four/five-week flag, Mark Pay Received, and next-cycle prompt work.

### Backup/PWA/offline

- [ ] Export Backup creates a uniquely named JSON file and success modal.
- [ ] Exported JSON contains settings, shifts, activities, tasks, payments, payroll, rota, and geofence fields.
- [ ] Invalid import does not overwrite existing data.
- [ ] Valid import requires replacement confirmation and restores exact totals.
- [ ] CSV opens correctly in Google Sheets and includes new geofence columns.
- [ ] Install PWA appears only when appropriate and hides when installed.
- [ ] Refresh App shows loading state and reloads.
- [ ] After loading online once, disable network and verify core tracker opens and works.
- [ ] Close/reopen/lock/restart installed PWA during shift, break, and delivery.

---

## 20. INSTRUCTIONS FOR THE NEXT CHATGPT WORK CONVERSATION

This is an **existing application**.

1. Read this entire handover before modifying anything.
2. Recover/open the existing `dominos-shift-tracker` Sites project; do not create a new site.
3. Inspect the actual current project/code before making changes.
4. Treat this handover as continuity context, but treat the current code and persisted-data compatibility as the ultimate source of truth.
5. Do not rebuild the application.
6. Preserve existing user data and the localStorage key unless a tested migration reads and converts it safely.
7. Preserve the existing visual design, mobile hierarchy, and one-handed operation.
8. Preserve wage, fuel reimbursement, Single/Double, break, mileage, cleaning eligibility, and historical snapshot rules unless James explicitly changes them.
9. Keep GPS optional, privacy-first, and non-authoritative.
10. Use safe, versioned migrations for persistent-shape changes.
11. Add regression tests for every business-rule or migration change.
12. Integrate new functionality into the existing `domain.ts` + immediate `commit()` architecture instead of bolting on a second tracker.
13. If the handover and code disagree, investigate the discrepancy rather than blindly overwriting either.
14. Before completing a major change, run the full test/build suite and update this handover.

Suggested opening message for the next conversation:

> Open the existing `dominos-shift-tracker` project. Read `SHIFT_TRACKER_HANDOVER.md` in full, then inspect the current code. This is an existing working application: do not rebuild it, preserve data/design/business rules, and use safe migrations. I will then give you the next requested change.

---

## 21. Development changelog

### Initial PWA and core tracker

- Built mobile-first local Shift Tracker with clock-in/out, breaks, wage calculations, Single/Double reimbursement, mileage, history, fuel ledger, dashboard, Settings, JSON/CSV tools, PWA manifest/service worker, and light/dark themes.

### Reliability and mobile safeguards

- Added live seconds/current wage, robust PWA install handling, immediate persistence, break confirmations, clock-out confirmation, multiple-break mistake recovery, mileage input fixes, fixed full-height active screen, refresh control, and mobile Shift Detail layouts.

### Six-hour shift records and history audit

- Added five-minute clock-in review boundary, safely incomplete clock-out records, no-break reasons/notes/potential deduction flags, recovery card, Clear/Review/Concern history totals/filters, default shift locking, and confirmed deletion.

### Fuel/payroll controls

- Added Monday-Sunday fuel batches payable the following configured weekday, actual-vs-expected payment reconciliation, under/overpayment flags, reversals, navigable week/month dashboard totals, payroll start/cut-off/payday, four/five-week cycles, countdowns, and received-pay workflow.

### Timed work and cleaning upgrade

- Added role-based cleaning eligibility, manual override, editable snapshotted weekly rota, delivery-day settings, timed/paused/quick-completed cleaning tasks, Other Task timing, delivery timers, cleaning-delivery interruption/resume workflow, activity records, compact Shift Log, historical task/timer editing, and cleaning/delivery analytics.

### Geofence and Hustle upgrade

- Added optional privacy-first store geofence at 53.56845/-2.88802/35m, permission/failure states, accuracy filtering, hysteresis/debounce, suspension honesty, store exit/entry timeline events, observed Hustle/pre-departure/return-delay calculations, history editing, dashboard analytics, CSV columns, and migration revision 3.

### Delivery-run controls — current

- Simplified the active delivery card: Single/Double begins the timer, Back at Store completes the run, and Cancel delivery is a confirmed safety action that expires after five minutes. Removed the redundant manual left-store and returned-store controls.

### Shift mileage and active delivery timing — current

- Work miles are collected in a required final-shift modal before clock-out can save. Direct total miles and odometer readings are both supported; invalid or missing values keep the shift open.
- The former on-shift mileage card is now a Hustle Timing card. It shows the duration from Single/Double tap to geofence exit, the duration from geofence entry to pressing Back at Store, and the overall trip duration. It does not show clock-of-day departure/return times.
- Single/Double seeds the delivery's inside-store baseline and starts high-accuracy GPS monitoring. The first stable outside reading records the exit automatically; no extra left-store tap is required.
- A single outside/inside reading is accepted immediately when its full GPS accuracy circle is conclusively beyond the relevant threshold; only borderline readings require a second matching sample. This avoids Android leaving the card stuck on GPS detecting after one strong reading followed by no stationary update.
- If Android/browser suspension means an exact crossing was missed, the active card says Exit time missed instead of continuing to claim GPS detecting.
- For a location-assisted delivery, Back at Store is disabled until a current accepted GPS reading confirms the driver is inside the store geofence. Outside shows Return to Store; an unresolved reading shows Waiting for GPS. The same guard applies to completing a delivery before starting a task, and Back at Store & Clock Out is hidden until inside. Clock Out Anyway remains the explicit emergency fallback and does not claim a confirmed return.
- The locked Back at Store control has a deliberate fail-safe: pressing and holding it continuously for five seconds overrides GPS, completes the delivery, vibrates when supported, and records `GPS return overridden after 5-second hold` in the activity notes. A normal tap outside/unresolved does nothing.
- When the PWA becomes hidden during a delivery it discards the browser GPS watch. On `visibilitychange` back to visible, window `focus`, or `pageshow`, it starts a brand-new high-accuracy watch and simultaneously requests an uncached high-accuracy fix. Closely grouped resume events are debounced. This avoids retaining a dead Android watch handle after switching apps.
- Settings → Refresh App now waits briefly for an installing/waiting service worker to activate before reloading. Service-worker cache revision is v25.
- Removed Undo last and its restore/second-undo workflow from the active shift. Corrections remain available through historical Shift Details.
- Shift Details now renders delivery timers as compact summary rows (type, start time, total trip and Hustle when available). Each row has Edit, which opens the four delivery/GPS timestamps and derived timing strip in a modal instead of expanding every delivery into a large inline form.
- Money & Miles now displays fuel reimbursement per work mile (`delivery reimbursement ÷ work miles`) as £ per mile alongside total work miles and reimbursement status.
- Corrected misleading Hustle labelling without modifying any saved timestamps. `storeExitAt → storeEntryAt` is now labelled Outside store because it covers nearly the entire delivery. The operational Hustle/turnaround measures are Leave store (`delivery start → GPS exit`) and Back in (`GPS entry → Back at Store button`). Compact delivery rows show trip + out + back; if either crossing-dependent turnaround value is unavailable they show GPS error. The editor modal uses Total trip / Leave store / Outside store / Back in, and dashboard/shift analytics use explicit turnaround and outside-store labels.
- The compact Shift Log was removed from the active screen; underlying activity records remain available to calculations and history.

---

## 22. Future handover maintenance

After every major development session:

1. Inspect the current code and migrations.
2. Run the full test/build suite.
3. Update the Generated timestamp, app/Sites/schema versions, source revision, and Last Major Change at the top.
4. Update Current Features, Data Model, Migrations, Known Issues, Status, Tests, and Changelog.
5. Move features between Planned, Partial, Working but Needs Testing, and Complete only when the current implementation justifies it.
6. Do not erase resolved issues without recording the fix in the changelog.
7. Keep exact defaults and business rules in sync with `lib/domain.ts`.

Future request:

> Update `SHIFT_TRACKER_HANDOVER.md` to reflect the current application. Inspect the actual code and tests first; do not merely append the latest prompt.
