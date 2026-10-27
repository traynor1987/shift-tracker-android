import type { ActivityRecord, Shift } from "./domain.ts";
import type * as Reports from "./pdfReports.ts";

type ReportModule = typeof Reports;
export async function loadReportIntoWindow(
  render: (reports: ReportModule, popup: Window | null) => boolean,
  load: () => Promise<ReportModule> = () => import("./pdfReports.ts"),
) {
  // Reserve the window during the click; loading a chunk must not consume the
  // browser's transient user activation before window.open.
  const popup = window.open("", "_blank");
  if (popup) popup.document.body.textContent = "Loading saved report…";
  try {
    return render(await load(), popup);
  } catch {
    if (popup && !popup.closed) popup.document.body.textContent = "Report could not load. Close this window and try again. Your saved shift data is safe.";
    return false;
  }
}
export const printDeliveryReport = (activity: ActivityRecord) => loadReportIntoWindow((reports, popup) => reports.printDeliveryReport(activity, popup));
export const printStockRunReport = (activity: ActivityRecord, hourlyRatePence: number, fuelCostPencePerMile: number) => loadReportIntoWindow((reports, popup) => reports.printStockRunReport(activity, hourlyRatePence, fuelCostPencePerMile, popup));
export const printShiftReport = (shift: Shift) => loadReportIntoWindow((reports, popup) => reports.printShiftReport(shift, popup));
export const printWeekReport = (shifts: Shift[], weekStart: Date) => loadReportIntoWindow((reports, popup) => reports.printWeekReport(shifts, weekStart, popup));
