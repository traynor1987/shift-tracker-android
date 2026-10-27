import test from 'node:test';
import assert from 'node:assert/strict';
import { startNativeDeliveryTracking, syncNativeShiftState, TRUSTED_SHIFT_TRACKER_ORIGIN, type NativeShiftSnapshot } from '../lib/nativeBridge.ts';
import { nativeStoreProfile } from '../lib/storeProfiles.ts';
import { emptyData } from '../lib/domain.ts';
test('native start and state sync carry identical explicit store profile and session identity', () => {
 const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window'); const messages: Array<Record<string, unknown>> = [];
 try {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: TRUSTED_SHIFT_TRACKER_ORIGIN }, ShiftTrackerNative: { postMessage: (message: string) => messages.push(JSON.parse(message)) } } });
  const profile = nativeStoreProfile(emptyData().settings, 'maghull');
  assert.equal(startNativeDeliveryTracking('delivery-1', profile, 'shift-1'), true);
  assert.equal(syncNativeShiftState({ shiftId: 'shift-1', activityId: 'delivery-1', storeProfile: profile } as NativeShiftSnapshot), true);
  assert.deepEqual(messages[0].storeProfile, messages[1].storeProfile);
  assert.equal(messages[0].shiftId, 'shift-1'); assert.equal(messages[0].deliveryId, 'delivery-1');
  assert.equal((messages[0].storeProfile as typeof profile).verified, false);
  assert.equal((messages[0].storeProfile as typeof profile).id, 'maghull');
  const changed = nativeStoreProfile({ ...emptyData().settings, maghullGeofence: { latitude: 53.5166, longitude: -2.9432, radius: 80 } }, 'maghull');
  assert.notEqual(profile.revision, changed.revision);
 } finally { if (descriptor) Object.defineProperty(globalThis, 'window', descriptor); else Reflect.deleteProperty(globalThis, 'window'); }
});
