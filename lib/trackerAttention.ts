import type { AppData } from "./domain.ts";
import { periodTotals, reportingShifts, shiftNeedsReview, shiftTaskReviewNeeded } from "./domain.ts";
import { payrollPeriodDateRange } from "./payroll.ts";
import { calculatePayslipComparison } from "./payrollComparison.ts";

export function trackerAttention(data: AppData) {
  const shifts = reportingShifts(data);
  const reviewShiftIds = shifts.filter(shift => shiftNeedsReview(shift) || shiftTaskReviewNeeded(shift))
    .sort((left, right) => right.clockIn.localeCompare(left.clockIn)).map(shift => shift.id);
  const payrollCount = (data.payrollSchedules ?? []).filter(record => {
    if (!record.payslip) return false;
    const range = payrollPeriodDateRange(record);
    if (!range) return false;
    const comparison = calculatePayslipComparison(periodTotals(shifts, range.start, range.end), record.payslip.grossPayPence, record.payslip.paidMs, record.payslip.preTrackerAdjustment);
    return comparison != null && comparison.state !== "match";
  }).length;
  return { reviewShiftIds, payrollCount };
}
