import assert from "node:assert/strict";
import test from "node:test";
import { trackerAttention } from "../lib/trackerAttention.ts";
import { createShift, emptyData } from "../lib/domain.ts";

test("attention summary reuses task outcomes and payroll tolerance without mutating saved data", () => {
  const data = emptyData();
  data.settings.includeBetaData = true;
  const shift = createShift(data.settings, new Date("2026-09-29T08:00:00Z"));
  shift.status = "completed"; shift.clockOut = "2026-09-29T15:00:00Z";
  for (const task of shift.taskSnapshot ?? []) task.managementBlockedAt = shift.clockOut;
  data.shifts.push(shift);
  data.payrollSchedules = [{ monthKey: "2026-09", cutoffDate: "2026-09-30", paydayDate: "2026-10-07", periodStartDate: "2026-09-01", paidAt: null,
    payslip: { grossPayPence: 0, paidMs: 0, recordedAt: "2026-09-30T10:00:00Z", updatedAt: "2026-09-30T10:00:00Z" } }];
  const before = JSON.stringify(data);
  const result = trackerAttention(data);
  assert.deepEqual(result.reviewShiftIds, [shift.id]);
  assert.equal(result.payrollCount, 1);
  assert.equal(JSON.stringify(data), before);
});

test("a matching payslip with a pre-tracker adjustment is not a discrepancy", () => {
  const data = emptyData();
  data.payrollSchedules = [{ monthKey: "2026-09", cutoffDate: "2026-09-30", paydayDate: "2026-10-07", periodStartDate: "2026-09-01", paidAt: null,
    payslip: { grossPayPence: 10000, paidMs: 3600000, recordedAt: "2026-09-30T10:00:00Z", updatedAt: "2026-09-30T10:00:00Z", preTrackerAdjustment: { grossPayPence: 10000, paidMs: 3600000 } } }];
  assert.equal(trackerAttention(data).payrollCount, 0);
});
