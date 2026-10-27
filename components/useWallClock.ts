"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import { createWallClock } from "../lib/wallClock";
import { recordRuntimeMeasurement } from "../lib/runtimeDiagnostics";

const clock = createWallClock({
  now: () => Date.now(),
  schedule: (callback, delay) => window.setInterval(callback, delay),
  cancel: (handle) => window.clearInterval(handle as number),
});
let mounted = 0;
let hidden = false;
const wake = () => {
  const wasHidden = hidden;
  hidden = document.hidden;
  clock.setPaused(hidden);
  if (!hidden && !wasHidden) clock.wake();
};

function createCadenceStore(cadence: number, initialTime: number) {
    let snapshot = initialTime;
    return {
      getSnapshot: () => snapshot,
      getServerSnapshot: () => initialTime,
      subscribe(callback: () => void) {
        hidden = document.hidden;
        clock.setPaused(hidden);
        const unsubscribe = clock.subscribe(cadence, () => {
          snapshot = clock.getSnapshot();
          recordRuntimeMeasurement("visual_tick", 1);
          callback();
        });
        if (mounted++ === 0) {
          window.addEventListener("focus", wake);
          window.addEventListener("pageshow", wake);
          document.addEventListener("visibilitychange", wake);
        }
        return () => {
          unsubscribe();
          if (--mounted === 0) {
            window.removeEventListener("focus", wake);
            window.removeEventListener("pageshow", wake);
            document.removeEventListener("visibilitychange", wake);
          }
        };
      },
    };
}

/** Only mounted live screens subscribe each second; root safety work uses 15s. */
export function useWallClock(cadence = 1000) {
  const [initialTime] = useState(() => Date.now());
  const store = useMemo(() => createCadenceStore(cadence, initialTime), [cadence, initialTime]);
  return new Date(useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot));
}
