import { BackupExportError, buildBackupExport } from './backupExportData.ts';
import { readIndexedDbBackupSnapshot } from "./indexedDbStorage.ts";
import type { AppData } from './domain.ts';
self.onmessage = async (event: MessageEvent<{ data: AppData | null; appVersion: string; createdAt: string }>) => {
  try {
    let data = event.data.data;
    if (!data) { try { data = await readIndexedDbBackupSnapshot(); } catch { throw new BackupExportError('read', 'The saved tracker database could not be read. Retry or use Emergency Backup.'); } }
    self.postMessage({ result: buildBackupExport(data, event.data.appVersion, event.data.createdAt) });
  }
  catch (error) { self.postMessage({ stage: error instanceof BackupExportError ? error.stage : 'preparation', message: error instanceof BackupExportError ? error.message : 'Backup preparation failed.' }); }
};
