import test from "node:test";
import assert from "node:assert/strict";
import { createShift, emptyData, type ActivityRecord, type AppData } from "../lib/domain.ts";
import { nativeStoppedStateClearsTransferGuard, nativeStoppedStateMatchesDelivery, operationalOpenDelivery, planRestoreTracking } from "../lib/restoreTracking.ts";

function delivery(id: string, shiftId: string, start: string, end: string | null = null, type: "single_delivery" | "double_delivery" = "single_delivery"): ActivityRecord {
  return { id, shiftId, type, start, end };
}

function dataWithOpenDelivery(id: string): AppData {
  const data = emptyData();
  const shift = createShift(data.settings, new Date("2026-08-23T16:00:00.000Z"));
  shift.id = `shift-${id}`;
  shift.activities = [delivery(id, shift.id, "2026-08-23T17:00:00.000Z")];
  data.shifts = [shift];
  return data;
}

test("full restore from delivery A to B stops A and starts B", () => {
  const plan = planRestoreTracking(dataWithOpenDelivery("delivery-a"), dataWithOpenDelivery("delivery-b"), true);

  assert.equal(plan.currentDelivery?.id, "delivery-a");
  assert.equal(plan.restoredDelivery?.id, "delivery-b");
  assert.equal(plan.changedDelivery, true);
  assert.equal(plan.stopCurrent, true);
  assert.equal(plan.startRestored, true);
});

test("full restore with no active delivery stops tracking without starting another session", () => {
  const plan = planRestoreTracking(dataWithOpenDelivery("delivery-a"), emptyData(), true);

  assert.equal(plan.currentDelivery?.id, "delivery-a");
  assert.equal(plan.restoredDelivery, null);
  assert.equal(plan.changedDelivery, true);
  assert.equal(plan.stopCurrent, true);
  assert.equal(plan.startRestored, false);
});

test("restoring the same delivery id leaves an active native session running", () => {
  const plan = planRestoreTracking(dataWithOpenDelivery("delivery-a"), dataWithOpenDelivery("delivery-a"), true);

  assert.equal(plan.currentDelivery?.id, "delivery-a");
  assert.equal(plan.restoredDelivery?.id, "delivery-a");
  assert.equal(plan.changedDelivery, false);
  assert.equal(plan.stopCurrent, false);
  assert.equal(plan.startRestored, false);
});

test("operational delivery selection ignores completed history and uses the last open run in the active shift", () => {
  const data = emptyData();
  const completed = createShift(data.settings, new Date("2026-08-22T12:00:00.000Z"));
  completed.id = "completed-shift";
  completed.status = "completed";
  completed.clockOut = "2026-08-22T18:00:00.000Z";
  completed.activities = [delivery("stale-history-run", completed.id, "2026-08-22T13:00:00.000Z")];

  const active = createShift(data.settings, new Date("2026-08-23T16:00:00.000Z"));
  active.id = "active-shift";
  active.activities = [
    delivery("finished-run", active.id, "2026-08-23T16:30:00.000Z", "2026-08-23T16:50:00.000Z"),
    delivery("open-single", active.id, "2026-08-23T17:00:00.000Z"),
    { id: "open-task", shiftId: active.id, type: "other_task", start: "2026-08-23T17:05:00.000Z", end: null },
    delivery("open-double", active.id, "2026-08-23T17:10:00.000Z", null, "double_delivery"),
  ];
  data.shifts = [completed, active];

  assert.equal(operationalOpenDelivery(data)?.id, "open-double");
});

test("a late stop acknowledgement cannot clear a restored delivery's native state or return guard", () => {
  assert.equal(nativeStoppedStateMatchesDelivery("delivery-b", "delivery-a"), false);
  assert.equal(nativeStoppedStateClearsTransferGuard("delivery-b", "delivery-a"), false);
  assert.equal(nativeStoppedStateMatchesDelivery("delivery-b"), false, "an unowned stop cannot tear down a live restored delivery");
  assert.equal(nativeStoppedStateClearsTransferGuard("delivery-b"), false);
  assert.equal(nativeStoppedStateMatchesDelivery("delivery-b", "delivery-b"), true);
  assert.equal(nativeStoppedStateClearsTransferGuard("delivery-b", "delivery-b"), true);
  assert.equal(nativeStoppedStateMatchesDelivery(null, "delivery-a"), true, "a stop is authoritative once no delivery is open");
});
