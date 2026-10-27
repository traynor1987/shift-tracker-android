/** Wall time is canonical: delayed callbacks never accumulate timer drift. */
export function createWallClock(runtime: {
  now: () => number;
  schedule: (callback: () => void, delay: number) => unknown;
  cancel: (handle: unknown) => void;
}) {
  let snapshot = runtime.now();
  let handle: unknown;
  let paused = false;
  const listeners = new Set<{ cadence: number; notifiedAt: number; callback: () => void }>();
  const refresh = (force: boolean) => {
    snapshot = runtime.now();
    for (const listener of listeners) {
      if ((force && snapshot !== listener.notifiedAt) || snapshot - listener.notifiedAt >= listener.cadence || snapshot < listener.notifiedAt) {
        listener.notifiedAt = snapshot;
        listener.callback();
      }
    }
  };
  const tick = () => { refresh(false); };
  return {
    getSnapshot: () => snapshot,
    wake: () => { if (!paused) refresh(true); },
    setPaused(value: boolean) {
      if (value === paused) return;
      paused = value;
      if (paused && handle !== undefined) { runtime.cancel(handle); handle = undefined; }
      if (!paused && listeners.size) { refresh(true); handle = runtime.schedule(tick, 1000); }
    },
    subscribe(cadence: number, callback: () => void) {
      const listener = { cadence, notifiedAt: runtime.now(), callback };
      listeners.add(listener);
      if (listeners.size === 1 && !paused) {
        snapshot = runtime.now();
        handle = runtime.schedule(tick, 1000);
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size && handle !== undefined) { runtime.cancel(handle); handle = undefined; }
      };
    },
  };
}
