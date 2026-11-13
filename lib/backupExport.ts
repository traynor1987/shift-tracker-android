import { readIndexedDbBackupSnapshot } from "./indexedDbStorage.ts";
import type { AppData } from "./domain.ts";
import { BackupExportError, buildBackupExport, type PreparedBackup } from "./backupExportData.ts";
export { BackupExportError } from "./backupExportData.ts";

export function prepareBackupExport(data: AppData | null, appVersion: string, createdAt: string): Promise<PreparedBackup> {
  // Node and older browsers retain the identical format and validation path.
  if (typeof Worker === 'undefined') return Promise.resolve().then(async () => {
    let snapshot = data;
    if (!snapshot) { try { snapshot = await readIndexedDbBackupSnapshot(); } catch { throw new BackupExportError('read', 'The saved tracker database could not be read. Retry or use Emergency Backup.'); } }
    return buildBackupExport(snapshot, appVersion, createdAt);
  });
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try { worker = new Worker(new URL('./backupExport.worker.ts', import.meta.url), { type: 'module' }); }
    catch { reject(new BackupExportError('worker', 'Backup preparation could not start. Reload the screen and retry.')); return; }
    worker.onmessage = (event: MessageEvent<{ result?: PreparedBackup; stage?: string; message?: string }>) => {
      worker.terminate();
      if (event.data.result) resolve(event.data.result);
      else reject(new BackupExportError(event.data.stage ?? 'preparation', event.data.message ?? 'Backup preparation failed.'));
    };
    worker.onerror = () => { worker.terminate(); reject(new BackupExportError('worker', 'Backup preparation stopped. Retry the export.')); };
    try { worker.postMessage({ data, appVersion, createdAt }); }
    catch { worker.terminate(); reject(new BackupExportError('snapshot', 'The full backup snapshot could not be copied.')); }
  });
}
