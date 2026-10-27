import { activityGeofenceEvidence, deliveryGeofenceDurations, type ActivityRecord, type HustleSource, type Shift } from './domain.ts';
export type WeeklyHustleAllowance = { leaveMs: number | null; returnMs: number | null; leaveSamples: number; returnSamples: number };

/** Value-keyed, bounded cache: mutable app objects and active GPS points are never keys. */
export function createHustleAllowanceCache(limit = 8) {
  const cache = new Map<string, WeeklyHustleAllowance>();
  return (shifts: Shift[], target: ActivityRecord, source: HustleSource = 'real'): WeeklyHustleAllowance => {
    const weekStart = new Date(target.start);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const eligible: ActivityRecord[] = [];
    const values: unknown[] = [];
    for (const shift of shifts) for (const activity of shift.activities ?? []) {
      if (activity.id === target.id || activity.testOnly || !activity.end ||
        (activity.type !== 'single_delivery' && activity.type !== 'double_delivery')) continue;
      const startedAt = new Date(activity.start).getTime();
      if (startedAt < weekStart.getTime() || startedAt >= weekEnd.getTime()) continue;
      const evidence = activityGeofenceEvidence(activity, source);
      values.push([activity.badDelivery, activity.start, activity.end, activity.backAtStoreAt,
        activity.wasEarlyDispatched, activity.dominosDispatchStartedAt, evidence.exitAt,
        evidence.entryAt, evidence.exitObserved, evidence.entryObserved]);
      eligible.push(activity);
    }
    const key = JSON.stringify([weekStart.getTime(), target.id, source, values]);
    const cached = cache.get(key);
    if (cached) return cached;
    const leave: number[] = [], returned: number[] = [];
    for (const activity of eligible) {
      const timing = deliveryGeofenceDurations(activity, source);
      if (timing.preDepartureMs != null) leave.push(timing.preDepartureMs);
      if (timing.returnDelayMs != null) returned.push(timing.returnDelayMs);
    }
    const average = (items: number[]) => items.length ? Math.round(items.reduce((sum, item) => sum + item, 0) / items.length) : null;
    const result = Object.freeze({leaveMs: average(leave), returnMs: average(returned), leaveSamples: leave.length, returnSamples: returned.length});
    cache.set(key, result);
    if (cache.size > limit) cache.delete(cache.keys().next().value!);
    return result;
  };
}
