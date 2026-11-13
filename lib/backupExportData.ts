import { createBackupDocument, validateBackupDocument, type BackupRecordCounts } from './backup.ts';
import type { AppData } from './domain.ts';

export type PreparedBackup = { content: string; createdAt: string; recordCounts: BackupRecordCounts };
export class BackupExportError extends Error {
  readonly stage: string;
  constructor(stage: string, message: string) { super(message); this.name = 'BackupExportError'; this.stage = stage; }
}

/** Called in a worker in the app. Exports the full canonical in-memory dataset,
 * including the active shift and all separately rehydrated IndexedDB routes. */
export function buildBackupExport(data: AppData, appVersion: string, createdAt: string): PreparedBackup {
  let document;
  try { document = createBackupDocument(data, appVersion, new Date(createdAt)); }
  catch { throw new BackupExportError('snapshot', 'The full backup snapshot could not be prepared.'); }
  const validation = validateBackupDocument(document);
  if (!validation.ok) throw new BackupExportError('validation', validation.message);
  try { return { content: JSON.stringify(document), createdAt, recordCounts: document.recordCounts }; }
  catch { throw new BackupExportError('serialization', 'The full backup could not be encoded.'); }
}

