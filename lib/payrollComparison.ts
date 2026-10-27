import { formatDuration, formatMoney, type periodTotals, type PayrollPreTrackerAdjustment } from "./domain.ts";

const PAYSLIP_TIME_TOLERANCE_MS = 10 * 60_000;
const PAYSLIP_GROSS_TOLERANCE_PENCE = 1;

export type PayrollPayslipComparison = {
  state: "match" | "hours-different" | "gross-different" | "different";
  label: string;
  summary: string;
  timeDifferenceMs: number;
  grossDifferencePence: number;
};

export function formatSignedDurationDifference(value: number) {
  if (value === 0) return "0m";
  return `${value > 0 ? "+" : "−"}${formatDuration(Math.abs(value), true)}`;
}

export function formatSignedMoneyDifference(value: number) {
  if (value === 0) return formatMoney(0);
  return `${value > 0 ? "+" : "−"}${formatMoney(Math.abs(value))}`;
}

export function withPreTrackerAdjustment(
  totals: ReturnType<typeof periodTotals> | null,
  adjustment: PayrollPreTrackerAdjustment | null | undefined,
) {
  if (!totals || !adjustment) return totals;
  return {
    ...totals,
    paidMs: totals.paidMs + adjustment.paidMs,
    wagesPence: totals.wagesPence + adjustment.grossPayPence,
  };
}

export function calculatePayslipComparison(
  totals: ReturnType<typeof periodTotals> | null,
  grossPayPence: number,
  paidMs: number,
  preTrackerAdjustment: PayrollPreTrackerAdjustment | null | undefined = null,
): PayrollPayslipComparison | null {
  const reconciledTotals = withPreTrackerAdjustment(
    totals,
    preTrackerAdjustment,
  );
  if (!reconciledTotals) return null;
  const hasPreTrackerAdjustment = Boolean(
    preTrackerAdjustment &&
      (preTrackerAdjustment.grossPayPence > 0 || preTrackerAdjustment.paidMs > 0),
  );
  const timeDifferenceMs = paidMs - reconciledTotals.paidMs;
  const grossDifferencePence = grossPayPence - reconciledTotals.wagesPence;
  const hoursMatch = Math.abs(timeDifferenceMs) <= PAYSLIP_TIME_TOLERANCE_MS;
  const grossMatch =
    Math.abs(grossDifferencePence) <= PAYSLIP_GROSS_TOLERANCE_PENCE;
  const state = grossMatch
    ? hoursMatch
      ? "match"
      : "hours-different"
    : hoursMatch
      ? "gross-different"
      : "different";
  const label =
    state === "match"
      ? "MATCHES TRACKER"
      : state === "hours-different"
        ? "HOURS DIFFER"
        : state === "gross-different"
          ? "PAY DIFFERENCE"
          : "CHECK PAYSLIP";
  const summary =
    state === "match"
      ? hasPreTrackerAdjustment
        ? "Gross pay matches after the before-tracker balance; hours are within the 10-minute grace window."
        : "Gross pay matches; hours are within the 10-minute grace window."
      : `Hours ${formatSignedDurationDifference(timeDifferenceMs)} · gross ${formatSignedMoneyDifference(grossDifferencePence)}.`;
  return {
    state,
    label,
    summary,
    timeDifferenceMs,
    grossDifferencePence,
  };
}

