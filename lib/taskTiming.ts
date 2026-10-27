import { activeTimedActivity, type AppData, type ActivityRecord, type Shift, type ShiftTaskRecord } from './domain.ts';
import { validateAppDataStructure } from './backup.ts';

/** Action time is sampled at the action, never from React's display clock.
 * Historical evidence may be used only within the current work generation. */
export function deliveryTransitionTime(shift: Shift, actionMs: number, departureAt: string | null = null): string {
  const boundary = Math.max(Date.parse(shift.clockIn), ...(shift.activities ?? []).flatMap(a => [Date.parse(a.start), Date.parse(a.end ?? a.start)]), ...(shift.taskSnapshot ?? []).flatMap(t => t.segments.flatMap(s => [Date.parse(s.start), Date.parse(s.end ?? s.start)])));
  if (!Number.isFinite(actionMs) || !Number.isFinite(boundary) || actionMs < boundary) throw new Error('Clock is earlier than the latest work transition. No timing changed.');
  const eventMs = Date.parse(departureAt ?? '');
  return new Date(Number.isFinite(eventMs) && eventMs >= boundary && eventMs <= actionMs && actionMs - eventMs <= 30 * 60_000 ? eventMs : actionMs).toISOString();
}

export function closeTaskSegment(task: ShiftTaskRecord, at: string): boolean {
  const segment = task.segments.findLast(s => s.end == null);
  if (!segment) return false;
  if (!Number.isFinite(Date.parse(segment.start)) || !Number.isFinite(Date.parse(at)) || Date.parse(at) < Date.parse(segment.start)) throw new Error('Stale task transition ignored; segment start is newer.');
  segment.end = at;
  return true;
}

export function openTaskSegment(shift: Shift, task: ShiftTaskRecord, at: string): boolean {
  if (shift.status !== 'working' || activeTimedActivity(shift) || task.segments.some(s => s.end == null) || task.status === 'complete' || task.unableAt) return false;
  // Reject an out-of-order resume, rather than fabricating elapsed time.
  deliveryTransitionTime(shift, Date.parse(at));
  task.segments.push({start:at, end:null});
  task.status = 'active';
  return true;
}

const timingState = (task: ShiftTaskRecord | undefined) => JSON.stringify(task && [task.status, task.segments]);
/** Called against the latest React state, with the handler's captured state.
 * An async callback cannot close or resume a different task generation. */
export function assertTaskMutationCurrent(base: AppData, current: AppData, candidate: AppData): void {
  for (const shift of candidate.shifts) {
    const before = current.shifts.find(s => s.id === shift.id);
    const captured = base.shifts.find(s => s.id === shift.id);
    for (const task of shift.taskSnapshot ?? []) {
      const old = before?.taskSnapshot?.find(t => t.id === task.id);
      if (timingState(old) === timingState(task)) continue;
      if (timingState(captured?.taskSnapshot?.find(t => t.id === task.id)) !== timingState(old)) throw new Error('Stale task action ignored; work has already changed.');
      for (const segment of task.segments) {
        if (!Number.isFinite(Date.parse(segment.start)) || (segment.end != null && (!Number.isFinite(Date.parse(segment.end)) || Date.parse(segment.end) < Date.parse(segment.start)))) throw new Error('Invalid task transition rejected; existing work is unchanged.');
      }
    }
  }
}

export function isFreshOperationalSample(sampleMs: number, nowMs: number, lastMs: number, boundaryMs: number): boolean {
  return Number.isFinite(sampleMs) && sampleMs > lastMs && sampleMs >= boundaryMs && sampleMs <= nowMs && nowMs - sampleMs <= 30_000;
}

export function hasReversedTaskSegments(data: AppData): boolean {
  return data.shifts.some(s => s.taskSnapshot?.some(t => t.segments.some(p => p.end != null && Date.parse(p.end) < Date.parse(p.start))));
}

/** Explicit owner repair. A reversed boundary proves corruption, not its cause
 * or true duration. Preserve its start and record zero supported duration.
 * Copies in task activities are repaired independently, preserving valid history. */
export function repairReversedTaskSegments(source: AppData, repairedAt = new Date().toISOString()) {
  const data = structuredClone(source);
  const repairs: string[] = [];
  for (const shift of data.shifts) {
    for (const task of shift.taskSnapshot ?? []) {
      const notes: string[] = [];
      const repair = (segments: ShiftTaskRecord['segments'], path: string) => segments.forEach((s, index) => {
        if (s.end == null || !Number.isFinite(Date.parse(s.start)) || !Number.isFinite(Date.parse(s.end)) || Date.parse(s.end) >= Date.parse(s.start)) return;
        const note = `${path}[${index}]: original end ${s.end}; retained start ${s.start}; end set equal to start (0s); true end unknown, stale/out-of-order cause unproven`;
        s.end = s.start;
        repairs.push(note); notes.push(note);
      });
      repair(task.segments, `shift ${shift.id}/task ${task.id}/segments`);
      for (const activity of shift.activities ?? []) {
        if (activity.taskId !== task.id || !['cleaning_task','prep_task'].includes(activity.type)) continue;
        repair(activity.segments ?? [], `activity ${activity.id}/segments`);
        if (activity.end != null && Date.parse(activity.end) < Date.parse(activity.start)) {
          const note = `activity ${activity.id}: original end ${activity.end}; end set equal to start ${activity.start}; true end unknown`;
          activity.end = activity.start; repairs.push(note); notes.push(note);
        }
      }
      if (notes.length) task.shiftNotes = [task.shiftNotes, `Timing repair ${repairedAt}: ${notes.join(' | ')}`].filter(Boolean).join('\n');
    }
  }
  const validation = validateAppDataStructure(data);
  if (!validation.ok) return {ok:false as const, message:validation.message, issues:validation.issues, repairs};
  return {ok:true as const, data, repairs};
}


/** Automatic return is an observed event (carryout), or a due time anchored
 * to a confirmed return. Callback receipt after resume must not extend it. */
export function automaticReturnCompletionAt(activity: ActivityRecord, actionMs: number, entryAt: string, allowanceMs: number): string | null {
  const entryMs = Date.parse(entryAt);
  const completionMs = entryMs + allowanceMs;
  const boundaries = [activity.start, activity.storeExitAt, activity.storeEntryAt,
    ...(activity.customerEvents ?? []).filter(event => event.source === 'manual_delivered').map(event => event.timestamp)]
    .filter((stamp): stamp is string => stamp != null).map(stamp => Date.parse(stamp));
  if (!Number.isFinite(actionMs) || !Number.isFinite(entryMs) || !Number.isFinite(allowanceMs) || allowanceMs < 0 ||
      !Number.isFinite(completionMs) || completionMs > actionMs || boundaries.some(stamp => !Number.isFinite(stamp) || entryMs < stamp)) return null;
  return new Date(completionMs).toISOString();
}
