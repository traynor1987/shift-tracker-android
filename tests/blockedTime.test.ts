import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import * as domain from "../lib/domain.ts";
import {
  activeTimedActivity,
  createShift,
  emptyData,
  paidMilliseconds,
  repairShiftActivityIds,
  trackedActivityTotals,
  type ActivityRecord,
  type AppData,
  type Shift,
} from "../lib/domain.ts";
import { createBackupDocument, validateBackupDocument } from "../lib/backup.ts";
import { buildShiftReportBody } from "../lib/pdfReports.ts";
import {
  LEGACY_PRIMARY_KEY,
  loadIndexedDbData,
  resetIndexedDbSessionForTests,
  saveIndexedDbData,
} from "../lib/indexedDbStorage.ts";

const start = "2026-09-28T12:00:00.000Z";
const blockedStart = "2026-09-28T12:10:00.000Z";
const blockedEnd = "2026-09-28T12:30:00.000Z";
const shiftEnd = "2026-09-28T13:00:00.000Z";

function blockedActivity(shiftId: string, end: string | null = blockedEnd): ActivityRecord {
  return {
    id: "blocked-1",
    shiftId,
    type: "blocked_time" as ActivityRecord["type"],
    start: blockedStart,
    end,
    tracked: true,
    blockedReason: "idiot_in_charge",
    blockedNote: "Cleaning was stopped by the manager.",
  } as ActivityRecord;
}

function blockedShift(open = false) {
  const data = emptyData();
  const shift = repairShiftActivityIds(createShift(data.settings, new Date(start)));
  shift.activities ??= [];
  shift.activities.push(blockedActivity(shift.id, open ? null : blockedEnd));
  if (!open) {
    shift.status = "completed";
    shift.clockOut = shiftEnd;
    shift.activities.push({ id: "clock-out", shiftId: shift.id, type: "clock_out", start: shiftEnd, end: shiftEnd, tracked: false });
  }
  data.shifts = [shift];
  return { data, shift };
}

test("blocked paid time is separate from productive and unallocated time", () => {
  const { shift } = blockedShift();
  const totals = trackedActivityTotals(shift, new Date(shiftEnd)) as ReturnType<typeof trackedActivityTotals> & { blockedMs: number };
  assert.equal(paidMilliseconds(shift, new Date(shiftEnd)), 60 * 60_000);
  assert.equal(totals.blockedMs, 20 * 60_000);
  assert.equal(totals.cleaningMs, 0);
  assert.equal(totals.preparationMs, 0);
  assert.equal(totals.otherTaskMs, 0);
  assert.equal(totals.untrackedPaidMs, 40 * 60_000);
});

test("an open blocked record reconstructs the live state from its saved timestamp", () => {
  const { shift } = blockedShift(true);
  assert.deepEqual(activeTimedActivity(shift), {
    kind: "blocked",
    id: "blocked-1",
    name: "Idiot in charge",
    start: blockedStart,
  });
});

test("backup validation accepts a valid blocked record and rejects malformed boundaries and reasons", () => {
  const { data } = blockedShift();
  assert.equal(validateBackupDocument(createBackupDocument(data, "2.1.217")).ok, true);

  const reversed = structuredClone(data);
  reversed.shifts[0].activities!.find((item) => item.id === "blocked-1")!.end = "2026-09-28T12:09:59.000Z";
  assert.equal(validateBackupDocument(createBackupDocument(reversed, "2.1.217")).ok, false);

  const missingReason = structuredClone(data) as AppData;
  delete (missingReason.shifts[0].activities!.find((item) => item.id === "blocked-1") as ActivityRecord & { blockedReason?: string }).blockedReason;
  assert.equal(validateBackupDocument(createBackupDocument(missingReason, "2.1.217")).ok, false);
});

test("professional shift report translates the private reason label", () => {
  const { shift } = blockedShift();
  const report = buildShiftReportBody(shift);
  assert.match(report, /Blocked time/);
  assert.match(report, /Management blocked/);
  assert.match(report, /20m/);
  assert.doesNotMatch(report, /Idiot in charge/i);
});

test("historic shifts without blocked records remain compatible", () => {
  const data = emptyData();
  const shift = repairShiftActivityIds(createShift(data.settings, new Date(start)));
  shift.status = "completed";
  shift.clockOut = shiftEnd;
  shift.activities!.push({ id: "clock-out", shiftId: shift.id, type: "clock_out", start: shiftEnd, end: shiftEnd, tracked: false });
  data.shifts = [shift];
  const totals = trackedActivityTotals(shift, new Date(shiftEnd)) as ReturnType<typeof trackedActivityTotals> & { blockedMs: number };
  assert.equal(totals.blockedMs, 0);
  assert.equal(validateBackupDocument(createBackupDocument(data, "2.1.217")).ok, true);
});

test("blocked timestamp and reason survive IndexedDB save and process-style reload", async () => {
  const { data } = blockedShift(true);
  const factory = new IDBFactory();
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
  localStorage.setItem(LEGACY_PRIMARY_KEY, JSON.stringify(data));
  const databaseName = "ShiftTrackerBlockedTime";
  const options = { factory, localStorage, databaseName };
  assert.equal((await loadIndexedDbData(options)).status, "migrated");
  await saveIndexedDbData(data, options);
  resetIndexedDbSessionForTests(databaseName);
  const loaded = await loadIndexedDbData(options);
  assert.equal(loaded.status, "loaded");
  if (loaded.status !== "loaded") return;
  const blocked = loaded.data.shifts[0].activities!.find((item) => item.id === "blocked-1") as ActivityRecord & { blockedReason?: string };
  assert.equal(blocked.start, blockedStart);
  assert.equal(blocked.end, null);
  assert.equal(blocked.blockedReason, "idiot_in_charge");
});

test("starting blocked time pauses active cleaning at the same boundary and records zero further cleaning", () => {
  assert.equal(typeof (domain as Record<string, unknown>).startBlockedTime, "function");
  const { shift } = blockedShift(true);
  shift.activities = shift.activities!.filter((item) => item.type !== "blocked_time");
  const task = shift.taskSnapshot![0];
  task.status = "active";
  task.segments = [{ start: blockedStart, end: null }];
  shift.activities!.push({ id: "cleaning-1", shiftId: shift.id, type: "cleaning_task", start: blockedStart, end: null, taskId: task.id, taskName: task.name, tracked: true, segments: structuredClone(task.segments) });

  const result = (domain as unknown as { startBlockedTime: (shift: Shift, reason: string, note: string, at: string) => { ok: boolean } }).startBlockedTime(shift, "idiot_in_charge", "Stopped cleaning", blockedEnd);

  assert.equal(result.ok, true);
  assert.equal(task.status, "paused");
  assert.equal(task.segments[0].end, blockedEnd);
  assert.equal(shift.pendingResumeTaskId, task.id);
  assert.equal(shift.activities!.find((item) => item.id === "cleaning-1")!.end, blockedEnd);
  assert.equal(activeTimedActivity(shift)?.kind, "blocked");
});

test("ending blocked time is idempotent and never writes an end before its start", () => {
  assert.equal(typeof (domain as Record<string, unknown>).endBlockedTime, "function");
  const { shift } = blockedShift(true);
  const api = domain as unknown as { endBlockedTime: (shift: Shift, at: string) => boolean };
  assert.throws(() => api.endBlockedTime(shift, "2026-09-28T12:09:59.000Z"), /stale|earlier/i);
  assert.equal(shift.activities!.find((item) => item.id === "blocked-1")!.end, null);
  assert.equal(api.endBlockedTime(shift, blockedEnd), true);
  assert.equal(api.endBlockedTime(shift, "2026-09-28T12:31:00.000Z"), false);
  assert.equal(shift.activities!.find((item) => item.id === "blocked-1")!.end, blockedEnd);
});

test("a productive or delivery transition can atomically resolve blocked time without overlap", () => {
  assert.equal(typeof (domain as Record<string, unknown>).endBlockedTime, "function");
  const { shift } = blockedShift(true);
  const api = domain as unknown as { endBlockedTime: (shift: Shift, at: string) => boolean };
  assert.equal(api.endBlockedTime(shift, blockedEnd), true);
  shift.activities!.push({ id: "delivery-1", shiftId: shift.id, type: "single_delivery", start: blockedEnd, end: null, tracked: true });
  assert.equal(activeTimedActivity(shift)?.kind, "delivery");
  assert.equal(shift.activities!.find((item) => item.id === "blocked-1")!.end, blockedEnd);
});

test("a delivery interruption persists Blocked Time context and resumes it at the real return boundary", async () => {
  const { data, shift } = blockedShift(true);
  const api = domain as unknown as {
    pauseBlockedTimeForDelivery: (shift: Shift, at: string) => boolean;
    resumePendingBlockedTime: (shift: Shift, at: string) => { ok: boolean };
  };

  assert.equal(api.pauseBlockedTimeForDelivery(shift, blockedEnd), true);
  assert.deepEqual(shift.pendingResumeBlockedTime, {
    reason: "idiot_in_charge",
    note: "Cleaning was stopped by the manager.",
  });
  assert.equal(shift.activities!.find((item) => item.id === "blocked-1")!.end, blockedEnd);

  const factory = new IDBFactory();
  const databaseName = "ShiftTrackerPendingBlockedResume";
  const options = { factory, databaseName, localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
  await loadIndexedDbData(options);
  await saveIndexedDbData(data, options);
  resetIndexedDbSessionForTests(databaseName);
  const loaded = await loadIndexedDbData(options);
  assert.equal(loaded.status, "loaded");
  if (loaded.status !== "loaded") return;
  const restored = loaded.data.shifts[0];
  assert.deepEqual(restored.pendingResumeBlockedTime, shift.pendingResumeBlockedTime);
  assert.equal(validateBackupDocument(createBackupDocument(loaded.data, "2.1.219")).ok, true);

  const resumedAt = "2026-09-28T12:35:00.000Z";
  assert.equal(api.resumePendingBlockedTime(restored, resumedAt).ok, true);
  const resumed = restored.activities!.findLast((item) => item.type === "blocked_time" && !item.end)!;
  assert.equal(resumed.start, resumedAt);
  assert.equal(resumed.blockedReason, "idiot_in_charge");
  assert.equal(resumed.blockedNote, "Cleaning was stopped by the manager.");
  assert.equal(restored.pendingResumeBlockedTime, null);
});

test("dismissing a pending Blocked Time continuation does not alter recorded history", () => {
  const { shift } = blockedShift(true);
  const api = domain as unknown as {
    pauseBlockedTimeForDelivery: (shift: Shift, at: string) => boolean;
    dismissPendingBlockedTime: (shift: Shift) => boolean;
  };
  assert.equal(api.pauseBlockedTimeForDelivery(shift, blockedEnd), true);
  assert.equal(api.dismissPendingBlockedTime(shift), true);
  assert.equal(shift.pendingResumeBlockedTime, null);
  assert.equal(shift.activities!.find((item) => item.id === "blocked-1")!.end, blockedEnd);
});
