import { confirmedStoreReturnAt, deliveryCustomersComplete, recordRealHustleExitMetrics, type AppData, type NativeReturnEvidence } from './domain.ts';
import { readNativeShellInfo, readNativeTrackingState, subscribeToNativeMessages, TRUSTED_SHIFT_TRACKER_ORIGIN } from './nativeBridge.ts';
import { nativeStoreProfile } from './storeProfiles.ts';

export type NativeReturnEvent = NativeReturnEvidence & {
  kind: 'returned';
  shiftId: string;
  deliveryId: string;
  storeIdentity: string;
  exitAt: number;
  /** Zero means the crossing was not continuously observed. */
  entryAt: number;
  accuracy: number;
  source: 'native_gps';
  status: 'pending' | 'acknowledged';
};
const boundedText = (value: unknown, limit: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= limit;
const epoch = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 8.64e15;

/** Parse only the existing origin-checked shell channels, never raw diagnostics. */
export function readNativeReturnEvent(message: MessageEvent<unknown>): NativeReturnEvent | null {
  const diagnostics = (readNativeShellInfo(message) ?? readNativeTrackingState(message))?.diagnostics;
  return parseNativeReturnEvent(diagnostics?.nativeReturnEvent);
}

export function parseNativeReturnEvent(value: unknown): NativeReturnEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const e = value as Record<string, unknown>;
  if (!boundedText(e.eventId, 256) || !boundedText(e.shiftId, 128) || !boundedText(e.deliveryId, 128) ||
      !boundedText(e.storeRevision, 512) || !boundedText(e.storeIdentity, 1024) ||
      (e.storeId !== 'ormskirk' && e.storeId !== 'maghull') || e.kind !== 'returned' || e.source !== 'native_gps' ||
      (e.status !== 'pending' && e.status !== 'acknowledged') ||
      !Number.isSafeInteger(e.generation) || (e.generation as number) < 0 ||
      !epoch(e.timestampEpochMs) || !epoch(e.observedAtEpochMs) || !epoch(e.exitAt) ||
      (e.entryAt !== 0 && !epoch(e.entryAt)) || (e.notificationAt !== 0 && !epoch(e.notificationAt)) ||
      typeof e.accuracy !== 'number' || !Number.isFinite(e.accuracy) || e.accuracy <= 0 || e.accuracy > 65) return null;
  // Copy the schema only; unrelated native diagnostics never enter canonical data.
  return {eventId:e.eventId,kind:'returned',shiftId:e.shiftId,deliveryId:e.deliveryId,storeId:e.storeId,
    storeRevision:e.storeRevision,storeIdentity:e.storeIdentity,generation:e.generation as number,
    timestampEpochMs:e.timestampEpochMs,observedAtEpochMs:e.observedAtEpochMs,exitAt:e.exitAt,entryAt:e.entryAt,
    accuracy:e.accuracy,source:'native_gps',status:e.status,notificationAt:e.notificationAt};
}

/** Native is an evidence producer; the live web session owns every mutation. */
export function reconcileNativeReturnEvent(data: AppData, incoming: NativeReturnEvent, now = Date.now()): 'applied' | 'duplicate' | 'rejected' {
  const event = parseNativeReturnEvent(incoming);
  if (!event) return 'rejected';
  const shift = data.shifts.find(item => item.status !== 'completed');
  const activity = shift?.activities?.findLast(item => !item.end && (item.type === 'single_delivery' || item.type === 'double_delivery'));
  if (!shift || shift.status !== 'working' || shift.id !== event.shiftId || !activity || activity.id !== event.deliveryId ||
      activity.shiftId !== shift.id || !deliveryCustomersComplete(activity)) return 'rejected';
  const profile = nativeStoreProfile(data.settings, shift.storeId ?? 'ormskirk');
  if (!profile.verified || profile.id !== event.storeId || profile.revision !== event.storeRevision) return 'rejected';
  // Kotlin encodes integral doubles with .0; compare identity fields semantically.
  const identity = event.storeIdentity.split('|');
  if (identity.length !== 6 || identity[0] !== profile.id || identity[4] !== 'true' || identity[5] !== profile.revision ||
      identity.slice(1, 4).some(value => !value.trim() || !Number.isFinite(Number(value))) ||
      Number(identity[1]) !== profile.latitude || Number(identity[2]) !== profile.longitude || Number(identity[3]) !== profile.radius) return 'rejected';
  const started = Math.max(Date.parse(shift.clockIn), Date.parse(activity.start));
  const delivered = Math.max(...(activity.customerEvents ?? []).filter(item => item.source === 'manual_delivered').map(item => Date.parse(item.timestamp)));
  if (!Number.isFinite(started) || !Number.isFinite(delivered) || event.exitAt < started ||
      event.observedAtEpochMs < Math.max(event.exitAt, delivered) || event.timestampEpochMs < event.observedAtEpochMs ||
      event.timestampEpochMs > now + 5_000 || event.notificationAt > now + 5_000 ||
      (event.notificationAt !== 0 && event.notificationAt < event.timestampEpochMs) ||
      (event.entryAt !== 0 && event.entryAt !== event.observedAtEpochMs) ||
      (activity.storeExitAt && Date.parse(activity.storeExitAt) !== event.exitAt)) return 'rejected';
  const previous = activity.nativeReturnEvidence;
  if (previous) {
    if (previous.eventId === event.eventId) {
      if (previous.generation !== event.generation || previous.timestampEpochMs !== event.timestampEpochMs ||
          previous.observedAtEpochMs !== event.observedAtEpochMs || previous.storeId !== event.storeId || previous.storeRevision !== event.storeRevision) return 'rejected';
      if (event.notificationAt > previous.notificationAt) { previous.notificationAt = event.notificationAt; return 'applied'; }
      return 'duplicate';
    }
    if (event.generation < previous.generation || event.timestampEpochMs <= previous.timestampEpochMs ||
        (event.generation === previous.generation && confirmedStoreReturnAt(activity))) return 'rejected';
  }
  activity.storeExitAt = new Date(event.exitAt).toISOString();
  activity.storeExitObserved = true;
  activity.storeExitUnobserved = false;
  recordRealHustleExitMetrics(activity);
  // Preserve previously observed exact evidence; a recovery gap is never an entry.
  if (event.entryAt && !activity.storeEntryAt && !activity.storeEntryUnobserved) {
    activity.storeEntryAt = new Date(event.entryAt).toISOString();
    activity.storeEntryObserved = true;
  } else if (!event.entryAt && !activity.storeEntryAt) activity.storeEntryUnobserved = true;
  if (!confirmedStoreReturnAt(activity)) activity.storeReturnConfirmedAt = new Date(event.timestampEpochMs).toISOString();
  activity.nativeReturnEvidence = {eventId:event.eventId,generation:event.generation,storeId:event.storeId,storeRevision:event.storeRevision,
    timestampEpochMs:event.timestampEpochMs,observedAtEpochMs:event.observedAtEpochMs,notificationAt:event.notificationAt};
  shift.updatedAt = new Date(Math.max(Date.parse(shift.updatedAt) || 0, event.timestampEpochMs)).toISOString();
  return 'applied';
}

/** Also resave duplicates: a previous optimistic React update may have failed. */
export async function persistNativeReturnEvent(
  event: NativeReturnEvent,
  commit: (update: (draft: AppData) => void | boolean) => Promise<{status: 'persisted' | 'rejected' | 'failed'}>,
  acknowledge: (eventId: string) => unknown,
  now = Date.now(),
) {
  const result = await commit(draft => reconcileNativeReturnEvent(draft, event, now) !== 'rejected');
  if (result.status === 'persisted') acknowledge(event.eventId);
  return result.status;
}

export function acknowledgeNativeReturnEvent(eventId: string) {
  if (!boundedText(eventId, 256) || typeof window === 'undefined' || window.location.origin !== TRUSTED_SHIFT_TRACKER_ORIGIN || !window.ShiftTrackerNative) return false;
  try { window.ShiftTrackerNative.postMessage(JSON.stringify({type:'shift_tracker_native_return:ack',eventId})); return true; }
  catch { return false; }
}

/** Wait for Android's durable journal and chunked dispatcher, not a guessed delay. */
export function requestNativeDeliveryDrain(shiftId: string, deliveryId: string): Promise<boolean> {
  if (typeof window === 'undefined' || window.location.origin !== TRUSTED_SHIFT_TRACKER_ORIGIN || !window.ShiftTrackerNative) return Promise.resolve(false);
  const requestId = `return-drain-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return new Promise(resolve => {
    const finish = (ok: boolean) => { window.clearTimeout(timeout); unsubscribe(); resolve(ok); };
    const unsubscribe = subscribeToNativeMessages(message => {
      if (message.origin !== TRUSTED_SHIFT_TRACKER_ORIGIN) return;
      let payload: unknown = message.data;
      if (typeof payload === 'string') {
        if (payload.length > 65_536) return;
        try { payload = JSON.parse(payload); } catch { return; }
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
      const result = payload as Record<string, unknown>;
      if (result.type === 'shift_tracker_location:drained' && result.requestId === requestId && result.shiftId === shiftId && result.deliveryId === deliveryId) finish(!result.error);
    });
    const timeout = window.setTimeout(() => finish(false), 120_000);
    try { window.ShiftTrackerNative!.postMessage(JSON.stringify({type:'shift_tracker_location:drain',requestId,shiftId,deliveryId})); }
    catch { finish(false); }
  });
}
