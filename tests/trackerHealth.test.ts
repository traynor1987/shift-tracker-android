import assert from "node:assert/strict";
import test from "node:test";
import { trackingHealth, locationTrackingDemand, newestTrackingFix, shiftFinishChecklist, diagnosticExport } from "../lib/trackerHealth.ts";
import { createShift, emptyData } from "../lib/domain.ts";

test("the app's unacknowledged GPS explanation is setup, not a revoked phone permission", () => {
  const now = Date.now();
  const base = { active: true, enabled: true, status: "setup", now, lastFixAt: null };
  assert.equal(trackingHealth(base).label, "GPS setup needed");
  assert.equal(trackingHealth({ ...base, status: "permission", nativePermission: "precise" }).label, "GPS connection needs retry");
  assert.equal(trackingHealth({ ...base, status: "permission", nativePermission: "missing" }).label, "GPS permission needed");
  const exported = JSON.parse(diagnosticExport({ webVersion: "test", native: { shellVersion: "test", diagnostics: { foregroundLocation: "precise" } } }));
  assert.equal(exported.native.foregroundLocation, "precise");
});

test("a fresh browser fallback supersedes old native fixes and ignores impossible future timestamps", () => {
  const now = Date.now();
  const stamp = newestTrackingFix([now - 90_000, now - 1_000, now + 60_000, null], now);
  assert.equal(stamp, now - 1_000);
  assert.equal(trackingHealth({ active: true, enabled: true, status: "ready", lastFixAt: stamp, now }).label, "GPS receiving");
  assert.equal(newestTrackingFix([null, undefined, NaN], now), null);
});

test("route recording independently enables GPS health while an idle shift stays idle", () => {
  const data = emptyData();
  data.settings.locationAssistEnabled = false;
  data.settings.carryoutDepartureAssistEnabled = false;
  data.settings.recordDeliveryRoutes = true;
  const shift = createShift(data.settings);
  assert.equal(locationTrackingDemand(shift, data.settings).active, false);
  shift.activities?.push({ id: "run", shiftId: shift.id, type: "single_delivery", start: shift.clockIn, end: null, locationAssistEnabled: false });
  const demand = locationTrackingDemand(shift, data.settings);
  assert.deepEqual(demand, { active: true, enabled: true });
  const now = Date.now();
  assert.equal(trackingHealth({ ...demand, status: "searching", lastFixAt: now - 1000, now }).label, "GPS receiving");
});

test("tracking status never labels an old fix as receiving GPS", () => {
  const now = Date.parse("2026-09-30T10:00:00Z");
  const base = { active: true, enabled: true, status: "ready" as const, now, lastFixAt: now - 5000 };
  assert.equal(trackingHealth(base).label, "GPS receiving");
  assert.equal(trackingHealth({ ...base, lastFixAt: now - 90_000 }).label, "GPS delayed");
  assert.equal(trackingHealth({ ...base, lastFixAt: null }).label, "Waiting for GPS");
  assert.equal(trackingHealth({ ...base, lastFixAt: now + 60_000 }).label, "Waiting for GPS");
  assert.equal(trackingHealth({ ...base, recovering: true }).label, "GPS recovering");
  assert.equal(trackingHealth({ ...base, active: false }).label, "GPS idle");
  assert.equal(trackingHealth({ ...base, enabled: false }).label, "GPS off");
  assert.equal(trackingHealth({ ...base, status: "permission" }).label, "GPS permission needed");
});

test("finish checklist includes unfinished delivery, mileage and break without changing records", () => {
  const shift = createShift(emptyData().settings, new Date("2026-09-30T08:00:00Z"));
  shift.activities = [{ id: "run", shiftId: shift.id, type: "double_delivery", start: "2026-09-30T09:00:00Z", end: null, customerDeliveries: 2, customerEvents: [] }];
  const before = JSON.stringify(shift);
  const checks = shiftFinishChecklist(shift, new Date("2026-09-30T15:00:00Z"));
  assert.ok(checks.some(x => x.code === "delivery"));
  assert.ok(checks.some(x => x.code === "mileage"));
  assert.ok(checks.some(x => x.code === "break"));
  assert.equal(JSON.stringify(shift), before);
});

test("management-blocked outcomes are resolved without fabricating task completion", () => {
  const shift = createShift(emptyData().settings, new Date("2026-09-30T08:00:00Z"));
  for (const task of shift.taskSnapshot ?? []) task.managementBlockedAt = "2026-09-30T09:00:00Z";
  assert.equal(shiftFinishChecklist(shift, new Date("2026-09-30T10:00:00Z")).some(x => x.code === "tasks"), false);
  assert.ok((shift.taskSnapshot ?? []).every(task => task.status !== "complete"));
});

test("quick diagnostics export versions and numeric health while excluding arbitrary native data", () => {
  const output = diagnosticExport({ webVersion: "2.1.229", native: { shellVersion: "2.2.70", wearVersion: "2.2.70", diagnostics: { serviceRunning: true, recoveryQueueCount: 3, latitude: 53.5, apiKey: "SECRET", lastSampleRejection: "customer address SECRET" } } });
  const result = JSON.parse(output);
  assert.equal(result.versions.android, "2.2.70");
  assert.equal(result.native.recoveryQueueCount, 3);
  assert.equal(result.native.serviceRunning, true);
  assert.doesNotMatch(output, /SECRET|latitude|customer address/);
});
