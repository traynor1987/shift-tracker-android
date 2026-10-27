import type { ActivityRecord, AppData, HustleSource, StorePresence } from "./domain.ts";
import { migrateAppData, prepareAppDataForBackup } from "./domain.ts";
import { validateAppDataStructure } from "./backup.ts";
import {
  applyHighStoragePressurePolicy, getStorageHealth, indexedDbWriteWasSuperseded,
  initialiseFreshIndexedDb, isIndexedDbRevisionStorageEvent, loadIndexedDbData,
  requestPersistentStorageOnce, resetIndexedDbSessionForTests, restoreIndexedDbRecovery,
  saveIndexedDbData, subscribeToIndexedDbChanges, testIndexedDbRecoveryReadiness, inspectRecoveryCentre,
  type StorageOptions,
} from "./indexedDbStorage.ts";
import { saveFileWithNativeShell } from "./nativeBridge.ts";
import { trackLocalSave } from "./localSaveStatus.ts";

export type { SafeDataLoadResult, StorageHealth } from "./indexedDbStorage.ts";

export function loadDataSafely(options: StorageOptions = {}) { return loadIndexedDbData(options); }

export const TODAY_STATE_TRANSFER_KIND = "shift-tracker-today-state" as const;

export interface TodayStateTransfer {
  kind: typeof TODAY_STATE_TRANSFER_KIND;
  version: 1;
  exportedAt: string;
  localDate: string;
  data: AppData;
}

export function saveData(data: AppData, options: StorageOptions = {}) { return trackLocalSave(() => saveIndexedDbData(data, options)); }
export function storageWriteWasSuperseded(error: unknown) { return indexedDbWriteWasSuperseded(error); }
export function restoreRecoveryData(data: AppData, options: StorageOptions = {}) { return trackLocalSave(() => restoreIndexedDbRecovery(data, options)); }
export function startFreshData(options: StorageOptions = {}) { return trackLocalSave(() => initialiseFreshIndexedDb(options)); }
export function isExternalPrimaryStorageChange(event: Pick<StorageEvent, "key" | "newValue">) { return isIndexedDbRevisionStorageEvent(event); }
export function subscribeToStorageChanges(listener: (revision: number) => void) { return subscribeToIndexedDbChanges(listener); }
export function resetStorageSessionForTests(databaseName?: string) { resetIndexedDbSessionForTests(databaseName); }
export { applyHighStoragePressurePolicy, getStorageHealth, requestPersistentStorageOnce };
export { testIndexedDbRecoveryReadiness };
export { inspectRecoveryCentre };
export type { RecoveryCentreInspection, RecoveryCentreItem } from "./indexedDbStorage.ts";

export function backupFilename(stamp = new Date()) {
  return `shift-tracker-backup-${stamp.toISOString().replaceAll(":", "-").replaceAll(".", "-")}.json`;
}

export function localDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function todayStateFilename(stamp = new Date()) {
  return `shift-tracker-today-${localDateKey(stamp)}-${stamp.toISOString().slice(11, 19).replaceAll(":", "-")}.json`;
}

/**
 * A device-transfer snapshot deliberately contains only shifts started today
 * plus any still-active overnight shift. The normal full backup remains the
 * authority for complete history. Portable address privacy rules still apply.
 */
export function createTodayStateTransfer(value: AppData, stamp = new Date()): TodayStateTransfer {
  const localDate = localDateKey(stamp);
  const exported = prepareAppDataForBackup(value);
  exported.shifts = exported.shifts.filter((shift) => localDateKey(shift.clockIn) === localDate || shift.status !== "completed");
  exported.payments = [];
  exported.payrollSchedules = [];
  exported.lastBackupAt = null;
  return { kind: TODAY_STATE_TRANSFER_KIND, version: 1, exportedAt: stamp.toISOString(), localDate, data: exported };
}

export function parseTodayStateTransfer(value: unknown): TodayStateTransfer | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TodayStateTransfer>;
  if (candidate.kind !== TODAY_STATE_TRANSFER_KIND || candidate.version !== 1 || typeof candidate.exportedAt !== "string" || Number.isNaN(Date.parse(candidate.exportedAt)) || typeof candidate.localDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.localDate)) return null;
  const validation = validateAppDataStructure(candidate.data);
  if (!validation.ok) return null;
  const data = migrateAppData(validation.data);
  if (!data.shifts.every((shift) => localDateKey(shift.clockIn) === candidate.localDate || shift.status !== "completed")) return null;
  return { kind: TODAY_STATE_TRANSFER_KIND, version: 1, exportedAt: candidate.exportedAt, localDate: candidate.localDate, data };
}

/**
 * Replace only the transferred day and any live shift on the receiving
 * device. Settings, historic shifts, payments, payroll and backup metadata
 * stay device-local.
 */
export function mergeTodayState(current: AppData, transfer: TodayStateTransfer) {
  const merged = structuredClone(current);
  const incoming = migrateAppData(transfer.data).shifts;
  const incomingIds = new Set(incoming.map((shift) => shift.id));
  merged.shifts = [
    ...merged.shifts.filter((shift) => localDateKey(shift.clockIn) !== transfer.localDate && shift.status === "completed" && !incomingIds.has(shift.id)),
    ...structuredClone(incoming),
  ].sort((left, right) => Date.parse(left.clockIn) - Date.parse(right.clockIn));
  return merged;
}

export function transferredDeliveryResumePresence(activity: Partial<ActivityRecord> | null, source: HustleSource = "real"): StorePresence {
  const entryAt = source === "real" ? activity?.storeEntryAt : activity?.dominosStoreEntryAt;
  const entryObserved = source === "real" ? activity?.storeEntryObserved : activity?.dominosStoreEntryObserved;
  const exitAt = source === "real" ? activity?.storeExitAt : activity?.dominosStoreExitAt;
  const exitObserved = source === "real" ? activity?.storeExitObserved : activity?.dominosStoreExitObserved;
  const startedOutside = source === "real" ? activity?.startedOutsideStore : activity?.dominosStartedOutsideStore;
  if (entryAt || entryObserved) return "inside";
  if (activity && (exitAt || exitObserved || startedOutside)) return "outside";
  return "unknown";
}

export function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

export async function saveExportFile(filename: string, content: string, type: string) {
  const nativeResult = await saveFileWithNativeShell(filename, content, type);
  if (nativeResult) return { filename, status: nativeResult.status, message: nativeResult.message };
  downloadFile(filename, content, type);
  return { filename, status: "saved" as const };
}
