import test from "node:test";
import assert from "node:assert/strict";
import { applyValidatedBackup, createBackupDocument, validateBackupDocument, validateAppDataStructure } from "../lib/backup.ts";
import { createShift, emptyData, PREPARATION_ROTA, repairShiftActivityIds, snapshotPreparationTasks, type AppData } from "../lib/domain.ts";

test("backup preserves a durable James OS shift retraction tombstone", () => {
  const data = emptyData();
  data.settings.jamesOsShiftRetractions = [{ shiftId: "synthetic-shift", revision: 12, retractedAtEpochMs: 1_789_000_000_000 }];
  const result = validateBackupDocument(createBackupDocument(data, "2.1.212"));
  assert.equal(result.ok, true);
});

function dataWithDelivery(): AppData {
  const data = emptyData();
  const shift = repairShiftActivityIds(createShift(data.settings, new Date("2026-08-24T16:00:00.000Z")));
  shift.status = "completed";
  shift.clockOut = "2026-08-24T22:00:00.000Z";
  shift.updatedAt = shift.clockOut;
  shift.deliveries = [{ id: "delivery-1", type: "single", timestamp: "2026-08-24T17:20:00.000Z", reimbursementPence: 100, activityId: "run-1" }];
  shift.activities = [
    ...(shift.activities ?? []),
    {
      id: "run-1", shiftId: shift.id, type: "single_delivery", start: "2026-08-24T17:00:00.000Z", end: "2026-08-24T17:30:00.000Z", deliveryEventId: "delivery-1", customerDeliveries: 1,
      storeExitAt: "2026-08-24T17:02:00.000Z", storeEntryAt: "2026-08-24T17:28:00.000Z",
      customerEvents: [{ timestamp: "2026-08-24T17:20:00.000Z", latitude: 53.57, longitude: -2.88, accuracy: 8, source: "manual_delivered", pointIndex: 0 }],
      routeEvidence: { status: "complete", startedAt: "2026-08-24T17:00:00.000Z", completedAt: "2026-08-24T17:30:00.000Z", points: [{ latitude: 53.57, longitude: -2.88, timestamp: "2026-08-24T17:20:00.000Z", accuracy: 8 }], recordedPointCount: 1, distanceMetres: 1200, gaps: [], issues: [], detail: "standard", retention: "90", expiresAt: null },
      deliveryDestinations: [{ fullAddress: "42 Private Road, Ormskirk L39 2XX", houseNumberOrName: "42", street: "Private Road", postcode: "L39 2XX", destination: { latitude: 53.57, longitude: -2.88, accuracy: 8 }, addressSource: "manual", confirmedAt: "2026-08-24T16:59:00.000Z", privacyStatus: "precise" }],
    },
  ];
  data.shifts = [shift];
  return data;
}

test("a valid current backup validates with metadata and an import preview", () => {
  const backup = createBackupDocument(dataWithDelivery(), "2.1.35", new Date("2026-08-25T09:30:00.000Z"));
  const result = validateBackupDocument(backup);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.preview.appVersion, "2.1.35");
  assert.equal(result.preview.counts.shifts, 1);
  assert.equal(result.preview.counts.deliveries, 1);
  assert.equal(result.preview.counts.routePoints, 1);
  assert.equal(result.preview.historicalFormat, false);
  assert.equal(result.preview.createdAt, "2026-08-25T09:30:00.000Z");
});

test("backup validation preserves documented unable task outcomes", () => {
  const data = dataWithDelivery();
  const task = data.shifts[0].taskSnapshot?.[0];
  assert.ok(task);
  task.unableReason = "manager_direction";
  task.unableManager = "Sam";
  task.unableAt = "2026-08-24T20:00:00.000Z";
  const result = validateBackupDocument(createBackupDocument(data, "2.1.39"));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.shifts[0].taskSnapshot?.[0].unableManager, "Sam");
});

test("backup validation preserves valid custom quick tasks and rejects malformed labels", () => {
  const data = dataWithDelivery();
  data.settings.customQuickTasks = ["Label sauces", "Stock dip pots"];
  const valid = validateBackupDocument(createBackupDocument(data, "2.1.76"));
  assert.equal(valid.ok, true);
  if (valid.ok) assert.deepEqual(valid.data.settings.customQuickTasks, ["Label sauces", "Stock dip pots"]);
  data.settings.customQuickTasks = [" padded task "];
  assert.equal(validateBackupDocument(createBackupDocument(data, "2.1.76")).ok, false);
});

test("backup validation preserves valid quick-job preferences and rejects malformed ids", () => {
  const data = dataWithDelivery();
  Object.assign(data.settings, {
    quickTasksEnabled: false,
    hiddenQuickTaskIds: ["answer-phone"],
    quickTaskOrder: ["answer-phone", "make-pizzas"],
    quickTaskCategoryOrder: ["customer", "makeline", "stock", "cleaning", "oven_front", "other"],
    customQuickTaskCategories: {},
  });
  const valid = validateBackupDocument(createBackupDocument(data, "2.1.220"));
  assert.equal(valid.ok, true);
  if (valid.ok) assert.deepEqual(valid.data.settings.hiddenQuickTaskIds, ["answer-phone"]);

  Object.assign(data.settings, { hiddenQuickTaskIds: ["<bad>"] });
  assert.equal(validateBackupDocument(createBackupDocument(data, "2.1.220")).ok, false);
});

test("backup preserves the optional store-presence proof without changing geofence evidence", () => {
  const data = dataWithDelivery();
  data.settings.storePresenceProofEnabled = true;
  data.settings.storePresenceStartProofEnabled = true;
  const activity = data.shifts[0].activities?.find((item) => item.id === "run-1");
  assert.ok(activity);
  activity.storePresenceProof = { version: 1, startEnabledAtStart: true, enabledAtStart: true, radiusMetres: 10, latitude: 53.568186, longitude: -2.887791, changes: [{ at: "2026-08-24T17:25:00.000Z", enabled: false }, { at: "2026-08-24T17:26:00.000Z", enabled: true }], startAttempt: { at: "2026-08-24T17:20:00.000Z", outcome: "confirmed", latitude: 53.568185, longitude: -2.887792, accuracy: 5, distanceMetres: 1, sampleAt: "2026-08-24T17:19:58.000Z" }, returnAttempt: { at: "2026-08-24T17:30:00.000Z", outcome: "confirmed", latitude: 53.568185, longitude: -2.887792, accuracy: 6, distanceMetres: 1, sampleAt: "2026-08-24T17:29:58.000Z" } };
  const valid = validateBackupDocument(createBackupDocument(data, "2.1.88"));
  assert.equal(valid.ok, true);
  if (valid.ok) {
    const proof = valid.data.shifts[0].activities?.find((item) => item.id === "run-1")?.storePresenceProof;
    assert.equal(proof?.startAttempt?.outcome, "confirmed");
    assert.equal(proof?.returnAttempt?.outcome, "confirmed");
  }
  (activity.storePresenceProof as { radiusMetres: number }).radiusMetres = 20;
  assert.equal(validateBackupDocument(createBackupDocument(data, "2.1.88")).ok, false);
});

test("backup validation rejects malformed unable task metadata", () => {
  const data = dataWithDelivery();
  const task = data.shifts[0].taskSnapshot?.[0] as unknown as Record<string, unknown>;
  task.unableReason = "made_up_reason";
  task.unableManager = "Sam";
  task.unableAt = "not-a-date";
  assert.equal(validateBackupDocument(createBackupDocument(data, "2.1.39")).ok, false);
});

test("backup validation preserves and validates preparation not-required outcomes", () => {
  const data = dataWithDelivery();
  data.shifts[0].taskSnapshot?.push(...snapshotPreparationTasks(PREPARATION_ROTA));
  const task = data.shifts[0].taskSnapshot?.find((item) => item.category === "prep" && item.allowNotRequired);
  assert.ok(task);
  task.notRequired = true;
  task.notRequiredAt = data.shifts[0].clockOut;
  const valid = validateBackupDocument(createBackupDocument(data, "2.1.65"));
  assert.equal(valid.ok, true);
  if (valid.ok) assert.equal(valid.data.shifts[0].taskSnapshot?.find((item) => item.id === task.id)?.notRequired, true);
  task.notRequiredAt = "not-a-date";
  assert.equal(validateBackupDocument(createBackupDocument(data, "2.1.65")).ok, false);
});

test("backup validation preserves active, awaiting and paid payroll records without migration", () => {
  const data = dataWithDelivery();
  data.payrollSchedules = [
    { monthKey: "2026-08", periodStartDate: "2026-07-27", cutoffDate: "2026-08-23", paydayDate: "2026-09-01", isFiveWeekPay: false, paidAt: null },
    { monthKey: "2026-07", periodStartDate: "2026-06-29", cutoffDate: "2026-07-26", paydayDate: "2026-08-04", isFiveWeekPay: false, paidAt: "2026-08-04T08:00:00.000Z" },
  ];
  const result = validateBackupDocument(createBackupDocument(data, "2.1.40"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.payrollSchedules?.length, 2);
  assert.equal(result.data.payrollSchedules?.[0].paidAt, null);
  assert.equal(result.data.payrollSchedules?.[1].paidAt, "2026-08-04T08:00:00.000Z");
});

test("backup preserves a before-tracker payslip balance without adding a shift", () => {
  const data = dataWithDelivery();
  data.payrollSchedules = [
    {
      monthKey: "2026-08",
      periodStartDate: "2026-07-27",
      cutoffDate: "2026-08-23",
      paydayDate: "2026-09-01",
      paidAt: "2026-09-01T08:00:00.000Z",
      payslip: {
        grossPayPence: 146_992,
        paidMs: 408_312_000,
        preTrackerAdjustment: {
          grossPayPence: 73_330,
          paidMs: 203_700_000,
        },
        recordedAt: "2026-09-01T08:00:00.000Z",
        updatedAt: "2026-09-01T08:00:00.000Z",
      },
    },
  ];

  const result = validateBackupDocument(createBackupDocument(data, "2.1.40"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.data.payrollSchedules?.[0].payslip?.preTrackerAdjustment,
    { grossPayPence: 73_330, paidMs: 203_700_000 },
  );
  assert.equal(result.data.shifts.length, 1);
});

test("a valid historical raw JSON backup remains supported", () => {
  const historical = dataWithDelivery();
  delete historical.settings.osmRoadFeatureSettings;
  delete historical.settings.localRoadFeatures;
  delete historical.settings.settingsStyle;
  delete historical.payrollSchedules;
  delete (historical.shifts[0] as Partial<typeof historical.shifts[number]>).createdAt;
  delete (historical.shifts[0] as Partial<typeof historical.shifts[number]>).updatedAt;
  const legacyRoute = historical.shifts[0].activities?.find((activity) => activity.id === "run-1")?.routeEvidence as unknown as Record<string, unknown>;
  delete legacyRoute.status;
  delete legacyRoute.completedAt;
  delete legacyRoute.recordedPointCount;
  delete legacyRoute.distanceMetres;
  delete legacyRoute.gaps;
  delete legacyRoute.issues;
  delete legacyRoute.detail;
  delete legacyRoute.retention;
  delete legacyRoute.expiresAt;
  const result = validateBackupDocument(historical);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.preview.historicalFormat, true);
    assert.equal(result.preview.formatVersion, null);
    assert.equal(result.data.settings.osmRoadFeatureSettings?.trafficSignals, true);
  }
});

test("malformed top-level and unsupported backup versions are rejected", () => {
  assert.equal(validateBackupDocument({ version: 1 }).ok, false);
  const backup = createBackupDocument(dataWithDelivery(), "2.1.35");
  assert.equal(validateBackupDocument({ ...backup, formatVersion: 99 }).ok, false);
  assert.equal(validateBackupDocument({ ...backup, schemaVersion: 2 }).ok, false);
  assert.equal(validateBackupDocument({ ...backup.data, version: 2 }).ok, false);
});

test("malformed nested shift and delivery records are rejected", () => {
  const malformedShift = structuredClone(dataWithDelivery()) as unknown as { shifts: Array<Record<string, unknown>> };
  malformedShift.shifts[0].clockIn = "not-a-timestamp";
  const shiftResult = validateBackupDocument(malformedShift);
  assert.equal(shiftResult.ok, false);
  if (!shiftResult.ok) assert.match(shiftResult.message, /shift/i);

  const malformedDelivery = structuredClone(dataWithDelivery()) as unknown as { shifts: Array<{ deliveries: Array<Record<string, unknown>> }> };
  malformedDelivery.shifts[0].deliveries[0].reimbursementPence = Number.NaN;
  const deliveryResult = validateBackupDocument(malformedDelivery);
  assert.equal(deliveryResult.ok, false);
  if (!deliveryResult.ok) assert.match(deliveryResult.message, /deliver/i);
});

test("malformed GPS routes and nested timestamps are rejected", () => {
  const malformedRoute = structuredClone(dataWithDelivery()) as unknown as { shifts: Array<{ activities: Array<Record<string, unknown>> }> };
  const delivery = malformedRoute.shifts[0].activities.find((activity) => activity.id === "run-1")!;
  (delivery.routeEvidence as { points: Array<Record<string, unknown>> }).points[0].latitude = 120;
  const routeResult = validateBackupDocument(malformedRoute);
  assert.equal(routeResult.ok, false);
  if (!routeResult.ok) assert.match(routeResult.message, /GPS/i);

  const malformedHustle = structuredClone(dataWithDelivery()) as unknown as { shifts: Array<{ activities: Array<Record<string, unknown>> }> };
  malformedHustle.shifts[0].activities.find((activity) => activity.id === "run-1")!.storeExitAt = "yesterday-ish";
  assert.equal(validateBackupDocument(malformedHustle).ok, false);
});

test("failed or cancelled import leaves the current dataset untouched", () => {
  const current = emptyData();
  current.settings.hourlyRatePence = 777;
  const before = JSON.stringify(current);
  const invalid = validateBackupDocument({ version: 1, shifts: "broken" });
  assert.equal(applyValidatedBackup(current, invalid, true), current);
  assert.equal(JSON.stringify(current), before);

  const valid = validateBackupDocument(createBackupDocument(dataWithDelivery(), "2.1.35"));
  assert.equal(applyValidatedBackup(current, valid, false), current);
  assert.equal(JSON.stringify(current), before);
});

test("successful import replaces data only after explicit confirmation", () => {
  const current = emptyData();
  const valid = validateBackupDocument(createBackupDocument(dataWithDelivery(), "2.1.35"));
  const restored = applyValidatedBackup(current, valid, true);
  assert.notEqual(restored, current);
  assert.equal(restored.shifts.length, 1);
  assert.equal(current.shifts.length, 0);
});

test("backup sanitisation keeps live precise data private without mutating it", () => {
  const live = dataWithDelivery();
  const liveDestination = live.shifts[0].activities?.find((activity) => activity.id === "run-1")?.deliveryDestinations?.[0];
  const backup = createBackupDocument(live, "2.1.35");
  const exportedDestination = backup.data.shifts[0].activities?.find((activity) => activity.id === "run-1")?.deliveryDestinations?.[0];
  assert.equal(exportedDestination?.houseNumberOrName, undefined);
  assert.equal(exportedDestination?.destination, undefined);
  assert.equal(exportedDestination?.street, "Private Road");
  assert.equal(liveDestination?.houseNumberOrName, "42");
  assert.equal(liveDestination?.destination?.latitude, 53.57);
});

test("beta records and settings are preserved and reported in backup metadata", () => {
  const data = dataWithDelivery();
  const beta = repairShiftActivityIds(createShift(data.settings, new Date("2026-08-22T22:00:00.000Z")));
  beta.status = "completed";
  beta.clockOut = "2026-08-22T22:30:00.000Z";
  data.settings.includeBetaData = false;
  data.settings.includeBetaCleaningData = true;
  data.shifts.push(beta);
  const backup = createBackupDocument(data, "2.1.35");
  const result = validateBackupDocument(backup);
  assert.equal(backup.recordCounts.betaShifts, 1);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.preview.hasBetaRecords, true);
    assert.equal(result.data.settings.includeBetaData, false);
    assert.equal(result.data.settings.includeBetaCleaningData, true);
    assert.equal(result.data.shifts.length, 2);
  }
});

test("tampered backup record-count metadata is rejected", () => {
  const backup = createBackupDocument(dataWithDelivery(), "2.1.35");
  backup.recordCounts.routePoints += 1;
  const result = validateBackupDocument(backup);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /record counts/i);
});

test("dual-geofence evidence and selected Hustle source survive backup validation", () => {
  const data = dataWithDelivery();
  data.settings.hustleStatsSource = "dominos";
  data.settings.dominosReferenceRadiusMetres = 95;
  const activity = data.shifts[0].activities?.find((item) => item.id === "run-1");
  assert.ok(activity);
  Object.assign(activity, {
    dominosStoreExitAt: "2026-08-24T17:03:00.000Z",
    dominosStoreEntryAt: "2026-08-24T17:27:00.000Z",
    dominosStoreExitObserved: true,
    dominosStoreEntryObserved: true,
    dominosGeofenceLatitude: 53.56822592818352,
    dominosGeofenceLongitude: -2.887807336362812,
    dominosGeofenceRadius: 75,
    dominosDispatchStartedAt: "2026-08-24T17:00:00.000Z",
    dominosGeofenceExitedAt: "2026-08-24T17:03:00.000Z",
    realDeliveryStartedAt: "2026-08-24T17:02:00.000Z",
    realGeofenceExitedAt: "2026-08-24T17:03:30.000Z",
    earlyDispatchGapSeconds: 120,
    dominosHustleSeconds: 180,
    realHustleSeconds: 90,
    wasEarlyDispatched: true,
  });
  const result = validateBackupDocument(createBackupDocument(data, "2.1.41"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.settings.hustleStatsSource, "dominos");
  assert.equal(result.data.settings.dominosReferenceRadiusMetres, 95);
  assert.equal(result.data.shifts[0].activities?.find((item) => item.id === "run-1")?.dominosStoreExitAt, "2026-08-24T17:03:00.000Z");
  assert.equal(result.data.shifts[0].activities?.find((item) => item.id === "run-1")?.earlyDispatchGapSeconds, 120);
  assert.equal(result.data.shifts[0].activities?.find((item) => item.id === "run-1")?.wasEarlyDispatched, true);
});

test("a pending early-dispatch timer survives backup without creating a run", () => {
  const data = emptyData();
  const shift = repairShiftActivityIds(createShift(data.settings, new Date("2026-08-30T18:00:00.000Z")));
  shift.pendingEarlyDispatch = {
    dominosDispatchStartedAt: "2026-08-30T18:42:10.000Z",
    dominosGeofenceExitedAt: null,
    dominosGeofenceLatitude: 53.56822592818352,
    dominosGeofenceLongitude: -2.887807336362812,
    dominosGeofenceRadius: 75,
  };
  data.shifts = [shift];
  const result = validateBackupDocument(createBackupDocument(data, "2.1.96"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.shifts[0].pendingEarlyDispatch?.dominosDispatchStartedAt, "2026-08-30T18:42:10.000Z");
  assert.equal(result.data.shifts[0].deliveries.length, 0);
  assert.equal(result.data.shifts[0].activities?.filter((item) => item.type === "single_delivery" || item.type === "double_delivery").length, 0);
});

test("old backups without Domino's fields remain valid and default to Real Hustle", () => {
  const data = dataWithDelivery();
  delete data.settings.hustleStatsSource;
  const result = validateBackupDocument(createBackupDocument(data, "2.1.40"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.settings.hustleStatsSource, "real");
  assert.equal(result.data.shifts[0].activities?.find((item) => item.id === "run-1")?.dominosStoreExitAt, undefined);
});

test("backup validation rejects impossible calendar dates", () => {
  const data = dataWithDelivery();
  data.payrollSchedules = [{ monthKey: "2026-02", periodStartDate: "2026-02-01", cutoffDate: "2026-02-31", paydayDate: "2026-03-03", paidAt: null }];
  const result = validateBackupDocument(createBackupDocument(data, "2.1.42"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /payroll|schedule|date/i);
});

test("backup validation rejects impossible full timestamps", () => {
  for (const date of ["2026-02-31T10:00:00.000Z", "February 31, 2026 10:00 UTC", "02/31/2026 10:00 UTC"]) {
    const data = dataWithDelivery();
    data.payments = [{ id: "impossible-payment-date", date, amountPence: 100, expectedAmountPence: 100, shiftIds: [data.shifts[0].id], reversedAt: null }];
    const result = validateBackupDocument(createBackupDocument(data, "2.1.42"));
    assert.equal(result.ok, false, `accepted impossible timestamp ${date}`);
    if (!result.ok) assert.match(result.message, /payment|date|malformed/i);
  }
});

test("backup validation rejects overlapping breaks that would double-deduct pay", () => {
  const data = dataWithDelivery();
  data.shifts[0].breaks = [
    { id: "break-one", start: "2026-08-24T18:00:00.000Z", end: "2026-08-24T19:00:00.000Z" },
    { id: "break-two", start: "2026-08-24T18:30:00.000Z", end: "2026-08-24T19:30:00.000Z" },
  ];
  const result = validateBackupDocument(createBackupDocument(data, "2.1.42"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /break.*overlap/i);
});

test("backup validation rejects reversed shift and activity times", () => {
  const reversedShift = dataWithDelivery();
  reversedShift.shifts[0].clockOut = "2026-08-24T15:59:00.000Z";
  assert.equal(validateBackupDocument(createBackupDocument(reversedShift, "2.1.42")).ok, false);

  const reversedActivity = dataWithDelivery();
  const run = reversedActivity.shifts[0].activities?.find((activity) => activity.id === "run-1");
  assert.ok(run);
  run.end = "2026-08-24T16:59:00.000Z";
  assert.equal(validateBackupDocument(createBackupDocument(reversedActivity, "2.1.42")).ok, false);
});

test("backup validation rejects an odometer reading that runs backwards", () => {
  const data = dataWithDelivery();
  data.shifts[0].mileage = { method: "odometer", startTenths: 125_000, endTenths: 124_999, directTenths: null };
  const result = validateBackupDocument(createBackupDocument(data, "2.1.42"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /odometer|mileage/i);
});

test("backup validation rejects reversed, duplicate and overlapping payroll relationships", () => {
  const reversed = dataWithDelivery();
  reversed.payrollSchedules = [{ monthKey: "2026-08", periodStartDate: "2026-08-24", cutoffDate: "2026-08-23", paydayDate: "2026-09-01", paidAt: null }];
  assert.equal(validateBackupDocument(createBackupDocument(reversed, "2.1.42")).ok, false);

  const paydayBeforeCutoff = dataWithDelivery();
  paydayBeforeCutoff.payrollSchedules = [{ monthKey: "2026-08", periodStartDate: "2026-07-27", cutoffDate: "2026-08-23", paydayDate: "2026-08-22", paidAt: null }];
  assert.equal(validateBackupDocument(createBackupDocument(paydayBeforeCutoff, "2.1.42")).ok, false);

  const duplicate = dataWithDelivery();
  duplicate.payrollSchedules = [
    { monthKey: "2026-08", periodStartDate: "2026-07-27", cutoffDate: "2026-08-23", paydayDate: "2026-09-01", paidAt: null },
    { monthKey: "2026-09", periodStartDate: "2026-07-27", cutoffDate: "2026-08-23", paydayDate: "2026-09-01", paidAt: null },
  ];
  assert.equal(validateBackupDocument(createBackupDocument(duplicate, "2.1.42")).ok, false);

  const overlapping = dataWithDelivery();
  overlapping.payrollSchedules = [
    { monthKey: "2026-08", periodStartDate: "2026-07-27", cutoffDate: "2026-08-23", paydayDate: "2026-09-01", paidAt: null },
    { monthKey: "2026-09", periodStartDate: "2026-08-20", cutoffDate: "2026-09-20", paydayDate: "2026-09-29", paidAt: null },
  ];
  assert.equal(validateBackupDocument(createBackupDocument(overlapping, "2.1.42")).ok, false);
});

test("minute-precision History boundaries do not block a valid historical activity backup", () => {
  const data = dataWithDelivery();
  data.shifts[0].activities?.push({
    id: "legacy-quick-task-at-clock-out",
    shiftId: data.shifts[0].id,
    type: "other_task",
    start: "2026-08-24T21:58:30.000Z",
    end: "2026-08-24T22:00:42.000Z",
    taskName: "Quick tasks",
    tracked: true,
    segments: [{ start: "2026-08-24T21:58:30.000Z", end: "2026-08-24T22:00:42.000Z" }],
  });

  const backup = createBackupDocument(data, "2.1.43");
  const result = validateBackupDocument(backup);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(
    result.data.shifts[0].activities?.find((activity) => activity.id === "legacy-quick-task-at-clock-out")?.end,
    "2026-08-24T22:00:42.000Z",
  );
});

test("activity containment still rejects records a full minute outside a shift", () => {
  const data = dataWithDelivery();
  data.shifts[0].activities?.push({
    id: "invalid-task-after-shift",
    shiftId: data.shifts[0].id,
    type: "other_task",
    start: "2026-08-24T21:59:30.000Z",
    end: "2026-08-24T22:01:00.000Z",
    taskName: "Invalid task",
    tracked: true,
  });

  const result = validateBackupDocument(createBackupDocument(data, "2.1.43"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /activity falls outside its shift/i);
});

test("minute-precision compatibility does not relax starts, breaks or delivery events", () => {
  const earlyActivity = dataWithDelivery();
  earlyActivity.shifts[0].activities?.push({
    id: "invalid-task-before-shift",
    shiftId: earlyActivity.shifts[0].id,
    type: "other_task",
    start: "2026-08-24T15:59:42.000Z",
    end: "2026-08-24T16:00:30.000Z",
    taskName: "Invalid task",
    tracked: true,
  });
  assert.equal(validateBackupDocument(createBackupDocument(earlyActivity, "2.1.43")).ok, false);

  const lateBreak = dataWithDelivery();
  lateBreak.shifts[0].breaks = [{ id: "late-break", start: "2026-08-24T21:59:00.000Z", end: "2026-08-24T22:00:42.000Z" }];
  assert.equal(validateBackupDocument(createBackupDocument(lateBreak, "2.1.43")).ok, false);

  const lateDelivery = dataWithDelivery();
  lateDelivery.shifts[0].deliveries[0].timestamp = "2026-08-24T22:00:42.000Z";
  assert.equal(validateBackupDocument(createBackupDocument(lateDelivery, "2.1.43")).ok, false);
});

test("a narrowly late legacy geofence marker remains backup-compatible", () => {
  const compatible = dataWithDelivery();
  compatible.shifts[0].clockOut = "2026-08-24T22:00:42.100Z";
  compatible.shifts[0].activities?.push({
    id: "late-store-entry",
    shiftId: compatible.shifts[0].id,
    type: "store_entry",
    start: "2026-08-24T22:00:44.000Z",
    end: "2026-08-24T22:00:44.000Z",
    deliveryEventId: "delivery-1",
    tracked: false,
  });
  const compatibleResult = validateBackupDocument(createBackupDocument(compatible, "2.1.43"));
  assert.equal(compatibleResult.ok, true);
  if (compatibleResult.ok) {
    assert.equal(compatibleResult.data.shifts[0].activities?.find((activity) => activity.id === "late-store-entry")?.end, "2026-08-24T22:00:44.000Z");
  }

  const tooLate = structuredClone(compatible);
  const marker = tooLate.shifts[0].activities?.find((activity) => activity.id === "late-store-entry");
  assert.ok(marker);
  marker.start = "2026-08-24T22:00:48.000Z";
  marker.end = marker.start;
  assert.equal(validateBackupDocument(createBackupDocument(tooLate, "2.1.43")).ok, false);
});

test("backup count validation compares the exported document before compatibility migration", () => {
  const data = emptyData();
  const legacyActiveShift = repairShiftActivityIds(createShift(data.settings, new Date("2026-08-24T16:00:00.000Z")));
  delete legacyActiveShift.taskSnapshot;
  data.shifts = [legacyActiveShift];

  const backup = createBackupDocument(data, "2.1.43");
  assert.equal(backup.recordCounts.cleaningTasks, 0);
  const result = validateBackupDocument(backup);

  assert.equal(result.ok, true);
  if (result.ok) assert.ok(result.data.shifts[0].taskSnapshot?.length);
});

test("malformed wrapped backup records are rejected without throwing during count verification", () => {
  const backup = createBackupDocument(dataWithDelivery(), "2.1.43");
  (backup.data.shifts[0].activities as unknown[]).push(null);

  assert.doesNotThrow(() => validateBackupDocument(backup));
  assert.equal(validateBackupDocument(backup).ok, false);
});

test("present malformed legacy collections are rejected before migration can replace them", () => {
  const cases: Array<(value: AppData) => void> = [
    (value) => { (value.shifts[0] as unknown as Record<string, unknown>).activities = "not-a-list"; },
    (value) => { (value.shifts[0] as unknown as Record<string, unknown>).taskSnapshot = "not-a-list"; },
    (value) => { (value as unknown as Record<string, unknown>).payrollSchedules = "not-a-list"; },
    (value) => { (value as unknown as Record<string, unknown>).cleaningRota = "not-a-list"; },
    (value) => { (value as unknown as Record<string, unknown>).preparationRota = "not-a-list"; },
  ];

  for (const corrupt of cases) {
    const legacy = dataWithDelivery();
    corrupt(legacy);
    const result = validateBackupDocument(legacy);
    assert.equal(result.ok, false);
  }
});

test("completed shifts reject open activities, task segments and breaks while active shifts remain valid", () => {
  const openActivity = dataWithDelivery();
  openActivity.shifts[0].activities?.push({
    id: "open-after-completion",
    shiftId: openActivity.shifts[0].id,
    type: "other_task",
    start: "2026-08-24T21:59:00.000Z",
    end: null,
    taskName: "Still running",
    tracked: true,
  });
  assert.equal(validateBackupDocument(createBackupDocument(openActivity, "2.1.43")).ok, false);

  const openActivitySegment = dataWithDelivery();
  openActivitySegment.shifts[0].activities?.push({
    id: "closed-activity-open-segment",
    shiftId: openActivitySegment.shifts[0].id,
    type: "other_task",
    start: "2026-08-24T21:58:00.000Z",
    end: "2026-08-24T21:59:00.000Z",
    taskName: "Segment still running",
    tracked: true,
    segments: [{ start: "2026-08-24T21:58:00.000Z", end: null }],
  });
  assert.equal(validateBackupDocument(createBackupDocument(openActivitySegment, "2.1.43")).ok, false);

  const openTask = dataWithDelivery();
  const task = openTask.shifts[0].taskSnapshot?.[0];
  assert.ok(task);
  task.status = "active";
  task.segments = [{ start: "2026-08-24T21:59:00.000Z", end: null }];
  assert.equal(validateBackupDocument(createBackupDocument(openTask, "2.1.43")).ok, false);

  const openBreak = dataWithDelivery();
  openBreak.shifts[0].breaks = [{ id: "open-break", start: "2026-08-24T21:59:00.000Z", end: null }];
  assert.equal(validateBackupDocument(createBackupDocument(openBreak, "2.1.43")).ok, false);

  const active = emptyData();
  const activeShift = repairShiftActivityIds(createShift(active.settings, new Date("2026-08-24T16:00:00.000Z")));
  activeShift.activities?.push({ id: "running-work", shiftId: activeShift.id, type: "other_task", start: "2026-08-24T17:00:00.000Z", end: null, taskName: "Running", tracked: true });
  active.shifts = [activeShift];
  assert.equal(validateBackupDocument(createBackupDocument(active, "2.1.43")).ok, true);
});


test("backup validation rejects malformed delivery collections without throwing or replacing saved data", () => {
  const current = dataWithDelivery();
  const before = structuredClone(current);
  for (const deliveries of [null, {}, "broken"]) {
    const malformed = structuredClone(current) as unknown as { shifts: { deliveries: unknown }[] };
    malformed.shifts[0].deliveries = deliveries;
    const result = validateAppDataStructure(malformed);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /deliveries must be a list/);
    assert.deepEqual(applyValidatedBackup(current, result, true), before);
  }
});
