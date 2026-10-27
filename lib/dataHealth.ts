import type { AppData } from "./domain.ts";
import { validateAppDataStructure } from "./backup.ts";

export type DataHealthIssue = { severity: "warning" | "error"; code: string; message: string; shiftId?: string };
export type DataHealthResult = { status: "healthy" | "review"; checkedAt: string; issues: DataHealthIssue[] };

export function verifyTrackerData(data: AppData, checkedAt = new Date().toISOString()): DataHealthResult {
  const issues: DataHealthIssue[] = [];
  const validation = validateAppDataStructure(data);
  if (!validation.ok) validation.issues.slice(0, 20).forEach((message) => issues.push({ severity: "error", code: "canonical_validation", message }));
  const ids = new Map<string, string>();
  const recordId = (id: string, kind: string, shiftId?: string) => { const prior = ids.get(id); if (prior) issues.push({ severity: "error", code: "duplicate_id", message: `${kind} identifier is also used by ${prior}.`, shiftId }); else ids.set(id, kind); };
  data.shifts.forEach((shift) => {
    recordId(shift.id, "shift", shift.id);
    shift.breaks.forEach((item) => recordId(item.id, "break", shift.id));
    shift.deliveries.forEach((item) => recordId(item.id, "delivery", shift.id));
    (shift.activities ?? []).forEach((item) => { recordId(item.id, "activity", shift.id); if (item.shiftId !== shift.id) issues.push({ severity: "error", code: "activity_owner", message: "An activity points to a different shift.", shiftId: shift.id }); });
    (shift.taskSnapshot ?? []).forEach((item) => recordId(item.id, "task", shift.id));
    (shift.incidents ?? []).forEach((item) => { recordId(item.id, "incident", shift.id); if (item.shiftId !== shift.id) issues.push({ severity: "error", code: "incident_owner", message: "An incident marker points to a different shift.", shiftId: shift.id }); if (item.activityId && !(shift.activities ?? []).some((activity) => activity.id === item.activityId)) issues.push({ severity: "warning", code: "incident_activity", message: "An incident marker refers to an activity that is no longer present.", shiftId: shift.id }); });
    if (shift.reimbursementPaymentId && !data.payments.some((payment) => payment.id === shift.reimbursementPaymentId && payment.shiftIds.includes(shift.id))) issues.push({ severity: "error", code: "payroll_link", message: "Fuel reimbursement links do not agree.", shiftId: shift.id });
    if (shift.rotaEntryId && !(data.rotaWeeks ?? []).flatMap((week) => week.entries).some((entry) => entry.id === shift.rotaEntryId)) issues.push({ severity: "warning", code: "rota_link", message: "The linked rota entry is no longer present.", shiftId: shift.id });
  });
  data.payments.forEach((payment) => recordId(payment.id, "payment"));
  return { status: issues.length ? "review" : "healthy", checkedAt, issues };
}
