import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mapSource = readFileSync(new URL("../components/RouteMapModal.tsx", import.meta.url), "utf8");
const source = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");

test("dual geofences share the existing canonical GPS ingestion path", () => {
  assert.equal((source.match(/navigator\.geolocation\.watchPosition\(/g) ?? []).length, 1);
  const handler = source.slice(source.indexOf("const applyLocationReading"), source.indexOf("const recordRouteIssue"));
  assert.match(handler, /evaluateGeofenceSample\(\s*dominosGeofenceStateRef\.current/);
  assert.match(handler, /evaluateGeofenceSample\(\s*realGeofenceStateRef\.current,\s*REAL_GEOFENCE_DEFINITION/);
  assert.match(handler, /applyRealGeofenceTransition/);
  assert.doesNotMatch(handler, /DOMINOS[\s\S]{0,500}playGeofenceTone/);
});

test("Domino's transitions cannot drive operational completion or duplicate notifications", () => {
  const comparisonBlock = source.slice(source.indexOf("The comparison boundary consumes"), source.indexOf("if (!currentActive || !deliveryActivity?.locationAssistEnabled)"));
  assert.match(comparisonBlock, /dominosStoreExitAt/);
  assert.match(comparisonBlock, /dominosStoreEntryAt/);
  assert.doesNotMatch(comparisonBlock, /playGeofenceTone|navigator\.vibrate|setLocationState|store_exit|store_entry/);
  assert.match(source, /locationAllowsDeliveryCompletion/);
  assert.match(source, /hasConfirmedStoreReturn/);
});

test("Hustle UI and Expected Delivery Time expose one complete selected dataset", () => {
  assert.match(source, /REAL HUSTLE/);
  assert.match(source, /DOMINO'S HUSTLE/);
  assert.match(mapSource, /weeklyHustleSources\?\.\[hustleSource\]/);
  assert.match(source, /const expectedHustleShifts = useMemo\(\s*\(\) => expectedDeliveryHustleShifts\(data\),\s*\[data\]/);
  assert.match(source, /weeklyHustleAllowance\(\s*expectedDeliveryHustleShifts\(data\),\s*viewingTodayRoute,\s*"real",?\s*\)/);
  assert.match(source, /ROAD ONLY/);
  assert.match(source, /WITH HUSTLE/);
  assert.match(mapSource, /Hustle source:/);
});

test("standard History and CSV call sites request Real Hustle explicitly", () => {
  assert.doesNotMatch(source, /\.map\(deliveryGeofenceDurations\)/);
  assert.equal((source.match(/deliveryGeofenceTimingsForShift\([^\n]+, "real"\)/g) ?? []).length, 2);
});

test("maps and evidence keep Real fixed while Domino's uses the saved reference radius", () => {
  assert.match(source, /DOMINO'S REFERENCE GEOFENCE/);
  assert.match(source, /REAL HUSTLE GEOFENCE/);
  assert.match(mapSource, /Both independent boundaries/);
  assert.match(source, /dominosGeofence\.radius/);
  assert.match(mapSource, /DOMINO'S GEOFENCE · \{dominosGeofence\.radius\}m/);
});
