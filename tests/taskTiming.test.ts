import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryGeofenceDurations, type ActivityRecord } from '../lib/domain.ts';

test('Real timing rejects an exit/entry belonging before this run instead of rendering zero leave and a long return', () => {
  const activity = { start: '2026-09-24T12:00:00Z', end: '2026-09-24T12:30:00Z', storeExitAt: '2026-09-24T11:00:00Z', storeEntryAt: '2026-09-24T11:15:00Z', storeExitObserved: true, storeEntryObserved: true } as ActivityRecord;
  const timing = deliveryGeofenceDurations(activity);
  assert.equal(timing.preDepartureMs, null);
  assert.equal(timing.returnDelayMs, null);
});

import { applyRealGeofenceTransition } from '../lib/domain.ts';
test('a delayed Real GPS exit cannot be attached to a newer run', () => {
  const activity={start:'2026-09-24T12:00:00Z',end:null} as ActivityRecord;
  assert.equal(applyRealGeofenceTransition(activity,{from:'inside',to:'outside',timestamp:'2026-09-24T11:59:59Z',observed:true}),'rejected');
  assert.equal(activity.storeExitAt,undefined);
});
