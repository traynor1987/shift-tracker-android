import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import * as domain from "../lib/domain.ts";
import { createBackupDocument, validateBackupDocument } from "../lib/backup.ts";
import { buildShiftReportBody } from "../lib/pdfReports.ts";
import { buildFrozenSharedReport } from "../lib/sharedReports.ts";
import { LEGACY_PRIMARY_KEY, loadIndexedDbData, resetIndexedDbSessionForTests } from "../lib/indexedDbStorage.ts";

const stamp = "2026-09-28T16:00:00.000Z";

function fixture() {
  const data = domain.emptyData();
  const shift = domain.repairShiftActivityIds(domain.createShift(data.settings, new Date("2026-09-28T12:00:00.000Z"), undefined, "open", data.cleaningRota, data.preparationRota));
  const tasks = shift.taskSnapshot!.slice(0, 4);
  shift.taskSnapshot = tasks;
  tasks[0].status = "complete";
  tasks[0].completedAt = "2026-09-28T15:00:00.000Z";
  tasks[1].unableReason = "equipment_or_safety";
  tasks[1].unableManager = "Manager";
  tasks[1].unableAt = "2026-09-28T15:30:00.000Z";
  tasks[2].notRequired = true;
  tasks[2].notRequiredAt = "2026-09-28T15:40:00.000Z";
  data.shifts = [shift];
  return { data, shift, tasks };
}

test("bulk management block changes only applicable incomplete tasks", () => {
  assert.equal(typeof (domain as Record<string, unknown>).markRemainingTasksManagementBlocked, "function");
  const { shift, tasks } = fixture();
  const result = domain.markRemainingTasksManagementBlocked(shift, stamp, "bulk-1");
  assert.equal(result.count, 1);
  assert.equal(tasks[0].status, "complete");
  assert.equal(tasks[0].completedAt, "2026-09-28T15:00:00.000Z");
  assert.equal(tasks[1].managementBlockedAt, undefined);
  assert.equal(tasks[2].managementBlockedAt, undefined);
  assert.equal(tasks[3].managementBlockedAt, stamp);
  assert.equal(tasks[3].completedAt, null);
  assert.notEqual(tasks[3].status, "complete");
});

test("clearing bulk status preserves genuine completions and unrelated outcomes", () => {
  assert.equal(typeof (domain as Record<string, unknown>).clearManagementBlockedTasks, "function");
  const { shift, tasks } = fixture();
  domain.markRemainingTasksManagementBlocked(shift, stamp, "bulk-1");
  tasks[3].status = "complete";
  tasks[3].completedAt = "2026-09-28T16:42:00.000Z";
  tasks[3].managementBlockedAt = null;
  tasks[3].managementBlockedBatchId = null;
  const cleared = domain.clearManagementBlockedTasks(shift);
  assert.equal(cleared, 0);
  assert.equal(tasks[0].status, "complete");
  assert.equal(tasks[3].status, "complete");
  assert.equal(tasks[3].completedAt, "2026-09-28T16:42:00.000Z");
  assert.equal(tasks[1].unableReason, "equipment_or_safety");
});

test("a stale bulk boundary rejects atomically without changing any task", () => {
  const { shift, tasks } = fixture();
  tasks[3].status = "active";
  tasks[3].segments = [{ start: "2026-09-28T16:01:00.000Z", end: null }];
  const before = structuredClone(shift.taskSnapshot);
  assert.throws(
    () => domain.markRemainingTasksManagementBlocked(shift, stamp, "bulk-stale"),
    /earlier than an active task start/i,
  );
  assert.deepEqual(shift.taskSnapshot, before);
});

test("reporting separates completed, management blocked and missed tasks", () => {
  assert.equal(typeof (domain as Record<string, unknown>).taskOutcomeSummary, "function");
  const { shift, tasks } = fixture();
  tasks[1].unableReason = null; tasks[1].unableManager = null; tasks[1].unableAt = null;
  tasks[2].notRequired = false; tasks[2].notRequiredAt = null;
  domain.markRemainingTasksManagementBlocked(shift, stamp, "bulk-1");
  tasks[1].managementBlockedAt = null; tasks[1].managementBlockedBatchId = null;
  const summary = domain.taskOutcomeSummary(shift);
  assert.deepEqual({ completed: summary.completed, managementBlocked: summary.managementBlocked, missed: summary.missed }, { completed: 1, managementBlocked: 2, missed: 1 });
  const report = buildShiftReportBody(shift);
  assert.match(report, /Management blocked/);
  assert.match(report, /Completed[^<]*<\/small><strong>1/);
  assert.match(report, /Missed[^<]*<\/small><strong>1/);
  const shared = buildFrozenSharedReport({ ...domain.emptyData(), shifts: [shift] }, [shift], "none");
  assert.match(shared.shifts[0].tasks, /2 management blocked/);
  assert.equal(shared.shifts[0].taskOutcomes.filter((item) => item.endsWith("management blocked")).length, 2);
  assert.match(shared.highlights.find((item) => item.label === "Task completion")?.detail ?? "", /excluded from rate/);
});

test("management-blocked tasks survive persistence without inventing Blocked Time", async () => {
  const { data, shift } = fixture();
  domain.markRemainingTasksManagementBlocked(shift, stamp, "bulk-1");
  assert.equal((shift.activities ?? []).some((item) => item.type === "blocked_time"), false);
  assert.equal(validateBackupDocument(createBackupDocument(data, "2.1.217")).ok, true);
  const factory = new IDBFactory();
  const values = new Map<string, string>();
  const localStorage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), removeItem: (key: string) => void values.delete(key) };
  localStorage.setItem(LEGACY_PRIMARY_KEY, JSON.stringify(data));
  const databaseName = "ShiftTrackerManagementBlocked";
  const loaded = await loadIndexedDbData({ factory, localStorage, databaseName });
  assert.equal(loaded.status, "migrated");
  if (loaded.status === "migrated") assert.equal(loaded.data.shifts[0].taskSnapshot![3].managementBlockedBatchId, "bulk-1");
  resetIndexedDbSessionForTests(databaseName);
});

test("legacy task history defaults to no management-blocked outcomes", () => {
  const { data, shift } = fixture();
  const summary = domain.taskOutcomeSummary(shift);
  assert.equal(summary?.managementBlocked, 0);
  assert.equal(validateBackupDocument(createBackupDocument(data, "2.1.217")).ok, true);
});
