import test from "node:test";
import assert from "node:assert/strict";
import * as domain from "../lib/domain.ts";
import {
  breakMilliseconds, createShift, deleteDeliveryRun, deleteDeliveryRunFromData, deleteShiftWithIntegrity, queueJamesOsShiftRetraction, deliverySummary, deliveriesPerHour, grossWagesPence,
  deliveryCooldownRemaining, emptyData, gpsRouteMilesTenths, liveWorkMilesTenths, migrateAppData, needsBreakReviewPrompt, nextPaymentDate, paidMilliseconds, reimbursementPaymentDate, shiftMilliseconds, shiftNeedsReview, shiftTaskReviewNeeded, workMilesTenths, DEFAULT_SETTINGS, formatLiveDuration, normalizeMileageText,
  cleaningReportingShifts, cleaningRequiredFor, cleaningSummary, prepareShiftHistoryDraft, repairShiftActivityIds, restartCompletedShift, routeEfficiencyScore, shiftEfficiencyScore, taskMilliseconds, trackedActivityTotals, formatTimingDuration, periodTotals, PREPARATION_ROTA, snapshotPreparationTasks,
  activityGeofenceEvidence, applyRealGeofenceTransition, attachEarlyDispatchToActivity, bestHustleRecord, canApplyLiveGeofenceTransition, classifyStorePresence, deliveryCustomersComplete, deliveryGeofenceDurations, deliveryGeofenceTimingsForShift, distanceMetres, DOMINOS_REFERENCE_GEOFENCE, evaluateGeofenceSample, expectedDeliveryHustleShifts, hasConfirmedStoreReturn, hustleAnalyticsShifts, initialGeofenceEvaluatorState, isBetaShift, isConclusiveStorePresence, locationAllowsDeliveryCompletion, markRunningDeliveryEarlyDispatch, questionableBetaHustleActivityIds, recordDominosHustleExit, recordRealHustleExitMetrics, reportingShifts, setDeliveryRunCountWithIntegrity, shouldIgnoreRapidNativeStoreReentry,
  analyseRouteMovement, appendRoutePoint, buildCarryoutDepartureZone, carryoutDepartureZoneIsValid, classifyTrafficLightStops, corsaFuelEstimate, customerStopDurationMs, detectSignalQueues, cleanupExpiredRoutes, cleanupExpiredRoutesIfNeeded, finalizeRouteEvidence, finaliseDeliveryActivity, isInsideCarryoutDepartureZone, manualDeliveredCustomerTimings, mergeTrafficSignals, nearestRoutePointToTimestamp, normaliseDeliveryRoutePoints, prepareAppDataForBackup, resolveCustomerLocation, routeDistanceMetres, shouldSaveRoutePoint, sanitiseDeliveryAddress, stockRunCostPence, getDominosReferenceGeofence, getRealStatsGeofence, getStoreDisplayLocation, REAL_STATS_GEOFENCE, DEFAULT_STORE_DISPLAY_LOCATION, type ActivityRecord, type CarryoutDepartureZone, type DeliveryDestinationAddress, type DeliveryRouteEvidence, type DeliveryRoutePoint,
} from "../lib/domain.ts";
import { createBackupDocument, validateBackupDocument } from "../lib/backup.ts";
import { GOOGLE_ROUTES_24_HOUR_HARD_LIMIT, GOOGLE_ROUTES_30_DAY_HARD_LIMIT, GOOGLE_ROUTES_DETAIL_CATALOG, GOOGLE_ROUTES_REASON_CATALOG, GOOGLE_ROUTES_PER_DELIVERY_OVERRIDE_HARD_LIMIT, GoogleRoutesService, getGoogleRoutesRequestLog, getGoogleRoutesUsage, googleRouteFingerprint } from "../lib/googleRoutesService.ts";
import { GOOGLE_GEOCODING_24_HOUR_HARD_LIMIT, GOOGLE_GEOCODING_30_DAY_HARD_LIMIT, GOOGLE_GEOCODING_PER_DELIVERY_HARD_LIMIT, GOOGLE_GEOCODING_PER_MINUTE_HARD_LIMIT, GoogleAddressLookupService } from "../lib/googleAddressLookupService.ts";

class MemoryStore {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test("preparation rota supports neutral not-required outcomes", () => {
  const names = PREPARATION_ROTA.map((task) => task.name);
  assert.ok(names.includes("Prepare chicken"));
  assert.ok(names.includes("Prepare other"));
  for (const name of ["Prepare wedges", "Prepare fries", "Prepare cookies", "Prepare chicken"]) {
    assert.equal(PREPARATION_ROTA.find((task) => task.name === name)?.allowNotRequired, true);
  }
  const snapshot = snapshotPreparationTasks(PREPARATION_ROTA);
  assert.equal(snapshot.find((task) => task.name === "Prepare other")?.notRequired, true);
  assert.equal(snapshot.find((task) => task.name === "Prepare chicken")?.notRequired, false);
});

test("carryout calibration averages noisy doorway readings into a compact helper box", () => {
  const zone = buildCarryoutDepartureZone([
    { label: "front_left", latitude: 53.5680, longitude: -2.8880, accuracy: 24, capturedAt: "2026-09-12T12:00:00.000Z" },
    { label: "front_right", latitude: 53.5684, longitude: -2.8876, accuracy: 24, capturedAt: "2026-09-12T12:00:01.000Z" },
    { label: "back_right", latitude: 53.5677, longitude: -2.8878, accuracy: 24, capturedAt: "2026-09-12T12:00:02.000Z" },
    { label: "back_left", latitude: 53.5678, longitude: -2.8883, accuracy: 24, capturedAt: "2026-09-12T12:00:03.000Z" },
  ], "2026-09-12T12:00:04.000Z");
  assert.ok(zone);
  assert.equal(carryoutDepartureZoneIsValid(zone), true);
  assert.equal(isInsideCarryoutDepartureZone(zone, 53.567975, -2.887925), true);
  assert.equal(isInsideCarryoutDepartureZone(zone, 53.569, -2.887925), false);
});

test("calibrated carryout box is valid only with all four named corners and stays separate from geofences", () => {
  const zone: CarryoutDepartureZone = {
    version: 1,
    calibratedAt: "2026-09-12T12:00:00.000Z",
    corners: [
      { label: "front_left", latitude: 53.5681, longitude: -2.8881, accuracy: 8, capturedAt: "2026-09-12T12:00:00.000Z" },
      { label: "front_right", latitude: 53.5681, longitude: -2.8879, accuracy: 8, capturedAt: "2026-09-12T12:00:01.000Z" },
      { label: "back_right", latitude: 53.5679, longitude: -2.8879, accuracy: 8, capturedAt: "2026-09-12T12:00:02.000Z" },
      { label: "back_left", latitude: 53.5679, longitude: -2.8881, accuracy: 8, capturedAt: "2026-09-12T12:00:03.000Z" },
    ],
  };
  assert.equal(carryoutDepartureZoneIsValid(zone), true);
  assert.equal(isInsideCarryoutDepartureZone(zone, 53.5680, -2.8880), true);
  assert.equal(isInsideCarryoutDepartureZone(zone, 53.5690, -2.8880), false);
  assert.equal(carryoutDepartureZoneIsValid({ ...zone, corners: zone.corners.slice(0, 3) }), false);
});

test("migration adds new preparation jobs without replacing saved rota records", () => {
  const legacy = emptyData();
  legacy.preparationRota = legacy.preparationRota!.filter((task) => task.id !== "prep-06" && task.id !== "prep-07");
  legacy.preparationRota[0].notes = "Keep this saved note";
  const activeShift = createShift(legacy.settings, new Date("2026-08-25T11:00:00.000Z"), undefined, "other", legacy.cleaningRota, legacy.preparationRota);
  legacy.shifts.push(activeShift);
  const migrated = migrateAppData(legacy);
  assert.equal(migrated.preparationRota?.find((task) => task.id === "prep-00")?.notes, "Keep this saved note");
  assert.ok(migrated.preparationRota?.some((task) => task.id === "prep-06"));
  assert.ok(migrated.preparationRota?.some((task) => task.id === "prep-07"));
  assert.ok(migrated.shifts[0].taskSnapshot?.some((task) => task.sourceTaskId === "prep-06"));
  assert.equal(migrated.shifts[0].taskSnapshot?.find((task) => task.sourceTaskId === "prep-07")?.notRequired, true);
});

test("GPS delivery mileage uses recorded driving routes and excludes tests and walking", () => {
  const shift = createShift(DEFAULT_SETTINGS, new Date("2026-08-25T11:00:00.000Z"));
  const route = (id: string, distanceMetres: number, options: { testOnly?: boolean; travelMode?: "driving" | "walking" } = {}): ActivityRecord => ({
    id, shiftId: shift.id, type: "single_delivery", start: "2026-08-25T12:00:00.000Z", end: "2026-08-25T12:20:00.000Z", tracked: true,
    testOnly: options.testOnly, travelMode: options.travelMode,
    routeEvidence: { status: "complete", startedAt: "2026-08-25T12:00:00.000Z", completedAt: "2026-08-25T12:20:00.000Z", points: [], recordedPointCount: 2, distanceMetres, gaps: [], issues: [], stops: [], detail: "standard", retention: "90", expiresAt: null },
  });
  shift.activities = [route("driving", 1609.344), route("walking", 804.672, { travelMode: "walking" }), route("test", 804.672, { testOnly: true })];
  assert.equal(gpsRouteMilesTenths(shift), 10);
});

test("a saved live mileage reading becomes a baseline and new GPS miles keep increasing it", () => {
  const data = emptyData();
  const shift = createShift(
    DEFAULT_SETTINGS,
    new Date("2026-09-06T11:00:00.000Z"),
  );
  shift.mileage.directTenths = 240;
  const route = (
    id: string,
    distanceMetres: number,
    end: string | null,
  ): ActivityRecord => ({
    id,
    shiftId: shift.id,
    type: "single_delivery",
    start: "2026-09-06T12:00:00.000Z",
    end,
    tracked: true,
    routeEvidence: {
      status: end ? "complete" : "recording",
      startedAt: "2026-09-06T12:00:00.000Z",
      completedAt: end,
      points: [],
      recordedPointCount: 30,
      distanceMetres,
      gaps: [],
      issues: [],
      stops: [],
      detail: "standard",
      retention: "90",
      expiresAt: null,
    },
  });
  shift.activities = [
    route("completed", 20 * 1609.344, "2026-09-06T12:20:00.000Z"),
    route("open", 0.87 * 1609.344, null),
  ];
  data.shifts = [shift];

  const migrated = migrateAppData(data).shifts[0];
  assert.equal(migrated.mileage.directTenths, 240);
  assert.equal(migrated.mileage.gpsBaselineTenths, 200);
  assert.equal(liveWorkMilesTenths(migrated), 249);

  migrated.activities![1].routeEvidence!.distanceMetres = 4 * 1609.344;
  assert.equal(liveWorkMilesTenths(migrated), 280);
});

test("completed shifts use their final canonical mileage rather than a live GPS delta", () => {
  const shift = createShift(DEFAULT_SETTINGS, new Date("2026-09-06T11:00:00.000Z"));
  shift.status = "completed";
  shift.clockOut = "2026-09-06T18:00:00.000Z";
  shift.mileage.directTenths = 240;
  shift.mileage.gpsBaselineTenths = 200;
  shift.activities = [{
    id: "completed",
    shiftId: shift.id,
    type: "single_delivery",
    start: "2026-09-06T12:00:00.000Z",
    end: "2026-09-06T12:20:00.000Z",
    tracked: true,
    routeEvidence: {
      status: "complete",
      startedAt: "2026-09-06T12:00:00.000Z",
      completedAt: "2026-09-06T12:20:00.000Z",
      points: [],
      recordedPointCount: 30,
      distanceMetres: 25 * 1609.344,
      gaps: [],
      issues: [],
      stops: [],
      detail: "standard",
      retention: "90",
      expiresAt: null,
    },
  }];
  assert.equal(liveWorkMilesTenths(shift), 240);
});

test("stock-run cost keeps delivery reimbursement at zero and separates paid time from driver fuel", () => {
  const run: ActivityRecord = { id: "stock", shiftId: "shift", type: "single_delivery", stockRun: true, start: "2026-09-01T12:00:00.000Z", end: "2026-09-01T12:30:00.000Z", tracked: true, customerDeliveries: 0, routeEvidence: { status: "complete", startedAt: "2026-09-01T12:00:00.000Z", completedAt: "2026-09-01T12:30:00.000Z", points: [], recordedPointCount: 0, distanceMetres: 1609.344, gaps: [], issues: [], detail: "standard", retention: "90", expiresAt: null } };
  assert.deepEqual(stockRunCostPence(run, 1296, 15), { wagePence: 648, fuelPence: 15, totalPence: 663, netPence: 633, routeMiles: 1 });
});

test("Corsa fuel estimate uses the fixed 45 litre, 350 mile baseline", () => {
  const estimate = corsaFuelEstimate(16.3, DEFAULT_SETTINGS);
  assert.equal(estimate.litres.toFixed(2), "2.10");
  assert.equal(estimate.pencePerMile.toFixed(2), "20.43");
  assert.equal(estimate.fuelPence, 333);
});

test("new shifts ask for a first task once while historical shifts remain undisturbed", () => {
  const shift = createShift(DEFAULT_SETTINGS, new Date("2026-08-25T11:00:00.000Z"));
  assert.equal(shift.firstTaskPromptHandled, false);
  delete shift.firstTaskPromptHandled;
  const data = emptyData();
  data.shifts = [shift];
  assert.equal(migrateAppData(data).shifts[0].firstTaskPromptHandled, true);
});

test("a deleted production shift retains one replay-safe James OS retraction", () => {
  const data = emptyData();
  assert.equal(queueJamesOsShiftRetraction(data, { shiftId: "shift-delete-1", revision: 42, retractedAtEpochMs: 1_789_000_000_000 }), true);
  assert.equal(queueJamesOsShiftRetraction(data, { shiftId: "shift-delete-1", revision: 42, retractedAtEpochMs: 1_789_000_000_100 }), true);
  assert.deepEqual(data.settings.jamesOsShiftRetractions, [{ shiftId: "shift-delete-1", revision: 42, retractedAtEpochMs: 1_789_000_000_100 }]);
  assert.equal(queueJamesOsShiftRetraction(data, { shiftId: "", revision: 42, retractedAtEpochMs: 1 }), false);
});

test("custom quick-task migration trims, deduplicates and bounds saved labels", () => {
  const data = emptyData();
  data.settings.customQuickTasks = ["  Label sauces  ", "label sauces", "", "A".repeat(61), "Restock dips"];
  const migrated = migrateAppData(data);
  assert.deepEqual(migrated.settings.customQuickTasks, ["Label sauces", "Restock dips"]);
});

test("quick-job preferences migrate to safe local defaults without re-enabling hidden jobs", () => {
  const data = emptyData();
  data.settings.customQuickTasks = ["Label sauces"];
  Object.assign(data.settings, {
    quickTasksEnabled: false,
    hiddenQuickTaskIds: ["answer-phone", "answer-phone", "missing-job"],
    quickTaskOrder: ["custom:label sauces", "answer-phone", "missing-job", "answer-phone"],
    quickTaskCategoryOrder: ["stock", "stock", "customer", "invalid"],
    customQuickTaskCategories: {
      "label sauces": "makeline",
      missing: "customer",
      "bad category": "invalid",
    },
  });

  const migrated = migrateAppData(data).settings as typeof data.settings & Record<string, unknown>;
  assert.equal(migrated.quickTasksEnabled, false);
  assert.deepEqual(migrated.hiddenQuickTaskIds, ["answer-phone"]);
  assert.deepEqual(migrated.quickTaskOrder, ["custom:label sauces", "answer-phone"]);
  assert.deepEqual(migrated.quickTaskCategoryOrder, [
    "stock", "customer", "makeline", "cleaning", "oven_front", "other",
  ]);
  assert.deepEqual(migrated.customQuickTaskCategories, { "label sauces": "makeline" });
});

test("resolved quick jobs group defaults and custom jobs without duplicate equivalents", () => {
  const resolveQuickJobs = (domain as Record<string, unknown>).resolveQuickJobs as
    | ((settings: typeof DEFAULT_SETTINGS) => Array<{ id: string; label: string; category: string }>)
    | undefined;
  assert.equal(typeof resolveQuickJobs, "function");
  const settings = {
    ...DEFAULT_SETTINGS,
    customQuickTasks: ["Answer phone", "Label sauces"],
    hiddenQuickTaskIds: ["take-payment"],
    customQuickTaskCategories: { "label sauces": "makeline" },
  } as typeof DEFAULT_SETTINGS;
  const jobs = resolveQuickJobs!(settings);
  assert.equal(jobs.filter((job) => job.label === "Answer phone").length, 1);
  assert.equal(jobs.some((job) => job.label === "Take payment"), false);
  assert.equal(jobs.find((job) => job.label === "Label sauces")?.category, "makeline");
  assert.equal(jobs.some((job) => job.label === "Cut / box pizzas"), true);
  assert.equal(jobs.some((job) => job.label === "Mop floor"), true);
});

test("frequent quick jobs are derived from saved local quick-work history", () => {
  const frequentQuickJobs = (domain as Record<string, unknown>).frequentQuickJobs as
    | ((shifts: ReturnType<typeof createShift>[], jobs: Array<{ id: string; label: string; aliases?: readonly string[] }>) => Array<{ id: string; label: string }>)
    | undefined;
  const resolveQuickJobs = (domain as Record<string, unknown>).resolveQuickJobs as
    | ((settings: typeof DEFAULT_SETTINGS) => Array<{ id: string; label: string; aliases?: readonly string[] }>)
    | undefined;
  assert.equal(typeof frequentQuickJobs, "function");
  assert.equal(typeof resolveQuickJobs, "function");
  const shift = createShift(DEFAULT_SETTINGS, new Date("2026-09-28T11:00:00.000Z"));
  shift.activities = [
    { id: "quick-1", shiftId: shift.id, type: "other_task", taskName: "Quick tasks", quickStack: true, quickItems: ["Answer phone", "Doing oven"], start: "2026-09-28T12:00:00.000Z", end: "2026-09-28T12:05:00.000Z", tracked: true },
    { id: "quick-2", shiftId: shift.id, type: "other_task", taskName: "Quick tasks", quickStack: true, quickItems: ["Answer phone", "Make pizzas", "Answer phone"], start: "2026-09-28T13:00:00.000Z", end: "2026-09-28T13:05:00.000Z", tracked: true },
  ];
  const frequent = frequentQuickJobs!([shift], resolveQuickJobs!(DEFAULT_SETTINGS));
  assert.deepEqual(frequent.map((job) => job.label), ["Answer phone"]);
});

test("startup prompt settings default safely and preserve explicit choices", () => {
  const data = emptyData();
  delete (data.settings as Partial<typeof data.settings>).startupPromptsEnabled;
  delete (data.settings as Partial<typeof data.settings>).clockInRolePromptEnabled;
  delete (data.settings as Partial<typeof data.settings>).defaultShiftRole;
  delete (data.settings as Partial<typeof data.settings>).firstTaskPromptEnabled;
  delete (data.settings as Partial<typeof data.settings>).firstTaskPromptTaskIds;
  delete (data.settings as Partial<typeof data.settings>).firstTaskPromptIncludeRushReady;
  const migratedDefaults = migrateAppData(data).settings;
  assert.equal(migratedDefaults.startupPromptsEnabled, true);
  assert.equal(migratedDefaults.clockInRolePromptEnabled, true);
  assert.equal(migratedDefaults.defaultShiftRole, "open");
  assert.equal(migratedDefaults.firstTaskPromptEnabled, true);
  assert.deepEqual(migratedDefaults.firstTaskPromptTaskIds, []);
  assert.equal(migratedDefaults.firstTaskPromptIncludeRushReady, true);
  data.settings.startupPromptsEnabled = false;
  data.settings.clockInRolePromptEnabled = false;
  data.settings.defaultShiftRole = "second";
  data.settings.firstTaskPromptEnabled = true;
  data.settings.firstTaskPromptTaskIds = ["clean-1", "clean-1", "", "x".repeat(129)];
  data.settings.firstTaskPromptIncludeRushReady = false;
  const migratedChoices = migrateAppData(data).settings;
  assert.equal(migratedChoices.startupPromptsEnabled, false);
  assert.equal(migratedChoices.clockInRolePromptEnabled, false);
  assert.equal(migratedChoices.defaultShiftRole, "second");
  assert.deepEqual(migratedChoices.firstTaskPromptTaskIds, ["clean-1"]);
  assert.equal(migratedChoices.firstTaskPromptIncludeRushReady, false);
});

test("History minute edits keep timeline boundary markers inside the saved shift", () => {
  const data = emptyData();
  const shift = repairShiftActivityIds(createShift(data.settings, new Date("2026-08-24T16:00:42.000Z")));
  shift.clockIn = "2026-08-24T16:00:00.000Z";
  shift.clockOut = "2026-08-24T22:00:00.000Z";
  shift.status = "completed";
  shift.activities?.push({ id: "clock-out-seconds", shiftId: shift.id, type: "clock_out", start: "2026-08-24T22:00:42.000Z", end: "2026-08-24T22:00:42.000Z", tracked: false });
  data.shifts = [shift];

  assert.equal(shift.activities?.find((activity) => activity.type === "clock_out")?.start, "2026-08-24T22:00:42.000Z");
  const result = validateBackupDocument(data);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const clockIn = result.data.shifts[0].activities?.find((activity) => activity.type === "clock_in");
  const clockOut = result.data.shifts[0].activities?.find((activity) => activity.type === "clock_out");
  assert.equal(clockIn?.start, shift.clockIn);
  assert.equal(clockOut?.start, shift.clockOut);
  assert.equal(clockOut?.end, shift.clockOut);
});

test("opening a History draft preserves recorded shift and break seconds", () => {
  const shift = repairShiftActivityIds(createShift(DEFAULT_SETTINGS, new Date("2026-08-24T16:00:42.000Z")));
  shift.status = "completed";
  shift.clockOut = "2026-08-24T22:00:37.000Z";
  shift.breaks = [{ id: "break-with-seconds", start: "2026-08-24T18:00:17.000Z", end: "2026-08-24T18:15:33.000Z" }];

  const draft = prepareShiftHistoryDraft(shift);

  assert.equal(draft.clockIn, "2026-08-24T16:00:42.000Z");
  assert.equal(draft.clockOut, "2026-08-24T22:00:37.000Z");
  assert.equal(draft.breaks[0].start, "2026-08-24T18:00:17.000Z");
  assert.equal(draft.breaks[0].end, "2026-08-24T18:15:33.000Z");
  assert.notEqual(draft, shift);
});

test("delayed geofence callbacks cannot attach evidence to a closed delivery or shift", () => {
  const shift = repairShiftActivityIds(createShift(DEFAULT_SETTINGS, new Date("2026-08-24T16:00:00.000Z")));
  const delivery: ActivityRecord = {
    id: "live-delivery",
    shiftId: shift.id,
    type: "single_delivery",
    start: "2026-08-24T17:00:00.000Z",
    end: null,
    tracked: true,
  };
  shift.activities?.push(delivery);

  assert.equal(canApplyLiveGeofenceTransition(shift, delivery), true);
  delivery.end = "2026-08-24T17:30:00.000Z";
  assert.equal(canApplyLiveGeofenceTransition(shift, delivery), false);
  delivery.end = null;
  shift.status = "completed";
  shift.clockOut = "2026-08-24T22:00:00.000Z";
  assert.equal(canApplyLiveGeofenceTransition(shift, delivery), false);
});

test("unable cleaning outcomes stay incomplete but are reported separately", () => {
  const shift = createShift(DEFAULT_SETTINGS, new Date("2026-08-25T11:00:00.000Z"), "direct", "open");
  const task = shift.taskSnapshot?.find((item) => item.category !== "prep");
  assert.ok(task);
  task.unableReason = "store_too_busy";
  task.unableManager = "Alex";
  task.unableAt = "2026-08-25T18:00:00.000Z";
  const summary = cleaningSummary(shift);
  assert.equal(summary.completed, 0);
  assert.equal(summary.unavailable, 1);
});
const googleRequest = (deliveryId = "delivery-1") => ({ deliveryId, requestType: "expected_outbound" as const, origin: { latitude: 53.56845, longitude: -2.88802 }, destination: { latitude: 53.57000, longitude: -2.88000 }, apiKey: "restricted-test-key", trigger: "manual_delivered" as const, caller: "active_shift.delivered_button" as const });
const googleSuccess = async () => ({ ok: true, status: 200, json: async () => ({ routes: [{ duration: "120s", staticDuration: "100s", distanceMeters: 1_000 }] }) }) as Response;
const seedGoogleLedger = (store: MemoryStore, count: number, timestamp: string, deliveryPrefix = "old") => store.setItem("shift-tracker-google-routes-ledger-v1", JSON.stringify(Array.from({ length: count }, (_, index) => ({ id: `id-${index}`, timestamp, service: "google_routes", requestType: "expected_outbound", deliveryId: `${deliveryPrefix}-${index}`, success: true, cacheHit: false, networkSent: true, fingerprint: `old-${index}`, retryAttempt: 0 }))));
const seedGeocodingLedger = (store: MemoryStore, count: number, timestamp: string, deliveryPrefix = "address") => store.setItem("shift-tracker-google-geocoding-ledger-v2", JSON.stringify(Array.from({ length: count }, (_, index) => ({ id: `geocode-${index}`, timestamp, service: "google_geocoding", requestType: "geocode", deliveryId: `${deliveryPrefix}-${index}`, success: true, cacheHit: false, networkSent: true, fingerprint: `address-${index}` }))));
const geocodingSuccess = async () => ({ ok: true, status: 200, json: async () => ({ status: "OK", results: [{ formatted_address: "42 Example Street, Ormskirk L39 2XX, UK", geometry: { location: { lat: 53.57, lng: -2.88 } }, address_components: [{ long_name: "42", types: ["street_number"] }, { long_name: "Example Street", types: ["route"] }, { long_name: "Ormskirk", types: ["postal_town"] }, { long_name: "L39 2XX", types: ["postal_code"] }] }] }) }) as Response;

function completedShift() {
  const shift = createShift(DEFAULT_SETTINGS, new Date("2026-08-10T16:00:00.000Z"));
  shift.status = "completed";
  shift.clockOut = "2026-08-10T21:30:00.000Z";
  shift.breaks = [{ id: "break", start: "2026-08-10T18:00:00.000Z", end: "2026-08-10T18:30:00.000Z" }];
  return shift;
}

test("five paid hours at £12.96 is £64.80", () => {
  const shift = completedShift();
  assert.equal(shiftMilliseconds(shift), 5.5 * 3_600_000);
  assert.equal(breakMilliseconds(shift), 0.5 * 3_600_000);
  assert.equal(paidMilliseconds(shift), 5 * 3_600_000);
  assert.equal(grossWagesPence(shift), 6480);
});

test("eight singles and three doubles produce the required totals", () => {
  const shift = completedShift();
  shift.deliveries = [
    ...Array.from({ length: 8 }, (_, index) => ({ id: `s${index}`, type: "single" as const, timestamp: shift.clockIn, reimbursementPence: 100 })),
    ...Array.from({ length: 3 }, (_, index) => ({ id: `d${index}`, type: "double" as const, timestamp: shift.clockIn, reimbursementPence: 150 })),
  ];
  assert.deepEqual(deliverySummary(shift), { singles: 8, doubles: 3, runs: 11, individual: 14, reimbursementPence: 1250 });
  assert.equal(deliveriesPerHour(shift), 2.8);
});

test("Google Routes test deliveries stay out of normal shift totals", () => {
  const shift = completedShift();
  shift.deliveries = [
    { id: "test", type: "single", timestamp: shift.clockIn, reimbursementPence: 0, testOnly: true },
    { id: "real", type: "single", timestamp: shift.clockIn, reimbursementPence: 100 },
  ];
  shift.activities = [
    { id: "test-activity", shiftId: shift.id, type: "single_delivery", start: "2026-08-10T17:00:00.000Z", end: "2026-08-10T17:20:00.000Z", tracked: true, testOnly: true },
    { id: "real-activity", shiftId: shift.id, type: "single_delivery", start: "2026-08-10T18:00:00.000Z", end: "2026-08-10T18:30:00.000Z", tracked: true },
  ];
  assert.deepEqual(deliverySummary(shift), { singles: 1, doubles: 0, runs: 1, individual: 1, reimbursementPence: 100 });
  assert.equal(trackedActivityTotals(shift).deliveryMs, 30 * 60_000);
});

test("completed delivery deletion removes its linked run evidence and reimbursement only", () => {
  const shift = completedShift();
  shift.manualDeliveryCount = 4;
  shift.mileage.directTenths = 278;
  shift.deliveries = [
    { id: "event-double", activityId: "run-double", type: "double", timestamp: "2026-08-10T17:00:00.000Z", reimbursementPence: 150 },
    { id: "event-single", activityId: "run-single", type: "single", timestamp: "2026-08-10T18:00:00.000Z", reimbursementPence: 100 },
  ];
  shift.activities = [
    { id: "run-double", shiftId: shift.id, type: "double_delivery", start: "2026-08-10T17:00:00.000Z", end: "2026-08-10T17:20:00.000Z", deliveryEventId: "event-double", customerDeliveries: 2, customerEvents: [{ timestamp: "2026-08-10T17:10:00.000Z", latitude: null, longitude: null, accuracy: null, source: "manual_delivered", pointIndex: null }], routeEvidence: { status: "complete", startedAt: "2026-08-10T17:00:00.000Z", completedAt: "2026-08-10T17:20:00.000Z", points: [], recordedPointCount: 12, distanceMetres: 1200, gaps: [], issues: [], detail: "standard", retention: "90", expiresAt: null } },
    { id: "exit-double", shiftId: shift.id, type: "store_exit", start: "2026-08-10T17:01:00.000Z", end: "2026-08-10T17:01:00.000Z", deliveryEventId: "event-double" },
    { id: "entry-double", shiftId: shift.id, type: "store_entry", start: "2026-08-10T17:19:00.000Z", end: "2026-08-10T17:19:00.000Z", deliveryEventId: "event-double" },
    { id: "run-single", shiftId: shift.id, type: "single_delivery", start: "2026-08-10T18:00:00.000Z", end: "2026-08-10T18:15:00.000Z", deliveryEventId: "event-single", customerDeliveries: 1 },
  ];

  assert.equal(deleteDeliveryRun(shift, "run-double", "2026-08-22T16:00:00.000Z"), true);
  assert.deepEqual(shift.deliveries.map((item) => item.id), ["event-single"]);
  assert.deepEqual(shift.activities?.map((item) => item.id), ["run-single"]);
  assert.equal(shift.manualDeliveryCount, 2);
  assert.equal(shift.mileage.directTenths, 278);
  assert.deepEqual(deliverySummary(shift), { singles: 1, doubles: 0, runs: 1, individual: 2, reimbursementPence: 100 });
  assert.equal(shift.updatedAt, "2026-08-22T16:00:00.000Z");
});

test("History run reduction removes linked route evidence without leaving an invalid orphan", () => {
  const data = emptyData();
  const shift = completedShift();
  shift.deliveries = [
    { id: "event-keep", activityId: "run-keep", type: "single", timestamp: "2026-08-10T17:10:00.000Z", reimbursementPence: 100 },
    { id: "event-remove", activityId: "run-remove", type: "single", timestamp: "2026-08-10T18:10:00.000Z", reimbursementPence: 100 },
  ];
  shift.activities = [
    { id: "run-keep", shiftId: shift.id, type: "single_delivery", start: "2026-08-10T17:00:00.000Z", end: "2026-08-10T17:20:00.000Z", deliveryEventId: "event-keep", routeEvidence: { status: "complete", startedAt: "2026-08-10T17:00:00.000Z", completedAt: "2026-08-10T17:20:00.000Z", points: [{ latitude: 53.568, longitude: -2.888, timestamp: "2026-08-10T17:10:00.000Z", accuracy: 8 }], recordedPointCount: 1, distanceMetres: 900, gaps: [], issues: [], detail: "standard", retention: "90", expiresAt: null } },
    { id: "run-remove", shiftId: shift.id, type: "single_delivery", start: "2026-08-10T18:00:00.000Z", end: "2026-08-10T18:20:00.000Z", deliveryEventId: "event-remove", routeEvidence: { status: "complete", startedAt: "2026-08-10T18:00:00.000Z", completedAt: "2026-08-10T18:20:00.000Z", points: [{ latitude: 53.569, longitude: -2.887, timestamp: "2026-08-10T18:10:00.000Z", accuracy: 8 }], recordedPointCount: 1, distanceMetres: 1_100, gaps: [], issues: [], detail: "standard", retention: "90", expiresAt: null } },
    { id: "exit-remove", shiftId: shift.id, type: "store_exit", start: "2026-08-10T18:01:00.000Z", end: "2026-08-10T18:01:00.000Z", deliveryEventId: "event-remove" },
    { id: "entry-remove", shiftId: shift.id, type: "store_entry", start: "2026-08-10T18:19:00.000Z", end: "2026-08-10T18:19:00.000Z", deliveryEventId: "event-remove" },
  ];
  data.shifts = [shift];

  assert.deepEqual(setDeliveryRunCountWithIntegrity(shift, "single", 1, "2026-08-22T17:00:00.000Z"), { ok: true });
  assert.deepEqual(shift.deliveries.map((event) => event.id), ["event-keep"]);
  assert.deepEqual(shift.activities?.map((activity) => activity.id), ["run-keep"]);
  assert.equal(shift.updatedAt, "2026-08-22T17:00:00.000Z");

  const validation = validateBackupDocument(createBackupDocument(data, "2.1.42"));
  assert.equal(validation.ok, true, validation.ok ? undefined : validation.message);
});

test("a running delivery cannot be deleted from history", () => {
  const shift = completedShift();
  shift.activities = [{ id: "running", shiftId: shift.id, type: "single_delivery", start: "2026-08-10T18:00:00.000Z", end: null, deliveryEventId: "event" }];
  shift.deliveries = [{ id: "event", activityId: "running", type: "single", timestamp: "2026-08-10T18:00:00.000Z", reimbursementPence: 100 }];
  assert.equal(deleteDeliveryRun(shift, "running"), false);
  assert.equal(shift.deliveries.length, 1);
  assert.equal(shift.activities.length, 1);
});

test("standard History and CSV timing helper defaults explicitly to Real Hustle", () => {
  const shift = completedShift();
  shift.activities = [{
    id: "run", shiftId: shift.id, type: "single_delivery", start: "2026-08-10T17:00:00.000Z", end: "2026-08-10T17:30:00.000Z", backAtStoreAt: "2026-08-10T17:30:00.000Z",
    storeExitAt: "2026-08-10T17:02:00.000Z", storeEntryAt: "2026-08-10T17:28:00.000Z", storeExitObserved: true, storeEntryObserved: true,
    dominosStoreExitAt: "2026-08-10T17:04:00.000Z", dominosStoreEntryAt: "2026-08-10T17:25:00.000Z", dominosStoreExitObserved: true, dominosStoreEntryObserved: true,
  }];
  const standard = deliveryGeofenceTimingsForShift(shift);
  const comparison = deliveryGeofenceTimingsForShift(shift, "dominos");
  assert.equal(standard[0].preDepartureMs, 2 * 60_000);
  assert.equal(standard[0].hustleMs, 26 * 60_000);
  assert.equal(standard[0].returnDelayMs, 2 * 60_000);
  assert.equal(comparison[0].hustleMs, 21 * 60_000);
});

test("delivery deletion preserves paid history and repairs expected reimbursement", () => {
  const data = emptyData();
  const shift = completedShift();
  shift.deliveries = [
    { id: "delete-event", activityId: "delete-run", type: "single", timestamp: "2026-08-10T17:00:00.000Z", reimbursementPence: 100 },
    { id: "keep-event", activityId: "keep-run", type: "double", timestamp: "2026-08-10T18:00:00.000Z", reimbursementPence: 150 },
  ];
  shift.activities = [
    { id: "delete-run", shiftId: shift.id, type: "single_delivery", start: "2026-08-10T17:00:00.000Z", end: "2026-08-10T17:20:00.000Z", deliveryEventId: "delete-event" },
    { id: "keep-run", shiftId: shift.id, type: "double_delivery", start: "2026-08-10T18:00:00.000Z", end: "2026-08-10T18:20:00.000Z", deliveryEventId: "keep-event" },
  ];
  shift.reimbursementStatus = "paid";
  shift.reimbursementPaymentId = "payment";
  data.shifts = [shift];
  data.payments = [{ id: "payment", date: "2026-08-20T12:00:00.000Z", amountPence: 250, expectedAmountPence: 250, shiftIds: [shift.id], reversedAt: null }];

  assert.equal(deleteDeliveryRunFromData(data, shift.id, "delete-run", "2026-08-22T17:00:00.000Z"), true);
  assert.equal(data.payments[0].amountPence, 250);
  assert.equal(data.payments[0].expectedAmountPence, 150);
  assert.deepEqual(data.payments[0].shiftIds, [shift.id]);
});

test("shift deletion removes orphan payment links without changing unrelated paid history", () => {
  const data = emptyData();
  const removed = completedShift();
  removed.id = "remove";
  removed.reimbursementPaymentId = "payment";
  const kept = completedShift();
  kept.id = "keep";
  kept.reimbursementPaymentId = "payment";
  kept.deliveries = [{ id: "kept", type: "single", timestamp: kept.clockIn, reimbursementPence: 100 }];
  data.shifts = [removed, kept];
  data.payments = [{ id: "payment", date: "2026-08-20T12:00:00.000Z", amountPence: 250, expectedAmountPence: 250, shiftIds: [removed.id, kept.id], reversedAt: null }];
  data.rotaWeeks = [{ id: "week", weekStartDate: "2026-08-10", createdAt: removed.clockIn, updatedAt: removed.clockIn, entries: [{ id: "rota", date: "2026-08-10", status: "working", startTime: "17:00", shiftType: "R", attendance: null, linkedShiftId: removed.id, createdAt: removed.clockIn, updatedAt: removed.clockIn }] }];

  assert.equal(deleteShiftWithIntegrity(data, removed.id), true);
  assert.deepEqual(data.shifts.map((shift) => shift.id), ["keep"]);
  assert.deepEqual(data.payments[0].shiftIds, ["keep"]);
  assert.equal(data.payments[0].amountPence, 250);
  assert.equal(data.payments[0].expectedAmountPence, 100);
  assert.equal(data.rotaWeeks[0].entries[0].linkedShiftId, null);
});

test("beta shifts stay stored but are excluded from reports by default", () => {
  const beta = completedShift();
  beta.id = "beta";
  beta.clockIn = "2026-08-23T22:59:59.999Z";
  const live = completedShift();
  live.id = "live";
  live.clockIn = "2026-08-23T23:00:00.000Z";
  const data = emptyData();
  data.shifts = [beta, live];
  beta.cleaningOverride = true;
  live.cleaningOverride = true;
  assert.ok((beta.taskSnapshot?.length ?? 0) > 0);
  assert.ok((live.taskSnapshot?.length ?? 0) > 0);
  assert.equal(isBetaShift(beta), true);
  assert.equal(isBetaShift(live), false);
  assert.deepEqual(reportingShifts(data).map((shift) => shift.id), ["live"]);
  const liveOnlyTotals = periodTotals(reportingShifts(data), new Date(0), new Date(8_640_000_000_000_000));
  assert.equal(liveOnlyTotals.cleaningEligibleShifts, 1);
  assert.equal(liveOnlyTotals.cleaningExpected, live.taskSnapshot?.filter((task) => task.category !== "prep").length);
  data.settings.includeBetaData = true;
  assert.deepEqual(reportingShifts(data).map((shift) => shift.id), ["beta", "live"]);
  assert.deepEqual(cleaningReportingShifts(data).map((shift) => shift.id), ["live"]);
  const betaCleaningExcluded = periodTotals(reportingShifts(data), new Date(0), new Date(8_640_000_000_000_000), cleaningReportingShifts(data));
  assert.equal(betaCleaningExcluded.shifts, 2);
  assert.equal(betaCleaningExcluded.cleaningEligibleShifts, 1);
  data.settings.includeBetaCleaningData = true;
  assert.deepEqual(cleaningReportingShifts(data).map((shift) => shift.id), ["beta", "live"]);
  const betaCleaningIncluded = periodTotals(reportingShifts(data), new Date(0), new Date(8_640_000_000_000_000), cleaningReportingShifts(data));
  assert.equal(betaCleaningIncluded.cleaningEligibleShifts, 2);
  data.settings.includeBetaData = false;
  assert.deepEqual(cleaningReportingShifts(data).map((shift) => shift.id), ["live"]);
  assert.equal(data.shifts.length, 2);
});

test("shift efficiency is transparent paid-time coverage and excludes breaks", () => {
  const shift = completedShift();
  shift.activities = [
    { id: "delivery", shiftId: shift.id, type: "single_delivery", start: "2026-08-10T16:00:00.000Z", end: "2026-08-10T18:00:00.000Z", tracked: true },
    { id: "store-work", shiftId: shift.id, type: "other_task", start: "2026-08-10T19:00:00.000Z", end: "2026-08-10T20:00:00.000Z", tracked: true, taskName: "Stock" },
  ];
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.operationalAllowances = { comfortMinutesPerHour: 0, orderHandlingMinutesPerOrder: 0, transitionSeconds: 0, returnResetMinutes: 0, maximumMinutesPerHour: 0 };
  const score = shiftEfficiencyScore(shift, settings);
  assert.equal(score.paidMs, 5 * 3_600_000);
  assert.equal(score.trackedMs, 3 * 3_600_000);
  assert.equal(score.score, 60);
  assert.equal(score.band, "developing");
  assert.equal(score.unallocatedMs, 2 * 3_600_000);
});

test("route efficiency is capped at 100 and only exists with both totals", () => {
  assert.deepEqual(routeEfficiencyScore(600, 600), { score: 100, band: "excellent" });
  assert.deepEqual(routeEfficiencyScore(600, 750), { score: 80, band: "strong" });
  assert.equal(routeEfficiencyScore(600, undefined), null);
});

test("completed delivery addresses are reduced to the selected privacy level", () => {
  const address: DeliveryDestinationAddress = { fullAddress: "42 Example Street\nOrmskirk\nL39 2XX", houseNumberOrName: "42", street: "Example Street", locality: "Ormskirk", postcode: "L39 2XX", destination: { latitude: 53.57, longitude: -2.88 }, addressSource: "manual", privacyStatus: "precise" };
  const reduced = sanitiseDeliveryAddress(address, "street_sector");
  assert.equal(reduced.fullAddress, undefined);
  assert.equal(reduced.houseNumberOrName, undefined);
  assert.equal(reduced.destination, undefined);
  assert.equal(reduced.street, "Example Street");
  assert.equal(reduced.locality, "Ormskirk");
  assert.equal(reduced.postcode, "L39 2");
  assert.equal(reduced.privacyStatus, "sanitised");
});

test("privacy none removes all historical destination detail without touching GPS evidence", () => {
  const address: DeliveryDestinationAddress = { fullAddress: "1 Private Road", street: "Private Road", postcode: "L39 2XX", destination: { latitude: 53.57, longitude: -2.88 }, privacyStatus: "precise" };
  const reduced = sanitiseDeliveryAddress(address, "none");
  assert.equal(reduced.street, undefined);
  assert.equal(reduced.postcode, undefined);
  assert.equal(reduced.destination, undefined);
  assert.equal(reduced.privacyStatus, "sanitised");
});

test("multiple breaks and an open break are calculated from timestamps", () => {
  const shift = createShift(DEFAULT_SETTINGS, new Date("2026-08-10T16:00:00.000Z"));
  shift.status = "break";
  shift.breaks = [
    { id: "a", start: "2026-08-10T17:00:00.000Z", end: "2026-08-10T17:15:00.000Z" },
    { id: "b", start: "2026-08-10T18:00:00.000Z", end: null },
  ];
  const reopenedAt = new Date("2026-08-10T19:00:00.000Z");
  assert.equal(shiftMilliseconds(shift, reopenedAt), 3 * 3_600_000);
  assert.equal(breakMilliseconds(shift, reopenedAt), 75 * 60_000);
  assert.equal(paidMilliseconds(shift, reopenedAt), 105 * 60_000);
});

test("odometer and direct mileage stay separate and use tenths", () => {
  const shift = completedShift();
  shift.mileage = { method: "odometer", startTenths: 41_002, endTenths: 41_425, directTenths: null };
  assert.equal(workMilesTenths(shift), 423);
  shift.mileage = { method: "direct", startTenths: null, endTenths: null, directTenths: 178 };
  assert.equal(workMilesTenths(shift), 178);
});

test("direct mileage is the default for new shifts", () => {
  const shift = createShift(DEFAULT_SETTINGS, new Date("2026-08-10T16:00:00.000Z"));
  assert.equal(shift.mileage.method, "direct");
});

test("a clocked-out shift without break details remains safely incomplete", () => {
  const shift = completedShift();
  shift.clockOut = "2026-08-10T22:00:00.000Z";
  shift.breaks = [];
  shift.reviewStatus = "incomplete";
  assert.equal(shiftNeedsReview(shift), true);
  shift.noBreakRecord = { reason: "No cover was available", note: "Busy close", expectedDeduction: false, recordedAt: shift.clockOut! };
  shift.reviewStatus = "complete";
  assert.equal(shiftNeedsReview(shift), false);
});

test("a shift under six hours never requires break details", () => {
  const shift = completedShift();
  shift.clockOut = "2026-08-10T21:59:00.000Z";
  shift.breaks = [];
  shift.reviewStatus = "incomplete";
  assert.equal(shiftNeedsReview(shift), false);
});

test("the break check appears only in the five minutes before six hours", () => {
  const shift = createShift(DEFAULT_SETTINGS, new Date("2026-08-10T11:00:00.000Z"));
  assert.equal(needsBreakReviewPrompt(shift, new Date("2026-08-10T16:54:59.000Z")), false);
  assert.equal(needsBreakReviewPrompt(shift, new Date("2026-08-10T16:55:00.000Z")), true);
  assert.equal(needsBreakReviewPrompt(shift, new Date("2026-08-10T16:59:59.000Z")), true);
  assert.equal(needsBreakReviewPrompt(shift, new Date("2026-08-10T17:00:00.000Z")), false);
  shift.breaks = [{ id: "break", start: "2026-08-10T14:00:00.000Z", end: "2026-08-10T14:15:00.000Z" }];
  assert.equal(needsBreakReviewPrompt(shift, new Date("2026-08-10T16:58:00.000Z")), false);
});

test("a completed shift with a valid break does not need review", () => {
  assert.equal(shiftNeedsReview(completedShift()), false);
});

test("task review remains due until applicable tasks have a final outcome", () => {
  const shift = completedShift();
  shift.cleaningRequired = true;
  shift.taskSnapshot = [{ id: "task", sourceTaskId: "source", weekday: 1, name: "Office", area: "Office", description: "Clean", enabled: true, order: 1, expectedMinutes: null, notes: "", category: "cleaning", status: "not_started", segments: [], completedAt: null, quickCompleted: false, completedBySomeoneElse: false }];
  assert.equal(shiftTaskReviewNeeded(shift), true);
  shift.taskSnapshot[0].unableAt = shift.clockOut;
  shift.taskSnapshot[0].unableReason = "shift_ended";
  shift.taskSnapshot[0].unableManager = "Manager";
  assert.equal(shiftTaskReviewNeeded(shift), false);
});

test("manual missed-shift evidence survives canonical backup validation", () => {
  const data = emptyData();
  const shift = completedShift();
  shift.activities = [];
  shift.manualEntry = { reason: "missed_tracking", note: "Phone was unavailable", recordedAt: shift.clockOut! };
  data.shifts.push(shift);
  const validation = validateBackupDocument(createBackupDocument(data, "2.1.67", new Date("2026-08-25T20:00:00.000Z")));
  assert.equal(validation.ok, true);
  if (validation.ok) assert.equal(validation.data.shifts[0].manualEntry?.reason, "missed_tracking");
});

test("a called-back shift resumes with the clock-out gap as an extra break", () => {
  const shift = completedShift();
  shift.activities = [
    { id: "clock-in", shiftId: shift.id, type: "clock_in", start: shift.clockIn, end: shift.clockIn, tracked: false },
    { id: "clock-out", shiftId: shift.id, type: "clock_out", start: shift.clockOut!, end: shift.clockOut!, tracked: false },
  ];
  shift.noBreakRecord = { reason: "Shift workload prevented a break", note: "", expectedDeduction: false, recordedAt: shift.clockOut! };
  const result = restartCompletedShift(shift, "2026-08-10T22:00:00.000Z");
  assert.equal(result.ok, true);
  assert.equal(shift.status, "working");
  assert.equal(shift.clockOut, null);
  assert.equal(shift.noBreakRecord, null);
  assert.deepEqual(shift.breaks.at(-1), { id: result.ok ? result.breakId : "", start: "2026-08-10T21:30:00.000Z", end: "2026-08-10T22:00:00.000Z" });
  assert.equal(shift.activities.some((activity) => activity.type === "clock_out"), false);
  assert.equal(shift.activities.find((activity) => activity.type === "break" && activity.start === "2026-08-10T21:30:00.000Z")?.notes, "Called back after clock-out");
  const data = emptyData(); data.shifts = [shift];
  assert.equal(validateBackupDocument(createBackupDocument(data, "2.1.68", new Date("2026-08-10T22:00:01.000Z"))).ok, true);
});

test("a completed shift cannot restart before its saved clock-out", () => {
  const shift = completedShift();
  assert.equal(restartCompletedShift(shift, "2026-08-10T21:29:59.000Z").ok, false);
  assert.equal(shift.status, "completed");
  assert.equal(shift.clockOut, "2026-08-10T21:30:00.000Z");
});

test("ask each shift uses the mileage method chosen at clock-in", () => {
  const askSettings = { ...DEFAULT_SETTINGS, mileagePreference: "ask" as const };
  const direct = createShift(askSettings, new Date("2026-08-10T16:00:00.000Z"), "direct");
  const odometer = createShift(askSettings, new Date("2026-08-10T16:00:00.000Z"), "odometer");
  assert.equal(direct.mileage.method, "direct");
  assert.equal(odometer.mileage.method, "odometer");
});

test("legacy ask preference resets to direct once, then ask can be selected normally", () => {
  const legacy = emptyData();
  legacy.settingsRevision = undefined;
  legacy.settings.mileagePreference = "ask";
  const migrated = migrateAppData(legacy);
  assert.equal(migrated.settings.mileagePreference, "direct");
  assert.equal(migrated.settingsRevision, 7);
  migrated.settings.mileagePreference = "ask";
  assert.equal(migrateAppData(migrated).settings.mileagePreference, "ask");
});

test("store geofence uses hysteresis around the configured 35 metre radius", () => {
  assert.equal(classifyStorePresence(20, 35, "unknown"), "inside");
  assert.equal(classifyStorePresence(40, 35, "inside"), "inside");
  assert.equal(classifyStorePresence(50, 35, "inside"), "outside");
  assert.equal(classifyStorePresence(36, 35, "outside"), "outside");
  assert.equal(classifyStorePresence(35, 35, "outside"), "inside");
  assert.ok(distanceMetres(53.56845, -2.88802, 53.56845, -2.88802) < 0.1);
});

test("the old-store built-in point migrates back to the configured current store", () => {
  const legacy = emptyData();
  legacy.settingsRevision = 4;
  legacy.settings.storeLatitude = 53.5669481;
  legacy.settings.storeLongitude = -2.8860588;
  const migrated = migrateAppData(legacy);
  assert.equal(migrated.settings.storeLatitude, 53.56845);
  assert.equal(migrated.settings.storeLongitude, -2.88802);
  assert.equal(migrated.settingsRevision, 7);
});

test("the configured current-store default remains unchanged during migration", () => {
  const legacy = emptyData();
  legacy.settingsRevision = 3;
  legacy.settings.storeLatitude = 53.56845;
  legacy.settings.storeLongitude = -2.88802;
  const migrated = migrateAppData(legacy);
  assert.equal(migrated.settings.storeLatitude, 53.56845);
  assert.equal(migrated.settings.storeLongitude, -2.88802);
  assert.equal(migrated.settingsRevision, 7);
});

test("custom store coordinates are preserved by the built-in store migration", () => {
  const custom = emptyData();
  custom.settingsRevision = 3;
  custom.settings.storeLatitude = 53.57001;
  custom.settings.storeLongitude = -2.88002;
  const migrated = migrateAppData(custom);
  assert.equal(migrated.settings.storeLatitude, 53.57001);
  assert.equal(migrated.settings.storeLongitude, -2.88002);
});

test("physical store display pin is separate from the protected statistics geofence", () => {
  const data = emptyData();
  const stats = getRealStatsGeofence(data.settings);
  const display = getStoreDisplayLocation(data.settings);
  assert.deepEqual(stats, { latitude: REAL_STATS_GEOFENCE.latitude, longitude: REAL_STATS_GEOFENCE.longitude, radius: REAL_STATS_GEOFENCE.radius });
  assert.deepEqual(display, { latitude: 53.568186, longitude: -2.887791, label: DEFAULT_STORE_DISPLAY_LOCATION.label });
  assert.notDeepEqual([stats.latitude, stats.longitude], [display.latitude, display.longitude]);
  data.settings.storeDisplayLatitude = 53.5682;
  data.settings.storeDisplayLongitude = -2.8878;
  const moved = getStoreDisplayLocation(data.settings);
  assert.deepEqual([moved.latitude, moved.longitude], [53.5682, -2.8878]);
  assert.deepEqual(getRealStatsGeofence(data.settings), stats);
});

test("stored or imported settings cannot move the protected Real geofence", () => {
  const data = emptyData();
  data.settings.storeLatitude = 51.5;
  data.settings.storeLongitude = -0.12;
  data.settings.storeRadiusMetres = 500;
  assert.deepEqual(getRealStatsGeofence(data.settings), {
    latitude: REAL_STATS_GEOFENCE.latitude,
    longitude: REAL_STATS_GEOFENCE.longitude,
    radius: REAL_STATS_GEOFENCE.radius,
  });
});

test("display pin migration adds the physical store point without rewriting geofence settings", () => {
  const legacy = emptyData();
  delete legacy.settings.storeDisplayLatitude;
  delete legacy.settings.storeDisplayLongitude;
  delete legacy.settings.storeDisplayLabel;
  legacy.settings.storeLatitude = REAL_STATS_GEOFENCE.latitude;
  legacy.settings.storeLongitude = REAL_STATS_GEOFENCE.longitude;
  const migrated = migrateAppData(legacy);
  assert.deepEqual(getRealStatsGeofence(migrated.settings), { latitude: REAL_STATS_GEOFENCE.latitude, longitude: REAL_STATS_GEOFENCE.longitude, radius: REAL_STATS_GEOFENCE.radius });
  assert.deepEqual(getStoreDisplayLocation(migrated.settings), { latitude: DEFAULT_STORE_DISPLAY_LOCATION.latitude, longitude: DEFAULT_STORE_DISPLAY_LOCATION.longitude, label: DEFAULT_STORE_DISPLAY_LOCATION.label });
});

test("delivery address prompt defaults on for existing and new data", () => {
  assert.equal(DEFAULT_SETTINGS.deliveryAddressEnabled, true);
  const legacy = emptyData();
  delete legacy.settings.deliveryAddressEnabled;
  assert.equal(migrateAppData(legacy).settings.deliveryAddressEnabled, true);
});

test("geofence chime style defaults safely and preserves a supported choice", () => {
  assert.equal(DEFAULT_SETTINGS.geofenceChimeStyle, "classic");
  const legacy = emptyData();
  delete legacy.settings.geofenceChimeStyle;
  assert.equal(migrateAppData(legacy).settings.geofenceChimeStyle, "classic");
  const chosen = emptyData();
  chosen.settings.geofenceChimeStyle = "alarm";
  assert.equal(migrateAppData(chosen).settings.geofenceChimeStyle, "alarm");
});

test("OSM optional feature settings default on and preserve explicit choices", () => {
  const defaults = migrateAppData(emptyData());
  assert.deepEqual(defaults.settings.osmRoadFeatureSettings, {
    trafficSignals: true,
    junctionControls: true,
    pedestrianCrossings: true,
    calmingAndRoundabouts: true,
    roadMetadata: true,
    restrictions: true,
  });
  const saved = emptyData();
  saved.settings.osmRoadFeatureSettings = {
    trafficSignals: false,
    junctionControls: true,
    pedestrianCrossings: false,
    calmingAndRoundabouts: true,
    roadMetadata: false,
    restrictions: true,
  };
  assert.deepEqual(migrateAppData(saved).settings.osmRoadFeatureSettings, saved.settings.osmRoadFeatureSettings);
});

test("geofence timings keep seconds instead of rounding short returns to zero", () => {
  assert.equal(formatTimingDuration(38_000), "38s");
  assert.equal(formatTimingDuration(70_000), "1m 10s");
  assert.equal(formatTimingDuration(60 * 60_000 + 12 * 60_000), "1h 12m");
});

test("a single conclusive GPS reading can confirm a crossing", () => {
  assert.equal(isConclusiveStorePresence(1_000, 20, 35, "outside"), true);
  assert.equal(isConclusiveStorePresence(50, 10, 35, "outside"), false);
  assert.equal(isConclusiveStorePresence(10, 8, 35, "inside"), true);
  assert.equal(isConclusiveStorePresence(25, 8, 35, "inside"), true);
});

test("location-assisted delivery completion requires a confirmed inside reading", () => {
  assert.equal(locationAllowsDeliveryCompletion(true, true, "outside"), false);
  assert.equal(locationAllowsDeliveryCompletion(true, false, "unknown"), false);
  assert.equal(locationAllowsDeliveryCompletion(true, true, "inside"), true);
  assert.equal(locationAllowsDeliveryCompletion(false, false, "unknown"), true);
});

test("a persisted canonical store return requires one delivery-owned exit then entry", () => {
  const exit = { storeExitObserved: true, storeExitAt: "2026-08-22T18:10:00.000Z" };
  assert.equal(hasConfirmedStoreReturn({ ...exit, storeEntryObserved: true, storeEntryAt: "2026-08-22T18:31:00.000Z" }), true);
  assert.equal(hasConfirmedStoreReturn({ ...exit, storeEntryObserved: false, storeEntryAt: "2026-08-22T18:31:00.000Z" }), false);
  assert.equal(hasConfirmedStoreReturn({ ...exit, storeEntryObserved: true, storeEntryAt: "not-a-time" }), false);
  assert.equal(hasConfirmedStoreReturn({ ...exit, storeEntryObserved: true, storeEntryAt: "2026-08-22T18:09:00.000Z" }), false);
  assert.equal(hasConfirmedStoreReturn({ storeExitObserved: false, storeExitAt: null, storeEntryObserved: true, storeEntryAt: "2026-08-22T18:31:00.000Z" }), false);
});

test("Back at Store requires Delivered for every customer on the current run", () => {
  const single: ActivityRecord = { id: "single", shiftId: "shift", type: "single_delivery", start: "2026-08-23T16:00:00.000Z", end: null, customerDeliveries: 1, customerEvents: [] };
  assert.equal(deliveryCustomersComplete(single), false);
  single.customerEvents!.push({ timestamp: "2026-08-23T16:10:00.000Z", latitude: null, longitude: null, accuracy: null, pointIndex: null, source: "manual_delivered", customerIndex: 1 });
  assert.equal(deliveryCustomersComplete(single), true);
  const double: ActivityRecord = { ...single, id: "double", type: "double_delivery", customerDeliveries: 2, customerEvents: [...single.customerEvents!] };
  assert.equal(deliveryCustomersComplete(double), false);
  double.customerEvents!.push({ timestamp: "2026-08-23T16:15:00.000Z", latitude: null, longitude: null, accuracy: null, pointIndex: null, source: "manual_delivered", customerIndex: 2 });
  assert.equal(deliveryCustomersComplete(double), true);
});

test("native store re-entry is ignored only during the first 60 seconds after exit", () => {
  const exit = "2026-08-22T14:00:00.000Z";
  assert.equal(shouldIgnoreRapidNativeStoreReentry(exit, "2026-08-22T14:00:59.999Z"), true);
  assert.equal(shouldIgnoreRapidNativeStoreReentry(exit, "2026-08-22T14:01:00.000Z"), false);
  assert.equal(shouldIgnoreRapidNativeStoreReentry(exit, "2026-08-22T13:59:59.000Z"), false);
  assert.equal(shouldIgnoreRapidNativeStoreReentry(null, "2026-08-22T14:00:10.000Z"), false);
});

test("Hustle, pre-departure and return delay reconcile without inventing data", () => {
  const activity = {
    id: "geo", shiftId: "shift", type: "single_delivery" as const,
    start: "2026-08-12T17:52:00.000Z", end: "2026-08-12T18:08:00.000Z",
    storeExitAt: "2026-08-12T17:54:00.000Z", storeEntryAt: "2026-08-12T18:07:00.000Z", backAtStoreAt: "2026-08-12T18:08:00.000Z",
    storeExitObserved: true, storeEntryObserved: true,
  };
  assert.deepEqual(deliveryGeofenceDurations(activity), { totalMs: 16 * 60_000, preDepartureMs: 2 * 60_000, hustleMs: 13 * 60_000, returnDelayMs: 60_000 });
  assert.equal(deliveryGeofenceDurations({ ...activity, storeEntryObserved: false }).hustleMs, null);
});

test("best Hustle records use fully timed runs and rank shift, week and month averages", () => {
  const makeTimedShift = (id: string, clockIn: string, exitDelayMs: number, returnDelayMs: number) => {
    const shift = createShift(DEFAULT_SETTINGS, new Date(clockIn));
    shift.id = id;
    const start = new Date(clockIn).getTime();
    const exit = start + exitDelayMs;
    const entry = exit + 10 * 60_000;
    const back = entry + returnDelayMs;
    shift.activities = [{ id: `${id}-run`, shiftId: id, type: "single_delivery", start: new Date(start).toISOString(), end: new Date(back).toISOString(), storeExitAt: new Date(exit).toISOString(), storeEntryAt: new Date(entry).toISOString(), backAtStoreAt: new Date(back).toISOString(), storeExitObserved: true, storeEntryObserved: true }];
    return shift;
  };
  const firstWeek = makeTimedShift("shift-a", "2026-08-10T11:00:00.000Z", 120_000, 60_000);
  const secondWeek = makeTimedShift("shift-b", "2026-08-17T11:00:00.000Z", 60_000, 40_000);
  const september = makeTimedShift("shift-c", "2026-09-07T11:00:00.000Z", 100_000, 60_000);
  firstWeek.activities!.push({ id: "missing-gps", shiftId: firstWeek.id, type: "single_delivery", start: "2026-08-10T12:00:00.000Z", end: "2026-08-10T12:12:00.000Z" });

  assert.equal(bestHustleRecord([firstWeek, secondWeek, september], "shift")?.shiftId, "shift-b");
  assert.equal(bestHustleRecord([firstWeek, secondWeek, september], "week")?.averageMs, 100_000);
  assert.equal(new Date(bestHustleRecord([firstWeek, secondWeek, september], "month")?.periodStart ?? "").getMonth(), 7);
  assert.equal(bestHustleRecord([firstWeek], "shift")?.runCount, 1);
});

test("unusual beta Hustle timings are filtered without removing their shifts or production data", () => {
  const makeTimedShift = (id: string, clockIn: string, exitDelayMs: number, returnDelayMs: number) => {
    const shift = createShift(DEFAULT_SETTINGS, new Date(clockIn));
    shift.id = id;
    const start = Date.parse(clockIn);
    const exit = start + exitDelayMs;
    const entry = exit + 10 * 60_000;
    const back = entry + returnDelayMs;
    shift.activities = [{ id: `${id}-run`, shiftId: id, type: "single_delivery", start: new Date(start).toISOString(), end: new Date(back).toISOString(), storeExitAt: new Date(exit).toISOString(), storeEntryAt: new Date(entry).toISOString(), backAtStoreAt: new Date(back).toISOString(), storeExitObserved: true, storeEntryObserved: true }];
    return shift;
  };
  const normalBeta = Array.from({ length: 5 }, (_, index) => makeTimedShift(`normal-${index}`, `2026-08-${String(10 + index).padStart(2, "0")}T16:00:00.000Z`, 60_000, 40_000));
  const unusualBeta = makeTimedShift("unusual-beta", "2026-08-20T16:00:00.000Z", 10 * 60_000, 40_000);
  const unusualProduction = makeTimedShift("unusual-production", "2026-08-24T16:00:00.000Z", 12 * 60_000, 40_000);
  const shifts = [...normalBeta, unusualBeta, unusualProduction];

  assert.deepEqual([...questionableBetaHustleActivityIds(shifts)], ["unusual-beta-run"]);
  const filtered = hustleAnalyticsShifts(shifts);
  assert.equal(filtered.find((shift) => shift.id === "unusual-beta")?.activities?.length, 0);
  assert.equal(filtered.find((shift) => shift.id === "unusual-production")?.activities?.length, 1);
  assert.equal(filtered.length, shifts.length);
  assert.equal(hustleAnalyticsShifts(shifts, true), shifts);

  const data = emptyData();
  data.shifts = shifts;
  data.settings.includeBetaData = true;
  assert.equal(expectedDeliveryHustleShifts(data).find((shift) => shift.id === "unusual-beta")?.activities?.length, 0);
  assert.equal(expectedDeliveryHustleShifts(data).find((shift) => shift.id === "unusual-production")?.activities?.length, 1);
  data.settings.includeQuestionableBetaHustle = true;
  assert.equal(expectedDeliveryHustleShifts(data).find((shift) => shift.id === "unusual-beta")?.activities?.length, 1);
  data.settings.includeBetaData = false;
  assert.deepEqual(expectedDeliveryHustleShifts(data).map((shift) => shift.id), ["unusual-production"]);
});

test("questionable beta Hustle analysis calculates route timings only for completed single/double deliveries", () => {
  const shift = createShift(DEFAULT_SETTINGS, new Date("2026-08-20T16:00:00.000Z"));
  const nonDelivery = {
    id: "ordinary-task",
    shiftId: shift.id,
    type: "other_paid_work",
    start: "2026-08-20T16:00:00.000Z",
    end: "2026-08-20T16:10:00.000Z",
  } as unknown as ActivityRecord;
  Object.defineProperty(nonDelivery, "storeExitAt", {
    get() {
      throw new Error("non-delivery timing was evaluated");
    },
  });
  shift.activities = [nonDelivery];

  assert.doesNotThrow(() => questionableBetaHustleActivityIds([shift]));
});

test("a shift retains its saved rate after settings change", () => {
  const settings = { ...DEFAULT_SETTINGS };
  const shift = createShift(settings, new Date("2026-08-10T16:00:00.000Z"));
  settings.hourlyRatePence = 1400;
  shift.status = "completed";
  shift.clockOut = "2026-08-10T21:00:00.000Z";
  assert.equal(shift.hourlyRatePence, 1296);
  assert.equal(grossWagesPence(shift), 6480);
});

test("next configured Wednesday is grouped correctly", () => {
  const monday = new Date(2026, 7, 10, 12);
  const wednesday = nextPaymentDate(3, monday);
  assert.equal(wednesday.getDay(), 3);
  assert.equal(wednesday.getDate(), 12);
});

test("Monday through Sunday fuel is due on Wednesday the following week", () => {
  const mondayDue = reimbursementPaymentDate(new Date(2026, 7, 3, 12), 3);
  const sundayDue = reimbursementPaymentDate(new Date(2026, 7, 9, 12), 3);
  assert.equal(mondayDue.getFullYear(), 2026);
  assert.equal(mondayDue.getMonth(), 7);
  assert.equal(mondayDue.getDate(), 12);
  assert.equal(sundayDue.getDate(), 12);
  assert.equal(mondayDue.getDay(), 3);
});

test("delivery cooldown is derived from the saved timestamp", () => {
  const shift = createShift(DEFAULT_SETTINGS, new Date("2026-08-10T16:00:00.000Z"));
  shift.deliveries.push({ id: "recent", type: "single", timestamp: "2026-08-10T16:00:06.000Z", reimbursementPence: 100 });
  assert.equal(deliveryCooldownRemaining(shift, new Date("2026-08-10T16:00:10.000Z")), 6000);
  assert.equal(deliveryCooldownRemaining(shift, new Date("2026-08-10T16:00:17.000Z")), 0);
});

test("live shift clock includes seconds", () => {
  assert.equal(formatLiveDuration(3_661_000), "01:01:01");
  assert.equal(formatLiveDuration(59_999), "00:00:59");
});

test("mileage input accepts natural mobile decimal typing", () => {
  assert.equal(normalizeMileageText("4"), "4");
  assert.equal(normalizeMileageText("42"), "42");
  assert.equal(normalizeMileageText("42."), "42.");
  assert.equal(normalizeMileageText("42.3"), "42.3");
  assert.equal(normalizeMileageText("42,3"), "42.3");
  assert.equal(normalizeMileageText("42.34"), null);
});

test("cleaning eligibility follows role, time and explicit override", () => {
  assert.equal(cleaningRequiredFor("open", new Date(2026, 7, 11, 18, 0)), true);
  assert.equal(cleaningRequiredFor("second", new Date(2026, 7, 11, 12, 59)), true);
  assert.equal(cleaningRequiredFor("second", new Date(2026, 7, 11, 13, 0)), false);
  assert.equal(cleaningRequiredFor("other", new Date(2026, 7, 11, 9, 0)), false);
  assert.equal(cleaningRequiredFor("other", new Date(2026, 7, 11, 9, 0), true), true);
  assert.equal(cleaningRequiredFor("open", new Date(2026, 7, 11, 9, 0), false), false);
});

test("migration preserves old records and adds empty activity fields", () => {
  const legacy = emptyData();
  const old = completedShift();
  delete old.activities;
  delete old.taskSnapshot;
  delete old.role;
  legacy.shifts = [old];
  legacy.cleaningRota = undefined;
  legacy.settings.deliveryDays = undefined;
  legacy.settings.includeBetaCleaningData = undefined;
  const migrated = migrateAppData(legacy);
  assert.equal(migrated.shifts[0].clockIn, old.clockIn);
  assert.equal(migrated.shifts[0].deliveries.length, old.deliveries.length);
  assert.deepEqual(migrated.shifts[0].activities, []);
  assert.deepEqual(migrated.shifts[0].taskSnapshot, []);
  assert.deepEqual(migrated.settings.deliveryDays, [2, 4, 6]);
  assert.equal(migrated.settings.locationAssistEnabled, true);
  assert.equal(migrated.settings.includeBetaCleaningData, false);
  assert.equal(migrated.settings.storeLatitude, 53.56845);
  assert.equal(migrated.settings.storeLongitude, -2.88802);
  assert.equal(migrated.settings.storeRadiusMetres, 35);
  assert.equal(migrated.settings.recordDeliveryRoutes, true);
  assert.equal(migrated.settings.routeGpsDetail, "standard");
  assert.equal(migrated.settings.routeRetention, "90");
  assert.ok((migrated.cleaningRota?.length ?? 0) > 30);
});

test("timed delivery interruption scenario accounts for active cleaning segments exactly", () => {
  const shift = repairShiftActivityIds(createShift(DEFAULT_SETTINGS, new Date("2026-08-11T17:00:00.000Z"), "direct", "open"));
  shift.status = "completed";
  shift.clockOut = "2026-08-11T22:00:00.000Z";
  shift.breaks = [{ id: "break", start: "2026-08-11T19:00:00.000Z", end: "2026-08-11T19:20:00.000Z" }];
  shift.deliveries = [
    { id: "single", type: "single", timestamp: "2026-08-11T17:50:00.000Z", reimbursementPence: 100, activityId: "single-activity" },
    { id: "double", type: "double", timestamp: "2026-08-11T18:18:00.000Z", reimbursementPence: 150, activityId: "double-activity" },
  ];
  shift.activities = [
    ...(shift.activities ?? []),
    { id: "single-activity", shiftId: shift.id, type: "single_delivery", start: "2026-08-11T17:50:00.000Z", end: "2026-08-11T18:04:00.000Z", customerDeliveries: 1, tracked: true },
    { id: "double-activity", shiftId: shift.id, type: "double_delivery", start: "2026-08-11T18:18:00.000Z", end: "2026-08-11T18:41:00.000Z", customerDeliveries: 2, tracked: true },
  ];
  const seed = shift.taskSnapshot![0];
  shift.taskSnapshot = [
    { ...structuredClone(seed), id: "customer", name: "CUSTOMER AREA", sourceTaskId: "customer", status: "complete", segments: [{ start: "2026-08-11T17:15:00.000Z", end: "2026-08-11T17:42:00.000Z" }], completedAt: "2026-08-11T17:42:00.000Z", quickCompleted: false },
    { ...structuredClone(seed), id: "bins", name: "BINS", sourceTaskId: "bins", status: "complete", segments: [{ start: "2026-08-11T18:10:00.000Z", end: "2026-08-11T18:18:00.000Z" }, { start: "2026-08-11T18:41:00.000Z", end: "2026-08-11T18:50:00.000Z" }], completedAt: "2026-08-11T18:50:00.000Z", quickCompleted: false },
  ];
  const delivery = deliverySummary(shift);
  const cleaning = cleaningSummary(shift);
  const tracked = trackedActivityTotals(shift);
  assert.equal(taskMilliseconds(shift.taskSnapshot[0]), 27 * 60_000);
  assert.equal(taskMilliseconds(shift.taskSnapshot[1]), 17 * 60_000);
  assert.deepEqual(delivery, { singles: 1, doubles: 1, runs: 2, individual: 3, reimbursementPence: 250 });
  assert.equal(paidMilliseconds(shift), 280 * 60_000);
  assert.equal(tracked.deliveryMs, 37 * 60_000);
  assert.equal(tracked.cleaningMs, 44 * 60_000);
  assert.equal(tracked.untrackedPaidMs, 199 * 60_000);
  assert.equal(cleaning.completed, 2);
  assert.equal(cleaning.total, 2);
  assert.equal(grossWagesPence(shift), 6048);
});

test("a task completed by someone else counts as complete without adding driver cleaning time", () => {
  const shift = createShift(DEFAULT_SETTINGS, new Date("2026-08-11T17:00:00.000Z"), "direct", "open");
  const task = shift.taskSnapshot![0];
  task.status = "complete";
  task.completedAt = "2026-08-11T17:05:00.000Z";
  task.completedBySomeoneElse = true;
  task.quickCompleted = false;
  task.segments = [];
  const summary = cleaningSummary(shift);
  const tracked = trackedActivityTotals(shift);
  assert.equal(summary.completed, 1);
  assert.equal(summary.trackedMs, 0);
  assert.equal(tracked.cleaningMs, 0);
});

test("journey milestone pins use the nearest real recorded GPS sample", () => {
  const points: DeliveryRoutePoint[] = [
    { latitude: 53.56845, longitude: -2.88802, timestamp: "2026-08-15T16:00:00.000Z", accuracy: 8 },
    { latitude: 53.56890, longitude: -2.88780, timestamp: "2026-08-15T16:00:24.000Z", accuracy: 10 },
    { latitude: 53.56940, longitude: -2.88720, timestamp: "2026-08-15T16:00:50.000Z", accuracy: 11 },
  ];
  assert.equal(nearestRoutePointToTimestamp(points, "2026-08-15T16:00:20.000Z")?.timestamp, points[1].timestamp);
  assert.equal(nearestRoutePointToTimestamp(points, "2026-08-15T16:00:47.000Z")?.timestamp, points[2].timestamp);
  assert.equal(nearestRoutePointToTimestamp(points, "not-a-time"), null);
  assert.equal(nearestRoutePointToTimestamp([], "2026-08-15T16:00:20.000Z"), null);
});

test("delivery routes use movement or elapsed time instead of saving every GPS update", () => {
  const first: DeliveryRoutePoint = { latitude: 53.56845, longitude: -2.88802, timestamp: "2026-08-15T16:00:00.000Z", accuracy: 8 };
  const nearby: DeliveryRoutePoint = { latitude: 53.56850, longitude: -2.88802, timestamp: "2026-08-15T16:00:05.000Z", accuracy: 9 };
  const moved: DeliveryRoutePoint = { latitude: 53.56890, longitude: -2.88802, timestamp: "2026-08-15T16:00:10.000Z", accuracy: 10 };
  const waited: DeliveryRoutePoint = { latitude: 53.56851, longitude: -2.88802, timestamp: "2026-08-15T16:00:26.000Z", accuracy: 11 };
  assert.equal(shouldSaveRoutePoint(undefined, first, "standard"), true);
  assert.equal(shouldSaveRoutePoint(first, nearby, "standard"), false);
  assert.equal(shouldSaveRoutePoint(first, moved, "standard"), true);
  assert.equal(shouldSaveRoutePoint(first, waited, "standard"), true);
  assert.equal(shouldSaveRoutePoint(first, { ...moved, accuracy: 300 }, "high"), false);
});

test("route evidence records honest gaps, distance and retention", () => {
  const route: DeliveryRouteEvidence = { status: "recording", startedAt: "2026-08-15T16:00:00.000Z", completedAt: null, points: [], recordedPointCount: 0, distanceMetres: 0, gaps: [], issues: [], detail: "standard", retention: "30", expiresAt: null };
  const first: DeliveryRoutePoint = { latitude: 53.56845, longitude: -2.88802, timestamp: "2026-08-15T16:00:00.000Z", accuracy: 8 };
  const second: DeliveryRoutePoint = { latitude: 53.57000, longitude: -2.88802, timestamp: "2026-08-15T16:02:00.000Z", accuracy: 12 };
  assert.equal(appendRoutePoint(route, first), true);
  assert.equal(appendRoutePoint(route, second), true);
  finalizeRouteEvidence(route, "2026-08-15T16:10:00.000Z");
  assert.equal(route.status, "partial");
  assert.equal(route.recordedPointCount, 2);
  assert.equal(route.gaps.length, 1);
  assert.ok(routeDistanceMetres(route.points) > 150);
  assert.equal(route.expiresAt, "2026-09-14T16:10:00.000Z");
});

test("delivery finalisation closes route evidence, records return timing and sanitises the address", () => {
  const start = "2026-08-15T16:00:00.000Z";
  const end = "2026-08-15T16:05:00.000Z";
  const activity: ActivityRecord = {
    id: "delivery", shiftId: "shift", type: "single_delivery", start, end: null, customerDeliveries: 1,
    routeEvidence: { status: "recording", startedAt: start, completedAt: null, points: [
      { latitude: 53.56845, longitude: -2.88802, timestamp: start, accuracy: 8 },
      { latitude: 53.57000, longitude: -2.88802, timestamp: "2026-08-15T16:04:00.000Z", accuracy: 9 },
    ], recordedPointCount: 2, distanceMetres: 0, gaps: [], issues: [], detail: "standard", retention: "90", expiresAt: null },
    expectedRoute: { status: "snapshot", customer: { latitude: 53.57000, longitude: -2.88802, accuracy: 9, source: "gps_estimate" }, totalSeconds: 600, serviceAllowanceSeconds: 60, calculatedAt: start, calculationVersion: 1 },
    deliveryDestinations: [{ fullAddress: "42 Example Street\nOrmskirk\nL39 2XX", houseNumberOrName: "42", street: "Example Street", locality: "Ormskirk", postcode: "L39 2XX", destination: { latitude: 53.57, longitude: -2.88 }, addressSource: "manual", privacyStatus: "precise" }],
  };
  finaliseDeliveryActivity(activity, end, "street_postcode");
  assert.equal(activity.end, end);
  assert.equal(activity.backAtStoreAt, end);
  assert.equal(activity.routeEvidence?.status, "complete");
  assert.equal(activity.routeEvidence?.completedAt, end);
  assert.equal(activity.expectedRoute?.status, "ready");
  assert.equal(activity.expectedRoute?.actualSeconds, 300);
  assert.equal(activity.expectedRoute?.differenceSeconds, -300);
  assert.equal(activity.deliveryDestinations?.[0].fullAddress, undefined);
  assert.equal(activity.deliveryDestinations?.[0].houseNumberOrName, undefined);
  assert.equal(activity.deliveryDestinations?.[0].destination, undefined);
  assert.equal(activity.deliveryDestinations?.[0].postcode, "L39 2XX");
});

test("customer wait notes remain manual context and survive delivery finalisation", () => {
  const activity: ActivityRecord = {
    id: "wait-note", shiftId: "shift", type: "single_delivery", start: "2026-08-15T16:00:00.000Z", end: null,
    customerWaitExplanation: { status: "recorded", reasons: ["no_answer_door", "slow_to_answer"], note: "Waited for the door to be answered.", recordedAt: "2026-08-15T16:09:00.000Z" },
  };
  finaliseDeliveryActivity(activity, "2026-08-15T16:10:00.000Z");
  assert.equal(activity.end, "2026-08-15T16:10:00.000Z");
  assert.deepEqual(activity.customerWaitExplanation, { status: "recorded", reasons: ["no_answer_door", "slow_to_answer"], note: "Waited for the door to be answered.", recordedAt: "2026-08-15T16:09:00.000Z" });
});

test("clocking out without a confirmed return marks the route benchmark unavailable", () => {
  const activity: ActivityRecord = {
    id: "delivery", shiftId: "shift", type: "single_delivery", start: "2026-08-15T16:00:00.000Z", end: null,
    expectedRoute: { status: "snapshot", customer: null, totalSeconds: 600, serviceAllowanceSeconds: 60, calculatedAt: "2026-08-15T16:00:00.000Z", calculationVersion: 1 },
  };
  finaliseDeliveryActivity(activity, "2026-08-15T16:05:00.000Z", "street_postcode", false);
  assert.equal(activity.end, "2026-08-15T16:05:00.000Z");
  assert.equal(activity.backAtStoreAt, undefined);
  assert.equal(activity.expectedRoute?.status, "unavailable");
  assert.equal(activity.expectedRoute?.reason, "Return was not confirmed before clock-out");
});

test("delivery finalisation cancels an unsent connection-gated Google snapshot", () => {
  const activity: ActivityRecord = {
    id: "delivery", shiftId: "shift", type: "single_delivery", start: "2026-08-15T16:00:00.000Z", end: null,
    expectedRoute: {
      status: "waiting_for_connection", customer: { latitude: 53.57, longitude: -2.88, accuracy: 8, source: "manual_delivered" }, serviceAllowanceSeconds: 120,
      calculatedAt: "2026-08-15T16:00:00.000Z", calculationVersion: 1, reason: "GOOGLE_API_CONNECTION_WAITING",
      connectionCheck: { startedAt: "2026-08-15T16:00:00.000Z", deadlineAt: "2026-08-15T16:05:00.000Z", nextCheckAt: "2026-08-15T16:00:10.000Z", successfulChecks: 1, attempts: 1 },
    },
  };
  finaliseDeliveryActivity(activity, "2026-08-15T16:02:00.000Z", "street_postcode");
  assert.equal(activity.expectedRoute?.status, "unavailable");
  assert.equal(activity.expectedRoute?.reason, "GOOGLE_API_CONNECTION_WAIT_CANCELLED");
});

test("backup preparation sanitises precise active addresses without mutating live data", () => {
  const data = emptyData();
  const shift = createShift(DEFAULT_SETTINGS, new Date("2026-08-15T16:00:00.000Z"));
  const activity: ActivityRecord = {
    id: "delivery", shiftId: shift.id, type: "single_delivery", start: shift.clockIn, end: null,
    deliveryDestinations: [{ fullAddress: "42 Example Street", houseNumberOrName: "42", street: "Example Street", postcode: "L39 2XX", destination: { latitude: 53.57, longitude: -2.88 }, privacyStatus: "precise" }],
  };
  shift.activities = [activity];
  data.shifts = [shift];
  const backup = prepareAppDataForBackup(data);
  assert.equal(backup.shifts[0].activities?.[0].deliveryDestinations?.[0].fullAddress, undefined);
  assert.equal(backup.shifts[0].activities?.[0].deliveryDestinations?.[0].houseNumberOrName, undefined);
  assert.equal(backup.shifts[0].activities?.[0].deliveryDestinations?.[0].destination, undefined);
  assert.equal(data.shifts[0].activities?.[0].deliveryDestinations?.[0].fullAddress, "42 Example Street");
});

test("route evidence adds one traffic-delay marker for a sustained stationary period", () => {
  const route: DeliveryRouteEvidence = { status: "recording", startedAt: "2026-08-15T16:00:00.000Z", completedAt: null, points: [], recordedPointCount: 0, distanceMetres: 0, gaps: [], issues: [], detail: "standard", retention: "30", expiresAt: null };
  [0, 25, 50, 75, 100, 125].forEach((seconds) => {
    assert.equal(appendRoutePoint(route, { latitude: 53.56845, longitude: -2.88802, timestamp: new Date(Date.parse("2026-08-15T16:00:00.000Z") + seconds * 1_000).toISOString(), accuracy: 8 }), true);
  });
  assert.equal(route.stops?.length, 1);
  assert.equal(route.stops?.[0].kind, "traffic_delay");
  assert.equal(route.stops?.[0].durationMs, 125_000);
});

test("manual Delivered location always wins over detected or furthest GPS evidence", () => {
  const route: DeliveryRouteEvidence = { status: "complete", startedAt: "2026-08-15T16:00:00.000Z", completedAt: "2026-08-15T16:10:00.000Z", points: [
    { latitude: 53.56845, longitude: -2.88802, timestamp: "2026-08-15T16:00:00.000Z", accuracy: 8 },
    { latitude: 53.57000, longitude: -2.88802, timestamp: "2026-08-15T16:04:00.000Z", accuracy: 7 },
    { latitude: 53.57100, longitude: -2.88802, timestamp: "2026-08-15T16:06:00.000Z", accuracy: 7 },
  ], recordedPointCount: 3, distanceMetres: 200, gaps: [], issues: [], stops: [{ latitude: 53.57000, longitude: -2.88802, startedAt: "2026-08-15T16:04:00.000Z", endedAt: "2026-08-15T16:05:00.000Z", durationMs: 60_000, kind: "traffic_delay" }], detail: "standard", retention: "30", expiresAt: null };
  const activity = { id: "delivery", shiftId: "shift", type: "single_delivery" as const, start: route.startedAt, end: route.completedAt, geofenceLatitude: 53.56845, geofenceLongitude: -2.88802, geofenceRadius: 35, routeEvidence: route, customerEvents: [{ timestamp: "2026-08-15T16:04:10.000Z", latitude: 53.57000, longitude: -2.88802, accuracy: 7, source: "manual_delivered" as const, pointIndex: 1 }] };
  const customer = resolveCustomerLocation(activity);
  assert.equal(customer?.source, "manual_delivered");
  assert.equal(customer?.latitude, 53.57000);
  assert.equal(customer?.pointIndex, 1);
});

test("double deliveries retain separate customer taps and measure each customer leg", () => {
  const activity: ActivityRecord = {
    id: "double-timing", shiftId: "shift", type: "double_delivery", start: "2026-08-15T16:00:00.000Z", end: "2026-08-15T16:35:00.000Z",
    storeExitAt: "2026-08-15T16:02:00.000Z", customerDeliveries: 2,
    customerEvents: [
      { timestamp: "2026-08-15T16:12:00.000Z", latitude: 53.57, longitude: -2.88, accuracy: 8, source: "manual_delivered", pointIndex: 3, customerIndex: 1 },
      { timestamp: "2026-08-15T16:24:00.000Z", latitude: 53.571, longitude: -2.879, accuracy: 9, source: "manual_delivered", pointIndex: 6, customerIndex: 2 },
    ],
  };
  const timings = manualDeliveredCustomerTimings(activity);
  assert.deepEqual(timings.map((item) => [item.customerIndex, item.durationMs]), [[1, 10 * 60_000], [2, 12 * 60_000]]);
});

test("customer stop duration uses the turnaround window, not store departure time", () => {
  const route: DeliveryRouteEvidence = { status: "complete", startedAt: "2026-08-15T16:00:00.000Z", completedAt: "2026-08-15T16:12:00.000Z", points: [
    { latitude: 53.56845, longitude: -2.88802, timestamp: "2026-08-15T16:00:00.000Z", accuracy: 8 },
    { latitude: 53.57000, longitude: -2.88802, timestamp: "2026-08-15T16:04:00.000Z", accuracy: 7 },
    { latitude: 53.57001, longitude: -2.88802, timestamp: "2026-08-15T16:04:35.000Z", accuracy: 7 },
    { latitude: 53.57000, longitude: -2.88802, timestamp: "2026-08-15T16:05:15.000Z", accuracy: 7 },
    { latitude: 53.56890, longitude: -2.88802, timestamp: "2026-08-15T16:06:00.000Z", accuracy: 9 },
  ], recordedPointCount: 5, distanceMetres: 0, gaps: [], issues: [], detail: "standard", retention: "30", expiresAt: null };
  const activity = { id: "delivery", shiftId: "shift", type: "single_delivery" as const, start: route.startedAt, end: route.completedAt, geofenceLatitude: 53.56845, geofenceLongitude: -2.88802, geofenceRadius: 35, routeEvidence: route };
  assert.equal(customerStopDurationMs(activity), 75_000);
});

test("GPS linger followed by a return is treated as a probable customer stop", () => {
  const route: DeliveryRouteEvidence = { status: "complete", startedAt: "2026-08-15T17:00:00.000Z", completedAt: "2026-08-15T17:08:00.000Z", points: [
    { latitude: 53.56845, longitude: -2.88802, timestamp: "2026-08-15T17:00:00.000Z", accuracy: 8 },
    { latitude: 53.57200, longitude: -2.88802, timestamp: "2026-08-15T17:04:00.000Z", accuracy: 8 },
    { latitude: 53.57201, longitude: -2.88802, timestamp: "2026-08-15T17:04:35.000Z", accuracy: 8 },
    { latitude: 53.57200, longitude: -2.88801, timestamp: "2026-08-15T17:05:15.000Z", accuracy: 8 },
    { latitude: 53.57000, longitude: -2.88802, timestamp: "2026-08-15T17:06:15.000Z", accuracy: 8 },
  ], recordedPointCount: 5, distanceMetres: 0, gaps: [], issues: [], stops: [], detail: "standard", retention: "30", expiresAt: null };
  const activity = { id: "customer-turnaround", shiftId: "shift", type: "single_delivery" as const, start: route.startedAt, end: route.completedAt, geofenceLatitude: 53.56845, geofenceLongitude: -2.88802, geofenceRadius: 35, routeEvidence: route };
  const customer = resolveCustomerLocation(activity);
  assert.equal(customer?.source, "detected_stop");
  assert.equal(customer?.pointIndex, 2);
});

test("a user-selected route point overrides an inferred customer location", () => {
  const route: DeliveryRouteEvidence = { status: "complete", startedAt: "2026-08-15T17:00:00.000Z", completedAt: "2026-08-15T17:08:00.000Z", points: [
    { latitude: 53.56845, longitude: -2.88802, timestamp: "2026-08-15T17:00:00.000Z", accuracy: 8 },
    { latitude: 53.57000, longitude: -2.88802, timestamp: "2026-08-15T17:04:00.000Z", accuracy: 8 },
    { latitude: 53.57100, longitude: -2.88802, timestamp: "2026-08-15T17:06:00.000Z", accuracy: 8 },
  ], recordedPointCount: 3, distanceMetres: 0, gaps: [], issues: [], stops: [], detail: "standard", retention: "30", expiresAt: null };
  const activity = { id: "selected-customer", shiftId: "shift", type: "single_delivery" as const, start: route.startedAt, end: route.completedAt, geofenceLatitude: 53.56845, geofenceLongitude: -2.88802, geofenceRadius: 35, routeEvidence: route, customerEvents: [{ timestamp: route.points[1].timestamp, latitude: route.points[1].latitude, longitude: route.points[1].longitude, accuracy: 8, source: "user_selected_route_point" as const, pointIndex: 1 }] };
  const customer = resolveCustomerLocation(activity);
  assert.equal(customer?.source, "user_selected_route_point");
  assert.equal(customer?.pointIndex, 1);
});

test("Google Routes circuit breaker blocks request 3,001 before the network", async () => {
  const store = new MemoryStore(); const now = Date.parse("2026-08-16T18:00:00.000Z"); let calls = 0;
  seedGoogleLedger(store, GOOGLE_ROUTES_30_DAY_HARD_LIMIT, "2026-08-16T17:00:00.000Z");
  const service = new GoogleRoutesService(store, () => now, (async () => { calls += 1; return googleSuccess(); }) as typeof fetch);
  const response = await service.computeRoute(googleRequest());
  assert.equal(response.ok, false); if (!response.ok) assert.equal(response.reason, "GOOGLE_API_HARD_LIMIT_REACHED"); assert.equal(calls, 0);
});

test("Google usage starts empty and survives a service restart", async () => {
  const store = new MemoryStore(); const now = Date.parse("2026-08-16T18:00:00.000Z");
  assert.equal(getGoogleRoutesUsage(store, now).rolling30Days, 0);
  const first = new GoogleRoutesService(store, () => now, googleSuccess as typeof fetch);
  await first.computeRoute(googleRequest("restart"));
  const [entry] = getGoogleRoutesRequestLog(store);
  assert.equal(entry.reason, "GOOGLE_API_ROUTE_COMPLETED"); assert.equal(entry.detailCode, "ROUTE_RESULT_SAVED"); assert.equal(entry.responseStatus, 200); assert.equal(entry.completedAt, new Date(now).toISOString()); assert.ok(typeof entry.elapsedMs === "number");
  const restarted = new GoogleRoutesService(store, () => now, googleSuccess as typeof fetch);
  assert.equal(restarted.usage().rolling30Days, 1);
});

test("Google Routes diagnostic code dictionary covers every audited outcome", () => {
  const codes = new Set(GOOGLE_ROUTES_REASON_CATALOG.map((definition) => definition.code));
  ["GOOGLE_API_ROUTE_COMPLETED", "CACHE_HIT", "NETWORK_REQUEST", "GOOGLE_API_INCOMPLETE", "GOOGLE_API_KEY_REJECTED", "GOOGLE_API_REQUEST_REJECTED", "GOOGLE_API_PROVIDER_RATE_LIMITED", "GOOGLE_API_NO_USABLE_ROUTE", "GOOGLE_API_UNAVAILABLE", "GOOGLE_API_NOT_CONFIGURED", "GOOGLE_API_LIVE_DELIVERY_ONLY", "GOOGLE_API_HARD_LIMIT_REACHED", "GOOGLE_API_DAILY_LIMIT_REACHED", "DELIVERY_GOOGLE_API_LIMIT_REACHED", "GOOGLE_API_CLOCK_SAFETY_BLOCKED"].forEach((code) => assert.equal(codes.has(code), true));
  const detailCodes = new Set(GOOGLE_ROUTES_DETAIL_CATALOG.map((definition) => definition.code));
  ["NETWORK_STARTED", "CACHE_SERVED", "BLOCKED_BEFORE_NETWORK", "FETCH_UNAVAILABLE", "FETCH_EXCEPTION", "HTTP_ERROR", "INVALID_JSON", "NO_ROUTE_DATA", "ROUTE_RESULT_SAVED", "MAPS_JS_LOAD_FAILED", "MAPS_JS_LIBRARY_FAILED", "MAPS_JS_REFRESH_REQUIRED", "MAPS_ROUTE_EXCEPTION", "LEGACY_UNFINALIZED"].forEach((code) => assert.equal(detailCodes.has(code as never), true));
});

test("Google Routes allows request 3,000 but blocks a concurrent 3,001st", async () => {
  const store = new MemoryStore(); const now = Date.parse("2026-08-16T18:00:00.000Z"); let calls = 0;
  seedGoogleLedger(store, GOOGLE_ROUTES_30_DAY_HARD_LIMIT - 1, "2026-08-01T17:00:00.000Z");
  const fetcher = (async () => { calls += 1; return googleSuccess(); }) as typeof fetch;
  const first = new GoogleRoutesService(store, () => now, fetcher); const second = new GoogleRoutesService(store, () => now, fetcher);
  const [a, b] = await Promise.all([first.computeRoute(googleRequest("last-slot")), second.computeRoute(googleRequest("other-slot"))]);
  assert.equal([a.ok, b.ok].filter(Boolean).length, 1); assert.equal(calls, 1);
});

test("Google Routes daily and per-delivery breakers stop further requests", async () => {
  const now = Date.parse("2026-08-16T18:00:00.000Z"); const dailyStore = new MemoryStore(); seedGoogleLedger(dailyStore, GOOGLE_ROUTES_24_HOUR_HARD_LIMIT, "2026-08-16T17:00:00.000Z");
  const daily = new GoogleRoutesService(dailyStore, () => now, googleSuccess as typeof fetch); const dailyResponse = await daily.computeRoute(googleRequest());
  assert.equal(dailyResponse.ok, false); if (!dailyResponse.ok) assert.equal(dailyResponse.reason, "GOOGLE_API_DAILY_LIMIT_REACHED");
  const deliveryStore = new MemoryStore(); const service = new GoogleRoutesService(deliveryStore, () => now, googleSuccess as typeof fetch);
  assert.equal((await service.computeRoute(googleRequest("same"))).ok, true);
  assert.equal((await service.computeRoute({ ...googleRequest("same"), requestType: "expected_return" })).ok, true);
  const third = await service.computeRoute({ ...googleRequest("same"), destination: { latitude: 53.571, longitude: -2.881 } }); assert.equal(third.ok, false); if (!third.ok) assert.equal(third.reason, "DELIVERY_GOOGLE_API_LIMIT_REACHED");
});

test("Google Routes allows one confirmed per-delivery refresh and then blocks another", async () => {
  const store = new MemoryStore(); const now = Date.parse("2026-08-16T18:00:00.000Z"); let calls = 0;
  const service = new GoogleRoutesService(store, () => now, (async () => { calls += 1; return googleSuccess(); }) as typeof fetch);
  const normal = googleRequest("refreshable");
  assert.equal((await service.computeRoute(normal)).ok, true);
  assert.equal((await service.computeRoute({ ...normal, requestType: "expected_return" })).ok, true);
  const refresh = { ...normal, trigger: "manual_route_refresh" as const, caller: "active_shift.route_refresh_confirmation" as const, allowPerDeliveryLimitOverride: true };
  assert.equal((await service.computeRoute(refresh)).ok, true);
  assert.equal((await service.computeRoute({ ...refresh, requestType: "expected_return" })).ok, true);
  assert.equal(calls, 4);
  const blocked = await service.computeRoute({ ...refresh, destination: { latitude: 53.571, longitude: -2.881 } });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.reason, "DELIVERY_GOOGLE_API_OVERRIDE_LIMIT_REACHED");
  assert.equal(getGoogleRoutesRequestLog(store).filter((entry) => entry.perDeliveryLimitOverride && entry.networkSent).length, GOOGLE_ROUTES_PER_DELIVERY_OVERRIDE_HARD_LIMIT);
});

test("Google route cache is usable when the global limit is locked", async () => {
  const store = new MemoryStore(); const now = Date.parse("2026-08-16T18:00:00.000Z"); let calls = 0;
  seedGoogleLedger(store, GOOGLE_ROUTES_30_DAY_HARD_LIMIT - 1, "2026-08-01T17:00:00.000Z");
  const service = new GoogleRoutesService(store, () => now, (async () => { calls += 1; return googleSuccess(); }) as typeof fetch);
  assert.equal((await service.computeRoute(googleRequest("cached"))).ok, true);
  const cached = await service.computeRoute(googleRequest("cached"));
  assert.equal(cached.ok, true); if (cached.ok) assert.equal(cached.cacheHit, true); assert.equal(calls, 1);
});

test("Google Routes walking mode uses pedestrian routing without traffic preference and has its own cache key", async () => {
  const store = new MemoryStore(); const now = Date.parse("2026-08-16T18:00:00.000Z"); const captured: { body: Record<string, unknown> | null } = { body: null };
  const service = new GoogleRoutesService(store, () => now, (async (_url, init) => { captured.body = JSON.parse(String(init?.body)) as Record<string, unknown>; return googleSuccess(); }) as typeof fetch);
  const request = { ...googleRequest("walking"), travelMode: "walking" as const };
  const response = await service.computeRoute(request);
  assert.equal(response.ok, true);
  if (response.ok) { assert.equal(response.value.travelMode, "walking"); assert.equal(response.value.trafficAware, false); }
  assert.equal(captured.body?.travelMode, "WALK"); assert.equal("routingPreference" in (captured.body ?? {}), false);
  assert.match(googleRouteFingerprint(request), /\|walking$/);
  assert.notEqual(googleRouteFingerprint(request), googleRouteFingerprint({ ...request, travelMode: "driving" }));
});

test("Google Routes keeps a double-delivery customer stop in the ordered outbound route", async () => {
  const store = new MemoryStore(); const now = Date.parse("2026-08-16T18:00:00.000Z"); const captured: { body: Record<string, unknown> | null } = { body: null };
  const service = new GoogleRoutesService(store, () => now, (async (_url, init) => { captured.body = JSON.parse(String(init?.body)) as Record<string, unknown>; return googleSuccess(); }) as typeof fetch);
  const request = { ...googleRequest("double-route"), destination: { latitude: 53.572, longitude: -2.879 }, intermediates: [{ latitude: 53.57, longitude: -2.88 }] };
  const response = await service.computeRoute(request);
  assert.equal(response.ok, true);
  assert.deepEqual(captured.body?.intermediates, [{ location: { latLng: { latitude: 53.57, longitude: -2.88 } } }]);
  assert.match(googleRouteFingerprint(request), /\|via:53\.57000,-2\.88000\|traffic-aware$/);
  assert.notEqual(googleRouteFingerprint(request), googleRouteFingerprint({ ...request, intermediates: [{ latitude: 53.571, longitude: -2.88 }] }));
});

test("Google usage releases capacity on the rolling 30-day boundary and never automatically retries", async () => {
  const store = new MemoryStore(); const now = Date.parse("2026-08-16T18:00:00.000Z");
  seedGoogleLedger(store, 1, "2026-07-17T17:59:59.000Z"); assert.equal(getGoogleRoutesUsage(store, now).rolling30Days, 0);
  let attempts = 0; const service = new GoogleRoutesService(new MemoryStore(), () => now, (async () => { attempts += 1; return attempts === 1 ? { ok: false, status: 500, json: async () => ({}) } as Response : googleSuccess(); }) as typeof fetch);
  assert.equal((await service.computeRoute(googleRequest())).ok, false); assert.equal(attempts, 1); assert.equal(service.usage().rolling30Days, 1);
});

test("Google Routes preserves a safe reason when the provider rejects the key", async () => {
  const store = new MemoryStore();
  const service = new GoogleRoutesService(store, () => Date.parse("2026-08-16T18:00:00.000Z"), (async () => ({ ok: false, status: 403, json: async () => ({ error: { status: "PERMISSION_DENIED" } }) }) as Response) as typeof fetch);
  const response = await service.computeRoute(googleRequest("key-rejected"));
  assert.equal(response.ok, false);
  if (!response.ok) assert.equal(response.reason, "GOOGLE_API_KEY_REJECTED");
  const [entry] = getGoogleRoutesRequestLog(store);
  assert.equal(entry.networkSent, true);
  assert.equal(entry.reason, "GOOGLE_API_KEY_REJECTED");
  assert.equal(entry.responseStatus, 403); assert.equal(entry.detailCode, "HTTP_ERROR"); assert.equal(entry.completedAt, "2026-08-16T18:00:00.000Z"); assert.ok(typeof entry.elapsedMs === "number");
});

test("Google Routes records the browser failure stage instead of leaving a request in progress", async () => {
  const store = new MemoryStore();
  const service = new GoogleRoutesService(store, () => Date.parse("2026-08-16T18:00:00.000Z"), (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch);
  const response = await service.computeRoute(googleRequest("fetch-failed"));
  assert.equal(response.ok, false);
  if (!response.ok) assert.equal(response.reason, "GOOGLE_API_UNAVAILABLE");
  const [entry] = getGoogleRoutesRequestLog(store);
  assert.equal(entry.success, false); assert.equal(entry.networkSent, true); assert.equal(entry.reason, "GOOGLE_API_UNAVAILABLE"); assert.equal(entry.detailCode, "FETCH_EXCEPTION"); assert.equal(entry.completedAt, "2026-08-16T18:00:00.000Z");
});

test("Google Routes does not count a missing browser Maps SDK runtime as a sent request", async () => {
  const store = new MemoryStore();
  const service = new GoogleRoutesService(store, () => Date.parse("2026-08-16T18:00:00.000Z"), null);
  const response = await service.computeRoute(googleRequest("maps-sdk-unavailable"));
  assert.equal(response.ok, false);
  if (!response.ok) assert.equal(response.reason, "GOOGLE_API_UNAVAILABLE");
  const [entry] = getGoogleRoutesRequestLog(store);
  assert.equal(entry.success, false); assert.equal(entry.networkSent, false); assert.equal(entry.reason, "GOOGLE_API_UNAVAILABLE"); assert.equal(entry.detailCode, "MAPS_JS_LOAD_FAILED"); assert.equal(entry.completedAt, "2026-08-16T18:00:00.000Z"); assert.equal(getGoogleRoutesUsage(store).rolling30Days, 0);
});

test("Google Routes rejects invalid coordinates before spending a request", async () => {
  const store = new MemoryStore(); let calls = 0;
  const service = new GoogleRoutesService(store, () => Date.parse("2026-08-16T18:00:00.000Z"), (async () => { calls += 1; return googleSuccess(); }) as typeof fetch);
  const response = await service.computeRoute({ ...googleRequest("bad-coordinates"), destination: { latitude: Number.NaN, longitude: -2.88 } });
  assert.equal(response.ok, false);
  if (!response.ok) assert.equal(response.reason, "GOOGLE_API_REQUEST_REJECTED");
  assert.equal(calls, 0);
  assert.equal(getGoogleRoutesUsage(store).rolling30Days, 0);
});

test("Google Routes distinguishes a successful response with no usable route", async () => {
  const store = new MemoryStore();
  const service = new GoogleRoutesService(store, () => Date.parse("2026-08-16T18:00:00.000Z"), (async () => ({ ok: true, status: 200, json: async () => ({ routes: [] }) }) as Response) as typeof fetch);
  const response = await service.computeRoute(googleRequest("no-route"));
  assert.equal(response.ok, false);
  if (!response.ok) assert.equal(response.reason, "GOOGLE_API_NO_USABLE_ROUTE");
  const [entry] = getGoogleRoutesRequestLog(store);
  assert.equal(entry.reason, "GOOGLE_API_NO_USABLE_ROUTE");
});

test("Google Routes refuses a non-Delivered caller before the network and audits the attempt", async () => {
  const store = new MemoryStore(); let calls = 0;
  const service = new GoogleRoutesService(store, () => Date.parse("2026-08-16T18:00:00.000Z"), (async () => { calls += 1; return googleSuccess(); }) as typeof fetch);
  const response = await service.computeRoute({ ...googleRequest(), trigger: "settings_open" as never, caller: "settings_page" as never });
  assert.equal(response.ok, false); if (!response.ok) assert.equal(response.reason, "GOOGLE_API_LIVE_DELIVERY_ONLY");
  assert.equal(calls, 0);
  const [entry] = getGoogleRoutesRequestLog(store);
  assert.equal(entry.networkSent, false); assert.equal(entry.trigger, "settings_open"); assert.equal(entry.caller, "settings_page"); assert.equal(entry.reason, "GOOGLE_API_LIVE_DELIVERY_ONLY");
});

test("Google Geocoding blocks request 5,001 before the proxy or Google network", async () => {
  const store = new MemoryStore(); const now = Date.parse("2026-08-16T18:00:00.000Z"); let calls = 0;
  seedGeocodingLedger(store, GOOGLE_GEOCODING_30_DAY_HARD_LIMIT, "2026-08-01T17:00:00.000Z");
  const service = new GoogleAddressLookupService(store, () => now, (async () => { calls += 1; return geocodingSuccess(); }) as typeof fetch);
  const response = await service.lookup("42 Example Street, L39 2XX", { deliveryId: "blocked" });
  assert.equal(response.ok, false); if (!response.ok) assert.equal(response.reason, "GOOGLE_ADDRESS_LIMIT_REACHED"); assert.equal(calls, 0);
});

test("Google Geocoding enforces minute, daily and per-delivery fuses", async () => {
  const now = Date.parse("2026-08-16T18:00:00.000Z");
  const minuteStore = new MemoryStore(); seedGeocodingLedger(minuteStore, GOOGLE_GEOCODING_PER_MINUTE_HARD_LIMIT, "2026-08-16T17:59:30.000Z");
  const minute = await new GoogleAddressLookupService(minuteStore, () => now, geocodingSuccess as typeof fetch).lookup("1 Minute Road", { deliveryId: "minute" });
  assert.equal(minute.ok, false); if (!minute.ok) assert.equal(minute.reason, "GOOGLE_ADDRESS_MINUTE_LIMIT_REACHED");
  const dailyStore = new MemoryStore(); seedGeocodingLedger(dailyStore, GOOGLE_GEOCODING_24_HOUR_HARD_LIMIT, "2026-08-16T17:00:00.000Z");
  const daily = await new GoogleAddressLookupService(dailyStore, () => now, geocodingSuccess as typeof fetch).lookup("1 Daily Road", { deliveryId: "daily" });
  assert.equal(daily.ok, false); if (!daily.ok) assert.equal(daily.reason, "GOOGLE_ADDRESS_DAILY_LIMIT_REACHED");
  const deliveryStore = new MemoryStore();
  const service = new GoogleAddressLookupService(deliveryStore, () => now, geocodingSuccess as typeof fetch);
  for (let index = 0; index < GOOGLE_GEOCODING_PER_DELIVERY_HARD_LIMIT; index += 1) assert.equal((await service.lookup(`${index} Example Road`, { deliveryId: "same" })).ok, true);
  const fourth = await service.lookup("4 Example Road", { deliveryId: "same" });
  assert.equal(fourth.ok, false); if (!fourth.ok) assert.equal(fourth.reason, "DELIVERY_ADDRESS_LOOKUP_LIMIT_REACHED");
});

test("Google Geocoding cache remains usable when the global fuse is locked", async () => {
  const store = new MemoryStore(); const now = Date.parse("2026-08-16T18:00:00.000Z"); let calls = 0;
  seedGeocodingLedger(store, GOOGLE_GEOCODING_30_DAY_HARD_LIMIT - 1, "2026-08-01T17:00:00.000Z");
  const service = new GoogleAddressLookupService(store, () => now, (async () => { calls += 1; return geocodingSuccess(); }) as typeof fetch);
  assert.equal((await service.lookup("42 Example Street, L39 2XX", { deliveryId: "cache" })).ok, true);
  const cached = await service.lookup("42   Example Street, L39 2XX", { deliveryId: "cache" });
  assert.equal(cached.ok, true); if (cached.ok) assert.equal(cached.cacheHit, true); assert.equal(calls, 1);
});

test("route cleanup removes only expired points and keeps delivery evidence metadata", () => {
  const data = emptyData();
  const shift = completedShift();
  const activity = shift.activities!.find((item) => item.type === "clock_in")!;
  activity.routeEvidence = { status: "complete", startedAt: shift.clockIn, completedAt: shift.clockOut, points: [{ latitude: 53.56845, longitude: -2.88802, timestamp: shift.clockIn, accuracy: 8 }], recordedPointCount: 1, distanceMetres: 0, gaps: [], issues: [], stops: [{ latitude: 53.57, longitude: -2.88, startedAt: shift.clockIn, endedAt: shift.clockOut!, durationMs: 1_000, kind: "traffic_delay" }], detail: "standard", retention: "30", expiresAt: "2026-08-12T00:00:00.000Z" };
  activity.customerEvents = [{ timestamp: shift.clockIn, latitude: 53.57, longitude: -2.88, accuracy: 8, source: "manual_delivered", pointIndex: 0 }];
  activity.expectedRoute = { status: "ready", customer: { latitude: 53.57, longitude: -2.88, accuracy: 8, source: "manual_delivered" }, totalSeconds: 600, actualSeconds: 610, differenceSeconds: 10, serviceAllowanceSeconds: 60, calculatedAt: shift.clockIn, calculationVersion: 1 };
  data.shifts = [shift];
  assert.equal(cleanupExpiredRoutes(data, new Date("2026-08-15T00:00:00.000Z")), true);
  assert.equal(data.shifts.length, 1);
  assert.equal(activity.routeEvidence.status, "expired");
  assert.equal(activity.routeEvidence.points.length, 0);
  assert.equal(activity.routeEvidence.recordedPointCount, 1);
  assert.deepEqual(activity.routeEvidence.stops, []);
  assert.deepEqual(activity.customerEvents, []);
  assert.equal(activity.expectedRoute.customer, null);
  assert.equal(cleanupExpiredRoutes(data, new Date("2026-08-16T00:00:00.000Z")), false);
});

test("route cleanup preflight returns the same AppData when no route is expired", () => {
  const data = emptyData();
  const shift = completedShift();
  shift.activities![0].routeEvidence = {
    status: "complete",
    startedAt: shift.clockIn,
    completedAt: shift.clockOut,
    points: [],
    recordedPointCount: 0,
    distanceMetres: 0,
    gaps: [],
    issues: [],
    detail: "standard",
    retention: "90",
    expiresAt: "2026-10-01T00:00:00.000Z",
  };
  data.shifts = [shift];

  assert.equal(
    cleanupExpiredRoutesIfNeeded(data, new Date("2026-09-30T23:59:59.999Z")),
    data,
  );
});

test("route cleanup copy expires only routes at or before the exact boundary", () => {
  const data = emptyData();
  const shift = completedShift();
  const due = structuredClone(shift.activities![0]);
  due.id = "due-route";
  due.routeEvidence = {
    status: "complete",
    startedAt: shift.clockIn,
    completedAt: shift.clockOut,
    points: [{ latitude: 53.56845, longitude: -2.88802, timestamp: shift.clockIn, accuracy: 8 }],
    recordedPointCount: 1,
    distanceMetres: 0,
    gaps: [],
    issues: [],
    detail: "standard",
    retention: "90",
    expiresAt: "2026-10-01T00:00:00.000Z",
  };
  const later = structuredClone(due);
  later.id = "later-route";
  later.routeEvidence!.expiresAt = "2026-10-01T00:00:00.001Z";
  shift.activities = [due, later];
  data.shifts = [shift];

  const cleaned = cleanupExpiredRoutesIfNeeded(data, new Date("2026-10-01T00:00:00.000Z"));

  assert.notEqual(cleaned, data);
  assert.equal(data.shifts[0].activities![0].routeEvidence!.status, "complete");
  assert.equal(cleaned.shifts[0].activities![0].routeEvidence!.status, "expired");
  assert.equal(cleaned.shifts[0].activities![1].routeEvidence!.status, "complete");
  assert.equal(cleaned.shifts[0].activities![1].routeEvidence!.points.length, 1);
});

test("legacy route samples are repaired without inventing invalid GPS evidence", () => {
  const points = normaliseDeliveryRoutePoints([
    { lat: 53.56845, lng: -2.88802, time: "2026-08-16T12:00:00.000Z", accuracy: "8" },
    { latitude: 999, longitude: -2.88, timestamp: "2026-08-16T12:00:10.000Z", accuracy: 4 },
    { latitude: 53.56855, longitude: -2.8879, timestamp: "not-a-date", accuracy: 4 },
    { latitude: 53.56865, longitude: -2.8878, timestamp: "2026-08-16T12:00:20.000Z" },
  ]);
  assert.equal(points.length, 2);
  assert.deepEqual(points[0], { latitude: 53.56845, longitude: -2.88802, timestamp: "2026-08-16T12:00:00.000Z", accuracy: 8, speed: null, heading: null });
  assert.equal(points[1].accuracy, 0);
});

test("a driver-marked traffic-light wait is included without an OSM lookup", () => {
  const base = Date.parse("2026-08-16T12:00:00.000Z");
  const point = (seconds: number, longitude: number): DeliveryRoutePoint => ({ latitude: 53.56845, longitude, accuracy: 5, timestamp: new Date(base + seconds * 1000).toISOString() });
  const points = [point(0, -2.88802), point(10, -2.88742), point(25, -2.88742), point(45, -2.88742), point(70, -2.88642)];
  const activity: ActivityRecord = { id: "manual-signal", shiftId: "shift", type: "single_delivery", start: points[0].timestamp, end: points.at(-1)!.timestamp, geofenceLatitude: 53.56845, geofenceLongitude: -2.88802, geofenceRadius: 20, routePointContexts: [{ pointIndex: 1, context: "traffic_light", setAt: points[2].timestamp }], routeEvidence: { status: "complete", startedAt: points[0].timestamp, completedAt: points.at(-1)!.timestamp, points, recordedPointCount: points.length, distanceMetres: 100, gaps: [], issues: [], stops: [], detail: "standard", retention: "90", expiresAt: null } };
  const stops = classifyTrafficLightStops(activity, []);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].signalId, "driver-marked");
  assert.equal(stops[0].confidence, "high");
});

test("GPS movement heatmap classifies saved route samples without any routing provider", () => {
  const base = Date.parse("2026-08-16T12:00:00.000Z");
  const sample = (offset: number, longitude: number) => ({ latitude: 53.56845, longitude, accuracy: 6, timestamp: new Date(base + offset * 1000).toISOString() });
  const activity: ActivityRecord = {
    id: "heatmap", shiftId: "shift", type: "single_delivery", start: sample(0, -2.88802).timestamp, end: sample(130, -2.88802).timestamp,
    geofenceLatitude: 53.56845, geofenceLongitude: -2.88802, geofenceRadius: 20,
    customerEvents: [{ timestamp: sample(60, -2.88502).timestamp, latitude: 53.56845, longitude: -2.88502, accuracy: 6, source: "manual_delivered", pointIndex: null }],
    routeEvidence: { status: "complete", startedAt: sample(0, -2.88802).timestamp, completedAt: sample(130, -2.88802).timestamp, points: [sample(0, -2.88802), sample(15, -2.88652), sample(60, -2.88502), sample(70, -2.88502), sample(85, -2.88652), sample(130, -2.88802)], recordedPointCount: 6, distanceMetres: 445, gaps: [], issues: [], stops: [], detail: "standard", retention: "90", expiresAt: null },
  };
  const movement = analyseRouteMovement(activity);
  assert.ok(movement.segments.some((segment) => segment.classification === "moderate" || segment.classification === "free" || segment.classification === "slow" || segment.classification === "heavy"));
  assert.ok(movement.segments.some((segment) => segment.classification === "customer"));
  assert.equal(movement.stationary.length, 0);
});

test("traffic-light stops match local OSM signals without touching routing providers", () => {
  const base = Date.parse("2026-08-16T12:00:00.000Z");
  const point = (seconds: number, longitude: number) => ({ latitude: 53.56845, longitude, accuracy: 6, timestamp: new Date(base + seconds * 1000).toISOString() });
  const activity: ActivityRecord = { id: "signal-stop", shiftId: "shift", type: "single_delivery", start: point(0, -2.88802).timestamp, end: point(100, -2.88502).timestamp, geofenceLatitude: 53.56845, geofenceLongitude: -2.88802, geofenceRadius: 20, routeEvidence: { status: "complete", startedAt: point(0, -2.88802).timestamp, completedAt: point(100, -2.88502).timestamp, points: [point(0, -2.88802), point(10, -2.88742), point(30, -2.88742), point(50, -2.88742), point(70, -2.88642), point(100, -2.88502)], recordedPointCount: 6, distanceMetres: 330, gaps: [], issues: [], stops: [], detail: "standard", retention: "90", expiresAt: null } };
  const stops = classifyTrafficLightStops(activity, [{ id: "osm-1", latitude: 53.56845, longitude: -2.88742 }]);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].confidence, "high");
  assert.equal(stops[0].durationMs, 40_000);
});

test("a short saved stop beside a signal is classified as a traffic-light stop", () => {
  const base = Date.parse("2026-08-16T12:00:00.000Z");
  const point = (seconds: number, longitude: number) => ({ latitude: 53.56845, longitude, accuracy: 6, timestamp: new Date(base + seconds * 1000).toISOString() });
  const points = [point(0, -2.88802), point(10, -2.88742), point(35, -2.88742), point(60, -2.88400)];
  const activity: ActivityRecord = { id: "short-signal-stop", shiftId: "shift", type: "single_delivery", start: points[0].timestamp, end: points.at(-1)!.timestamp, geofenceLatitude: 53.56845, geofenceLongitude: -2.88802, geofenceRadius: 20, routeEvidence: { status: "complete", startedAt: points[0].timestamp, completedAt: points.at(-1)!.timestamp, points, recordedPointCount: points.length, distanceMetres: 300, gaps: [], issues: [], stops: [{ latitude: 53.56845, longitude: -2.88742, startedAt: points[1].timestamp, endedAt: points[2].timestamp, durationMs: 25_000, kind: "probable_traffic_light" }], detail: "standard", retention: "90", expiresAt: null } };
  const stops = classifyTrafficLightStops(activity, [{ id: "osm-1", latitude: 53.56845, longitude: -2.88742 }]);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].durationMs, 25_000);
});

test("repeated approach stops group into one downstream signal queue", () => {
  const base = Date.parse("2026-08-16T13:00:00.000Z");
  const point = (seconds: number, longitude: number) => ({ latitude: 53.56845, longitude, accuracy: 6, timestamp: new Date(base + seconds * 1000).toISOString() });
  const points = [point(0, -2.88802), point(10, -2.88600), point(40, -2.88600), point(55, -2.88580), point(90, -2.88580), point(105, -2.88550), point(145, -2.88550), point(160, -2.88450), point(180, -2.88300)];
  const activity: ActivityRecord = { id: "signal-queue", shiftId: "shift", type: "single_delivery", start: points[0].timestamp, end: points.at(-1)!.timestamp, geofenceLatitude: 53.56845, geofenceLongitude: -2.88802, geofenceRadius: 20, customerEvents: [{ timestamp: points.at(-1)!.timestamp, latitude: points.at(-1)!.latitude, longitude: points.at(-1)!.longitude, accuracy: 6, source: "manual_delivered", pointIndex: null }], routeEvidence: { status: "complete", startedAt: points[0].timestamp, completedAt: points.at(-1)!.timestamp, points, recordedPointCount: points.length, distanceMetres: 500, gaps: [], issues: [], stops: [], detail: "standard", retention: "90", expiresAt: null } };
  const queues = detectSignalQueues(activity, [{ id: "osm-signal", latitude: 53.56845, longitude: -2.88450 }]);
  assert.equal(queues.length, 1);
  assert.equal(queues[0].signalId, "osm-signal");
  assert.equal(queues[0].stopCycles, 3);
  assert.ok(queues[0].signalDistanceAtStart > 150);
  assert.ok(queues[0].durationMs >= 140_000);
});

test("signal matching tolerates GPS accuracy and junction-centre offsets", () => {
  const base = Date.parse("2026-08-16T14:00:00.000Z");
  const point = (seconds: number, latitude: number, longitude: number, accuracy = 30) => ({ latitude, longitude, accuracy, timestamp: new Date(base + seconds * 1000).toISOString() });
  const points = [point(0, 53.56845, -2.88802), point(10, 53.56845, -2.88742), point(80, 53.56845, -2.88742), point(100, 53.56845, -2.88642)];
  const activity: ActivityRecord = { id: "offset-signal", shiftId: "shift", type: "single_delivery", start: points[0].timestamp, end: points.at(-1)!.timestamp, geofenceLatitude: 53.56845, geofenceLongitude: -2.88802, geofenceRadius: 20, routeEvidence: { status: "complete", startedAt: points[0].timestamp, completedAt: points.at(-1)!.timestamp, points, recordedPointCount: points.length, distanceMetres: 180, gaps: [], issues: [], stops: [], detail: "standard", retention: "90", expiresAt: null } };
  const stops = classifyTrafficLightStops(activity, [{ id: "osm-junction-centre", latitude: 53.56845, longitude: -2.88840 }]);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].source, "OSM_MATCHED");
  assert.ok(stops[0].nearestSignalMetres > 50);
});

test("local traffic signals take priority over nearby OSM signals", () => {
  const merged = mergeTrafficSignals([{ id: "osm-1", latitude: 53.56845, longitude: -2.88742 }], [{ id: "local-1", latitude: 53.56845, longitude: -2.88740, featureType: "TRAFFIC_SIGNAL", source: "USER_CONFIRMED_LOCAL", createdAt: "2026-08-16T14:00:00.000Z" }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, "USER_CONFIRMED_LOCAL");
  assert.equal(merged[0].id, "local-local-1");
});

test("manual route event classification remains distinct from OSM evidence", () => {
  const base = Date.parse("2026-08-16T15:00:00.000Z");
  const point = (seconds: number, longitude: number) => ({ latitude: 53.56845, longitude, accuracy: 8, timestamp: new Date(base + seconds * 1000).toISOString() });
  const points = [point(0, -2.88802), point(10, -2.88742), point(40, -2.88742), point(70, -2.88642)];
  const activity: ActivityRecord = { id: "manual-classification", shiftId: "shift", type: "single_delivery", start: points[0].timestamp, end: points.at(-1)!.timestamp, routeEventClassifications: [{ pointIndex: 1, classification: "traffic_signal", source: "MANUALLY_CLASSIFIED", setAt: points[1].timestamp }], routeEvidence: { status: "complete", startedAt: points[0].timestamp, completedAt: points.at(-1)!.timestamp, points, recordedPointCount: points.length, distanceMetres: 120, gaps: [], issues: [], stops: [], detail: "standard", retention: "90", expiresAt: null } };
  const stops = classifyTrafficLightStops(activity, []);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].source, "MANUALLY_CLASSIFIED");
  assert.equal(stops[0].signalId, "manual-event");
});

test("Domino's reference geofence has the supplied fixed coordinates without altering Real Hustle", () => {
  assert.deepEqual(REAL_STATS_GEOFENCE, { latitude: 53.56845, longitude: -2.88802, radius: 35, protected: true });
  assert.deepEqual(DOMINOS_REFERENCE_GEOFENCE, { latitude: 53.56822592818352, longitude: -2.887807336362812, radius: 75, protected: true });
  assert.deepEqual(getDominosReferenceGeofence({ ...DEFAULT_SETTINGS, dominosReferenceRadiusMetres: 95 }), { latitude: DOMINOS_REFERENCE_GEOFENCE.latitude, longitude: DOMINOS_REFERENCE_GEOFENCE.longitude, radius: 95 });
  assert.equal(getDominosReferenceGeofence({ ...DEFAULT_SETTINGS, dominosReferenceRadiusMetres: 500 }).radius, 150);
  assert.equal(getRealStatsGeofence({ ...DEFAULT_SETTINGS, dominosReferenceRadiusMetres: 95 }).radius, 35);
});

test("one canonical GPS sequence drives independent real and Domino's geofence state machines", () => {
  const real = { id: "real", label: "Real", latitude: 0, longitude: 0, radius: 35 } as const;
  const dominos = { id: "dominos", label: "Domino's", latitude: 0, longitude: 0, radius: 75 } as const;
  const point = (seconds: number, metresEast: number) => ({ latitude: 0, longitude: metresEast / 111_320, accuracy: 3, timestamp: new Date(Date.parse("2026-08-23T10:00:00.000Z") + seconds * 1000).toISOString() });
  let realState = initialGeofenceEvaluatorState("inside");
  let dominosState = initialGeofenceEvaluatorState("inside");
  const transitions: string[] = [];
  for (const sample of [point(0, 0), point(20, 55), point(40, 100), point(80, 100), point(105, 55), point(125, 0)]) {
    const realResult = evaluateGeofenceSample(realState, real, sample); realState = realResult.state;
    const dominosResult = evaluateGeofenceSample(dominosState, dominos, sample); dominosState = dominosResult.state;
    if (realResult.transition) transitions.push(`real:${realResult.transition.to}:${seconds(realResult.transition.timestamp)}`);
    if (dominosResult.transition) transitions.push(`dominos:${dominosResult.transition.to}:${seconds(dominosResult.transition.timestamp)}`);
  }
  function seconds(value: string) { return (Date.parse(value) - Date.parse("2026-08-23T10:00:00.000Z")) / 1000; }
  assert.deepEqual(transitions, ["real:outside:20", "dominos:outside:40", "dominos:inside:105", "real:inside:125"]);
  assert.equal(realState.presence, "inside");
  assert.equal(dominosState.presence, "inside");
});

test("current Real delivery stays outside over 0.25 and 1 mile then retains the first credible 35m return timestamp", () => {
  const definition = { id: "real", label: "Real Hustle", latitude: 0, longitude: 0, radius: 35, entryRadius: 35 } as const;
  const startedAt = Date.parse("2026-08-23T16:00:00.000Z");
  const point = (seconds: number, metresEast: number, accuracy = 4): DeliveryRoutePoint => ({ latitude: 0, longitude: metresEast / 111_320, accuracy, timestamp: new Date(startedAt + seconds * 1000).toISOString() });
  const activity: ActivityRecord = { id: "current-run", shiftId: "shift", type: "single_delivery", start: new Date(startedAt).toISOString(), end: null, locationAssistEnabled: true, storeExitObserved: false, storeEntryObserved: false };
  let state = initialGeofenceEvaluatorState("inside", startedAt);
  const feed = (sample: DeliveryRoutePoint) => {
    const result = evaluateGeofenceSample(state, definition, sample);
    state = result.state;
    if (result.transition) applyRealGeofenceTransition(activity, result.transition);
    return result;
  };

  feed(point(5, 20));
  feed(point(10, 35));
  const exit = feed(point(20, 55));
  assert.equal(exit.transition?.to, "outside");
  assert.equal(activity.storeExitAt, point(20, 55).timestamp);
  assert.equal(state.presence, "outside");

  feed(point(80, 410));
  assert.equal(state.presence, "outside");
  assert.equal(activity.storeEntryAt, undefined);
  assert.equal(hasConfirmedStoreReturn(activity), false);
  assert.equal(deliveryGeofenceDurations(activity).returnDelayMs, null);

  feed(point(300, 1_700));
  assert.equal(state.presence, "outside");
  assert.equal(activity.storeEntryAt, undefined);
  assert.equal(deliveryGeofenceDurations(activity).hustleMs, null);

  feed(point(500, 100));
  const firstCredibleReturn = point(520, 35, 8);
  const pending = feed(firstCredibleReturn);
  assert.equal(pending.transition, null);
  assert.equal(state.pendingPresence, "inside");
  assert.equal(state.pendingSinceAt, firstCredibleReturn.timestamp);
  const confirmed = feed(point(524, 35, 8));
  assert.equal(confirmed.transition?.to, "inside");
  assert.equal(confirmed.transition?.timestamp, firstCredibleReturn.timestamp);
  assert.equal(activity.storeEntryAt, firstCredibleReturn.timestamp);
  assert.equal(hasConfirmedStoreReturn(activity), true);

  activity.backAtStoreAt = point(540, 0).timestamp;
  activity.end = activity.backAtStoreAt;
  assert.equal(deliveryGeofenceDurations(activity).returnDelayMs, 20_000);
});

test("a previous delivery entry cannot create a return on the next delivery", () => {
  const previous: ActivityRecord = { id: "previous", shiftId: "shift", type: "single_delivery", start: "2026-08-23T10:00:00.000Z", end: "2026-08-23T10:20:00.000Z", storeExitAt: "2026-08-23T10:01:00.000Z", storeExitObserved: true, storeEntryAt: "2026-08-23T10:19:00.000Z", storeEntryObserved: true };
  const next: ActivityRecord = { id: "next", shiftId: "shift", type: "single_delivery", start: "2026-08-23T10:30:00.000Z", end: null };
  assert.equal(hasConfirmedStoreReturn(previous), true);
  assert.equal(applyRealGeofenceTransition(next, { from: "outside", to: "inside", timestamp: "2026-08-23T10:31:00.000Z", observed: true }), "rejected");
  assert.equal(next.storeEntryAt, undefined);
  assert.equal(hasConfirmedStoreReturn(next), false);
});

test("border samples require confirmation independently at both boundary radii", () => {
  const sample = (longitude: number, seconds: number) => ({ latitude: 0, longitude, accuracy: 20, timestamp: new Date(Date.parse("2026-08-23T11:00:00.000Z") + seconds * 1000).toISOString() });
  let state = initialGeofenceEvaluatorState("inside");
  const first = evaluateGeofenceSample(state, { id: "dominos", label: "Domino's", latitude: 0, longitude: 0, radius: 75 }, sample(90 / 111_320, 0));
  assert.equal(first.transition, null);
  state = first.state;
  const second = evaluateGeofenceSample(state, { id: "dominos", label: "Domino's", latitude: 0, longitude: 0, radius: 75 }, sample(90 / 111_320, 5));
  assert.equal(second.transition?.to, "outside");
});

test("Hustle datasets never mix Real exit with Domino's return", () => {
  const activity: ActivityRecord = { id: "dual", shiftId: "shift", type: "single_delivery", start: "2026-08-23T10:00:00.000Z", end: "2026-08-23T10:20:00.000Z", backAtStoreAt: "2026-08-23T10:20:00.000Z", storeExitAt: "2026-08-23T10:01:30.000Z", storeEntryAt: "2026-08-23T10:18:30.000Z", storeExitObserved: true, storeEntryObserved: true, dominosStoreExitAt: "2026-08-23T10:02:00.000Z", dominosStoreEntryAt: "2026-08-23T10:18:00.000Z", dominosStoreExitObserved: true, dominosStoreEntryObserved: true };
  assert.equal(deliveryGeofenceDurations(activity, "real").preDepartureMs, 90_000);
  assert.equal(deliveryGeofenceDurations(activity, "real").returnDelayMs, 90_000);
  assert.equal(deliveryGeofenceDurations(activity, "dominos").preDepartureMs, 120_000);
  assert.equal(deliveryGeofenceDurations(activity, "dominos").returnDelayMs, 120_000);
});

test("historical Domino's Hustle is reconstructed only from conclusive retained route crossings", () => {
  const west = (metres: number) => DOMINOS_REFERENCE_GEOFENCE.longitude - metres / 66_500;
  const at = (seconds: number, metresWest: number): DeliveryRoutePoint => ({ latitude: DOMINOS_REFERENCE_GEOFENCE.latitude, longitude: west(metresWest), accuracy: 4, timestamp: new Date(Date.parse("2026-08-23T12:00:00.000Z") + seconds * 1000).toISOString() });
  const activity: ActivityRecord = { id: "historic", shiftId: "shift", type: "single_delivery", start: "2026-08-23T12:00:00.000Z", end: "2026-08-23T12:02:00.000Z", backAtStoreAt: "2026-08-23T12:02:00.000Z", routeEvidence: { status: "complete", startedAt: "2026-08-23T12:00:00.000Z", completedAt: "2026-08-23T12:02:00.000Z", points: [at(0, 0), at(30, 120), at(70, 120), at(100, 0)], recordedPointCount: 4, distanceMetres: 240, gaps: [], issues: [], detail: "standard", retention: "90", expiresAt: null } };
  const evidence = activityGeofenceEvidence(activity, "dominos");
  assert.equal(evidence.derivedFromRoute, true);
  assert.equal(evidence.exitAt, "2026-08-23T12:00:30.000Z");
  assert.equal(evidence.entryAt, "2026-08-23T12:01:40.000Z");
  activity.routeEvidence!.points = [at(30, 120), at(70, 120)];
  assert.equal(activityGeofenceEvidence(activity, "dominos").exitAt, null);
  assert.equal(activityGeofenceEvidence(activity, "dominos").entryAt, null);
});

test("Domino's best records use only the selected comparison dataset", () => {
  const shift = createShift(DEFAULT_SETTINGS, new Date("2026-08-23T09:00:00.000Z"));
  shift.activities = [{ id: "run", shiftId: shift.id, type: "single_delivery", start: "2026-08-23T10:00:00.000Z", end: "2026-08-23T10:20:00.000Z", backAtStoreAt: "2026-08-23T10:20:00.000Z", storeExitAt: "2026-08-23T10:01:00.000Z", storeEntryAt: "2026-08-23T10:19:00.000Z", storeExitObserved: true, storeEntryObserved: true, dominosStoreExitAt: "2026-08-23T10:02:00.000Z", dominosStoreEntryAt: "2026-08-23T10:18:00.000Z", dominosStoreExitObserved: true, dominosStoreEntryObserved: true }];
  assert.equal(bestHustleRecord([shift], "shift", "real")?.averageMs, 120_000);
  assert.equal(bestHustleRecord([shift], "shift", "dominos")?.averageMs, 240_000);
});

test("early dispatch attaches to one normal run without changing its Real start", () => {
  const activity: ActivityRecord = { id: "single", shiftId: "shift", type: "single_delivery", start: "2026-08-30T18:44:02.000Z", end: null, customerDeliveries: 1 };
  attachEarlyDispatchToActivity(activity, {
    dominosDispatchStartedAt: "2026-08-30T18:42:10.000Z",
    dominosGeofenceExitedAt: null,
    dominosGeofenceLatitude: DOMINOS_REFERENCE_GEOFENCE.latitude,
    dominosGeofenceLongitude: DOMINOS_REFERENCE_GEOFENCE.longitude,
    dominosGeofenceRadius: DOMINOS_REFERENCE_GEOFENCE.radius,
  }, activity.start);
  assert.equal(activity.start, "2026-08-30T18:44:02.000Z");
  assert.equal(activity.realDeliveryStartedAt, activity.start);
  assert.equal(activity.dominosDispatchStartedAt, "2026-08-30T18:42:10.000Z");
  assert.equal(activity.earlyDispatchGapSeconds, 112);
  assert.equal(activity.customerDeliveries, 1);
});

test("early-dispatched Double keeps one run and two customer deliveries", () => {
  const activities: ActivityRecord[] = [{ id: "double", shiftId: "shift", type: "double_delivery", start: "2026-08-30T18:44:00.000Z", end: null, customerDeliveries: 2 }];
  attachEarlyDispatchToActivity(activities[0], {
    dominosDispatchStartedAt: "2026-08-30T18:42:00.000Z",
    dominosGeofenceExitedAt: "2026-08-30T18:45:22.000Z",
    dominosGeofenceLatitude: DOMINOS_REFERENCE_GEOFENCE.latitude,
    dominosGeofenceLongitude: DOMINOS_REFERENCE_GEOFENCE.longitude,
    dominosGeofenceRadius: DOMINOS_REFERENCE_GEOFENCE.radius,
  }, activities[0].start);
  assert.equal(activities.length, 1);
  assert.equal(activities[0].customerDeliveries, 2);
  assert.equal(activities[0].dominosHustleSeconds, 202);
  assert.equal(activities[0].earlyDispatchGapSeconds, 120);
});

test("an active delivery can record an honest remembered early-dispatch gap", () => {
  const activity: ActivityRecord = {
    id: "single",
    shiftId: "shift",
    type: "single_delivery",
    start: "2026-09-05T21:16:00.000Z",
    end: null,
    customerDeliveries: 1,
    dominosStoreExitAt: "2026-09-05T21:17:30.000Z",
    dominosStoreExitObserved: true,
  };
  assert.equal(markRunningDeliveryEarlyDispatch(activity, 75), true);
  assert.equal(activity.dominosDispatchStartedAt, "2026-09-05T21:14:45.000Z");
  assert.equal(activity.realDeliveryStartedAt, activity.start);
  assert.equal(activity.earlyDispatchGapSeconds, 75);
  assert.equal(activity.dominosHustleSeconds, 165);
  assert.equal(markRunningDeliveryEarlyDispatch(activity, 30), false);
});

test("Domino's early and protected Real exit metrics stay independent", () => {
  const activity: ActivityRecord = { id: "run", shiftId: "shift", type: "single_delivery", start: "2026-08-30T18:44:00.000Z", end: null, realDeliveryStartedAt: "2026-08-30T18:44:00.000Z", dominosDispatchStartedAt: "2026-08-30T18:42:00.000Z", wasEarlyDispatched: true };
  recordDominosHustleExit(activity, "2026-08-30T18:45:22.000Z");
  applyRealGeofenceTransition(activity, { from: "inside", to: "outside", timestamp: "2026-08-30T18:45:20.000Z", observed: true });
  recordRealHustleExitMetrics(activity);
  assert.equal(activity.dominosHustleSeconds, 202);
  assert.equal(activity.realHustleSeconds, 80);
  assert.equal(deliveryGeofenceDurations(activity, "dominos").preDepartureMs, 202_000);
  assert.equal(deliveryGeofenceDurations(activity, "real").preDepartureMs, 80_000);
});

test("cancelling a pending early dispatch creates no delivery data", () => {
  const shift = createShift(DEFAULT_SETTINGS, new Date("2026-08-30T18:00:00.000Z"));
  const initialActivityCount = shift.activities?.length;
  const initialDeliveryCount = shift.deliveries.length;
  shift.pendingEarlyDispatch = {
    dominosDispatchStartedAt: "2026-08-30T18:42:00.000Z",
    dominosGeofenceExitedAt: null,
    dominosGeofenceLatitude: DOMINOS_REFERENCE_GEOFENCE.latitude,
    dominosGeofenceLongitude: DOMINOS_REFERENCE_GEOFENCE.longitude,
    dominosGeofenceRadius: DOMINOS_REFERENCE_GEOFENCE.radius,
  };
  shift.pendingEarlyDispatch = null;
  assert.equal(shift.activities?.length, initialActivityCount);
  assert.equal(shift.deliveries.length, initialDeliveryCount);
});

test("the next delivery can consume a queued dispatch notice independently of the previous run", () => {
  const previous: ActivityRecord = {
    id: "previous",
    shiftId: "shift",
    type: "single_delivery",
    start: "2026-09-11T17:00:00.000Z",
    end: null,
    customerDeliveries: 1,
    wasEarlyDispatched: true,
    dominosDispatchStartedAt: "2026-09-11T16:58:00.000Z",
  };
  const next: ActivityRecord = {
    id: "next",
    shiftId: "shift",
    type: "single_delivery",
    start: "2026-09-11T17:14:00.000Z",
    end: null,
    customerDeliveries: 1,
  };
  attachEarlyDispatchToActivity(next, {
    dominosDispatchStartedAt: "2026-09-11T17:10:00.000Z",
    dominosGeofenceExitedAt: null,
    dominosGeofenceLatitude: DOMINOS_REFERENCE_GEOFENCE.latitude,
    dominosGeofenceLongitude: DOMINOS_REFERENCE_GEOFENCE.longitude,
    dominosGeofenceRadius: DOMINOS_REFERENCE_GEOFENCE.radius,
  }, next.start);
  assert.equal(previous.dominosDispatchStartedAt, "2026-09-11T16:58:00.000Z");
  assert.equal(next.wasEarlyDispatched, true);
  assert.equal(next.dominosDispatchStartedAt, "2026-09-11T17:10:00.000Z");
  assert.equal(next.earlyDispatchGapSeconds, 240);
});
