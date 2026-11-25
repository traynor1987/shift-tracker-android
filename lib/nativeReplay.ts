import type { AppData } from './domain.ts';

type Result = {status: 'persisted' | 'rejected'} | {status: 'failed'; error: unknown};
type Update = (data: AppData) => void | boolean;
type Applied = (data: AppData) => void;
type Commit = (update: Update, applied?: Applied) => Promise<Result>;

/** Stage ordered fixes against one private snapshot, then save their mutations
 * against current canonical state once. Android retains every point until this
 * final save succeeds. */
export function createNativeReplayBatch(current: AppData) {
  const data = structuredClone(current);
  const updates: Update[] = [];
  const effects: Applied[] = [];
  let rejected = false;
  const commit: Commit = async (update, applied) => {
    if (rejected || update(data) === false) {
      rejected = true;
      return {status: 'rejected'};
    }
    updates.push(update);
    if (applied) effects.push(applied);
    return {status: 'persisted'};
  };
  return {
    data,
    commit,
    async persist(save: Commit): Promise<Result> {
      if (rejected) return {status: 'rejected'};
      if (!updates.length) return {status: 'persisted'};
      let saved: AppData | undefined;
      const result = await save(draft => {
        for (const update of updates) if (update(draft) === false) return false;
      }, latest => { saved = latest; });
      if (result.status === 'persisted' && saved) effects.forEach(effect => effect(saved!));
      return result;
    },
  };
}
