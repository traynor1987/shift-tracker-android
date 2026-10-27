import type { PayrollSchedule } from "./domain.ts";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLIS_PER_CALENDAR_DAY = 86_400_000;

function dateOnlyParts(value: string) {
  const match = DATE_ONLY.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

function calendarOrdinal(value: string) {
  const parts = dateOnlyParts(value);
  return parts ? Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / MILLIS_PER_CALENDAR_DAY) : null;
}

export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** A local calendar boundary used to match shifts to their pay period. */
export function localDateFromKey(value: string) {
  const parts = dateOnlyParts(value);
  return parts ? new Date(parts.year, parts.month - 1, parts.day) : null;
}

export function addCalendarDays(value: string, days: number) {
  const parts = dateOnlyParts(value);
  if (!parts) return value;
  const result = new Date(parts.year, parts.month - 1, parts.day, 12);
  result.setDate(result.getDate() + days);
  return localDateKey(result);
}

/** Positive when `to` is later than `from`, independent of time-of-day and DST. */
export function calendarDayDifference(from: string, to: string) {
  const fromOrdinal = calendarOrdinal(from);
  const toOrdinal = calendarOrdinal(to);
  return fromOrdinal == null || toOrdinal == null ? null : toOrdinal - fromOrdinal;
}

export function cutoffCountdownLabel(cutoffDate: string, today: Date) {
  const days = calendarDayDifference(localDateKey(today), cutoffDate);
  if (days == null || days < 0) return null;
  if (days === 0) return "Cut-off today";
  return `${days} ${days === 1 ? "day" : "days"} until cut-off`;
}

export function paydayCountdownLabel(paydayDate: string, today: Date) {
  const days = calendarDayDifference(localDateKey(today), paydayDate);
  if (days == null) return "Payday date unavailable";
  if (days < 0) return "Payment due";
  if (days === 0) return "Payday today";
  return `${days} ${days === 1 ? "day" : "days"} until payday`;
}

export function payrollPeriodStart(schedule: PayrollSchedule) {
  if (schedule.periodStartDate && dateOnlyParts(schedule.periodStartDate)) return schedule.periodStartDate;
  return addCalendarDays(schedule.cutoffDate, schedule.isFiveWeekPay ? -34 : -27);
}

export function payrollCycleDays(schedule: PayrollSchedule) {
  const configured = calendarDayDifference(payrollPeriodStart(schedule), schedule.cutoffDate);
  if (configured === 27 || configured === 34) return configured + 1;
  return schedule.isFiveWeekPay ? 35 : 28;
}

export function nextPayrollSchedule(schedule: PayrollSchedule): PayrollSchedule {
  const cycleDays = payrollCycleDays(schedule);
  const cutoffDate = addCalendarDays(schedule.cutoffDate, cycleDays);
  return {
    monthKey: cutoffDate.slice(0, 7),
    periodStartDate: addCalendarDays(payrollPeriodStart(schedule), cycleDays),
    cutoffDate,
    paydayDate: addCalendarDays(schedule.paydayDate, cycleDays),
    isFiveWeekPay: cycleDays === 35,
    paidAt: null,
  };
}

export function payrollScheduleKey(schedule: PayrollSchedule) {
  return `${payrollPeriodStart(schedule)}|${schedule.cutoffDate}`;
}

export interface PayrollResolution {
  active: PayrollSchedule | null;
  awaiting: PayrollSchedule[];
  history: PayrollSchedule[];
  generated: PayrollSchedule[];
  schedules: PayrollSchedule[];
}

/**
 * Resolves the active configured period by local calendar dates. If the latest
 * stored period has ended, successor records are derived from that configured
 * cycle without changing or deleting the completed record.
 */
export function resolvePayrollSchedules(stored: PayrollSchedule[], today: Date): PayrollResolution {
  const todayKey = localDateKey(today);
  const valid = stored.filter((schedule) => calendarOrdinal(schedule.cutoffDate) != null && calendarOrdinal(schedule.paydayDate) != null);
  const schedules = [...valid].sort((a, b) => payrollPeriodStart(a).localeCompare(payrollPeriodStart(b)));
  const generated: PayrollSchedule[] = [];
  const containsToday = (schedule: PayrollSchedule) => payrollPeriodStart(schedule) <= todayKey && todayKey <= schedule.cutoffDate;
  let active = schedules.findLast(containsToday) ?? null;

  if (!active && schedules.length) {
    let cursor = schedules.filter((schedule) => schedule.cutoffDate < todayKey).at(-1) ?? null;
    for (let guard = 0; cursor && cursor.cutoffDate < todayKey && guard < 240; guard += 1) {
      const derived = nextPayrollSchedule(cursor);
      const existing = schedules.find((schedule) => payrollScheduleKey(schedule) === payrollScheduleKey(derived));
      cursor = existing ?? derived;
      if (!existing) {
        schedules.push(derived);
        schedules.sort((a, b) => payrollPeriodStart(a).localeCompare(payrollPeriodStart(b)));
        generated.push(derived);
      }
      if (containsToday(cursor)) active = cursor;
    }
  }

  const history = schedules.filter((schedule) => schedule !== active).sort((a, b) => payrollPeriodStart(b).localeCompare(payrollPeriodStart(a)));
  const awaiting = history.filter((schedule) => schedule.cutoffDate < todayKey && !schedule.paidAt);
  return { active, awaiting, history, generated, schedules };
}

export function payrollPeriodDateRange(schedule: PayrollSchedule) {
  const start = localDateFromKey(payrollPeriodStart(schedule));
  const end = localDateFromKey(addCalendarDays(schedule.cutoffDate, 1));
  return start && end ? { start, end } : null;
}
