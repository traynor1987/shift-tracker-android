import test from 'node:test';
import assert from 'node:assert/strict';
import { requestNativeApkUpdate, TRUSTED_SHIFT_TRACKER_ORIGIN } from '../lib/nativeBridge.ts';

test('candidate checks require explicit channel while normal checks and installs stay stable by default', () => {
 const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
 const sent: Array<Record<string, unknown>> = [];
 try {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
   location: { origin: TRUSTED_SHIFT_TRACKER_ORIGIN },
   ShiftTrackerNative: { postMessage: (message: string) => sent.push(JSON.parse(message)) },
  }});
  assert.equal(requestNativeApkUpdate('check'), true);
  assert.equal(requestNativeApkUpdate('check', true, 'candidate'), true);
  assert.equal(requestNativeApkUpdate('install'), true);
  assert.deepEqual(sent.map(item => item.channel), ['stable', 'candidate', 'stable']);
  assert.equal(sent[1].manual, true);
  (globalThis as unknown as {window: {location: {origin: string}}}).window.location.origin = 'https://example.com';
  assert.equal(requestNativeApkUpdate('check', true, 'candidate'), false);
  assert.equal(sent.length, 3);
 } finally {
  if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
  else Reflect.deleteProperty(globalThis, 'window');
 }
});
