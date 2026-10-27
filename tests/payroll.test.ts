import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createShift, DEFAULT_SETTINGS, periodTotals, type PayrollSchedule } from "../lib/domain.ts";
import {
  calendarDayDifference,
  cutoffCountdownLabel,
  nextPayrollSchedule,
  payrollPeriodDateRange,
  payrollScheduleKey,
  resolvePayrollSchedules,
} from "../lib/payroll.ts";

const julyPeriod: PayrollSchedule = {
  monthKey: "2026-08",
  periodStartDate: "2026-07-27",
  cutoffDate: "2026-08-23",
  paydayDate: "2026-09-01",
  isFiveWeekPay: false,
  paidAt: null,
};

const localDay = (year: number, monthIndex: number, day: number, hour = 12) => new Date(year, monthIndex, day, hour);

test("cut-off countdown uses local calendar days with correct zero and singular wording", () => {
  assert.equal(cutoffCountdownLabel("2026-08-23", localDay(2026, 7, 22, 0)), "1 day until cut-off");
  assert.equal(cutoffCountdownLabel("2026-08-23", localDay(2026, 7, 22, 23)), "1 day until cut-off");
  assert.equal(cutoffCountdownLabel("2026-08-23", localDay(2026, 7, 23, 0)), "Cut-off today");
  assert.equal(cutoffCountdownLabel("2026-08-23", localDay(2026, 7, 23, 23)), "Cut-off today");
  assert.equal(cutoffCountdownLabel("2026-08-23", localDay(2026, 7, 24)), null);
  assert.notEqual(cutoffCountdownLabel("2026-08-23", localDay(2026, 7, 22)), "1 days until cut-off");
  assert.notEqual(cutoffCountdownLabel("2026-08-23", localDay(2026, 7, 23)), "0 days until cut-off");
});

test("calendar-day maths remains one day across UK daylight-saving boundaries", () => {
  assert.equal(calendarDayDifference("2026-03-28", "2026-03-29"), 1);
  assert.equal(calendarDayDifference("2026-10-24", "2026-10-25"), 1);
});

test("the configured four-week cycle derives the next period and payday", () => {
  assert.deepEqual(nextPayrollSchedule(julyPeriod), {
    monthKey: "2026-09",
    periodStartDate: "2026-08-24",
    cutoffDate: "2026-09-20",
    paydayDate: "2026-09-29",
    isFiveWeekPay: false,
    paidAt: null,
  });
});

test("cut-off day keeps the old period active and Monday rolls without deleting it", () => {
  const onCutoff = resolvePayrollSchedules([julyPeriod], localDay(2026, 7, 23));
  assert.equal(onCutoff.active?.periodStartDate, "2026-07-27");
  assert.equal(onCutoff.active?.cutoffDate, "2026-08-23");
  assert.equal(onCutoff.generated.length, 0);

  const afterRollover = resolvePayrollSchedules([julyPeriod], localDay(2026, 7, 24));
  assert.equal(afterRollover.active?.periodStartDate, "2026-08-24");
  assert.equal(afterRollover.active?.cutoffDate, "2026-09-20");
  assert.equal(afterRollover.active?.paydayDate, "2026-09-29");
  assert.equal(afterRollover.awaiting.length, 1);
  assert.equal(payrollScheduleKey(afterRollover.awaiting[0]), payrollScheduleKey(julyPeriod));
  assert.equal(afterRollover.schedules.length, 2);
});

test("marking the completed period paid never changes the active period", () => {
  const beforePayment = resolvePayrollSchedules([julyPeriod], localDay(2026, 7, 24));
  const next = beforePayment.active!;
  const paidOld = { ...julyPeriod, paidAt: "2026-09-01T08:00:00.000Z" };
  const afterPayment = resolvePayrollSchedules([paidOld, next], localDay(2026, 7, 24));
  assert.equal(afterPayment.awaiting.length, 0);
  assert.equal(afterPayment.active?.periodStartDate, "2026-08-24");
  assert.equal(afterPayment.history.find((record) => payrollScheduleKey(record) === payrollScheduleKey(paidOld))?.paidAt, paidOld.paidAt);
});

test("shifts remain in the payroll period whose local dates contain them", () => {
  const oldShift = createShift(DEFAULT_SETTINGS, localDay(2026, 7, 23, 11));
  oldShift.status = "completed";
  oldShift.clockOut = localDay(2026, 7, 23, 19).toISOString();
  const newShift = createShift(DEFAULT_SETTINGS, localDay(2026, 7, 24, 11));
  newShift.status = "completed";
  newShift.clockOut = localDay(2026, 7, 24, 19).toISOString();
  const next = nextPayrollSchedule(julyPeriod);
  const oldRange = payrollPeriodDateRange(julyPeriod)!;
  const newRange = payrollPeriodDateRange(next)!;
  assert.equal(periodTotals([oldShift, newShift], oldRange.start, oldRange.end).shifts, 1);
  assert.equal(periodTotals([oldShift, newShift], newRange.start, newRange.end).shifts, 1);
});

test("Dashboard exposes active, awaiting and paid-period controls without the old month countdown", () => {
  const component = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
  assert.match(component, /cutoffCountdownLabel\(schedule\.cutoffDate, now\)/);
  assert.match(component, /AWAITING PAYMENT/);
  assert.match(component, /The current active pay period will not change/);
  assert.doesNotMatch(component, /\$\{daysUntil\(schedule\.cutoffDate\)\} days until cut-off/);
});
