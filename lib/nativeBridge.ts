/**
 * Exact-origin Android-shell contract. The hosted PWA remains fully usable
 * without the shell. Android WebView delivers WebMessage payloads as strings,
 * so inbound JSON is parsed only after origin and size checks, then validated
 * against each named message schema.
 */
import { appendDeveloperLog, getDeveloperSettings, nativeMessageType } from "./developerConsole.ts";

export const WEB_APP_VERSION = "2.1.246";
export const TRUSTED_SHIFT_TRACKER_ORIGIN = "https://dominos-shift-tracker.traynor1987.chatgpt.site";
export const NATIVE_BRIDGE_VERSION = 1;
export const NATIVE_SAMPLE_STALE_MS = 60_000;
const MAX_INBOUND_MESSAGE_CHARS = 65_536;

export function nativeSampleIsFresh(timestamp: string | number | null | undefined, now = Date.now(), maximumAgeMs = NATIVE_SAMPLE_STALE_MS) {
  const sampleAt = typeof timestamp === "number" ? timestamp : Date.parse(timestamp ?? "");
  return Number.isFinite(sampleAt) && sampleAt <= now + 5_000 && now - sampleAt <= maximumAgeMs;
}

export type NativeDiagnostics = {
  diagnostic?: string;
  foregroundLocation?: "precise" | "approximate" | "missing";
  backgroundLocationGranted?: boolean;
  notificationsGranted?: boolean;
  locationProviderEnabled?: boolean;
  shiftMonitoringEnabled?: boolean;
  samplingMode?: string;
  nativeReturnObservedAt?: number;
  nativeReturnConfirmedAt?: number;
  nativeReturnPersistedAt?: number;
  nativeReturnNotificationAt?: number;
  serviceRunning?: boolean;
  lastSampleReceivedAt?: number | null;
  backgroundPermissionLabel?: string;
  [key: string]: unknown;
};

export type NativeShellInfo = {
  shellVersion: string;
  bridgeVersion: number;
  trustedOrigin: string;
  trackingActive?: boolean;
  trackedDeliveryId?: string;
  installedWebVersion?: string;
  previousWebVersion?: string;
  wearConnected?: boolean;
  wearVersion?: string;
  wearVersionCode?: number;
  dispatchNotificationAccess?: boolean;
  diagnostics?: NativeDiagnostics;
};

/** A timestamp from the Android-only Order Dispatched listener. It is not a
 * delivery action: the PWA validates it against the current live shift before
 * it can start a timer or queue it for the next delivery. */
export type NativeDispatchNotification = {
  id: string;
  receivedAtEpochMs: number;
};

export type NativeLocationSample = {
  sampleId: string;
  deliveryId: string;
  latitude: number;
  longitude: number;
  timestampEpochMs: number;
  accuracy: number;
  speed?: number | null;
  heading?: number | null;
};

export type NativeTrackingStatus =
  | "active" | "stopped" | "permission_required" | "error"
  | "service_starting" | "service_started" | "service_not_started"
  | "foreground_permission_granted" | "background_permission_required"
  | "background_settings_opened" | "background_permission_granted"
  | "location_provider_disabled" | "waiting_for_fix" | "sample_received";

export type NativeTrackingState = {
  status: NativeTrackingStatus;
  deliveryId?: string;
  message?: string;
  diagnostic?: string;
  diagnostics?: NativeDiagnostics;
};

export type NativeFileSaveResult = {
  requestId: string;
  status: "saved" | "cancelled" | "error";
  message?: string;
};

/** A one-shot foreground fix used only by the opt-in store-start proof. It is
 * deliberately separate from the delivery route/geofence sample pipeline. */
export type NativeStoreProofLocationResult =
  | { requestId: string; status: "ok"; latitude: number; longitude: number; timestampEpochMs: number; accuracy: number }
  | { requestId: string; status: "permission_required" | "unavailable"; message?: string };

export type NativeShiftSnapshot = {
  /** Identifies the authoritative PWA state rendered by a companion. */
  stateRevision: string;
  shiftId?: string;
  activityId?: string | null;
  shiftActive: boolean;
  shiftStartedAtEpochMs: number;
  activity: "idle" | "delivery_single" | "delivery_double" | "break" | "cleaning" | "prep" | "task";
  activityName: string;
  activityStartedAtEpochMs: number;
  deliveries: number;
  estimatedPay: string;
  paidTimeSeconds?: number;
  breakTimeSeconds?: number;
  deliveryReimbursement?: string;
  shiftTotal?: string;
  miles?: string;
  runs?: number;
  /** Existing configured Quick Task labels available to the watch. Stock Run
   * is deliberately not part of this list or action path. */
  quickTasks?: string[];
  /** Delivery progress and timing facts for read-only companion surfaces. */
  deliveredCustomers?: number;
  requiredCustomers?: number;
  earlyDispatchGapSeconds?: number;
  storeExitAtEpochMs?: number;
  storeExitObserved?: boolean;
  latestDeliveredAtEpochMs?: number;
  storeEntryAtEpochMs?: number;
  /** Store work paused by the current delivery and eligible to resume later. */
  pausedTaskName?: string;
  // Display-only mirror for native companions. It never controls geofence logic.
  storeStatus?: "at_store" | "outside_store" | "detecting" | "unknown";
  allowedActions: Array<"delivered" | "back_at_store" | "end_break" | "complete_task" | "single" | "double" | "break" | "undo_delivered" | "cancel_delivery" | "resume_task" | "dismiss_resume" | "start_quick_task" | "finish_quick_tasks">;
  settings: { alwaysOnShiftMonitoring?: boolean; shiftMonitoringHighAccuracy?: boolean; liveNotification: boolean; notificationActions: boolean; shiftReminders: boolean; breakReminders: boolean; taskReminders: boolean; photoCompression: "automatic" | "original" };
};

export type NativeActionRequest = {
  id: string;
  action: NativeShiftSnapshot["allowedActions"][number] | "open";
  expectedStateRevision?: string;
  expectedShiftId?: string;
  expectedActivityId?: string;
  taskName?: string;
};

export type NativeActionOutcome = "applied" | "already_applied" | "stale_state" | "invalid_action" | "error";

type NativeBridgePort = {
  postMessage: (message: string) => void;
  onmessage?: ((message: MessageEvent<unknown>) => void) | null;
  addEventListener?: (type: "message", listener: (message: MessageEvent<unknown>) => void) => void;
  removeEventListener?: (type: "message", listener: (message: MessageEvent<unknown>) => void) => void;
};

declare global {
  interface Window {
    ShiftTrackerNative?: NativeBridgePort;
  }
}

function onTrustedOrigin() {
  return typeof window !== "undefined" && window.location.origin === TRUSTED_SHIFT_TRACKER_ORIGIN;
}

function getBridge() {
  return onTrustedOrigin() ? window.ShiftTrackerNative : undefined;
}

/**
 * AndroidX's origin-restricted injected object is the authoritative reply
 * channel. Replies received on it are trusted because Android exposes the
 * object only to the exact production origin and accepts only the main frame.
 * The window listener remains for older shells, where the normal event-origin
 * check below still applies.
 */
export function subscribeToNativeMessages(listener: (message: MessageEvent<unknown>) => void) {
  if (typeof window === "undefined") return () => undefined;
  const receiveWindowMessage = (message: MessageEvent<unknown>) => listener(message);
  window.addEventListener("message", receiveWindowMessage);
  const bridge = getBridge();
  const receiveBridgeMessage = (message: MessageEvent<unknown>) => {
    appendDeveloperLog("BRIDGE", "SECURE_REPLY_RECEIVED", nativeMessageType(message.data), "success");
    listener({
      data: message.data,
      origin: TRUSTED_SHIFT_TRACKER_ORIGIN,
      source: null,
    } as MessageEvent<unknown>);
  };
  let previousOnMessage: NativeBridgePort["onmessage"];
  if (bridge?.addEventListener) bridge.addEventListener("message", receiveBridgeMessage);
  else if (bridge) {
    previousOnMessage = bridge.onmessage;
    bridge.onmessage = receiveBridgeMessage;
  }
  return () => {
    window.removeEventListener("message", receiveWindowMessage);
    if (bridge?.removeEventListener) bridge.removeEventListener("message", receiveBridgeMessage);
    else if (bridge?.onmessage === receiveBridgeMessage) bridge.onmessage = previousOnMessage ?? null;
  };
}

function trustedMessageObject(message: MessageEvent<unknown>): Record<string, unknown> | null {
  if (!onTrustedOrigin() || message.origin !== TRUSTED_SHIFT_TRACKER_ORIGIN) return null;
  let payload: unknown = message.data;
  if (typeof payload === "string") {
    if (!payload.length || payload.length > MAX_INBOUND_MESSAGE_CHARS) return null;
    try { payload = JSON.parse(payload); } catch { return null; }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as Record<string, unknown>;
}

function diagnostics(value: unknown): NativeDiagnostics | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as NativeDiagnostics : undefined;
}

export function announceNativeShell() {
  const bridge = getBridge();
  appendDeveloperLog("PWA", "SHELL_HELLO", bridge ? `Bridge object available · web=${WEB_APP_VERSION} · bridge=${NATIVE_BRIDGE_VERSION}` : "Bridge object unavailable", bridge ? "info" : "warning");
  bridge?.postMessage(JSON.stringify({ type: "shift_tracker_shell:hello", webVersion: WEB_APP_VERSION, bridgeVersion: NATIVE_BRIDGE_VERSION }));
}

export function requestNativeShellRefresh() {
  const bridge = getBridge();
  appendDeveloperLog("PWA", "SHELL_REFRESH_REQUESTED", bridge ? "Refresh command sent to Android shell" : "No native bridge; normal PWA refresh continues", bridge ? "info" : "warning");
  bridge?.postMessage(JSON.stringify({ type: "shift_tracker_shell:refresh_requested", webVersion: WEB_APP_VERSION }));
}

export type NativeWebUpdateMessage =
  | { type: "checking" }
  | { type: "available"; hostedVersion: string; installedVersion?: string; updateAvailable: boolean; apkVersion?: string }
  | { type: "progress"; phase: "Downloading" | "Verifying" | "Activating"; completed: number; total: number }
  | { type: "installed"; webVersion: string; apkVersion?: string }
  | { type: "failed"; message: string }
  | { type: "bootstrap_complete"; webVersion: string };

export function requestNativeWebUpdate(action: "check" | "install" | "rollback") {
  const bridge = getBridge();
  if (!bridge) return false;
  try { bridge.postMessage(JSON.stringify({ type: `shift_tracker_web_update:${action}`, webVersion: WEB_APP_VERSION })); return true; }
  catch { return false; }
}

export type NativeApkUpdateMessage = {
  state: "checking" | "rate_limited" | "available" | "up_to_date" | "web_refresh_required" | "unavailable" | "no_verified_update" | "install_permission_required" | "downloading" | "verified" | "installer_opened" | "failed";
  installedVersion?: string;
  installedVersionCode?: number;
  latestVersion?: string;
  latestVersionCode?: number;
  minimumWebVersion?: string;
  releaseNotes?: string[];
  updateAvailable?: boolean;
  transferBytes?: number;
  transferTotalBytes?: number;
  message?: string;
};

/** Status from the existing Android-owned Wear update manager. The PWA only
 * presents this state and requests its named bridge actions; it never handles
 * Wear APK bytes or the Wear Data Layer itself. */
export type NativeWearUpdateMessage = {
  state: "checking" | "watch_not_connected" | "watch_version_unknown" | "available" | "up_to_date" | "unavailable" | "no_verified_update" | "downloading" | "verified" | "sending_to_watch" | "sent_to_watch" | "receiving" | "ready_to_install" | "failed" | "installer_opened" | "install_permission_required";
  installedVersion?: string;
  installedVersionCode?: number;
  latestVersion?: string;
  latestVersionCode?: number;
  updateAvailable?: boolean;
  message?: string;
};

export function requestNativeApkUpdate(action: "check" | "install", manual = true) {
  const bridge = getBridge();
  if (!bridge) return false;
  try { bridge.postMessage(JSON.stringify({ type: `shift_tracker_apk_update:${action}`, manual, webVersion: WEB_APP_VERSION })); return true; } catch { return false; }
}

export function readNativeApkUpdateMessage(message: MessageEvent<unknown>): NativeApkUpdateMessage | null {
  const candidate = trustedMessageObject(message);
  if (!candidate || candidate.type !== "shift_tracker_apk_update:status" || typeof candidate.state !== "string") return null;
  const states = ["checking", "rate_limited", "available", "up_to_date", "web_refresh_required", "unavailable", "no_verified_update", "install_permission_required", "downloading", "verified", "installer_opened", "failed"] as const;
  if (!(states as readonly string[]).includes(candidate.state)) return null;
  const notes = Array.isArray(candidate.releaseNotes) ? candidate.releaseNotes.filter((item): item is string => typeof item === "string").slice(0, 12) : undefined;
  return { state: candidate.state as NativeApkUpdateMessage["state"], ...(typeof candidate.installedVersion === "string" ? { installedVersion: candidate.installedVersion } : {}), ...(typeof candidate.installedVersionCode === "number" ? { installedVersionCode: candidate.installedVersionCode } : {}), ...(typeof candidate.latestVersion === "string" ? { latestVersion: candidate.latestVersion } : {}), ...(typeof candidate.latestVersionCode === "number" ? { latestVersionCode: candidate.latestVersionCode } : {}), ...(typeof candidate.minimumWebVersion === "string" ? { minimumWebVersion: candidate.minimumWebVersion } : {}), ...(notes ? { releaseNotes: notes } : {}), ...(typeof candidate.updateAvailable === "boolean" ? { updateAvailable: candidate.updateAvailable } : {}), ...(typeof candidate.message === "string" ? { message: candidate.message } : {}) };
}

export function requestNativeWearUpdate(action: "check" | "send", manual = true) {
  const bridge = getBridge();
  if (!bridge) return false;
  try { bridge.postMessage(JSON.stringify({ type: `shift_tracker_wear_update:${action}`, manual, webVersion: WEB_APP_VERSION })); return true; } catch { return false; }
}

export function readNativeWearUpdateMessage(message: MessageEvent<unknown>): NativeWearUpdateMessage | null {
  const candidate = trustedMessageObject(message);
  if (!candidate || candidate.type !== "shift_tracker_wear_update:status" || typeof candidate.state !== "string") return null;
  const states = ["checking", "watch_not_connected", "watch_version_unknown", "available", "up_to_date", "unavailable", "no_verified_update", "downloading", "verified", "sending_to_watch", "sent_to_watch", "receiving", "ready_to_install", "failed", "installer_opened", "install_permission_required"] as const;
  if (!(states as readonly string[]).includes(candidate.state)) return null;
  return {
    state: candidate.state as NativeWearUpdateMessage["state"],
    ...(typeof candidate.installedVersion === "string" ? { installedVersion: candidate.installedVersion } : {}),
    ...(typeof candidate.installedVersionCode === "number" && Number.isSafeInteger(candidate.installedVersionCode) && candidate.installedVersionCode > 0 ? { installedVersionCode: candidate.installedVersionCode } : {}),
    ...(typeof candidate.latestVersion === "string" ? { latestVersion: candidate.latestVersion } : {}),
    ...(typeof candidate.latestVersionCode === "number" && Number.isSafeInteger(candidate.latestVersionCode) && candidate.latestVersionCode > 0 ? { latestVersionCode: candidate.latestVersionCode } : {}),
    ...(typeof candidate.updateAvailable === "boolean" ? { updateAvailable: candidate.updateAvailable } : {}),
    ...(typeof candidate.transferBytes === "number" && Number.isSafeInteger(candidate.transferBytes) && candidate.transferBytes >= 0 ? { transferBytes: candidate.transferBytes } : {}),
    ...(typeof candidate.transferTotalBytes === "number" && Number.isSafeInteger(candidate.transferTotalBytes) && candidate.transferTotalBytes > 0 ? { transferTotalBytes: candidate.transferTotalBytes } : {}),
    ...(typeof candidate.message === "string" ? { message: candidate.message.slice(0, 280) } : {}),
  };
}

export function readNativeWebUpdateMessage(message: MessageEvent<unknown>): NativeWebUpdateMessage | null {
  const candidate = trustedMessageObject(message);
  if (!candidate || typeof candidate.type !== "string" || !candidate.type.startsWith("shift_tracker_web_update:")) return null;
  const type = candidate.type.slice("shift_tracker_web_update:".length);
  if (type === "checking") return { type };
  if (type === "available" && typeof candidate.hostedVersion === "string" && typeof candidate.updateAvailable === "boolean") return { type, hostedVersion: candidate.hostedVersion, installedVersion: typeof candidate.installedVersion === "string" ? candidate.installedVersion : undefined, updateAvailable: candidate.updateAvailable, apkVersion: typeof candidate.apkVersion === "string" ? candidate.apkVersion : undefined };
  if (type === "progress" && (candidate.phase === "Downloading" || candidate.phase === "Verifying" || candidate.phase === "Activating") && Number.isFinite(candidate.completed) && Number.isFinite(candidate.total)) return { type, phase: candidate.phase, completed: Number(candidate.completed), total: Number(candidate.total) };
  if ((type === "installed" || type === "bootstrap_complete") && typeof candidate.webVersion === "string") return { type, webVersion: candidate.webVersion, ...(typeof candidate.apkVersion === "string" ? { apkVersion: candidate.apkVersion } : {}) };
  if (type === "failed" && typeof candidate.message === "string") return { type, message: candidate.message };
  return null;
}

export function nativeShellBridgeAvailable() {
  return Boolean(getBridge());
}

export type NativeRotaReminder = { id: string; rotaEntryId?: string; kind: string; atEpochMs: number; title: string; text: string };

/** Sends a complete replacement plan. Android persists only reminder metadata,
 * never tracker records, and atomically cancels obsolete alarms. */
export function syncNativeRotaReminders(reminders: NativeRotaReminder[]) {
  const bridge = getBridge();
  if (!bridge) return false;
  const safe = reminders.filter((item) => item.id && Number.isFinite(item.atEpochMs) && item.atEpochMs > 0).slice(0, 128);
  try {
    bridge.postMessage(JSON.stringify({ type: "shift_tracker_rota:sync", reminders: safe }));
    return true;
  } catch { return false; }
}

export function requestNativeRotaNotificationPermission() {
  const bridge = getBridge();
  if (!bridge) return false;
  bridge.postMessage(JSON.stringify({ type: "shift_tracker_rota:request_permission" }));
  return true;
}

export type NativeWorkStatus = {
  kind: "cleaning" | "prep";
  taskId: string;
  taskName: string;
  startedAtEpochMs?: number;
  paused: boolean;
};

/** Updates a normal Android notification only. It never starts the delivery
 * foreground service or requests location. */
export function setNativeWorkStatus(status: NativeWorkStatus) {
  const bridge = getBridge();
  if (!bridge || !status.taskId.trim() || !status.taskName.trim()) return false;
  try {
    bridge.postMessage(JSON.stringify({
      type: "shift_tracker_work:set",
      kind: status.kind,
      taskId: status.taskId.trim().slice(0, 128),
      taskName: status.taskName.trim().slice(0, 160),
      startedAtEpochMs: Number.isFinite(status.startedAtEpochMs) ? status.startedAtEpochMs : undefined,
      paused: status.paused,
    }));
    return true;
  } catch { return false; }
}

export function clearNativeWorkStatus() {
  const bridge = getBridge();
  if (!bridge) return false;
  try { bridge.postMessage(JSON.stringify({ type: "shift_tracker_work:clear" })); return true; }
  catch { return false; }
}

export function syncNativeShiftState(snapshot: NativeShiftSnapshot) {
  const bridge = getBridge();
  if (!bridge) return false;
  try { bridge.postMessage(JSON.stringify({ type: "shift_tracker_state:sync", ...snapshot })); return true; }
  catch { return false; }
}

export function clearNativeShiftState() {
  const bridge = getBridge();
  if (!bridge) return false;
  try { bridge.postMessage(JSON.stringify({ type: "shift_tracker_state:clear" })); return true; }
  catch { return false; }
}

/**
 * A deletion is a factual retraction, not a special test command.  The
 * Android shell durably replays it to James OS; callers keep the PWA's shift
 * deletion authoritative even when no shell is installed.
 */
export function retractNativeShift(value: { shiftId: string; revision: number; retractedAtEpochMs: number }) {
  const bridge = getBridge();
  const shiftId = value.shiftId.trim();
  if (!bridge || !shiftId || shiftId.length > 128 || !Number.isInteger(value.revision) || value.revision < 0 || value.revision > 1_000_000 || !Number.isFinite(value.retractedAtEpochMs) || value.retractedAtEpochMs <= 0) return false;
  try {
    bridge.postMessage(JSON.stringify({
      type: "shift_tracker_shift:retracted",
      shiftId,
      revision: value.revision,
      retractedAtEpochMs: Math.floor(value.retractedAtEpochMs),
    }));
    return true;
  } catch { return false; }
}

export function readNativeActionRequest(message: MessageEvent<unknown>): NativeActionRequest | null {
  const candidate = trustedMessageObject(message);
  const actions = new Set(["delivered", "back_at_store", "end_break", "complete_task", "single", "double", "break", "open", "undo_delivered", "cancel_delivery", "resume_task", "dismiss_resume", "start_quick_task", "finish_quick_tasks"]);
  if (!candidate || candidate.type !== "shift_tracker_native_action:requested" || typeof candidate.id !== "string" || !candidate.id || candidate.id.length > 160 || typeof candidate.action !== "string" || !actions.has(candidate.action)) return null;
  const optionalId = (name: "expectedStateRevision" | "expectedShiftId" | "expectedActivityId") => {
    const value = candidate[name];
    return typeof value === "string" && value.length > 0 && value.length <= 240 ? value : undefined;
  };
  return {
    id: candidate.id,
    action: candidate.action as NativeActionRequest["action"],
    expectedStateRevision: optionalId("expectedStateRevision"),
    expectedShiftId: optionalId("expectedShiftId"),
    expectedActivityId: optionalId("expectedActivityId"),
    taskName: typeof candidate.taskName === "string" && candidate.taskName.trim().length > 0 && candidate.taskName.trim().length <= 60 ? candidate.taskName.trim() : undefined,
  };
}

export function readNativeDispatchNotification(message: MessageEvent<unknown>): NativeDispatchNotification | null {
  const candidate = trustedMessageObject(message);
  if (!candidate || candidate.type !== "shift_tracker_dispatch_notification:received") return null;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const receivedAtEpochMs = candidate.receivedAtEpochMs;
  if (!id || id.length > 160 || typeof receivedAtEpochMs !== "number" || !Number.isFinite(receivedAtEpochMs)) return null;
  return { id, receivedAtEpochMs };
}

export function acknowledgeNativeDispatchNotification(id: string, outcome: "started" | "ignored" | "already_pending") {
  const bridge = getBridge();
  if (!bridge || !id || id.length > 160) return false;
  try {
    bridge.postMessage(JSON.stringify({ type: "shift_tracker_dispatch_notification:ack", id, outcome }));
    return true;
  } catch { return false; }
}

export function requestNativeDispatchNotificationAccess() {
  const bridge = getBridge();
  if (!bridge) return false;
  try {
    bridge.postMessage(JSON.stringify({ type: "shift_tracker_dispatch_notification:request_access" }));
    return true;
  } catch { return false; }
}

/** Structured result used by current companions. The legacy acknowledgement
 * remains below so already-installed shells keep working. */
export function respondNativeAction(id: string, outcome: NativeActionOutcome, snapshot?: Pick<NativeShiftSnapshot, "stateRevision" | "shiftId" | "activityId">) {
  const bridge = getBridge();
  if (!bridge || !id || id.length > 160) return false;
  try {
    bridge.postMessage(JSON.stringify({ type: "shift_tracker_native_action:result", id, outcome, ...snapshot }));
    return true;
  } catch { return false; }
}

export function acknowledgeNativeAction(id: string) {
  const bridge = getBridge();
  if (!bridge || !id || id.length > 160) return false;
  try { bridge.postMessage(JSON.stringify({ type: "shift_tracker_native_action:ack", id })); return true; }
  catch { return false; }
}

export function shareFileWithNativeShell(filename: string, content: string, mimeType: string) {
  const bridge = getBridge();
  if (!bridge) return false;
  const requestId = `share-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  try { bridge.postMessage(JSON.stringify({ type: "shift_tracker_file:share", requestId, filename, mimeType, content })); return true; }
  catch { return false; }
}

/** Posts a short Android alert after the canonical PWA geofence transition is
 * accepted. Android does not independently reinterpret GPS samples. */
export function showNativeGeofenceAlert(direction: "left" | "returned", observedAtEpochMs: number) {
  const bridge = getBridge();
  if (!bridge || !Number.isFinite(observedAtEpochMs)) return false;
  try { bridge.postMessage(JSON.stringify({ type: "shift_tracker_geofence:alert", direction, observedAtEpochMs })); return true; }
  catch { return false; }
}

export function startNativeDeliveryTracking(deliveryId: string) {
  const bridge = getBridge();
  if (!bridge || !deliveryId.trim()) {
    appendDeveloperLog("BRIDGE", "TRACKING_START_NOT_SENT", !bridge ? "Native bridge object unavailable" : "Delivery session id was empty", "error");
    return false;
  }
  appendDeveloperLog("BRIDGE", "TRACKING_START_SENT", "Active-delivery start command sent; session identifier redacted", "info");
  try {
    bridge.postMessage(JSON.stringify({ type: "shift_tracker_location:start", deliveryId: deliveryId.trim() }));
    return true;
  } catch {
    appendDeveloperLog("BRIDGE", "TRACKING_START_FAILED", "Native bridge rejected the tracking start command", "error");
    return false;
  }
}

let nativeSessionScopedCommands = false;

export function stopNativeDeliveryTracking(deliveryId?: string) {
  const bridge = getBridge();
  if (!bridge) {
    appendDeveloperLog("BRIDGE", "TRACKING_STOP_NOT_SENT", "Native bridge object unavailable", "error");
    return false;
  }
  appendDeveloperLog("BRIDGE", "TRACKING_STOP_SENT", deliveryId?.trim() ? "Active-delivery stop command sent; session identifier redacted" : "Unscoped active-delivery stop command sent", "info");
  try {
    bridge.postMessage(JSON.stringify({ type: !deliveryId?.trim() && nativeSessionScopedCommands ? "shift_tracker_location:stop_all" : "shift_tracker_location:stop", deliveryId: deliveryId?.trim() || undefined }));
    return true;
  } catch {
    appendDeveloperLog("BRIDGE", "TRACKING_STOP_FAILED", "Native bridge rejected the tracking stop command", "error");
    return false;
  }
}

export function requestNativeBackgroundLocation() {
  const bridge = getBridge();
  if (!bridge) {
    appendDeveloperLog("BRIDGE", "BACKGROUND_PERMISSION_NOT_SENT", "Native bridge object unavailable", "error");
    return false;
  }
  appendDeveloperLog("BRIDGE", "BACKGROUND_PERMISSION_SENT", "Android background-location settings requested", "info");
  bridge.postMessage(JSON.stringify({ type: "shift_tracker_location:background_request" }));
  return true;
}

export function acknowledgeNativeLocationSample(sampleId: string) {
  const bridge = getBridge();
  if (!bridge || !sampleId) return false;
  if (getDeveloperSettings().includeSampleMetadata) appendDeveloperLog("INGESTION", "SAMPLE_ACK_SENT", "Canonical ingestion completed; sample identifier redacted", "success");
  bridge.postMessage(JSON.stringify({ type: "shift_tracker_location:ack", sampleId }));
  return true;
}

export function readNativeShellInfo(message: MessageEvent<unknown>): NativeShellInfo | null {
  const candidate = trustedMessageObject(message);
  if (!candidate || candidate.type !== "shift_tracker_shell:ready" || candidate.trustedOrigin !== TRUSTED_SHIFT_TRACKER_ORIGIN || candidate.bridgeVersion !== NATIVE_BRIDGE_VERSION || typeof candidate.shellVersion !== "string") return null;
  nativeSessionScopedCommands = diagnostics(candidate.diagnostics)?.sessionScopedCommands === true;
  return { shellVersion: candidate.shellVersion, bridgeVersion: candidate.bridgeVersion, trustedOrigin: candidate.trustedOrigin, trackingActive: candidate.trackingActive === true, trackedDeliveryId: typeof candidate.trackedDeliveryId === "string" && candidate.trackedDeliveryId.length <= 128 ? candidate.trackedDeliveryId : undefined, installedWebVersion: typeof candidate.installedWebVersion === "string" && candidate.installedWebVersion.length <= 32 ? candidate.installedWebVersion : undefined, previousWebVersion: typeof candidate.previousWebVersion === "string" && candidate.previousWebVersion.length <= 32 ? candidate.previousWebVersion : undefined, wearConnected: typeof candidate.wearConnected === "boolean" ? candidate.wearConnected : undefined, wearVersion: typeof candidate.wearVersion === "string" && candidate.wearVersion.length <= 32 ? candidate.wearVersion : undefined, wearVersionCode: typeof candidate.wearVersionCode === "number" && Number.isSafeInteger(candidate.wearVersionCode) && candidate.wearVersionCode > 0 ? candidate.wearVersionCode : undefined, diagnostics: diagnostics(candidate.diagnostics) };
}

export function readNativeLocationSample(message: MessageEvent<unknown>): NativeLocationSample | null {
  const candidate = trustedMessageObject(message);
  if (!candidate || candidate.type !== "shift_tracker_location:sample" || !candidate.sample || typeof candidate.sample !== "object" || Array.isArray(candidate.sample)) return null;
  const sample = candidate.sample as Partial<NativeLocationSample>;
  if (typeof sample.sampleId !== "string" || typeof sample.deliveryId !== "string" || !sample.sampleId || !sample.deliveryId || sample.sampleId.length > 256 || sample.deliveryId.length > 128) return null;
  if (!Number.isFinite(sample.latitude) || sample.latitude! < -90 || sample.latitude! > 90 || !Number.isFinite(sample.longitude) || sample.longitude! < -180 || sample.longitude! > 180 || !Number.isFinite(sample.timestampEpochMs) || sample.timestampEpochMs! <= 0 || !Number.isFinite(sample.accuracy) || sample.accuracy! < 0 || sample.accuracy! > 250) return null;
  return { sampleId: sample.sampleId, deliveryId: sample.deliveryId, latitude: sample.latitude!, longitude: sample.longitude!, timestampEpochMs: sample.timestampEpochMs!, accuracy: sample.accuracy!, speed: typeof sample.speed === "number" && Number.isFinite(sample.speed) && sample.speed >= 0 ? sample.speed : null, heading: typeof sample.heading === "number" && Number.isFinite(sample.heading) ? sample.heading : null };
}

const TRACKING_STATUSES = new Set<NativeTrackingStatus>([
  "active", "stopped", "permission_required", "error", "service_starting", "service_started", "service_not_started",
  "foreground_permission_granted", "background_permission_required", "background_settings_opened", "background_permission_granted",
  "location_provider_disabled", "waiting_for_fix", "sample_received",
]);

export function readNativeTrackingState(message: MessageEvent<unknown>): NativeTrackingState | null {
  const candidate = trustedMessageObject(message);
  if (!candidate || candidate.type !== "shift_tracker_location:state" || typeof candidate.status !== "string" || !TRACKING_STATUSES.has(candidate.status as NativeTrackingStatus)) return null;
  return { status: candidate.status as NativeTrackingStatus, deliveryId: typeof candidate.deliveryId === "string" ? candidate.deliveryId : undefined, message: typeof candidate.message === "string" ? candidate.message : undefined, diagnostic: typeof candidate.diagnostic === "string" ? candidate.diagnostic : undefined, diagnostics: diagnostics(candidate.diagnostics) };
}

export function readNativeFileSaveResult(message: MessageEvent<unknown>): NativeFileSaveResult | null {
  const candidate = trustedMessageObject(message);
  if (!candidate || candidate.type !== "shift_tracker_file:save_result" || typeof candidate.requestId !== "string" || !candidate.requestId || candidate.requestId.length > 128 || !["saved", "cancelled", "error"].includes(String(candidate.status))) return null;
  return { requestId: candidate.requestId, status: candidate.status as NativeFileSaveResult["status"], message: typeof candidate.message === "string" ? candidate.message : undefined };
}

export function readNativeStoreProofLocationResult(message: MessageEvent<unknown>): NativeStoreProofLocationResult | null {
  const candidate = trustedMessageObject(message);
  if (!candidate || candidate.type !== "shift_tracker_store_proof:result" || typeof candidate.requestId !== "string" || !candidate.requestId || candidate.requestId.length > 128 || typeof candidate.status !== "string") return null;
  if (candidate.status === "ok") {
    if (typeof candidate.latitude !== "number" || !Number.isFinite(candidate.latitude) || candidate.latitude < -90 || candidate.latitude > 90 || typeof candidate.longitude !== "number" || !Number.isFinite(candidate.longitude) || candidate.longitude < -180 || candidate.longitude > 180 || typeof candidate.timestampEpochMs !== "number" || !Number.isFinite(candidate.timestampEpochMs) || candidate.timestampEpochMs <= 0 || typeof candidate.accuracy !== "number" || !Number.isFinite(candidate.accuracy) || candidate.accuracy < 0 || candidate.accuracy > 250) return null;
    return { requestId: candidate.requestId, status: "ok", latitude: candidate.latitude, longitude: candidate.longitude, timestampEpochMs: candidate.timestampEpochMs, accuracy: candidate.accuracy };
  }
  if (candidate.status !== "permission_required" && candidate.status !== "unavailable") return null;
  return { requestId: candidate.requestId, status: candidate.status, message: typeof candidate.message === "string" ? candidate.message.slice(0, 240) : undefined };
}

/** Requests one fresh Android foreground reading after an explicit user tap.
 * It never starts, stops, feeds, or alters delivery tracking. */
export function requestNativeStoreProofLocation(): Promise<NativeStoreProofLocationResult | null> {
  const bridge = getBridge();
  if (!bridge) return Promise.resolve(null);
  const requestId = `store-proof-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return new Promise((resolve) => {
    let unsubscribe: () => void = () => undefined;
    const receiveResult = (event: MessageEvent<unknown>) => {
      const result = readNativeStoreProofLocationResult(event);
      if (!result || result.requestId !== requestId) return;
      window.clearTimeout(timeout);
      unsubscribe();
      resolve(result);
    };
    const timeout = window.setTimeout(() => {
      unsubscribe();
      resolve({ requestId, status: "unavailable", message: "This Shift Tracker APK needs the store-proof update" });
    }, 25_000);
    unsubscribe = subscribeToNativeMessages(receiveResult);
    try {
      bridge.postMessage(JSON.stringify({ type: "shift_tracker_store_proof:request", requestId }));
    } catch {
      window.clearTimeout(timeout);
      unsubscribe();
      resolve({ requestId, status: "unavailable", message: "Android could not start the store-position check" });
    }
  });
}

export function saveFileWithNativeShell(filename: string, content: string, mimeType: string): Promise<NativeFileSaveResult | null> {
  const bridge = getBridge();
  if (!bridge) return Promise.resolve(null);
  const requestId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return new Promise((resolve) => {
    let unsubscribe: () => void = () => undefined;
    const receiveResult = (event: MessageEvent<unknown>) => {
      const result = readNativeFileSaveResult(event);
      if (!result || result.requestId !== requestId) return;
      window.clearTimeout(timeout);
      unsubscribe();
      appendDeveloperLog("BRIDGE", "FILE_SAVE_RESULT", `Android document picker result=${result.status}`, result.status === "saved" ? "success" : result.status === "error" ? "error" : "warning");
      resolve(result);
    };
    const timeout = window.setTimeout(() => {
      unsubscribe();
      resolve({ requestId, status: "error", message: "Android file picker timed out" });
    }, 10 * 60_000);
    unsubscribe = subscribeToNativeMessages(receiveResult);
    appendDeveloperLog("BRIDGE", "FILE_SAVE_SENT", `Android document picker requested · type=${mimeType} · filename omitted`, "info");
    bridge.postMessage(JSON.stringify({ type: "shift_tracker_file:save", requestId, filename, mimeType, content }));
  });
}


export type WearSettingsStatus = { ready: boolean; pending: boolean; values: Record<string, string> };
export function requestNativeWearSettings(action: "get" | "set", key?: string, value?: string) {
  const bridge = getBridge();
  if (!bridge) return false;
  try { bridge.postMessage(JSON.stringify({ type: `shift_tracker_wear_settings:${action}`, key, value })); return true; } catch { return false; }
}
export function readNativeWearSettings(event: MessageEvent<unknown>): WearSettingsStatus | null {
  const message = trustedMessageObject(event);
  if (!message || message.type !== "shift_tracker_wear_settings:status" || typeof message.ready !== "boolean" || typeof message.pending !== "boolean" || !message.values || typeof message.values !== "object" || Array.isArray(message.values)) return null;
  const values: Record<string, string> = {};
  const allowed = ["keep_awake", "battery_saver_display", "show_earnings", "haptic_geofence", "break_alert", "dim_delay", "break_minutes", "deliveries", "hours", "main_timer", "main_stat", "break_ring", "battery_tracking", "hold_actions"];
  for (const [key, value] of Object.entries(message.values)) if (allowed.includes(key) && typeof value === "string" && value.length <= 24) values[key] = value;
  if (message.ready && allowed.some(key => key !== "hold_actions" && !(key in values))) return null;
  return { ready: message.ready, pending: message.pending, values };
}
