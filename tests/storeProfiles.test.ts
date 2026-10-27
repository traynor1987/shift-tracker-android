import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, createShift } from '../lib/domain.ts';
import { filterStoreShifts, settingsForStore } from '../lib/storeProfiles.ts';
test('provisional Maghull cannot inherit Ormskirk automation or mutate home calibration', () => {
 const home = emptyData().settings; const original = structuredClone(home);
 const cover = settingsForStore(home, 'maghull');
 assert.equal(cover.locationAssistEnabled, false);
 assert.equal(cover.alwaysOnShiftMonitoring, false);
 assert.equal(cover.carryoutDepartureAssistEnabled, false);
 assert.equal(cover.carryoutDepartureZone, null);
 assert.deepEqual(home, original);
 assert.equal(settingsForStore(home, 'ormskirk'), home);
});
test('store filters preserve all records and do not guess historical attribution', () => {
 const shift = createShift(emptyData().settings); const old = structuredClone(shift); delete old.storeId;
 const cover = { ...structuredClone(shift), storeId: 'maghull' as const };
 const shifts = [shift, old, cover];
 assert.equal(filterStoreShifts(shifts, 'all'), shifts);
 assert.deepEqual(filterStoreShifts(shifts, 'maghull'), [cover]);
 assert.deepEqual(filterStoreShifts(shifts, 'ormskirk'), [shift]);
});
