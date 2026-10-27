import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { createShift, emptyData } from "../lib/domain.ts";

const modulePath = process.argv[2] ?? "../lib/indexedDbStorage.ts";
const storage = await import(modulePath);
const data = emptyData();
const base = Date.parse("2026-09-01T10:00:00Z");
for (let day = 0; day < 12; day++) {
  const start = base + day * 86400_000;
  const shift = createShift(data.settings, new Date(start));
  shift.id = `benchmark-shift-${day}`;
  shift.activities?.forEach(activity => { activity.shiftId = shift.id; });
  const activityId = `benchmark-route-${day}`;
  const eventId = `benchmark-delivery-${day}`;
  shift.deliveries = [{ id: eventId, type: "single", timestamp: new Date(start + 3600_000).toISOString(), reimbursementPence: 100, activityId }];
  shift.activities ??= [];
  shift.activities.push({ id: activityId, shiftId: shift.id, type: "single_delivery", start: new Date(start).toISOString(), end: null, deliveryEventId: eventId, customerDeliveries: 1,
    routeEvidence: { status: "recording", startedAt: new Date(start).toISOString(), completedAt: null, recordedPointCount: 1000, distanceMetres: 500, gaps: [], issues: [], stops: [], detail: "standard", retention: "90", expiresAt: null,
      points: Array.from({ length: 1000 }, (_, index) => ({ latitude: 53.568 + index / 1_000_000, longitude: -2.888, timestamp: new Date(start + index * 2_000).toISOString(), accuracy: 7 })) } });
  data.shifts.push(shift);
}
const options = { factory: new IDBFactory(), databaseName: "storage-benchmark", localStorage: null, now: new Date(base + 20 * 86400_000) };
await storage.loadIndexedDbData(options);
await storage.saveIndexedDbData(data, options);
for (let index = 1; index <= 3; index++) await storage.saveIndexedDbData(data, { ...options, now: new Date(options.now.getTime() + index * 300_000) });
let recoveryReads = 0;
const original = IDBObjectStore.prototype.getAll;
IDBObjectStore.prototype.getAll = function (...args) { if (this.name === "recovery-generations") recoveryReads++; return original.apply(this, args); };
const times = [];
for (let index = 0; index < 20; index++) {
  const at = performance.now();
  await storage.saveIndexedDbData(data, { ...options, now: new Date(options.now.getTime() + 901_000 + index) });
  times.push(performance.now() - at);
}
times.sort((a, b) => a - b);
console.log(JSON.stringify({ environment: "Node fake-indexeddb; synthetic 12 shifts / 12,000 points; not a handset benchmark", saves: times.length, recoveryReads, medianMs: Math.round(times[10]), p95Ms: Math.round(times[18]) }));
IDBObjectStore.prototype.getAll = original;
storage.resetIndexedDbSessionForTests(options.databaseName);
