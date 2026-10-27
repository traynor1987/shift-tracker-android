import { returnDiagnosticsSnapshot } from "./returnDiagnostics.ts";
import type { Shift, Settings } from "./domain.ts";
import { BREAK_REQUIRED_MS, carryoutDepartureZoneIsValid, deliveryCustomersComplete, liveWorkMilesTenths, shiftMilliseconds } from "./domain.ts";
import type { NativeShellInfo, NativeDiagnostics } from "./nativeBridge.ts";
import { localSaveSnapshot } from "./localSaveStatus.ts";
import { runtimeDiagnosticsSnapshot, PERFORMANCE_METRICS } from "./runtimeDiagnostics.ts";

export type TrackingHealth = { label: string; tone: "quiet" | "good" | "warning"; ageSeconds: number | null };
export type TrackingHealthInput = { active: boolean; enabled: boolean; status: string; lastFixAt?: number | null; now: number; recovering?: boolean; nativePermission?: NativeDiagnostics["foregroundLocation"] };
export function newestTrackingFix(timestamps: Array<number | null | undefined>, now: number) {
  const valid = timestamps.filter((stamp): stamp is number => stamp != null && Number.isFinite(stamp) && stamp <= now + 10_000);
  return valid.length ? Math.max(...valid) : null;
}
export function locationTrackingDemand(shift: Shift | null | undefined, settings: Settings) {
  const run = shift?.activities?.findLast(item => !item.end && (item.type === "single_delivery" || item.type === "double_delivery"));
  const early = Boolean(shift?.pendingEarlyDispatch);
  const carryout = Boolean(shift?.status === "working" && !run && settings.carryoutDepartureAssistEnabled && carryoutDepartureZoneIsValid(settings.carryoutDepartureZone));
  return { active: Boolean(run || early || carryout), enabled: Boolean(shift && (settings.locationAssistEnabled || settings.recordDeliveryRoutes || carryout || early || run?.locationAssistEnabled)) };
}
export function trackingHealth(value: TrackingHealthInput): TrackingHealth {
  const result = (label: string, tone: TrackingHealth["tone"], ageSeconds: number | null = null) => ({ label, tone, ageSeconds });
  if (!value.active) return result("GPS idle", "quiet");
  if (!value.enabled || value.status === "off") return result("GPS off", "quiet");
  if (value.status === "setup") return result("GPS setup needed", "quiet");
  if (value.status === "permission") return result(value.nativePermission === "precise" || value.nativePermission === "approximate" ? "GPS connection needs retry" : "GPS permission needed", "warning");
  if (value.recovering) return result("GPS recovering", "warning");
  if (value.status === "unavailable") return result("GPS unavailable", "warning");
  const stamp = value.lastFixAt;
  if (stamp == null || !Number.isFinite(stamp) || stamp > value.now + 10_000) return result("Waiting for GPS", "warning");
  const age = Math.max(0, Math.floor((value.now - stamp) / 1000));
  return age > 60 ? result("GPS delayed", "warning", age) : result("GPS receiving", "good", age);
}

export type FinishCheck = { code: "delivery" | "mileage" | "break" | "tasks"; message: string };
export function shiftFinishChecklist(shift: Shift, now = new Date()): FinishCheck[] {
  const checks: FinishCheck[] = [];
  const run = shift.activities?.findLast(item => !item.end && (item.type === "single_delivery" || item.type === "double_delivery"));
  if (run) checks.push({ code: "delivery", message: deliveryCustomersComplete(run) ? "Delivery return still open" : "Delivery has unconfirmed customer stops" });
  if (liveWorkMilesTenths(shift) == null) checks.push({ code: "mileage", message: "Mileage not recorded" });
  if (!shift.breaks.length && !shift.noBreakRecord?.reason?.trim() && shiftMilliseconds(shift, now) >= BREAK_REQUIRED_MS)
    checks.push({ code: "break", message: "Break details need review" });
  const tasks = (shift.taskSnapshot ?? []).filter(task => task.status !== "complete" && !task.unableAt && !task.notRequired && !task.managementBlockedAt && (task.category === "prep" || shift.cleaningRequired !== false));
  if (tasks.length) checks.push({ code: "tasks", message: `${tasks.length} task outcome${tasks.length === 1 ? "" : "s"} to review` });
  return checks;
}

/** Explicit field allowlist: diagnostics can never become an AppData export. */
export function diagnosticExport(input: { webVersion: string; native?: Pick<NativeShellInfo, "shellVersion" | "wearVersion" | "diagnostics"> | null; tracking?: TrackingHealth }) {
  const native: Record<string, boolean | number | string> = {};
  const fields = ["serviceRunning", "locationProviderEnabled", "backgroundLocationGranted", "notificationsGranted", "locationCallbackCount", "lastRawFixTimestamp", "lastSampleReceiptAt", "lastSampleReceivedAt", "lastRawFixAccuracy", "recoveryQueueCount", "watchdogRecoveryCount", "lastAcceptedFixTimestamp", "lastAcceptedFixReceiptAt", "journalReadCount", "journalWriteCount", "journalPendingCount", "journalAppendDurationMs", "journalAckDurationMs", "replayDurationMs", "journalCapacityFailureCount", "journalLastAppendMs", "journalLastAckMs", "journalLastReadMs", "journalLastWriteMs", "nativeDispatchBacklogCount", "nativeReplayBarrierCount", "lastAcceptedFixElapsedMs"];
  for (const key of fields) {
    const value = input.native?.diagnostics?.[key];
    if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) native[key] = value;
  }
  const permission = input.native?.diagnostics?.foregroundLocation;
  if (permission === "precise" || permission === "approximate" || permission === "missing") native.foregroundLocation = permission;
  return JSON.stringify({ format: 1, exportedAt: new Date().toISOString(), versions: { web: input.webVersion, android: input.native?.shellVersion ?? null, wear: input.native?.wearVersion ?? null }, localSave: localSaveSnapshot(), tracking: input.tracking ? { label: input.tracking.label, ageSeconds: input.tracking.ageSeconds } : null, native, performance: runtimeDiagnosticsSnapshot(),
    returnPipeline: returnDiagnosticsSnapshot(), performanceMetricDefinitions: PERFORMANCE_METRICS, privacy: "No routes, customer details, keys or tracker records." }, null, 2);
}
