import { returnDiagnosticsSnapshot } from "./returnDiagnostics.ts";
import { runtimeDiagnosticsSnapshot } from "./runtimeDiagnostics.ts";

const MODE_KEY = "shift-tracker-developer-mode-v1";
const SETTINGS_KEY = "shift-tracker-developer-settings-v1";
const LOG_KEY = "shift-tracker-developer-log-v1";
const CHANGE_EVENT = "shift-tracker-developer-console";

export type DeveloperLogLevel = "info" | "success" | "warning" | "error";

export type DeveloperLogEntry = {
  id: string;
  timestamp: string;
  source: "PWA" | "BRIDGE" | "ANDROID" | "GPS" | "INGESTION";
  event: string;
  detail: string;
  level: DeveloperLogLevel;
};

export type DeveloperConsoleSettings = {
  loggingEnabled: boolean;
  persistLog: boolean;
  includeSampleMetadata: boolean;
  statusHeartbeatEnabled: boolean;
  statusHeartbeatSeconds: number;
  maxEntries: number;
  waitingWarningSeconds: number;
  accuracyWarningMetres: number;
};

export const DEFAULT_DEVELOPER_SETTINGS: DeveloperConsoleSettings = {
  loggingEnabled: true,
  persistLog: true,
  includeSampleMetadata: true,
  statusHeartbeatEnabled: false,
  statusHeartbeatSeconds: 10,
  maxEntries: 150,
  waitingWarningSeconds: 30,
  accuracyWarningMetres: 65,
};

let sessionLog: DeveloperLogEntry[] = [];

function storageAvailable() {
  try { return typeof window !== "undefined" && typeof window.localStorage !== "undefined"; } catch { return false; }
}

function writeLog(value: string | null) {
  try { if (storageAvailable()) { if (value === null) window.localStorage.removeItem(LOG_KEY); else window.localStorage.setItem(LOG_KEY, value); } }
  catch { /* Optional logging must never interrupt tracking or a save. */ }
}

function dispatchChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

export function normaliseDeveloperSettings(value: Partial<DeveloperConsoleSettings> | null | undefined): DeveloperConsoleSettings {
  return {
    loggingEnabled: value?.loggingEnabled !== false,
    persistLog: value?.persistLog !== false,
    includeSampleMetadata: value?.includeSampleMetadata !== false,
    statusHeartbeatEnabled: value?.statusHeartbeatEnabled === true,
    statusHeartbeatSeconds: boundedInteger(value?.statusHeartbeatSeconds, DEFAULT_DEVELOPER_SETTINGS.statusHeartbeatSeconds, 5, 60),
    maxEntries: boundedInteger(value?.maxEntries, DEFAULT_DEVELOPER_SETTINGS.maxEntries, 25, 500),
    waitingWarningSeconds: boundedInteger(value?.waitingWarningSeconds, DEFAULT_DEVELOPER_SETTINGS.waitingWarningSeconds, 5, 300),
    accuracyWarningMetres: boundedInteger(value?.accuracyWarningMetres, DEFAULT_DEVELOPER_SETTINGS.accuracyWarningMetres, 5, 250),
  };
}

export function getDeveloperModeEnabled() {
  if (!storageAvailable()) return false;
  try { return window.localStorage.getItem(MODE_KEY) === "1"; } catch { return false; }
}

export function setDeveloperModeEnabled(enabled: boolean) {
  try { if (storageAvailable()) window.localStorage.setItem(MODE_KEY, enabled ? "1" : "0"); } catch { /* optional preference */ }
  dispatchChange();
  if (enabled) appendDeveloperLog("PWA", "DEVELOPER_MODE_ENABLED", "Hidden developer tools unlocked", "success");
}

export function getDeveloperSettings(): DeveloperConsoleSettings {
  if (!storageAvailable()) return { ...DEFAULT_DEVELOPER_SETTINGS };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<DeveloperConsoleSettings> | null;
    return normaliseDeveloperSettings(parsed);
  } catch {
    return { ...DEFAULT_DEVELOPER_SETTINGS };
  }
}

export function saveDeveloperSettings(value: Partial<DeveloperConsoleSettings>) {
  const settings = normaliseDeveloperSettings({ ...getDeveloperSettings(), ...value });
  try { if (storageAvailable()) window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* optional preference */ }
  const current = readStoredLog().slice(-settings.maxEntries);
  sessionLog = current;
  if (storageAvailable()) {
    writeLog(settings.persistLog ? JSON.stringify(current) : null);
  }
  dispatchChange();
  return settings;
}

function validEntry(value: unknown): value is DeveloperLogEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<DeveloperLogEntry>;
  return typeof item.id === "string" && typeof item.timestamp === "string" && typeof item.source === "string" && typeof item.event === "string" && typeof item.detail === "string" && ["info", "success", "warning", "error"].includes(String(item.level));
}

function readStoredLog() {
  if (sessionLog.length) return sessionLog;
  if (!storageAvailable()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOG_KEY) ?? "[]") as unknown;
    sessionLog = Array.isArray(parsed) ? parsed.filter(validEntry) : [];
  } catch {
    sessionLog = [];
  }
  return sessionLog;
}

function safeDetail(detail: string) {
  return detail.replace(/\s+/g, " ").trim().slice(0, 600);
}

export function appendDeveloperLog(source: DeveloperLogEntry["source"], event: string, detail: string, level: DeveloperLogLevel = "info") {
  if (!getDeveloperModeEnabled()) return;
  const settings = getDeveloperSettings();
  if (!settings.loggingEnabled) return;
  const entry: DeveloperLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    source,
    event: event.replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 80).toUpperCase(),
    detail: safeDetail(detail),
    level,
  };
  sessionLog = [...readStoredLog(), entry].slice(-settings.maxEntries);
  if (settings.persistLog) writeLog(JSON.stringify(sessionLog));
  dispatchChange();
}

export function getDeveloperLog() {
  return [...readStoredLog()];
}

export function clearDeveloperLog() {
  sessionLog = [];
  writeLog(null);
  dispatchChange();
}

export function subscribeDeveloperConsole(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

export function developerLogExportPayload() {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    app: "Domino's Shift Tracker",
    privacy: "No coordinates, customer addresses, receipt data, API keys or file contents are recorded by this developer log.",
    settings: getDeveloperSettings(),
    performance: runtimeDiagnosticsSnapshot(),
    returnPipeline: returnDiagnosticsSnapshot(),
    entries: getDeveloperLog(),
  }, null, 2);
}

export function nativeDiagnosticsSummary(value: Record<string, unknown> | null | undefined) {
  if (!value) return "No diagnostic payload";
  const keys = [
    "diagnostic", "foregroundLocation", "backgroundLocationGranted", "notificationsGranted", "locationProviderEnabled", "serviceRunning",
    "locationUpdateRequest", "providerAvailability", "lastKnownLocation", "currentLocation", "locationCallbackCount", "lastRawFixTimestamp",
    "lastRawFixAccuracy", "lastRawFixProvider", "lastSampleRejection", "recoveryStore", "nativeMessageDispatch", "lastSampleReceivedAt",
  ];
  return keys.filter((key) => value[key] !== undefined && value[key] !== null).map((key) => `${key}=${String(value[key])}`).join(" · ") || "Diagnostic payload contained no recognised fields";
}

export function nativeMessageType(data: unknown) {
  let payload = data;
  if (typeof payload === "string") {
    if (payload.length > 65_536) return "OVERSIZED_MESSAGE";
    try { payload = JSON.parse(payload); } catch { return "NON_JSON_MESSAGE"; }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "UNKNOWN_MESSAGE";
  const type = (payload as Record<string, unknown>).type;
  return typeof type === "string" ? type.slice(0, 100) : "UNNAMED_MESSAGE";
}
