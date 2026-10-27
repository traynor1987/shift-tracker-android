import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { applyValidatedBackup, createBackupDocument, validateBackupDocument } from "../lib/backup.ts";
import { createShift, emptyData, repairShiftActivityIds, type AppData } from "../lib/domain.ts";
import {
  IndexedDbConflictError, IndexedDbPersistenceError, LEGACY_PRIMARY_KEY,
  SHIFT_TRACKER_DB_STORES, loadIndexedDbData, openShiftTrackerDatabase,
  persistencePlanForTests, recoveryGenerationCountForTests, testIndexedDbRecoveryReadiness, inspectRecoveryCentre,
  resetIndexedDbSessionForTests, saveIndexedDbData,
} from "../lib/indexedDbStorage.ts";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

let sequence = 0;
function context(data?: AppData) {
  const factory = new IDBFactory();
  const localStorage = new MemoryStorage();
  const databaseName = `ShiftTrackerTest-${++sequence}`;
  if (data) localStorage.setItem(LEGACY_PRIMARY_KEY, JSON.stringify(data));
  return { factory, localStorage, databaseName };
}

function routedData(points = 2) {
  const data = emptyData();
  const shift = repairShiftActivityIds(createShift(data.settings, new Date("2026-08-25T10:00:00.000Z")));
  shift.id = "shift-route";
  shift.activities?.forEach((activity) => { activity.shiftId = shift.id; });
  shift.deliveries = [{ id: "event-route", type: "single", timestamp: "2026-08-25T10:30:00.000Z", reimbursementPence: 100, activityId: "route-1" }];
  shift.activities ??= [];
  shift.activities.push({
    id: "route-1", shiftId: shift.id, type: "single_delivery", start: "2026-08-25T10:10:00.000Z", end: null, deliveryEventId: "event-route", customerDeliveries: 1,
    routeEvidence: { status: "recording", startedAt: "2026-08-25T10:10:00.000Z", completedAt: null, recordedPointCount: points, distanceMetres: 500, gaps: [], issues: [], stops: [], detail: "standard", retention: "90", expiresAt: null, points: Array.from({ length: points }, (_, index) => ({ latitude: 53.568 + index / 10_000, longitude: -2.888, timestamp: new Date(Date.parse("2026-08-25T10:10:00.000Z") + index * 10_000).toISOString(), accuracy: 7, speed: 4, heading: 90 })) },
  });
  data.shifts = [shift];
  return data;
}

test("ordinary GPS saves do not deserialize recovery generations", async () => {
  const data = routedData(500);
  const ctx = { ...context(data), now: new Date("2026-09-29T10:00:00Z") };
  await loadIndexedDbData(ctx);
  // Establish the recovery cadence before observing ordinary route writes.
  await saveIndexedDbData(data, ctx);
  const original = IDBObjectStore.prototype.getAll;
  let recoveryReads = 0;
  IDBObjectStore.prototype.getAll = function (...args) {
    if (this.name === SHIFT_TRACKER_DB_STORES.recovery) recoveryReads += 1;
    return original.apply(this, args);
  };
  try {
    for (let index = 0; index < 3; index++) await saveIndexedDbData(data, ctx);
    assert.equal(recoveryReads, 0);
  } finally {
    IDBObjectStore.prototype.getAll = original;
    resetIndexedDbSessionForTests(ctx.databaseName);
  }
});

test("Recovery Centre inspection is read-only and exposes validated preview candidates", async () => {
  const source = routedData(); const options = context(source); const legacyBefore = options.localStorage.getItem(LEGACY_PRIMARY_KEY);
  await loadIndexedDbData(options);
  const first = await inspectRecoveryCentre(options); const second = await inspectRecoveryCentre(options);
  assert.equal(first.items[0].kind, "current"); assert.equal(first.items[0].valid, true); assert.ok(first.items[0].data);
  assert.ok(first.items.some((item) => item.kind === "legacy" && item.valid));
  assert.equal(second.items.length, first.items.length); assert.equal(options.localStorage.getItem(LEGACY_PRIMARY_KEY), legacyBefore);
  resetIndexedDbSessionForTests(options.databaseName);
});

test("valid localStorage AppData migrates by validated write/read-back and leaves the legacy bytes intact", async () => {
  const source = routedData(); source.settings.hourlyRatePence = 1432;
  const ctx = context(source); const legacyRaw = ctx.localStorage.getItem(LEGACY_PRIMARY_KEY);
  const result = await loadIndexedDbData(ctx);
  assert.equal(result.status, "migrated");
  assert.equal(result.data.settings.hourlyRatePence, 1432);
  assert.equal(ctx.localStorage.getItem(LEGACY_PRIMARY_KEY), legacyRaw);
  assert.match(ctx.localStorage.getItem("dominos-shift-tracker-indexeddb-v1") ?? "", /"migrationComplete":true/);
  assert.equal(await recoveryGenerationCountForTests(ctx), 1);
});

test("migration write failure preserves localStorage and retry succeeds", async () => {
  const ctx = context(routedData()); const legacyRaw = ctx.localStorage.getItem(LEGACY_PRIMARY_KEY);
  const failed = await loadIndexedDbData({ ...ctx, testHooks: { failMigrationWrite: true } });
  assert.equal(failed.status, "failed"); assert.equal(ctx.localStorage.getItem(LEGACY_PRIMARY_KEY), legacyRaw);
  const retried = await loadIndexedDbData(ctx); assert.equal(retried.status, "migrated");
});

test("migration read-back failure preserves localStorage and retry succeeds", async () => {
  const ctx = context(routedData()); const legacyRaw = ctx.localStorage.getItem(LEGACY_PRIMARY_KEY);
  assert.equal((await loadIndexedDbData({ ...ctx, testHooks: { failMigrationReadback: true } })).status, "failed");
  assert.equal(ctx.localStorage.getItem(LEGACY_PRIMARY_KEY), legacyRaw);
  resetIndexedDbSessionForTests(ctx.databaseName);
  assert.equal((await loadIndexedDbData(ctx)).status, "migrated");
});

test("an incomplete migration without its legacy source never initialises an empty dataset over partial records", async () => {
  const source = routedData(); const ctx = context(source);
  assert.equal((await loadIndexedDbData({ ...ctx, testHooks: { failMigrationReadback: true } })).status, "failed");
  ctx.localStorage.removeItem(LEGACY_PRIMARY_KEY);
  const database = await openShiftTrackerDatabase(ctx);
  const transaction = database.transaction(SHIFT_TRACKER_DB_STORES.settings, "readwrite");
  transaction.objectStore(SHIFT_TRACKER_DB_STORES.settings).put({ id: "settings", value: null });
  await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); }); database.close();
  resetIndexedDbSessionForTests(ctx.databaseName);
  const failed = await loadIndexedDbData(ctx);
  assert.equal(failed.status, "failed");
  if (failed.status === "failed") assert.match(failed.reason, /No empty dataset was written/);
});

test("migration validation failure never marks completion or changes invalid localStorage", async () => {
  const ctx = context(); const invalid = "{\"version\":1,\"settings\":"; ctx.localStorage.setItem(LEGACY_PRIMARY_KEY, invalid);
  const result = await loadIndexedDbData(ctx);
  assert.equal(result.status, "failed"); assert.equal(ctx.localStorage.getItem(LEGACY_PRIMARY_KEY), invalid);
  assert.equal(ctx.localStorage.getItem("dominos-shift-tracker-indexeddb-v1"), null);
});

test("an already migrated installation does not remigrate a changed legacy recovery copy", async () => {
  const first = emptyData(); first.settings.hourlyRatePence = 1200; const ctx = context(first);
  await loadIndexedDbData(ctx);
  const changedLegacy = emptyData(); changedLegacy.settings.hourlyRatePence = 9999; ctx.localStorage.setItem(LEGACY_PRIMARY_KEY, JSON.stringify(changedLegacy));
  resetIndexedDbSessionForTests(ctx.databaseName);
  const loaded = await loadIndexedDbData(ctx);
  assert.equal(loaded.status, "loaded"); assert.equal(loaded.data.settings.hourlyRatePence, 1200);
});

test("fresh installations initialise IndexedDB and reload without localStorage AppData", async () => {
  const ctx = context(); const fresh = await loadIndexedDbData(ctx);
  assert.equal(fresh.status, "fresh"); assert.equal(ctx.localStorage.getItem(LEGACY_PRIMARY_KEY), null);
  resetIndexedDbSessionForTests(ctx.databaseName);
  assert.equal((await loadIndexedDbData(ctx)).status, "loaded");
});

test("historical compatibility migration runs before IndexedDB promotion", async () => {
  const legacy = emptyData() as AppData & { settings: Record<string, unknown> };
  delete legacy.settings.includeBetaCleaningData;
  const ctx = context(legacy as AppData); const result = await loadIndexedDbData(ctx);
  assert.notEqual(result.status, "failed");
  if (result.status !== "failed") assert.equal(result.data.settings.includeBetaCleaningData, false);
});

test("an old raw Full Backup imports into IndexedDB without an internal-format conversion", async () => {
  const historical = emptyData() as AppData & { settings: Record<string, unknown> };
  historical.settings.hourlyRatePence = 1475;
  delete historical.settings.shelfLifeHiddenProductIds;
  const validation = validateBackupDocument(historical);
  assert.equal(validation.ok, true);
  if (!validation.ok) return;
  const ctx = context(); const fresh = await loadIndexedDbData(ctx); assert.notEqual(fresh.status, "failed"); if (fresh.status === "failed") return;
  const replacement = applyValidatedBackup(fresh.data, validation, true);
  await saveIndexedDbData(replacement, { ...ctx, recovery: true });
  resetIndexedDbSessionForTests(ctx.databaseName);
  const loaded = await loadIndexedDbData(ctx);
  assert.equal(loaded.status === "failed" ? 0 : loaded.data.settings.hourlyRatePence, 1475);
});

test("transaction abort and quota failures leave the prior canonical revision unchanged after reload", async () => {
  for (const hooks of [{ failWrite: true }, { failWriteWithQuota: true }]) {
    const initial = emptyData(); initial.settings.hourlyRatePence = 1200; const ctx = context(initial); await loadIndexedDbData(ctx);
    const next = structuredClone(initial); next.settings.hourlyRatePence = 1800;
    await assert.rejects(saveIndexedDbData(next, { ...ctx, testHooks: hooks }), IndexedDbPersistenceError);
    resetIndexedDbSessionForTests(ctx.databaseName);
    const reloaded = await loadIndexedDbData(ctx);
    assert.equal(reloaded.status === "failed" ? 0 : reloaded.data.settings.hourlyRatePence, 1200);
  }
});

test("database open failure is recoverable and does not touch legacy source", async () => {
  const ctx = context(routedData()); const raw = ctx.localStorage.getItem(LEGACY_PRIMARY_KEY);
  const result = await loadIndexedDbData({ ...ctx, testHooks: { failOpen: true } });
  assert.equal(result.status, "failed"); assert.equal(ctx.localStorage.getItem(LEGACY_PRIMARY_KEY), raw);
});

test("failed verification reports failure while the committed revision remains loadable", async () => {
  const initial = emptyData(); const ctx = context(initial); await loadIndexedDbData(ctx);
  const next = structuredClone(initial); next.settings.hourlyRatePence = 1555;
  await assert.rejects(saveIndexedDbData(next, { ...ctx, testHooks: { failVerification: true } }), (error) => error instanceof IndexedDbPersistenceError && error.code === "VERIFY");
  resetIndexedDbSessionForTests(ctx.databaseName);
  const loaded = await loadIndexedDbData(ctx);
  assert.equal(loaded.status === "failed" ? 0 : loaded.data.settings.hourlyRatePence, 1555);
});

test("startup offers the newest valid bounded recovery generation when canonical data is invalid", async () => {
  const initial = emptyData(); initial.settings.hourlyRatePence = 1200; const ctx = context(initial);
  await loadIndexedDbData({ ...ctx, now: new Date("2026-08-25T10:00:00.000Z") });
  for (let index = 1; index <= 4; index++) {
    const next = structuredClone(initial); next.settings.hourlyRatePence = 1200 + index;
    await saveIndexedDbData(next, { ...ctx, now: new Date(Date.parse("2026-08-25T10:00:00.000Z") + index * 6 * 60_000) });
  }
  assert.equal(await recoveryGenerationCountForTests(ctx), 3);
  const database = await openShiftTrackerDatabase(ctx);
  const transaction = database.transaction(SHIFT_TRACKER_DB_STORES.settings, "readwrite");
  transaction.objectStore(SHIFT_TRACKER_DB_STORES.settings).put({ id: "settings", value: null });
  await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); }); database.close();
  resetIndexedDbSessionForTests(ctx.databaseName);
  const failed = await loadIndexedDbData(ctx);
  assert.equal(failed.status, "failed");
  if (failed.status !== "failed") return;
  assert.ok(failed.recovery);
  assert.equal(failed.recovery?.data.settings.hourlyRatePence, 1203);
});

test("recovery readiness drill validates without writing or restoring", async () => {
  const initial = emptyData(); const ctx = context(initial);
  const loaded = await loadIndexedDbData({ ...ctx, now: new Date("2026-08-25T10:00:00.000Z") });
  assert.notEqual(loaded.status, "failed");
  const before = loaded.status === "failed" ? 0 : loaded.revision;
  const readiness = await testIndexedDbRecoveryReadiness(ctx);
  assert.equal(readiness.status, "ready");
  assert.equal(readiness.canonicalValid, true);
  assert.equal(readiness.validRecoveryGenerations, 1);
  resetIndexedDbSessionForTests(ctx.databaseName);
  const after = await loadIndexedDbData(ctx);
  assert.equal(after.status === "failed" ? -1 : after.revision, before);
});

test("stale-tab revision conflict cannot overwrite a newer IndexedDB commit", async () => {
  const ctx = context(emptyData()); await loadIndexedDbData(ctx);
  const database = await openShiftTrackerDatabase(ctx);
  const transaction = database.transaction(SHIFT_TRACKER_DB_STORES.metadata, "readwrite");
  transaction.objectStore(SHIFT_TRACKER_DB_STORES.metadata).put({ key: "revision", value: 99 });
  await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); }); database.close();
  await assert.rejects(saveIndexedDbData(emptyData(), ctx), IndexedDbConflictError);
});

test("GPS route points round-trip separately and only the changed delivery route is planned for rewrite", async () => {
  const source = routedData(3); const ctx = context(source); await loadIndexedDbData(ctx);
  resetIndexedDbSessionForTests(ctx.databaseName);
  const loaded = await loadIndexedDbData(ctx);
  assert.equal(loaded.status === "failed" ? 0 : loaded.data.shifts[0].activities?.find((item) => item.id === "route-1")?.routeEvidence?.points.length, 3);
  const existing = [{ activityId: "route-1", shiftId: "shift-route", evidence: structuredClone(source.shifts[0].activities!.find((item) => item.id === "route-1")!.routeEvidence!) }];
  const settingsOnly = structuredClone(source); settingsOnly.settings.theme = "dark";
  assert.deepEqual(persistencePlanForTests(settingsOnly, existing).puts, []);
  const appended = structuredClone(source); appended.shifts[0].activities!.find((item) => item.id === "route-1")!.routeEvidence!.points.push({ latitude: 53.57, longitude: -2.88, timestamp: "2026-08-25T10:12:00.000Z", accuracy: 8 });
  assert.deepEqual(persistencePlanForTests(appended, existing).puts, ["route-1"]);
});

test("delivery deletion removes route ownership atomically", async () => {
  const source = routedData(); const ctx = context(source); await loadIndexedDbData(ctx);
  const removed = structuredClone(source); removed.shifts[0].activities = removed.shifts[0].activities?.filter((item) => item.id !== "route-1"); removed.shifts[0].deliveries = [];
  await saveIndexedDbData(removed, { ...ctx, recovery: true });
  resetIndexedDbSessionForTests(ctx.databaseName);
  const loaded = await loadIndexedDbData(ctx);
  assert.equal(loaded.status === "failed" ? -1 : loaded.data.shifts[0].activities?.some((item) => item.id === "route-1"), false);
  const database = await openShiftTrackerDatabase(ctx); const transaction = database.transaction(SHIFT_TRACKER_DB_STORES.routes, "readonly");
  const count = await new Promise<number>((resolve, reject) => { const request = transaction.objectStore(SHIFT_TRACKER_DB_STORES.routes).count(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  assert.equal(count, 0); database.close();
});

test("validated Full Backup created from loaded IndexedDB restores transactionally", async () => {
  const source = routedData(); const ctx = context(source); const migrated = await loadIndexedDbData(ctx);
  assert.notEqual(migrated.status, "failed"); if (migrated.status === "failed") return;
  const document = createBackupDocument(migrated.data, "2.1.62", new Date("2026-08-25T12:00:00.000Z"));
  const validation = validateBackupDocument(document); assert.equal(validation.ok, true); if (!validation.ok) return;
  const current = structuredClone(migrated.data); current.settings.hourlyRatePence = 1000; await saveIndexedDbData(current, ctx);
  const replacement = applyValidatedBackup(current, validation, true); await saveIndexedDbData(replacement, { ...ctx, recovery: true });
  resetIndexedDbSessionForTests(ctx.databaseName); const restored = await loadIndexedDbData(ctx);
  assert.equal(restored.status === "failed" ? 0 : restored.data.settings.hourlyRatePence, source.settings.hourlyRatePence);
  assert.equal(restored.status === "failed" ? 0 : restored.data.shifts[0].activities?.find((item) => item.id === "route-1")?.routeEvidence?.points.length, 2);
});

test("failed Full Restore write leaves the previous IndexedDB dataset unchanged", async () => {
  const current = emptyData(); current.settings.hourlyRatePence = 1111; const ctx = context(current); await loadIndexedDbData(ctx);
  const replacement = emptyData(); replacement.settings.hourlyRatePence = 2222;
  await assert.rejects(saveIndexedDbData(replacement, { ...ctx, recovery: true, testHooks: { failWrite: true } }));
  resetIndexedDbSessionForTests(ctx.databaseName); const loaded = await loadIndexedDbData(ctx);
  assert.equal(loaded.status === "failed" ? 0 : loaded.data.settings.hourlyRatePence, 1111);
});

test("queued snapshots isolate caller mutation with only one full AppData clone", async () => {
  const data = routedData(30); const ctx = { ...context(data), recovery: false };
  await loadIndexedDbData(ctx);
  const original = globalThis.structuredClone; let fullClones = 0;
  globalThis.structuredClone = ((value: unknown, options?: StructuredSerializeOptions) => {
    if (value && typeof value === 'object' && 'settings' in value && 'shifts' in value) fullClones++;
    return original(value, options);
  }) as typeof structuredClone;
  try {
    const pending = saveIndexedDbData(data, ctx);
    data.settings.hourlyRatePence = 99999;
    data.shifts[0].activities!.at(-1)!.routeEvidence!.points[0].latitude = 1;
    await pending;
    assert.equal(fullClones, 1);
  } finally { globalThis.structuredClone = original; }
  const loaded = await loadIndexedDbData(ctx); assert.notEqual(loaded.status, 'failed');
  if (loaded.status !== 'failed') {
    assert.notEqual(loaded.data.settings.hourlyRatePence, 99999);
    assert.equal(loaded.data.shifts[0].activities!.at(-1)!.routeEvidence!.points[0].latitude, 53.568);
  }
});

test("appending route points avoids serializing both entire changed route records", async () => {
  const data = routedData(30); const ctx = { ...context(data), recovery: false };
  await loadIndexedDbData(ctx); await saveIndexedDbData(data, ctx);
  const evidence = data.shifts[0].activities!.at(-1)!.routeEvidence!;
  evidence.points.push({ ...evidence.points.at(-1)! }); evidence.recordedPointCount++;
  const original = JSON.stringify; let routeSerializations = 0;
  JSON.stringify = ((value: unknown, ...args: unknown[]) => {
    if (value && typeof value === 'object' && 'activityId' in value && 'evidence' in value) routeSerializations++;
    return Reflect.apply(original, JSON, [value, ...args]);
  }) as typeof JSON.stringify;
  try { await saveIndexedDbData(data, ctx); assert.equal(routeSerializations, 0); }
  finally { JSON.stringify = original; }
  const loaded = await loadIndexedDbData(ctx);
  assert.notEqual(loaded.status, 'failed');
  if (loaded.status !== 'failed') assert.equal(loaded.data.shifts[0].activities!.at(-1)!.routeEvidence!.points.length, 31);
});

test("equal-length GPS edits still compare and persist every changed field", async () => {
  const data = routedData(30); const ctx = { ...context(data), recovery: false };
  await loadIndexedDbData(ctx); await saveIndexedDbData(data, ctx);
  const evidence = data.shifts[0].activities!.at(-1)!.routeEvidence!;
  evidence.points[12].latitude = 54; evidence.distanceMetres = 650;
  await saveIndexedDbData(data, ctx);
  const loaded = await loadIndexedDbData(ctx);
  assert.notEqual(loaded.status, 'failed');
  if (loaded.status !== 'failed') {
    const persisted = loaded.data.shifts[0].activities!.at(-1)!.routeEvidence!;
    assert.equal(persisted.points.length, 30);
    assert.equal(persisted.points[12].latitude, 54);
    assert.equal(persisted.distanceMetres, 650);
  }
});
