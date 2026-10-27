import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, getRealStatsGeofence, getDominosReferenceGeofence, REAL_STATS_GEOFENCE } from '../lib/domain.ts';
import { classifyMaghullFix, maghullGeofenceVerified, nativeStoreProfile, settingsForStore, STORES } from '../lib/storeProfiles.ts';
const at = Date.parse('2026-10-27T12:00:00Z');
const fix = (latitude: number, longitude: number, accuracy = 4) => ({ latitude, longitude, accuracy, capturedAt: new Date(at - 10000).toISOString() });
// These are synthetic geometry fixtures, not a claim about the physical car park.
const zone = () => ({ latitude: STORES.maghull.latitude, longitude: STORES.maghull.longitude, radius: 70, insideProof: fix(STORES.maghull.latitude, STORES.maghull.longitude), carParkProof: fix(STORES.maghull.latitude + 0.00025, STORES.maghull.longitude), outsideProof: fix(STORES.maghull.latitude + 0.002, STORES.maghull.longitude), verifiedAt: new Date(at).toISOString() });
test('Maghull requires building, physical car park and outside checks; home is untouched', () => {
 const settings = emptyData().settings; const original = structuredClone(settings);
 assert.equal(maghullGeofenceVerified(settings), false);
 const verified = { ...settings, maghullGeofence: zone() };
 assert.equal(maghullGeofenceVerified(verified), true);
 const projected = settingsForStore(verified, 'maghull');
 assert.equal(projected.locationAssistEnabled, true);
 assert.deepEqual(getRealStatsGeofence(projected), { latitude: zone().latitude, longitude: zone().longitude, radius: 70 });
 assert.deepEqual(getRealStatsGeofence(settingsForStore(verified, 'ormskirk')), { latitude: REAL_STATS_GEOFENCE.latitude, longitude: REAL_STATS_GEOFENCE.longitude, radius: REAL_STATS_GEOFENCE.radius });
 assert.deepEqual(settings, original);
 for (const field of ['insideProof', 'carParkProof', 'outsideProof', 'verifiedAt'] as const) { const incomplete: Partial<ReturnType<typeof zone>> = zone(); delete incomplete[field]; assert.equal(maghullGeofenceVerified({ ...settings, maghullGeofence: incomplete as ReturnType<typeof zone> }), false, field); }
});
test('uncertain, stale, inaccurate, overlapping and outside car park readings cannot verify', () => {
 const settings = emptyData().settings;
 for (const proof of [fix(zone().latitude + .002, zone().longitude), fix(zone().latitude, zone().longitude, 80), fix(zone().latitude, zone().longitude, 0), { ...fix(zone().latitude, zone().longitude), capturedAt: new Date(at - 700000).toISOString() }, { ...fix(zone().latitude, zone().longitude), capturedAt: 'invalid' }]) assert.equal(maghullGeofenceVerified({ ...settings, maghullGeofence: { ...zone(), carParkProof: proof } }), false);
 assert.equal(classifyMaghullFix(zone(), fix(zone().latitude + .0006, zone().longitude, 10), at), 'uncertain');
 assert.equal(classifyMaghullFix({ ...zone(), radius: 0 }, fix(zone().latitude, zone().longitude), at), 'uncertain');
 assert.equal(maghullGeofenceVerified({ ...settings, maghullGeofence: { ...zone(), latitude: zone().latitude + .003 } }), false);
});
test('verification survives restart without pretending old fixes are current and changes revoke it', () => {
 const settings = { ...emptyData().settings, maghullGeofence: zone() };
 const restored = JSON.parse(JSON.stringify(settings));
 assert.equal(maghullGeofenceVerified(restored), true);
 assert.equal(classifyMaghullFix(zone(), zone().insideProof, at + 700000), 'uncertain');
 assert.equal(maghullGeofenceVerified({ ...settings, maghullGeofence: { ...zone(), radius: 15 } }), false);
});
test('preverification route setting preserved; native profile explicitly identifies disabled Maghull', () => {
 const settings = { ...emptyData().settings, recordDeliveryRoutes: true };
 const profile = settingsForStore(settings, 'maghull');
 assert.equal(profile.recordDeliveryRoutes, true); assert.equal(profile.locationAssistEnabled, false); assert.equal(profile.automaticDispatchTimer, false);
 const native = nativeStoreProfile(settings, 'maghull'); assert.equal(native.id, 'maghull'); assert.equal(native.verified, false); assert.equal(native.radius, 0);
 assert.equal(nativeStoreProfile(settings, 'ormskirk').verified, true);
});
test('Dominos comparison radius remains independent of Real and home calibration', () => {
 const settings = { ...emptyData().settings, maghullGeofence: zone(), maghullDominosReferenceRadiusMetres: 90 };
 const projected = settingsForStore(settings, 'maghull');
 assert.equal(getDominosReferenceGeofence(projected).radius, 90); assert.equal(getRealStatsGeofence(projected).radius, 70);
 assert.equal(getDominosReferenceGeofence(settings).radius, 75);
});
