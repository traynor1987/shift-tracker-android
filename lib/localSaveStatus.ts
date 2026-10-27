export type LocalSaveState = { status: "loaded" | "saving" | "saved" | "failed"; pending: number; savedAt: string | null };
let state: LocalSaveState = { status: "loaded", pending: 0, savedAt: null };
let sequence = 0;
let lastFailure = 0;
let lastSuccess = 0;
const pendingSaves = new Set<Promise<void>>();

export function localSaveSnapshot(): LocalSaveState { return { ...state }; }

/** Observe the real persistence promise; never mark an in-memory edit saved. */
export function trackLocalSave<T>(save: () => Promise<T>): Promise<T> {
  const id = ++sequence;
  state = { ...state, pending: state.pending + 1, status: "saving" };
  let operation: Promise<T>;
  try { operation = save(); } catch (error) { operation = Promise.reject(error); }
  const tracked = operation.then(result => {
    lastSuccess = Math.max(lastSuccess, id);
    state = { pending: state.pending - 1, savedAt: new Date().toISOString(), status: state.pending > 1 ? "saving" : lastFailure > lastSuccess ? "failed" : "saved" };
    return result;
  }, error => {
    lastFailure = Math.max(lastFailure, id);
    state = { ...state, pending: state.pending - 1, status: "failed" };
    throw error;
  });
  const settled = tracked.then(() => undefined, () => undefined);
  pendingSaves.add(settled);
  void settled.then(() => pendingSaves.delete(settled));
  return tracked;
}

/** Start an update/reload only once actual writes have settled successfully.
 * The action runs in the same turn as the final check, without an await gap. */
export async function runAfterLocalSaves<T>(action: () => T, timeoutMs = 15_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Recent changes are still saving. Try the update again once saving finishes.")), timeoutMs);
    });
    do {
      await Promise.race([
        (async () => { while (!cancelled && pendingSaves.size) await Promise.all([...pendingSaves]); })(),
        deadline,
      ]);
    } while (pendingSaves.size);
    if (state.status === "failed") throw new Error("Your latest change could not be saved. Retry saving before updating.");
    return action();
  } finally { cancelled = true; if (timeout !== undefined) clearTimeout(timeout); }
}
