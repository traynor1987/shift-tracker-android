import { recordRuntimeMeasurement } from "./runtimeDiagnostics.ts";
import type { AppData, DeliveryRouteEvidence, Shift } from "./domain.ts";
import { emptyData, migrateAppData, validateData } from "./domain.ts";
import { validateAppDataStructure } from "./backup.ts";

export const SHIFT_TRACKER_DB_NAME = "ShiftTrackerDB";
export const SHIFT_TRACKER_DB_VERSION = 1;
export const SHIFT_TRACKER_DB_STORES = Object.freeze({
  core: "app-core",
  settings: "settings",
  shifts: "shifts",
  payroll: "payroll",
  rota: "rota-attendance",
  routes: "gps-routes",
  recovery: "recovery-generations",
  metadata: "migration-metadata",
});

export const LEGACY_PRIMARY_KEY = "dominos-shift-tracker-v1";
const LEGACY_RECOVERY_KEY = "dominos-shift-tracker-v1-recovery-v2";
const LEGACY_FAILED_SOURCE_KEY = "dominos-shift-tracker-v1-failed-source-v1";
const BOOTSTRAP_KEY = "dominos-shift-tracker-indexeddb-v1";
const REVISION_KEY = "dominos-shift-tracker-v1-revision-v1";
const RECOVERY_INTERVAL_MS = 5 * 60_000;
const MAX_RECOVERY_GENERATIONS = 3;
const HIGH_PRESSURE_RECOVERY_GENERATIONS = 2;
const CACHE_KEYS = [
  "shift-tracker-google-routes-cache-v1",
  "shift-tracker-google-geocoding-cache-v2",
  "shift-tracker-nova-vision-cache-v1",
  "shift-tracker-osm-road-context-v1",
  "shift-tracker-osm-road-signals-v3",
  "shift-tracker-osm-road-signals-v2",
];

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type RecoverySnapshot = { kind: "shift-tracker-indexeddb-recovery"; version: 1; generationId: string; revision: number; savedAt: string; data: AppData };
export type StorageHealth = { usage: number | null; quota: number | null; percentage: number | null; status: "Healthy" | "Elevated" | "High" | "Unavailable"; persisted: boolean | null };

export type SafeDataLoadResult =
  | { status: "fresh" | "loaded" | "migrated"; data: AppData; revision: number; legacyCopyRetained: boolean }
  | { status: "failed"; failedRaw: string; reason: string; recovery: RecoverySnapshot | null; revision: number };

export type StorageTestHooks = {
  failOpen?: boolean;
  failMigrationWrite?: boolean;
  failMigrationReadback?: boolean;
  failWrite?: boolean;
  failWriteWithQuota?: boolean;
  failVerification?: boolean;
};

export type StorageOptions = {
  factory?: IDBFactory | null;
  localStorage?: StorageLike | null;
  databaseName?: string;
  now?: Date;
  force?: boolean;
  recovery?: boolean;
  testHooks?: StorageTestHooks;
};

type MetaRecord = { key: string; value: unknown };
type CoreRecord = Pick<AppData, "version" | "lastBackupAt" | "settingsRevision" | "cleaningRota" | "preparationRota"> & { id: "app" };
type SettingsRecord = { id: "settings"; value: AppData["settings"] };
type PayrollRecord = { id: "payroll"; payments: AppData["payments"]; payrollSchedules: AppData["payrollSchedules"] };
type RotaRecord = { id: "rota"; rotaWeeks: AppData["rotaWeeks"] };
type ShiftRecord = { id: string; shift: Shift; routeActivityIds: string[] };
type RouteRecord = { activityId: string; shiftId: string; evidence: DeliveryRouteEvidence };
type CanonicalParts = { core: CoreRecord; settings: SettingsRecord; payroll: PayrollRecord; rota: RotaRecord; shifts: ShiftRecord[]; routes: RouteRecord[] };

type Session = { revision: number; ready: boolean; queue: Promise<unknown>; channel: BroadcastChannel | null; pending: number };
const sessions = new Map<string, Session>();

function session(databaseName: string) {
  let value = sessions.get(databaseName);
  if (!value) {
    value = { revision: 0, ready: false, queue: Promise.resolve(), channel: null, pending: 0 };
    sessions.set(databaseName, value);
  }
  return value;
}

function browserFactory() { return typeof indexedDB === "undefined" ? null : indexedDB; }
function browserLocalStorage(): StorageLike | null {
  try { return typeof window === "undefined" ? null : window.localStorage; }
  catch { return null; }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was cancelled"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

export function openShiftTrackerDatabase(options: StorageOptions = {}): Promise<IDBDatabase> {
  const factory = options.factory === undefined ? browserFactory() : options.factory;
  if (!factory || options.testHooks?.failOpen) return Promise.reject(new Error("IndexedDB is unavailable"));
  const databaseName = options.databaseName ?? SHIFT_TRACKER_DB_NAME;
  return new Promise((resolve, reject) => {
    const request = factory.open(databaseName, SHIFT_TRACKER_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const name of Object.values(SHIFT_TRACKER_DB_STORES)) {
        if (database.objectStoreNames.contains(name)) continue;
        if (name === SHIFT_TRACKER_DB_STORES.shifts) database.createObjectStore(name, { keyPath: "id" });
        else if (name === SHIFT_TRACKER_DB_STORES.routes) database.createObjectStore(name, { keyPath: "activityId" });
        else if (name === SHIFT_TRACKER_DB_STORES.recovery) database.createObjectStore(name, { keyPath: "generationId" });
        else if (name === SHIFT_TRACKER_DB_STORES.metadata) database.createObjectStore(name, { keyPath: "key" });
        else database.createObjectStore(name, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened"));
    request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another open Shift Tracker tab"));
  });
}

function validatedData(value: unknown): AppData {
  if (!validateData(value)) throw new Error("Saved data does not match the Shift Tracker schema.");
  const migrated = migrateAppData(value);
  const validation = validateAppDataStructure(migrated, { enforceRelationships: false });
  if (!validation.ok) throw new Error(validation.message);
  return migrated;
}

function splitData(data: AppData): CanonicalParts {
  const started = performance.now();
  const routes: RouteRecord[] = [];
  const shifts = data.shifts.map((source) => {
    const shift = structuredClone(source);
    const routeActivityIds: string[] = [];
    for (const activity of shift.activities ?? []) {
      if (!activity.routeEvidence) continue;
      routeActivityIds.push(activity.id);
      routes.push({ activityId: activity.id, shiftId: shift.id, evidence: activity.routeEvidence });
      activity.routeEvidence = null;
    }
    return { id: shift.id, shift, routeActivityIds };
  });
  recordRuntimeMeasurement("persistence_split", performance.now() - started);
  return {
    core: { id: "app", version: data.version, lastBackupAt: data.lastBackupAt, settingsRevision: data.settingsRevision, cleaningRota: structuredClone(data.cleaningRota), preparationRota: structuredClone(data.preparationRota) },
    settings: { id: "settings", value: structuredClone(data.settings) },
    payroll: { id: "payroll", payments: structuredClone(data.payments), payrollSchedules: structuredClone(data.payrollSchedules) },
    rota: { id: "rota", rotaWeeks: structuredClone(data.rotaWeeks) },
    shifts,
    routes,
  };
}

function reconstructData(parts: Partial<CanonicalParts>): AppData {
  if (!parts.core || !parts.settings || !parts.payroll || !parts.rota || !parts.shifts || !parts.routes) throw new Error("IndexedDB canonical records are incomplete.");
  const routeMap = new Map(parts.routes.map((route) => [route.activityId, route]));
  const shifts = parts.shifts.map((record) => {
    const shift = structuredClone(record.shift);
    for (const activityId of record.routeActivityIds) {
      const route = routeMap.get(activityId);
      const activity = shift.activities?.find((candidate) => candidate.id === activityId);
      if (!route || !activity || route.shiftId !== shift.id) throw new Error(`GPS route ownership is incomplete for ${activityId}.`);
      activity.routeEvidence = structuredClone(route.evidence);
    }
    return shift;
  });
  return validatedData({
    version: parts.core.version,
    settings: structuredClone(parts.settings.value),
    shifts,
    payments: structuredClone(parts.payroll.payments),
    payrollSchedules: structuredClone(parts.payroll.payrollSchedules),
    lastBackupAt: parts.core.lastBackupAt,
    settingsRevision: parts.core.settingsRevision,
    cleaningRota: structuredClone(parts.core.cleaningRota),
    preparationRota: structuredClone(parts.core.preparationRota),
    rotaWeeks: structuredClone(parts.rota.rotaWeeks),
  });
}

async function readCanonical(database: IDBDatabase): Promise<AppData> {
  const names = [SHIFT_TRACKER_DB_STORES.core, SHIFT_TRACKER_DB_STORES.settings, SHIFT_TRACKER_DB_STORES.payroll, SHIFT_TRACKER_DB_STORES.rota, SHIFT_TRACKER_DB_STORES.shifts, SHIFT_TRACKER_DB_STORES.routes];
  const transaction = database.transaction(names, "readonly");
  const [core, settings, payroll, rota, shifts, routes] = await Promise.all([
    requestResult(transaction.objectStore(SHIFT_TRACKER_DB_STORES.core).get("app")),
    requestResult(transaction.objectStore(SHIFT_TRACKER_DB_STORES.settings).get("settings")),
    requestResult(transaction.objectStore(SHIFT_TRACKER_DB_STORES.payroll).get("payroll")),
    requestResult(transaction.objectStore(SHIFT_TRACKER_DB_STORES.rota).get("rota")),
    requestResult(transaction.objectStore(SHIFT_TRACKER_DB_STORES.shifts).getAll()),
    requestResult(transaction.objectStore(SHIFT_TRACKER_DB_STORES.routes).getAll()),
  ]);
  await transactionDone(transaction);
  return reconstructData({ core: core as CoreRecord, settings: settings as SettingsRecord, payroll: payroll as PayrollRecord, rota: rota as RotaRecord, shifts: shifts as ShiftRecord[], routes: routes as RouteRecord[] });
}

async function readMeta(database: IDBDatabase, key: string): Promise<unknown> {
  const transaction = database.transaction(SHIFT_TRACKER_DB_STORES.metadata, "readonly");
  const record = await requestResult(transaction.objectStore(SHIFT_TRACKER_DB_STORES.metadata).get(key)) as MetaRecord | undefined;
  await transactionDone(transaction);
  return record?.value;
}

function same(left: unknown, right: unknown) {
  const started = performance.now();
  try { return JSON.stringify(left) === JSON.stringify(right); }
  finally { recordRuntimeMeasurement("persistence_compare", performance.now() - started); }
}

function sameRoute(left: RouteRecord | undefined, right: RouteRecord) {
  // Different point counts prove inequality without serializing two complete
  // traces. Equal lengths still receive the full comparison (including edits).
  if (!left || left.evidence.points.length !== right.evidence.points.length) return false;
  return same(left, right);
}
function generationId(revision: number, now: Date) { return `r${revision}-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`; }

async function putCanonical(database: IDBDatabase, data: AppData, options: { expectedRevision: number | null; nextRevision: number; now: Date; migrationStatus?: "validating" | "complete"; recovery?: RecoverySnapshot | null; replaceRecovery?: boolean; hooks?: StorageTestHooks }) {
  const parts = splitData(data);
  const names = Object.values(SHIFT_TRACKER_DB_STORES);
  const transactionStarted = performance.now();
  const transaction = database.transaction(names, "readwrite");
  const done = transactionDone(transaction);
  try {
    const metadata = transaction.objectStore(SHIFT_TRACKER_DB_STORES.metadata);
    const persistedRevisionRecord = await requestResult(metadata.get("revision")) as MetaRecord | undefined;
    const persistedRevision = Number(persistedRevisionRecord?.value ?? 0);
    if (options.expectedRevision != null && persistedRevision !== options.expectedRevision) {
      transaction.abort();
      throw new Error("STALE_REVISION");
    }
    if (options.hooks?.failMigrationWrite || options.hooks?.failWrite || options.hooks?.failWriteWithQuota) {
      transaction.abort();
      if (options.hooks.failWriteWithQuota) throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      throw new Error("SIMULATED_TRANSACTION_ABORT");
    }

    const writeSingleton = async (storeName: string, key: string, value: unknown) => {
      const store = transaction.objectStore(storeName);
      const current = await requestResult(store.get(key));
      if (!same(current, value)) store.put(value);
    };
    await writeSingleton(SHIFT_TRACKER_DB_STORES.core, "app", parts.core);
    await writeSingleton(SHIFT_TRACKER_DB_STORES.settings, "settings", parts.settings);
    await writeSingleton(SHIFT_TRACKER_DB_STORES.payroll, "payroll", parts.payroll);
    await writeSingleton(SHIFT_TRACKER_DB_STORES.rota, "rota", parts.rota);

    const shiftStore = transaction.objectStore(SHIFT_TRACKER_DB_STORES.shifts);
    const existingShifts = await requestResult(shiftStore.getAll()) as ShiftRecord[];
    const nextShiftIds = new Set(parts.shifts.map((record) => record.id));
    for (const record of existingShifts) if (!nextShiftIds.has(record.id)) shiftStore.delete(record.id);
    const existingShiftMap = new Map(existingShifts.map((record) => [record.id, record]));
    for (const record of parts.shifts) if (!same(existingShiftMap.get(record.id), record)) shiftStore.put(record);

    const routeStore = transaction.objectStore(SHIFT_TRACKER_DB_STORES.routes);
    const existingRoutes = await requestResult(routeStore.getAll()) as RouteRecord[];
    const nextRouteIds = new Set(parts.routes.map((record) => record.activityId));
    for (const record of existingRoutes) if (!nextRouteIds.has(record.activityId)) routeStore.delete(record.activityId);
    const existingRouteMap = new Map(existingRoutes.map((record) => [record.activityId, record]));
    for (const record of parts.routes) if (!sameRoute(existingRouteMap.get(record.activityId), record)) routeStore.put(record);

    const recoveryStore = transaction.objectStore(SHIFT_TRACKER_DB_STORES.recovery);
    if (options.replaceRecovery) recoveryStore.clear();
    if (options.recovery) recoveryStore.put(options.recovery);
    // Each recovery contains the complete history and GPS routes. Reading
    // them on every provider point cloned up to three full datasets just to
    // check a retention limit that cannot change without an insertion.
    if (options.recovery) {
      const recoveries = await requestResult(recoveryStore.getAll()) as RecoverySnapshot[];
      const retained = recoveries.sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt));
      for (const old of retained.slice(MAX_RECOVERY_GENERATIONS)) recoveryStore.delete(old.generationId);
    }

    metadata.put({ key: "revision", value: options.nextRevision } satisfies MetaRecord);
    metadata.put({ key: "generationId", value: generationId(options.nextRevision, options.now) } satisfies MetaRecord);
    metadata.put({ key: "lastSuccessfulSaveAt", value: options.now.toISOString() } satisfies MetaRecord);
    if (options.migrationStatus) metadata.put({ key: "migration", value: { status: options.migrationStatus, schemaVersion: SHIFT_TRACKER_DB_VERSION, updatedAt: options.now.toISOString() } } satisfies MetaRecord);
  } catch (error) {
    try { transaction.abort(); } catch { /* already aborted */ }
    await done.catch(() => undefined);
    throw error;
  }
  await done;
  recordRuntimeMeasurement("persistence_transaction", performance.now() - transactionStarted);
}

async function newestRecovery(database: IDBDatabase): Promise<RecoverySnapshot | null> {
  try {
    const transaction = database.transaction(SHIFT_TRACKER_DB_STORES.recovery, "readonly");
    const values = await requestResult(transaction.objectStore(SHIFT_TRACKER_DB_STORES.recovery).getAll()) as RecoverySnapshot[];
    await transactionDone(transaction);
    for (const snapshot of values.sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt))) {
      try { return { ...snapshot, data: validatedData(snapshot.data) }; } catch { /* skip invalid generations */ }
    }
  } catch { /* database recovery is best effort */ }
  return null;
}

function readLegacyRecovery(source: StorageLike | null): RecoverySnapshot | null {
  try {
    const parsed = JSON.parse(source?.getItem(LEGACY_RECOVERY_KEY) ?? "null") as { savedAt?: string; data?: unknown } | null;
    if (!parsed?.savedAt || !parsed.data || !Number.isFinite(Date.parse(parsed.savedAt))) return null;
    return { kind: "shift-tracker-indexeddb-recovery", version: 1, generationId: `legacy-recovery-${Date.parse(parsed.savedAt)}`, revision: 0, savedAt: parsed.savedAt, data: validatedData(parsed.data) };
  } catch { return null; }
}

function preserveFailedLegacySource(source: StorageLike | null, raw: string, reason: string) {
  try { source?.setItem(LEGACY_FAILED_SOURCE_KEY, JSON.stringify({ kind: "shift-tracker-failed-source", version: 1, capturedAt: new Date().toISOString(), reason, raw })); }
  catch { /* the untouched primary remains the recovery evidence */ }
}

function writeBootstrap(source: StorageLike | null, revision: number, now: Date, migrated: boolean) {
  try {
    source?.setItem(BOOTSTRAP_KEY, JSON.stringify({ version: 1, databaseName: SHIFT_TRACKER_DB_NAME, databaseVersion: SHIFT_TRACKER_DB_VERSION, migrationComplete: true, legacyRecoveryCopyRetained: migrated, revision, updatedAt: now.toISOString() }));
    source?.setItem(REVISION_KEY, JSON.stringify({ version: 1, revision, updatedAt: now.toISOString(), primary: "indexeddb" }));
  } catch { /* tiny bootstrap metadata is optional once IndexedDB is valid */ }
}

async function markMigrationComplete(database: IDBDatabase, now: Date) {
  const transaction = database.transaction(SHIFT_TRACKER_DB_STORES.metadata, "readwrite");
  transaction.objectStore(SHIFT_TRACKER_DB_STORES.metadata).put({ key: "migration", value: { status: "complete", schemaVersion: SHIFT_TRACKER_DB_VERSION, completedAt: now.toISOString(), updatedAt: now.toISOString() } } satisfies MetaRecord);
  await transactionDone(transaction);
}

async function registerSuccessfulStartup(database: IDBDatabase, now: Date) {
  try {
    const current = Number(await readMeta(database, "successfulStartups") ?? 0);
    const transaction = database.transaction(SHIFT_TRACKER_DB_STORES.metadata, "readwrite");
    const store = transaction.objectStore(SHIFT_TRACKER_DB_STORES.metadata);
    store.put({ key: "successfulStartups", value: current + 1 } satisfies MetaRecord);
    store.put({ key: "lastSuccessfulStartupAt", value: now.toISOString() } satisfies MetaRecord);
    await transactionDone(transaction);
  } catch { /* diagnostics must never block a valid startup */ }
}

export async function loadIndexedDbData(options: StorageOptions = {}): Promise<SafeDataLoadResult> {
  const now = options.now ?? new Date();
  const databaseName = options.databaseName ?? SHIFT_TRACKER_DB_NAME;
  const source = options.localStorage === undefined ? browserLocalStorage() : options.localStorage;
  const legacyRaw = (() => { try { return source?.getItem(LEGACY_PRIMARY_KEY) ?? null; } catch { return null; } })();
  let database: IDBDatabase | null = null;
  try {
    database = await openShiftTrackerDatabase(options);
    const migration = await readMeta(database, "migration") as { status?: string } | undefined;
    if (migration?.status === "complete") {
      const data = await readCanonical(database);
      const revision = Number(await readMeta(database, "revision") ?? 0);
      const activeSession = session(databaseName); activeSession.revision = revision; activeSession.ready = true;
      writeBootstrap(source, revision, now, Boolean(legacyRaw));
      void registerSuccessfulStartup(database, now);
      return { status: "loaded", data, revision, legacyCopyRetained: Boolean(legacyRaw) };
    }

    let candidate: AppData;
    let migrated = false;
    if (legacyRaw) {
      candidate = validatedData(JSON.parse(legacyRaw));
      migrated = true;
    } else {
      try { candidate = await readCanonical(database); }
      catch {
        if (migration?.status) throw new Error("An incomplete IndexedDB migration was found without its legacy source. No empty dataset was written over it.");
        candidate = emptyData();
      }
    }
    const legacyRecovery = readLegacyRecovery(source);
    const migrationRecovery: RecoverySnapshot = { kind: "shift-tracker-indexeddb-recovery", version: 1, generationId: `migration-source-${now.getTime()}`, revision: 0, savedAt: now.toISOString(), data: structuredClone(candidate) };
    await putCanonical(database, candidate, { expectedRevision: null, nextRevision: 1, now, migrationStatus: "validating", recovery: legacyRecovery ?? migrationRecovery, replaceRecovery: true, hooks: options.testHooks });
    if (legacyRecovery) {
      const transaction = database.transaction(SHIFT_TRACKER_DB_STORES.recovery, "readwrite");
      transaction.objectStore(SHIFT_TRACKER_DB_STORES.recovery).put(migrationRecovery);
      await transactionDone(transaction);
    }
    if (options.testHooks?.failMigrationReadback) throw new Error("SIMULATED_MIGRATION_READBACK_FAILURE");
    const readBack = await readCanonical(database);
    validatedData(readBack);
    await markMigrationComplete(database, now);
    const activeSession = session(databaseName); activeSession.revision = 1; activeSession.ready = true;
    writeBootstrap(source, 1, now, migrated);
    void registerSuccessfulStartup(database, now);
    return { status: migrated ? "migrated" : "fresh", data: readBack, revision: 1, legacyCopyRetained: migrated };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "IndexedDB migration or startup failed.";
    if (legacyRaw) preserveFailedLegacySource(source, legacyRaw, reason);
    const recovery = database ? await newestRecovery(database) : readLegacyRecovery(source);
    return { status: "failed", failedRaw: legacyRaw ?? "", reason, recovery, revision: 0 };
  } finally { database?.close(); }
}

export class IndexedDbPersistenceError extends Error {
  readonly code: "OPEN" | "VALIDATION" | "WRITE" | "VERIFY" | "QUOTA" | "CONFLICT";
  constructor(message: string, code: IndexedDbPersistenceError["code"]) { super(message); this.name = "IndexedDbPersistenceError"; this.code = code; }
}
export class IndexedDbConflictError extends IndexedDbPersistenceError {
  constructor() { super("Another Shift Tracker tab saved newer data. This tab has stopped saving to protect that newer copy.", "CONFLICT"); this.name = "IndexedDbConflictError"; }
}

async function saveDirect(data: AppData, options: StorageOptions = {}) {
  const validationStarted = performance.now();
  const validation = validateAppDataStructure(data, { enforceRelationships: false });
  recordRuntimeMeasurement("persistence_validation", performance.now() - validationStarted);
  if (!validation.ok) throw new IndexedDbPersistenceError(`The updated data was not saved because it failed validation: ${validation.message}`, "VALIDATION");
  const databaseName = options.databaseName ?? SHIFT_TRACKER_DB_NAME;
  const activeSession = session(databaseName);
  if (!activeSession.ready && !options.force) throw new IndexedDbPersistenceError("IndexedDB has not completed safe startup yet.", "OPEN");
  const now = options.now ?? new Date();
  let database: IDBDatabase;
  try { database = await openShiftTrackerDatabase(options); }
  catch { throw new IndexedDbPersistenceError("Shift Tracker could not open its IndexedDB database.", "OPEN"); }
  try {
    const lastRecoveryAt = String(await readMeta(database, "lastRecoveryAt") ?? "");
    const recoveryDue = options.recovery !== false && (!Number.isFinite(Date.parse(lastRecoveryAt)) || now.getTime() - Date.parse(lastRecoveryAt) >= RECOVERY_INTERVAL_MS);
    let recovery: RecoverySnapshot | null = null;
    if (recoveryDue) {
      try {
        const previous = await readCanonical(database);
        recovery = { kind: "shift-tracker-indexeddb-recovery", version: 1, generationId: generationId(activeSession.revision, now), revision: activeSession.revision, savedAt: now.toISOString(), data: previous };
      } catch { /* never promote invalid current data into recovery */ }
    }
    const nextRevision = activeSession.revision + 1;
    try {
      await putCanonical(database, data, { expectedRevision: options.force ? null : activeSession.revision, nextRevision, now, migrationStatus: "complete", recovery, hooks: options.testHooks });
    } catch (error) {
      if (error instanceof DOMException && error.name === "QuotaExceededError") throw new IndexedDbPersistenceError("Shift Tracker ran out of browser storage while saving. The previous database transaction remains intact.", "QUOTA");
      if (error instanceof Error && error.message === "STALE_REVISION") throw new IndexedDbConflictError();
      throw new IndexedDbPersistenceError("Shift Tracker could not save the update. The previous IndexedDB transaction remains intact.", "WRITE");
    }
    if (recovery) {
      const transaction = database.transaction(SHIFT_TRACKER_DB_STORES.metadata, "readwrite");
      transaction.objectStore(SHIFT_TRACKER_DB_STORES.metadata).put({ key: "lastRecoveryAt", value: now.toISOString() } satisfies MetaRecord);
      await transactionDone(transaction);
    }
    const verifiedRevision = options.testHooks?.failVerification ? -1 : Number(await readMeta(database, "revision") ?? -1);
    if (verifiedRevision !== nextRevision) throw new IndexedDbPersistenceError("Shift Tracker could not verify the saved IndexedDB revision.", "VERIFY");
    activeSession.revision = nextRevision; activeSession.ready = true;
    const source = options.localStorage === undefined ? browserLocalStorage() : options.localStorage;
    writeBootstrap(source, nextRevision, now, Boolean(source?.getItem(LEGACY_PRIMARY_KEY)));
    activeSession.channel?.postMessage({ type: "revision", revision: nextRevision });
    return { revision: nextRevision };
  } finally { database.close(); }
}

export function saveIndexedDbData(data: AppData, options: StorageOptions = {}) {
  const databaseName = options.databaseName ?? SHIFT_TRACKER_DB_NAME;
  const activeSession = session(databaseName);
  const snapshotStarted = performance.now();
  const snapshot = structuredClone(data);
  recordRuntimeMeasurement("persistence_snapshot", performance.now() - snapshotStarted);
  const enqueuedAt = performance.now();
  activeSession.pending++;
  recordRuntimeMeasurement("persistence_queue_depth", activeSession.pending);
  const task = activeSession.queue.catch(() => undefined).then(async () => {
    recordRuntimeMeasurement("persistence_queue_wait", performance.now() - enqueuedAt);
    const started = performance.now();
    try { return await saveDirect(snapshot, options); }
    finally {
      recordRuntimeMeasurement("persistence_write", performance.now() - started);
      activeSession.pending--;
      recordRuntimeMeasurement("persistence_queue_depth", activeSession.pending);
    }
  });
  activeSession.queue = task;
  return task;
}

export async function restoreIndexedDbRecovery(data: AppData, options: StorageOptions = {}) {
  const databaseName = options.databaseName ?? SHIFT_TRACKER_DB_NAME;
  const activeSession = session(databaseName); activeSession.ready = true;
  if (!activeSession.revision) {
    const database = await openShiftTrackerDatabase(options);
    try { activeSession.revision = Number(await readMeta(database, "revision") ?? 0); } finally { database.close(); }
  }
  return saveIndexedDbData(data, { ...options, force: true, recovery: true });
}

export async function initialiseFreshIndexedDb(options: StorageOptions = {}) {
  return restoreIndexedDbRecovery(emptyData(), options);
}

export function subscribeToIndexedDbChanges(listener: (revision: number) => void, databaseName = SHIFT_TRACKER_DB_NAME) {
  if (typeof BroadcastChannel === "undefined") return () => undefined;
  const activeSession = session(databaseName);
  const channel = new BroadcastChannel(`shift-tracker:${databaseName}:revisions`);
  activeSession.channel = channel;
  channel.onmessage = (event) => {
    const revision = Number(event.data?.revision);
    if (Number.isInteger(revision) && revision > activeSession.revision) listener(revision);
  };
  return () => { if (activeSession.channel === channel) activeSession.channel = null; channel.close(); };
}

export function isIndexedDbRevisionStorageEvent(event: Pick<StorageEvent, "key" | "newValue">, databaseName = SHIFT_TRACKER_DB_NAME) {
  if (event.key !== REVISION_KEY || !event.newValue) return false;
  try { return Number(JSON.parse(event.newValue).revision) > session(databaseName).revision; } catch { return false; }
}

export function indexedDbWriteWasSuperseded(error: unknown) { return error instanceof IndexedDbConflictError; }

export async function getStorageHealth(): Promise<StorageHealth> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    const usage = typeof estimate?.usage === "number" ? estimate.usage : null;
    const quota = typeof estimate?.quota === "number" ? estimate.quota : null;
    const percentage = usage != null && quota ? usage / quota * 100 : null;
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
    return { usage, quota, percentage, status: percentage == null ? "Unavailable" : percentage >= 90 ? "High" : percentage >= 75 ? "Elevated" : "Healthy", persisted };
  } catch { return { usage: null, quota: null, percentage: null, status: "Unavailable", persisted: null }; }
}

export async function requestPersistentStorageOnce(options: StorageOptions = {}) {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return null;
  const database = await openShiftTrackerDatabase(options);
  try {
    const attempted = await readMeta(database, "persistentStorageAttempted");
    if (attempted === true) return navigator.storage.persisted ? navigator.storage.persisted() : null;
    const granted = await navigator.storage.persist();
    const transaction = database.transaction(SHIFT_TRACKER_DB_STORES.metadata, "readwrite");
    const store = transaction.objectStore(SHIFT_TRACKER_DB_STORES.metadata);
    store.put({ key: "persistentStorageAttempted", value: true } satisfies MetaRecord);
    store.put({ key: "persistentStorageGranted", value: granted } satisfies MetaRecord);
    await transactionDone(transaction);
    return granted;
  } finally { database.close(); }
}

export async function applyHighStoragePressurePolicy(options: StorageOptions = {}) {
  const health = await getStorageHealth();
  if (health.status !== "High") return { health, pruned: false };
  const source = options.localStorage === undefined ? browserLocalStorage() : options.localStorage;
  for (const key of CACHE_KEYS) { try { source?.removeItem(key); } catch { /* cache pruning is best effort */ } }
  try {
    const database = await openShiftTrackerDatabase(options);
    const transaction = database.transaction(SHIFT_TRACKER_DB_STORES.recovery, "readwrite");
    const store = transaction.objectStore(SHIFT_TRACKER_DB_STORES.recovery);
    const recoveries = await requestResult(store.getAll()) as RecoverySnapshot[];
    recoveries.sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt)).slice(HIGH_PRESSURE_RECOVERY_GENERATIONS).forEach((item) => store.delete(item.generationId));
    await transactionDone(transaction);
    database.close();
  } catch { /* core data is never pruned when cleanup is unavailable */ }
  return { health: await getStorageHealth(), pruned: true };
}

export function resetIndexedDbSessionForTests(databaseName = SHIFT_TRACKER_DB_NAME) {
  sessions.get(databaseName)?.channel?.close();
  sessions.delete(databaseName);
}

export function persistencePlanForTests(data: AppData, existingRoutes: RouteRecord[]) {
  const next = splitData(data).routes;
  const existing = new Map(existingRoutes.map((record) => [record.activityId, record]));
  return {
    puts: next.filter((record) => !sameRoute(existing.get(record.activityId), record)).map((record) => record.activityId),
    deletes: existingRoutes.filter((record) => !next.some((candidate) => candidate.activityId === record.activityId)).map((record) => record.activityId),
  };
}

export async function recoveryGenerationCountForTests(options: StorageOptions = {}) {
  const database = await openShiftTrackerDatabase(options);
  try {
    const transaction = database.transaction(SHIFT_TRACKER_DB_STORES.recovery, "readonly");
    const count = await requestResult(transaction.objectStore(SHIFT_TRACKER_DB_STORES.recovery).count());
    await transactionDone(transaction);
    return count;
  } finally { database.close(); }
}

export type RecoveryReadiness = {
  status: "ready" | "limited";
  canonicalValid: boolean;
  validRecoveryGenerations: number;
  newestRecoveryAt: string | null;
};

export type RecoveryCentreItem = {
  id: string;
  kind: "current" | "generation" | "legacy";
  label: string;
  savedAt: string | null;
  revision: number | null;
  valid: boolean;
  data: AppData | null;
};

export type RecoveryCentreInspection = { databaseName: string; databaseVersion: number; inspectedAt: string; items: RecoveryCentreItem[] };

/** Read-only inspection for the Recovery Centre. It never opens a write transaction. */
export async function inspectRecoveryCentre(options: StorageOptions = {}): Promise<RecoveryCentreInspection> {
  const database = await openShiftTrackerDatabase(options);
  const items: RecoveryCentreItem[] = [];
  try {
    const revision = Number(await readMeta(database, "revision") ?? 0);
    try {
      const data = await readCanonical(database); const valid = validateAppDataStructure(data).ok;
      items.push({ id: "current", kind: "current", label: "Current IndexedDB dataset", savedAt: String(await readMeta(database, "updatedAt") ?? "") || null, revision, valid, data: valid ? data : null });
    } catch { items.push({ id: "current", kind: "current", label: "Current IndexedDB dataset", savedAt: null, revision, valid: false, data: null }); }
    const transaction = database.transaction(SHIFT_TRACKER_DB_STORES.recovery, "readonly");
    const snapshots = await requestResult(transaction.objectStore(SHIFT_TRACKER_DB_STORES.recovery).getAll()) as RecoverySnapshot[];
    await transactionDone(transaction);
    snapshots.sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt)).forEach((snapshot, index) => {
      const valid = snapshot.kind === "shift-tracker-indexeddb-recovery" && validateAppDataStructure(snapshot.data).ok;
      items.push({ id: snapshot.generationId, kind: "generation", label: index === 0 ? "Newest validated generation" : index === 1 ? "Previous recovery generation" : "Older protected generation", savedAt: snapshot.savedAt, revision: snapshot.revision, valid, data: valid ? snapshot.data : null });
    });
    const source = options.localStorage === undefined ? browserLocalStorage() : options.localStorage;
    let legacyRaw: string | null = null; try { legacyRaw = source?.getItem(LEGACY_PRIMARY_KEY) ?? null; } catch { /* unavailable */ }
    if (legacyRaw) {
      try { const data = validatedData(JSON.parse(legacyRaw)); items.push({ id: "legacy", kind: "legacy", label: "Legacy migration recovery copy", savedAt: null, revision: null, valid: true, data }); }
      catch { items.push({ id: "legacy", kind: "legacy", label: "Legacy migration recovery copy", savedAt: null, revision: null, valid: false, data: null }); }
    }
    return { databaseName: options.databaseName ?? SHIFT_TRACKER_DB_NAME, databaseVersion: SHIFT_TRACKER_DB_VERSION, inspectedAt: new Date().toISOString(), items };
  } finally { database.close(); }
}

/** Read-only recovery drill: validates the canonical database and its retained generations without restoring or writing anything. */
export async function testIndexedDbRecoveryReadiness(options: StorageOptions = {}): Promise<RecoveryReadiness> {
  const database = await openShiftTrackerDatabase(options);
  try {
    let canonicalValid = false;
    try { canonicalValid = validateAppDataStructure(await readCanonical(database)).ok; } catch { canonicalValid = false; }
    const transaction = database.transaction(SHIFT_TRACKER_DB_STORES.recovery, "readonly");
    const snapshots = await requestResult(transaction.objectStore(SHIFT_TRACKER_DB_STORES.recovery).getAll()) as RecoverySnapshot[];
    await transactionDone(transaction);
    const valid = snapshots.filter((snapshot) => {
      try { return snapshot.kind === "shift-tracker-indexeddb-recovery" && validateAppDataStructure(snapshot.data).ok; } catch { return false; }
    }).sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt));
    return { status: canonicalValid && valid.length > 0 ? "ready" : "limited", canonicalValid, validRecoveryGenerations: valid.length, newestRecoveryAt: valid[0]?.savedAt ?? null };
  } finally { database.close(); }
}
