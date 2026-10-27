import { replaceShiftWithIntegrity, type AppData, type Shift } from './domain.ts';
import { validateAppDataStructure } from './backup.ts';

export type HistoricalRepairResult = { ok: true } | { ok: false; message: string };
export type HistoricalRepairCommit = (
  updater: (draft: AppData) => void | boolean,
) => Promise<{ status: 'persisted' } | { status: 'rejected' } | { status: 'failed'; error: unknown }>;
export interface HistoricalRepairRequest {
  updated: Shift;
  original: Shift;
  readLatest: () => AppData;
  commit: HistoricalRepairCommit;
}

/** Keep one instance per app. The commit owns SaveProtection, persistence and
 * conflict handling; this guard never writes a captured whole-AppData snapshot. */
export function createHistoricalRepair() {
  const pending = new Set<string>();
  const failedOptimistic = new Map<string, { original: string; applied: string }>();
  return async ({ updated, original, readLatest, commit }: HistoricalRepairRequest): Promise<HistoricalRepairResult> => {
    const id = original.id;
    if (pending.has(id)) return { ok: false, message: 'This shift repair is already saving. Please wait.' };
    pending.add(id);
    let appliedSnapshot: string | undefined;
    let originalSnapshot: string | undefined;
    try {
      // Snapshot the edit before awaiting so caller mutations cannot change it.
      const captured = structuredClone(original);
      const replacement = structuredClone(updated);
      originalSnapshot = JSON.stringify(captured);
      const retry = failedOptimistic.get(id);
      let rejection = 'The repair was rejected. Refresh the shift and try again.';
      const prepare = (draft: AppData): boolean => {
        const current = draft.shifts.find(shift => shift.id === id);
        if (!current || replacement.id !== id) {
          rejection = 'The original shift could not be found, so nothing was changed.';
          return false;
        }
        const currentSnapshot = JSON.stringify(current);
        if (currentSnapshot !== originalSnapshot && !(retry && retry.original === originalSnapshot && retry.applied === currentSnapshot)) {
          failedOptimistic.delete(id);
          rejection = 'This shift changed after the review opened. Close and reopen the review before repairing it.';
          return false;
        }
        replaceShiftWithIntegrity(draft, replacement);
        const validation = validateAppDataStructure(draft);
        if (!validation.ok) {
          rejection = `${validation.message} The original shift remains unchanged.`;
          return false;
        }
        return true;
      };
      if (!prepare(structuredClone(readLatest()))) return { ok: false, message: rejection };
      // Recheck inside the canonical functional update against its actual latest data.
      const result = await commit(draft => {
        if (!prepare(draft)) return false;
        appliedSnapshot = JSON.stringify(draft.shifts.find(shift => shift.id === id));
        return true;
      });
      if (result.status === 'persisted') {
        failedOptimistic.delete(id);
        return { ok: true };
      }
      if (result.status === 'rejected') return { ok: false, message: rejection };
      if (appliedSnapshot && originalSnapshot) failedOptimistic.set(id, { original: originalSnapshot, applied: appliedSnapshot });
      return { ok: false, message: failureMessage(result.error) };
    } catch (error) {
      if (appliedSnapshot && originalSnapshot) failedOptimistic.set(id, { original: originalSnapshot, applied: appliedSnapshot });
      return { ok: false, message: failureMessage(error) };
    } finally {
      pending.delete(id);
    }
  };
}

function failureMessage(error: unknown): string {
  const detail = error instanceof Error ? ` ${error.message}` : '';
  return `The repaired shift may be open in memory but could not be saved durably.${detail} Keep this review open and check storage before retrying.`;
}
