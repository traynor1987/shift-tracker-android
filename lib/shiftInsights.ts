import type { AppData, Shift } from "./domain.ts";
import { deliveryGeofenceDurations, deliverySummary, distanceMetres, grossWagesPence, manualDeliveredCustomerTimings, paidMilliseconds, reportingShifts, trackedActivityTotals, workMilesTenths } from "./domain.ts";

export type ShiftAnomaly = { id: string; rule: string; title: string; explanation: string; shiftId: string };

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
}

export function shiftAnomalies(shift: Shift, history: Shift[]): ShiftAnomaly[] {
  const out: ShiftAnomaly[] = [];
  const add = (rule: string, title: string, explanation: string) => {
    if (!shift.anomalyReviews?.some((item) => item.rule === rule)) out.push({ id: `${shift.id}:${rule}`, rule, title, explanation, shiftId: shift.id });
  };
  const paidHours = paidMilliseconds(shift) / 3_600_000;
  if (paidHours > 0 && paidHours < 2) add("very_short_shift", "Very short shift", `Only ${paidHours.toFixed(1)} paid hours were recorded.`);
  if (paidHours > 12) add("very_long_shift", "Very long shift", `${paidHours.toFixed(1)} paid hours were recorded.`);
  if (shift.scheduledEnd && shift.clockOut) {
    const [hours, minutes] = shift.scheduledEnd.split(":").map(Number);
    const expected = new Date(shift.clockOut); expected.setHours(hours, minutes, 0, 0);
    const earlyMinutes = (expected.getTime() - Date.parse(shift.clockOut)) / 60_000;
    if (earlyMinutes > 30) add("early_clock_out", "Earlier clock-out than rota", `Clock-out was about ${Math.round(earlyMinutes)} minutes before the scheduled end.`);
  }
  if (shift.scheduledStart) {
    const actual = new Date(shift.clockIn); const [hours, minutes] = shift.scheduledStart.split(":").map(Number);
    const scheduled = new Date(actual); scheduled.setHours(hours, minutes, 0, 0);
    const difference = Math.abs(actual.getTime() - scheduled.getTime()) / 60_000;
    if (difference > 30) add("rota_actual_mismatch", "Rota and actual start differ", `The recorded start differs from the rota by about ${Math.round(difference)} minutes.`);
  }
  if (paidHours >= 4 && deliverySummary(shift).individual === 0) add("zero_deliveries", "No deliveries on a long shift", "This may be correct, but is worth confirming for a delivery shift.");
  const closedBreaks = shift.breaks.filter((item) => item.end).map((item) => [Date.parse(item.start), Date.parse(item.end!)]).sort((a, b) => a[0] - b[0]);
  if (closedBreaks.some((item, index) => index > 0 && item[0] < closedBreaks[index - 1][1])) add("overlapping_breaks", "Breaks overlap", "Two recorded break periods overlap.");
  const deliveries = (shift.activities ?? []).filter((item) => (item.type === "single_delivery" || item.type === "double_delivery") && item.end);
  if (deliveries.some((item) => { const ms = Date.parse(item.end!) - Date.parse(item.start); return ms < 2 * 60_000 || ms > 90 * 60_000; })) add("delivery_duration", "Unusual delivery duration", "At least one delivery is under 2 minutes or over 90 minutes.");
  const peers = history.filter((item) => item.id !== shift.id && item.status === "completed").map(workMilesTenths).filter((value): value is number => value != null && value > 0);
  const miles = workMilesTenths(shift); const typical = median(peers);
  if (miles != null && (miles > 1_000 || (typical != null && peers.length >= 5 && miles > typical * 3))) add("mileage_outlier", "Mileage looks unusual", "Work mileage is much higher than the recent typical shift.");
  const gpsJump = deliveries.some((item) => (item.routeEvidence?.points ?? []).some((point, index, points) => {
    if (!index) return false; const seconds = (Date.parse(point.timestamp) - Date.parse(points[index - 1].timestamp)) / 1000;
    const previous = points[index - 1]; const metres = distanceMetres(previous.latitude, previous.longitude, point.latitude, point.longitude); return seconds > 0 && metres / seconds * 2.23694 > 120;
  }));
  if (gpsJump) add("gps_jump", "Large GPS movement jump", "A route contains a movement jump above 120 mph; normal GPS error may be the cause.");
  if (shift.status === "completed" && (!shift.clockOut || workMilesTenths(shift) == null)) add("missing_expected_data", "Expected shift data is missing", "Clock-out or work mileage needs review.");
  return out;
}

export type TrendRange = "4w" | "3m" | "6m" | "overall";
export type TrendSummary = { range: TrendRange; sampleSize: number; smallSample: boolean; workedHours: number; grossWagesPence: number; deliveries: number; deliveriesPerHour: number; averageDeliveryMinutes: number | null; averageCustomerMinutes: number | null; mileage: number; fuelPence: number; punctualityPercent: number | null; attendancePercent: number | null; realHustleMinutes: number | null; dominosHustleMinutes: number | null; storeWorkHours: number };

export function buildTrendSummary(data: AppData, range: TrendRange, now = new Date()): TrendSummary {
  const days = range === "4w" ? 28 : range === "3m" ? 92 : range === "6m" ? 183 : null;
  const start = days == null ? Number.NEGATIVE_INFINITY : now.getTime() - days * 86_400_000;
  const shifts = reportingShifts(data).filter((shift) => shift.status === "completed" && Date.parse(shift.clockIn) >= start && Date.parse(shift.clockIn) <= now.getTime());
  const paidMs = shifts.reduce((sum, shift) => sum + paidMilliseconds(shift), 0);
  const deliveries = shifts.reduce((sum, shift) => sum + deliverySummary(shift).individual, 0);
  const activities = shifts.flatMap((shift) => shift.activities ?? []).filter((item) => !item.testOnly && !item.badDelivery && (item.type === "single_delivery" || item.type === "double_delivery") && item.end);
  const durations = activities.map((item) => Date.parse(item.end!) - Date.parse(item.start)).filter((value) => value >= 0);
  const customerDurations = activities.flatMap(manualDeliveredCustomerTimings).map((item) => item.durationMs).filter((value): value is number => value != null && value >= 0);
  const real = activities.map((item) => deliveryGeofenceDurations(item, "real").hustleMs).filter((value): value is number => value != null);
  const dominos = activities.map((item) => deliveryGeofenceDurations(item, "dominos").hustleMs).filter((value): value is number => value != null);
  const scheduled = shifts.filter((shift) => shift.scheduledStart);
  const onTime = scheduled.filter((shift) => { const actual = new Date(shift.clockIn); const [h, m] = shift.scheduledStart!.split(":").map(Number); const expected = new Date(actual); expected.setHours(h, m, 0, 0); return actual.getTime() - expected.getTime() <= (shift.punctualityToleranceMinutes ?? 10) * 60_000; });
  const attendance = (data.rotaWeeks ?? []).flatMap((week) => week.entries).filter((entry) => Date.parse(`${entry.date}T12:00:00`) >= start && Date.parse(`${entry.date}T12:00:00`) <= now.getTime() && entry.status === "working");
  const attended = attendance.filter((entry) => Boolean(entry.linkedShiftId));
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const averageDeliveryMs = average(durations); const averageCustomerMs = average(customerDurations); const averageRealMs = average(real); const averageDominosMs = average(dominos);
  return { range, sampleSize: shifts.length, smallSample: shifts.length < 3, workedHours: paidMs / 3_600_000, grossWagesPence: shifts.reduce((sum, shift) => sum + grossWagesPence(shift), 0), deliveries, deliveriesPerHour: paidMs ? deliveries / (paidMs / 3_600_000) : 0, averageDeliveryMinutes: averageDeliveryMs == null ? null : averageDeliveryMs / 60_000, averageCustomerMinutes: averageCustomerMs == null ? null : averageCustomerMs / 60_000, mileage: shifts.reduce((sum, shift) => sum + (workMilesTenths(shift) ?? 0), 0) / 10, fuelPence: shifts.reduce((sum, shift) => sum + deliverySummary(shift).reimbursementPence, 0), punctualityPercent: scheduled.length ? onTime.length / scheduled.length * 100 : null, attendancePercent: attendance.length ? attended.length / attendance.length * 100 : null, realHustleMinutes: averageRealMs == null ? null : averageRealMs / 60_000, dominosHustleMinutes: averageDominosMs == null ? null : averageDominosMs / 60_000, storeWorkHours: shifts.reduce((sum, shift) => { const value = trackedActivityTotals(shift); return sum + value.cleaningMs + value.preparationMs + value.otherTaskMs; }, 0) / 3_600_000 };
}
