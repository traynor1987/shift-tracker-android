"use client";
import type { ReactNode } from "react";
import { measureTimerRender } from "../lib/performanceMonitor";
import { useWallClock } from "./useWallClock";

/** A text-only live boundary: its ticks do not rerender the surrounding screen. */
export default function LiveClockText({ render }: { render: (now: Date) => ReactNode }) {
  const now = useWallClock();
  return measureTimerRender(() => render(now));
}
