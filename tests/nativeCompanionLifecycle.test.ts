import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");

test("terminal delivery paths retain the active shift companion mirror", () => {
  assert.match(component, /const resetEndedDeliveryCompanionPresentation/);
  assert.match(component, /stopNativeDeliveryTracking\(deliveryId\)/);
  const reset = component.slice(component.indexOf("const resetEndedDeliveryCompanionPresentation"), component.indexOf("const clearEndedShiftCompanionPresentation"));
  assert.doesNotMatch(reset, /clearNativeShiftState\(\)/);
  assert.match(component, /setLocationState\(\{ status: "off", presence: "unknown", accuracy: null \}\)/);
  assert.match(component, /const clearEndedShiftCompanionPresentation/);
  assert.match(component, /clearNativeWorkStatus\(\);\s*clearNativeShiftState\(\);/);
});

test("all live delivery terminal routes refresh the native companion, while clock-out clears it", () => {
  const finish = component.slice(component.indexOf("function finishDelivery("), component.indexOf("const requestUndoLastDelivered ="));
  const cancel = component.slice(component.indexOf("const cancelDelivery ="), component.indexOf("const resumeTask ="));
  const clockOut = component.slice(component.indexOf("const clockOut ="), component.indexOf("const updateMileage ="));
  assert.match(finish, /resetEndedDeliveryCompanionPresentation\(running\.id\)/);
  assert.match(cancel, /resetEndedDeliveryCompanionPresentation\(running\.id\)/);
  assert.match(clockOut, /clearEndedShiftCompanionPresentation\(openDeliveryId\)/);
});

test("idle and task companion snapshots cannot retain a delivery geofence label", () => {
  assert.match(component, /storeStatus: delivery\s*\? locationState\.status/);
  assert.match(component, /: "unknown",\s*allowedActions/);
});
