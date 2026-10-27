import type { AppData } from "./domain.ts";
import { createBackupDocument, validateBackupDocument } from "./backup.ts";
import { WEB_APP_VERSION } from "./nativeBridge.ts";

const CONFIG_KEY = "shift-tracker-hosted-capability-v1";
const PENDING_REASON_KEY = "shift-tracker-hosted-pending-reason-v1";
const LAST_SUCCESS_KEY = "shift-tracker-hosted-last-success-v1";
const LAST_ERROR_KEY = "shift-tracker-hosted-last-error-v1";
export type HostedCapability = { version: 1; deviceId: string; secret: string; backupEnabled: boolean; createdAt: string };
export type HostedCheckpoint = { id: string; reason: string; app_version: string; shift_context: string | null; created_at: string; expires_at: string; byte_size: number; status: "stored" | "verified"; verified_at: string | null };

function storage() { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } }
function bytesToBase64Url(bytes: Uint8Array) { let value = ""; bytes.forEach((byte) => value += String.fromCharCode(byte)); return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); }
function base64UrlToBytes(value: string) { const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4); const binary = atob(padded); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }
function randomToken(bytes = 32) { return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes))); }
async function sha256Hex(bytes: ArrayBuffer) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((value) => value.toString(16).padStart(2, "0")).join(""); }
export function readHostedCapability(): HostedCapability | null { try { const value = JSON.parse(storage()?.getItem(CONFIG_KEY) ?? "null") as HostedCapability | null; return value?.version === 1 && value.deviceId && value.secret ? value : null; } catch { return null; } }
function notifyStatus() { if (typeof window !== "undefined") window.dispatchEvent(new Event("shift-tracker-hosted-status")); }
function writeCapability(value: HostedCapability) { storage()?.setItem(CONFIG_KEY, JSON.stringify(value)); notifyStatus(); }
export function createHostedCapability(backupEnabled = false): HostedCapability { const existing = readHostedCapability(); if (existing) { const next = { ...existing, backupEnabled: existing.backupEnabled || backupEnabled }; writeCapability(next); return next; } const value: HostedCapability = { version: 1, deviceId: randomToken(24), secret: randomToken(32), backupEnabled, createdAt: new Date().toISOString() }; writeCapability(value); return value; }
export function setHostedBackupEnabled(enabled: boolean) { const value = createHostedCapability(enabled); writeCapability({ ...value, backupEnabled: enabled }); return { ...value, backupEnabled: enabled }; }
export function exportRecoveryKey(value = readHostedCapability()) { if (!value) throw new Error("Hosted recovery has not been set up."); return `STRK1.${bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ v: 1, d: value.deviceId, s: value.secret })))}`; }
export function importRecoveryKey(key: string, backupEnabled = false) { if (!key.trim().startsWith("STRK1.")) throw new Error("This is not a Shift Tracker recovery key."); const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(key.trim().slice(6)))) as { v?: number; d?: string; s?: string }; if (parsed.v !== 1 || !parsed.d || !parsed.s || parsed.d.length < 20 || base64UrlToBytes(parsed.s).length !== 32) throw new Error("The recovery key is invalid or incomplete."); const value: HostedCapability = { version: 1, deviceId: parsed.d, secret: parsed.s, backupEnabled, createdAt: new Date().toISOString() }; writeCapability(value); return value; }

async function deriveBytes(config: HostedCapability, info: string, bits = 256) { const material = await crypto.subtle.importKey("raw", base64UrlToBytes(config.secret), "HKDF", false, ["deriveBits"]); const result = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode(`ShiftTracker:${config.deviceId}`), info: new TextEncoder().encode(info) }, material, bits); return new Uint8Array(result); }
export async function deriveHostedToken(config: HostedCapability, purpose: string) { return bytesToBase64Url(await deriveBytes(config, `capability:${purpose}`)); }
async function headers(config: HostedCapability) { return { Authorization: `Bearer ${await deriveHostedToken(config, "device-auth")}`, "X-Shift-Tracker-Device": config.deviceId }; }
export async function paidServiceHeaders() {
  if (typeof window === "undefined") return {};
  const config = createHostedCapability(false);
  await ensureHostedDevice(config);
  return headers(config);
}
export async function ensureHostedDevice(config = readHostedCapability()) { if (!config) throw new Error("Hosted recovery has not been set up."); const authToken = await deriveHostedToken(config, "device-auth"); const response = await fetch("/api/hosted/device", { method: "POST", signal: AbortSignal.timeout(45_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: config.deviceId, authToken }) }); if (!response.ok) throw new Error("The hosted recovery vault could not be opened safely."); return config; }

type EncryptedCheckpoint = { version: 1; metadata: { id: string; createdAt: string; reason: string; appVersion: string; schemaVersion: number }; iv: string; ciphertext: string };
export async function encryptCheckpoint(data: AppData, reason: string, config: HostedCapability, stamp = new Date()) {
  const backup = createBackupDocument(data, WEB_APP_VERSION, stamp); const validation = validateBackupDocument(backup); if (!validation.ok) throw new Error("The hosted checkpoint was not queued because the backup validator rejected it.");
  const metadata = { id: randomToken(18), createdAt: stamp.toISOString(), reason: reason.slice(0, 100), appVersion: WEB_APP_VERSION, schemaVersion: data.version }; const iv = crypto.getRandomValues(new Uint8Array(12)); const keyBytes = await deriveBytes(config, "checkpoint-encryption"); const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]); const aad = new TextEncoder().encode(JSON.stringify(metadata)); const plain = new TextEncoder().encode(JSON.stringify(backup)); const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, plain); const envelope: EncryptedCheckpoint = { version: 1, metadata, iv: bytesToBase64Url(iv), ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)) }; return { envelope, bytes: new TextEncoder().encode(JSON.stringify(envelope)) };
}
export async function decryptCheckpoint(bytes: ArrayBuffer, config: HostedCapability) { const envelope = JSON.parse(new TextDecoder().decode(bytes)) as EncryptedCheckpoint; if (envelope.version !== 1 || !envelope.metadata || !envelope.iv || !envelope.ciphertext) throw new Error("The encrypted checkpoint envelope is invalid."); const key = await crypto.subtle.importKey("raw", await deriveBytes(config, "checkpoint-encryption"), "AES-GCM", false, ["decrypt"]); const aad = new TextEncoder().encode(JSON.stringify(envelope.metadata)); const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlToBytes(envelope.iv), additionalData: aad }, key, base64UrlToBytes(envelope.ciphertext)); const backup = JSON.parse(new TextDecoder().decode(plain)); const validated = validateBackupDocument(backup); if (!validated.ok) throw new Error("The decrypted hosted checkpoint failed Shift Tracker validation."); return validated.data;
}

export async function uploadHostedCheckpoint(data: AppData, reason: string, shiftContext?: string) {
  const config = readHostedCapability(); if (!config?.backupEnabled) return null; await ensureHostedDevice(config); const encrypted = await encryptCheckpoint(data, reason, config); const auth = await headers(config); const response = await fetch(`/api/hosted/checkpoints?id=${encodeURIComponent(encrypted.envelope.metadata.id)}`, { method: "POST", signal: AbortSignal.timeout(45_000), headers: { ...auth, "Content-Type": "application/octet-stream", "X-Checkpoint-Reason": encrypted.envelope.metadata.reason, "X-App-Version": WEB_APP_VERSION, "X-Created-At": encrypted.envelope.metadata.createdAt, ...(shiftContext ? { "X-Shift-Context": shiftContext.slice(0, 120) } : {}) }, body: encrypted.bytes }); if (!response.ok) throw new Error("Encrypted checkpoint upload was not confirmed.");
  const stored = await response.json() as { id: string }; const readBack = await fetch(`/api/hosted/checkpoints/${encodeURIComponent(stored.id)}`, { signal: AbortSignal.timeout(45_000), headers: auth }); if (!readBack.ok) throw new Error("Encrypted checkpoint read-back failed."); const readBytes = await readBack.arrayBuffer(); const expectedDigest = readBack.headers.get("x-ciphertext-sha256"); if (!expectedDigest || await sha256Hex(readBytes) !== expectedDigest) throw new Error("Encrypted checkpoint read-back digest did not match."); await decryptCheckpoint(readBytes, config); const verified = await fetch("/api/hosted/checkpoints", { method: "PATCH", signal: AbortSignal.timeout(45_000), headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ id: stored.id }) }); if (!verified.ok) throw new Error("Encrypted checkpoint verification was not recorded."); storage()?.removeItem(PENDING_REASON_KEY); storage()?.setItem(LAST_SUCCESS_KEY, new Date().toISOString()); storage()?.removeItem(LAST_ERROR_KEY); notifyStatus(); return stored.id;
}

let checkpointQueue: Promise<unknown> = Promise.resolve();
let newestQueuedCheckpoint = 0;

type NetworkInformationLike = {
  effectiveType?: string;
  rtt?: number;
  downlink?: number;
  addEventListener?: (event: "change", listener: () => void) => void;
  removeEventListener?: (event: "change", listener: () => void) => void;
};

export function hostedSyncConnectionUsable() {
  if (typeof navigator === "undefined" || navigator.onLine === false) return false;
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (!connection) return true;
  if (connection.effectiveType === "slow-2g") return false;
  if (typeof connection.rtt === "number" && connection.rtt > 1_500) return false;
  if (typeof connection.downlink === "number" && connection.downlink > 0 && connection.downlink < 0.2) return false;
  return true;
}

export function queueHostedCheckpoint(data: AppData, reason: string, shiftContext?: string) {
  const config = readHostedCapability();
  if (!config?.backupEnabled) return Promise.resolve(null);
  storage()?.setItem(PENDING_REASON_KEY, reason.slice(0, 100));
  notifyStatus();
  if (!hostedSyncConnectionUsable()) return Promise.resolve(null);
  const requestNumber = ++newestQueuedCheckpoint;
  const snapshot = structuredClone(data);
  const latest = [...snapshot.shifts].sort((left, right) => right.clockIn.localeCompare(left.clockIn))[0];
  const safeContext = shiftContext ?? (latest ? new Date(latest.clockIn).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : undefined);
  checkpointQueue = checkpointQueue.catch(() => undefined).then(async () => {
    // Multiple rapid saves collapse into the newest complete snapshot.
    if (requestNumber !== newestQueuedCheckpoint) return null;
    return uploadHostedCheckpoint(snapshot, reason, safeContext);
  }).catch((error) => {
    storage()?.setItem(LAST_ERROR_KEY, error instanceof Error ? error.message : "Hosted checkpoint failed.");
    notifyStatus();
    throw error;
  });
  return checkpointQueue;
}
export function pendingHostedCheckpointReason() { return storage()?.getItem(PENDING_REASON_KEY) ?? null; }
export const LOCATION_CHECKPOINT_INTERVAL_MS = 5 * 60_000;
export function locationCheckpointDue(lastQueuedAt: number, now: number) {
  return now - lastQueuedAt >= LOCATION_CHECKPOINT_INTERVAL_MS;
}
export function locationCheckpointReason(before: AppData, after: AppData): string | null {
  const previous = before.shifts.find(shift => shift.status !== "completed");
  const next = after.shifts.find(shift => shift.id === previous?.id);
  const run = (shift: AppData["shifts"][number] | undefined) => shift?.activities?.findLast(item => item.type === "single_delivery" || item.type === "double_delivery");
  const oldRun = run(previous), nextRun = run(next);
  if (!oldRun || oldRun.id !== nextRun?.id) return null;
  if (!oldRun.end && nextRun.end) return "Back at Store";
  if (oldRun.storeExitAt !== nextRun.storeExitAt || oldRun.storeEntryAt !== nextRun.storeEntryAt) return "Store crossing";
  return null;
}
export function hostedBackupDiagnostics() { return { pendingReason: storage()?.getItem(PENDING_REASON_KEY) ?? null, lastSuccessAt: storage()?.getItem(LAST_SUCCESS_KEY) ?? null, lastError: storage()?.getItem(LAST_ERROR_KEY) ?? null }; }
export async function listHostedCheckpoints(config = readHostedCapability()) { if (!config) return [] as HostedCheckpoint[]; await ensureHostedDevice(config); const response = await fetch("/api/hosted/checkpoints", { signal: AbortSignal.timeout(45_000), headers: await headers(config) }); if (!response.ok) throw new Error("Cloud Recovery could not list checkpoints."); return ((await response.json()) as { checkpoints: HostedCheckpoint[] }).checkpoints; }
export async function downloadHostedCheckpoint(id: string, config = readHostedCapability()) { if (!config) throw new Error("Enter your recovery key first."); await ensureHostedDevice(config); const response = await fetch(`/api/hosted/checkpoints/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(45_000), headers: await headers(config) }); if (!response.ok) throw new Error("The hosted checkpoint could not be downloaded."); return decryptCheckpoint(await response.arrayBuffer(), config); }

export function meaningfulCheckpointReason(before: AppData, after: AppData): string | null {
  const active = (data: AppData) => data.shifts.find((shift) => shift.status !== "completed"); const oldActive = active(before); const nextActive = active(after);
  if (!oldActive && nextActive) return before.shifts.some((shift) => shift.id === nextActive.id) ? "Restart Shift" : "Clock In";
  if (oldActive && !nextActive) return after.shifts.some((shift) => shift.id === oldActive.id) ? "Clock Out" : "Cancel Shift";
  if (oldActive && nextActive && oldActive.id === nextActive.id) {
    const oldBreak = oldActive.breaks.at(-1); const nextBreak = nextActive.breaks.at(-1); if (oldActive.breaks.length !== nextActive.breaks.length) return "Start Break"; if (oldBreak?.end !== nextBreak?.end) return "End Break";
    const oldRuns = (oldActive.activities ?? []).filter((item) => item.type === "single_delivery" || item.type === "double_delivery"); const nextRuns = (nextActive.activities ?? []).filter((item) => item.type === "single_delivery" || item.type === "double_delivery");
    if (oldRuns.length !== nextRuns.length) return nextRuns.length > oldRuns.length ? (nextRuns.at(-1)?.type === "double_delivery" ? "Start Double" : "Start Single") : "Cancel Delivery";
    const oldRun = oldRuns.at(-1); const nextRun = nextRuns.at(-1); if (oldRun && nextRun) { if ((oldRun.customerEvents?.length ?? 0) !== (nextRun.customerEvents?.length ?? 0)) return "Delivered"; if (!oldRun.end && nextRun.end) return "Back at Store"; }
  }
  if (JSON.stringify(before.rotaWeeks ?? []) !== JSON.stringify(after.rotaWeeks ?? [])) return "Rota edit";
  if (JSON.stringify(before.payrollSchedules ?? []) !== JSON.stringify(after.payrollSchedules ?? []) || JSON.stringify(before.payments) !== JSON.stringify(after.payments)) return "Payroll edit";
  const omitRoute = (data: AppData) => data.shifts.map((shift) => ({ ...shift, updatedAt: undefined, activities: (shift.activities ?? []).map((activity) => ({ ...activity, routeEvidence: undefined })) }));
  if (JSON.stringify(omitRoute(before)) !== JSON.stringify(omitRoute(after))) return "History correction";
  return null;
}
