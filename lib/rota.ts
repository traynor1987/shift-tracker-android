import type { AppData, RotaAttendanceCategory, RotaEntry, RotaShiftType, RotaWeek, Shift } from "./domain";

export const ROTA_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function localDate(key: string, time = "12:00") {
  const [year, month, day] = key.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0);
}

export function addDays(key: string, days: number) {
  const date = localDate(key); date.setDate(date.getDate() + days); return dateKey(date);
}

export function mondayKey(date: Date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return dateKey(copy);
}

export function rotaId(prefix = "rota") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createRotaWeek(weekStartDate: string): RotaWeek {
  const stamp = new Date().toISOString();
  return {
    id: `week-${weekStartDate}`,
    weekStartDate,
    createdAt: stamp,
    updatedAt: stamp,
    entries: ROTA_DAY_NAMES.map((_, index) => ({
      id: `rota-${addDays(weekStartDate, index)}`,
      date: addDays(weekStartDate, index), status: "off", startTime: "11:00", shiftType: "R",
      attendance: null, linkedShiftId: null, createdAt: stamp, updatedAt: stamp,
    })),
  };
}

export function copyPreviousWeek(previous: RotaWeek | undefined, weekStartDate: string) {
  const result = createRotaWeek(weekStartDate);
  if (!previous) return result;
  result.entries = result.entries.map((entry, index) => {
    const source = previous.entries[index];
    return source ? { ...entry, status: source.status, startTime: source.startTime || "11:00", shiftType: source.shiftType || "R", customLabel: source.customLabel, scheduledEndTime: source.scheduledEndTime } : entry;
  });
  return result;
}

export function shiftTypeLabel(type: RotaShiftType, custom?: string) {
  return type === "R" ? "Rush" : type === "L" ? "Late" : type === "close" ? "Close" : custom?.trim() || "Custom";
}

export function rotaWeekForecast(week: RotaWeek, hourlyRatePence: number) {
  const working = week.entries.filter((entry) => entry.status === "working");
  let scheduledMs = 0;
  let missingEndTimes = 0;
  for (const entry of working) {
    if (!entry.scheduledEndTime) { missingEndTimes += 1; continue; }
    const start = localDate(entry.date, entry.startTime);
    let end = localDate(entry.date, entry.scheduledEndTime);
    if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60_000);
    scheduledMs += end.getTime() - start.getTime();
  }
  return { shifts: working.length, scheduledMs, estimatedGrossPence: Math.round(scheduledMs / 3_600_000 * hourlyRatePence), missingEndTimes };
}

export function nextScheduledEntry(data: AppData, now: Date): RotaEntry | null {
  const existingShiftIds = new Set(data.shifts.map((shift) => shift.id));
  return (data.rotaWeeks ?? []).flatMap((week) => week.entries).filter((entry) => entry.status === "working" && !entry.attendance && (!entry.linkedShiftId || !existingShiftIds.has(entry.linkedShiftId)) && localDate(entry.date, entry.startTime).getTime() >= now.getTime() - 12 * 60 * 60_000).sort((a, b) => localDate(a.date, a.startTime).getTime() - localDate(b.date, b.startTime).getTime())[0] ?? null;
}

export function findClockInRotaEntry(data: AppData, clockIn: Date) {
  const key = dateKey(clockIn);
  const existingShiftIds = new Set(data.shifts.map((shift) => shift.id));
  return (data.rotaWeeks ?? []).flatMap((week) => week.entries).find((entry) => entry.date === key && entry.status === "working" && !entry.attendance && (!entry.linkedShiftId || !existingShiftIds.has(entry.linkedShiftId))) ?? null;
}

export type ClockInGuard = {
  reason: "unscheduled" | "early" | "late";
  rotaEntryId?: string;
  scheduledStart?: string;
  minutesEarly?: number;
  minutesLate?: number;
};

/** Returns the approval gate required before starting work, if any. */
export function clockInGuard(data: AppData, clockIn: Date, earlyThresholdMinutes = 15): ClockInGuard | null {
  const entry = findClockInRotaEntry(data, clockIn);
  if (!entry) return { reason: "unscheduled" };
  const differenceMinutes = Math.round((clockIn.getTime() - localDate(entry.date, entry.startTime).getTime()) / 60_000);
  const minutesEarly = Math.max(0, -differenceMinutes);
  if (minutesEarly >= earlyThresholdMinutes) return { reason: "early", rotaEntryId: entry.id, scheduledStart: entry.startTime, minutesEarly };
  const tolerance = Math.max(0, data.settings.punctualityToleranceMinutes ?? 10);
  return differenceMinutes > tolerance
    ? { reason: "late", rotaEntryId: entry.id, scheduledStart: entry.startTime, minutesLate: differenceMinutes }
    : null;
}

export function linkShiftToRota(shift: Shift, entry: RotaEntry, toleranceMinutes: number) {
  shift.rotaEntryId = entry.id;
  shift.scheduledDate = entry.date;
  shift.scheduledStart = entry.startTime;
  shift.scheduledShiftType = entry.shiftType;
  shift.scheduledShiftLabel = shiftTypeLabel(entry.shiftType, entry.customLabel);
  shift.scheduledEnd = entry.scheduledEndTime;
  shift.punctualityToleranceMinutes = toleranceMinutes;
  entry.linkedShiftId = shift.id;
  entry.updatedAt = new Date().toISOString();
}

export function punctualityForShift(shift: Shift) {
  if (!shift.scheduledDate || !shift.scheduledStart) return null;
  const differenceMinutes = Math.round((new Date(shift.clockIn).getTime() - localDate(shift.scheduledDate, shift.scheduledStart).getTime()) / 60_000);
  const tolerance = Math.max(0, shift.punctualityToleranceMinutes ?? 0);
  return { differenceMinutes, classification: differenceMinutes < 0 ? "early" as const : differenceMinutes <= tolerance ? "on_time" as const : "late" as const };
}

export function punctualityText(shift: Shift) {
  const result = punctualityForShift(shift);
  if (!result) return "Not scheduled";
  if (result.differenceMinutes < 0) return `${Math.abs(result.differenceMinutes)} min early`;
  if (result.classification === "on_time") return result.differenceMinutes ? `On time · ${result.differenceMinutes} min after start` : "On time";
  return `${result.differenceMinutes} min late`;
}

export function missingNextWeekOnSunday(data: AppData, now: Date) {
  if (now.getDay() !== 0) return false;
  const nextMonday = addDays(mondayKey(now), 7);
  return !(data.rotaWeeks ?? []).some((week) => week.weekStartDate === nextMonday);
}

export function missingRotaPrompt(data: AppData, now: Date) {
  const currentMonday = mondayKey(now);
  const weekStartDate = now.getDay() === 0 ? addDays(currentMonday, 7) : currentMonday;
  const offset = weekStartDate === currentMonday ? 0 : 1;
  return {
    missing: !(data.rotaWeeks ?? []).some((week) => week.weekStartDate === weekStartDate),
    weekStartDate,
    offset,
    message: offset === 1 ? "Next week’s rota has not been added yet." : "This week’s rota has not been added yet.",
  };
}

export function dueAbsenceEntries(data: AppData, now: Date) {
  const today = dateKey(now);
  return (data.rotaWeeks ?? []).flatMap((week) => week.entries).filter((entry) => entry.status === "working" && entry.date < today && !entry.linkedShiftId && !entry.attendance);
}

export function recordAttendance(entry: RotaEntry, category: RotaAttendanceCategory, note?: string, replacementDate?: string, replacementStartTime?: string) {
  entry.attendance = { category, note: note?.trim() || undefined, replacementDate: replacementDate || undefined, replacementStartTime: replacementStartTime || undefined, recordedAt: new Date().toISOString() };
  entry.updatedAt = new Date().toISOString();
}

export type RotaReminder = { id: string; rotaEntryId?: string; kind: "morning" | "one_hour" | "fifteen_min" | "sunday"; atEpochMs: number; title: string; text: string };

export function buildRotaReminders(data: AppData, now: Date): RotaReminder[] {
  const settings = data.settings;
  if (settings.rotaNotificationsEnabled === false) return [];
  const reminders: RotaReminder[] = [];
  for (const entry of (data.rotaWeeks ?? []).flatMap((week) => week.entries)) {
    if (entry.status !== "working" || entry.attendance || entry.linkedShiftId) continue;
    const start = localDate(entry.date, entry.startTime);
    const label = `${entry.startTime} · ${shiftTypeLabel(entry.shiftType, entry.customLabel)}`;
    const add = (kind: RotaReminder["kind"], at: Date, title: string, text: string) => { if (at > now) reminders.push({ id: `${entry.id}:${kind}`, rotaEntryId: entry.id, kind, atEpochMs: at.getTime(), title, text }); };
    if (settings.rotaMorningReminderEnabled !== false) add("morning", localDate(entry.date, settings.rotaMorningReminderTime ?? "08:00"), "You’re working today", label);
    if (settings.rotaOneHourReminderEnabled !== false) add("one_hour", new Date(start.getTime() - (settings.rotaOneHourMinutesBefore ?? 60) * 60_000), "Shift starts in 1 hour", label);
    if (settings.rotaFifteenMinuteReminderEnabled !== false) add("fifteen_min", new Date(start.getTime() - (settings.rotaFifteenMinuteMinutesBefore ?? 15) * 60_000), "Shift starts soon", `Shift starts at ${entry.startTime}`);
  }
  if (settings.rotaSundayReminderEnabled !== false) {
    const thisMonday = mondayKey(now); const sunday = localDate(addDays(thisMonday, 6), settings.rotaSundayReminderTime ?? "18:00");
    const nextMonday = addDays(thisMonday, 7);
    if (!(data.rotaWeeks ?? []).some((week) => week.weekStartDate === nextMonday) && sunday > now) reminders.push({ id: `rota-missing-${nextMonday}`, kind: "sunday", atEpochMs: sunday.getTime(), title: "Next week’s rota hasn’t been added", text: "Open Shift Tracker to add Monday–Sunday." });
  }
  return reminders.sort((a, b) => a.atEpochMs - b.atEpochMs);
}

export function nextShiftCountdown(entry: RotaEntry, now: Date) {
  const minutes = Math.round((localDate(entry.date, entry.startTime).getTime() - now.getTime()) / 60_000);
  if (minutes < 0) return `Scheduled start was ${Math.abs(minutes)} min ago`;
  if (minutes < 60) return `Starts in ${minutes} min`;
  const hours = Math.floor(minutes / 60); return `Starts in ${hours}h ${minutes % 60}m`;
}

export function attendanceStats(data: AppData, from: Date, to: Date) {
  const entries = (data.rotaWeeks ?? []).flatMap((week) => week.entries).filter((entry) => entry.status === "working" && localDate(entry.date) >= from && localDate(entry.date) < to);
  const shifts = new Map(data.shifts.map((shift) => [shift.id, shift]));
  const linked = entries.map((entry) => entry.linkedShiftId ? shifts.get(entry.linkedShiftId) : undefined).filter((shift): shift is Shift => Boolean(shift));
  const punctuality = linked.map(punctualityForShift).filter((item): item is NonNullable<ReturnType<typeof punctualityForShift>> => Boolean(item));
  const onTime = punctuality.filter((item) => item.classification !== "late").length;
  const lateMinutes = punctuality.filter((item) => item.classification === "late").map((item) => item.differenceMinutes);
  const earlyMinutes = punctuality.filter((item) => item.differenceMinutes < 0).map((item) => Math.abs(item.differenceMinutes));
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return { scheduled: entries.length, worked: linked.length, onTime, late: lateMinutes.length, onTimePercent: punctuality.length ? onTime / punctuality.length * 100 : 0, averageLateness: average(lateMinutes), averageEarly: average(earlyMinutes), earliestArrival: earlyMinutes.length ? Math.max(...earlyMinutes) : null, latestArrival: lateMinutes.length ? Math.max(...lateMinutes) : null, sick: entries.filter((entry) => entry.attendance?.category === "sick").length, holiday: entries.filter((entry) => entry.attendance?.category === "holiday").length, authorised: entries.filter((entry) => entry.attendance?.category === "authorised_absence").length, storeCancelled: entries.filter((entry) => entry.attendance?.category === "store_cancelled").length };
}
