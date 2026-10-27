import { checkpointRetentionIds } from "./hostedRetention.ts";
import { consumeHostedBudget, insertHostedDevice } from "./hostedLimits.ts";

type D1Result<T> = { results?: T[] };
type D1Statement = { bind(...values: unknown[]): D1Statement; run(): Promise<unknown>; first<T = Record<string, unknown>>(): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<D1Result<T>> };
type HostedD1 = { prepare(sql: string): D1Statement; batch(statements: D1Statement[]): Promise<unknown> };
type HostedR2Object = { arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> };
type HostedR2 = { put(key: string, value: ArrayBuffer | string, options?: { httpMetadata?: { contentType?: string }; onlyIf?: Headers }): Promise<unknown>; get(key: string): Promise<HostedR2Object | null>; delete(key: string | string[]): Promise<unknown> };

async function bindings() {
  const { env } = await import("cloudflare:workers");
  const value = env as unknown as { DB?: HostedD1; BUCKET?: HostedR2 };
  if (!value.DB || !value.BUCKET) throw new Error("HOSTED_STORAGE_UNAVAILABLE");
  return { db: value.DB, bucket: value.BUCKET };
}

const DEVICE_ID = /^[a-zA-Z0-9_-]{20,100}$/;
const RECORD_ID = /^[a-zA-Z0-9_-]{16,120}$/;
export function validHostedId(value: string, kind: "device" | "record" = "record") { return (kind === "device" ? DEVICE_ID : RECORD_ID).test(value); }
export async function sha256Hex(value: string | ArrayBuffer) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((item) => item.toString(16).padStart(2, "0")).join("");
}

export async function ensureHostedSchema() {
  // Production schema is owned by the checked-in Drizzle migrations. Do not
  // issue repeated DDL on GPS checkpoint requests or create schema at runtime.
  await bindings();
}

export function hostedBindings() { return bindings(); }

export async function registerDevice(deviceId: string, authToken: string) {
  if (!validHostedId(deviceId, "device") || authToken.length < 40 || authToken.length > 200) throw new Error("INVALID_DEVICE_CAPABILITY");
  await ensureHostedSchema(); const { db } = await bindings(); const hash = await sha256Hex(authToken); const now = new Date().toISOString();
  const existing = await db.prepare("SELECT auth_hash FROM hosted_devices WHERE id = ?").bind(deviceId).first<{ auth_hash: string }>();
  if (existing && existing.auth_hash !== hash) throw new Error("DEVICE_CAPABILITY_CONFLICT");
  if (!existing) {
    const inserted = await insertHostedDevice(db, deviceId, hash, now);
    if (!inserted) {
      // A concurrent request may already have enrolled this same capability.
      const concurrent = await db.prepare("SELECT auth_hash FROM hosted_devices WHERE id = ?").bind(deviceId).first<{ auth_hash: string }>();
      if (!concurrent) throw new Error("HOSTED_LIMIT_REACHED");
      if (concurrent.auth_hash !== hash) throw new Error("DEVICE_CAPABILITY_CONFLICT");
    }
  }
  else await db.prepare("UPDATE hosted_devices SET updated_at = ? WHERE id = ?").bind(now, deviceId).run();
}

export async function requireDevice(request: Request) {
  await ensureHostedSchema(); const { db } = await bindings(); const deviceId = request.headers.get("x-shift-tracker-device") ?? ""; const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!validHostedId(deviceId, "device") || auth.length < 40 || auth.length > 200) throw new Error("UNAUTHORISED");
  const record = await db.prepare("SELECT auth_hash FROM hosted_devices WHERE id = ?").bind(deviceId).first<{ auth_hash: string }>();
  if (!record || record.auth_hash !== await sha256Hex(auth)) throw new Error("UNAUTHORISED");
  return deviceId;
}

export function jsonError(error: unknown) {
  const code = error instanceof Error ? error.message : "HOSTED_REQUEST_FAILED";
  const status = code === "UNAUTHORISED" ? 401 : code === "HOSTED_LIMIT_REACHED" ? 429 : code.startsWith("INVALID_") ? 400 : code.endsWith("CONFLICT") ? 409 : code === "NOT_FOUND" ? 404 : 503;
  const safeCode = status === 503 ? "HOSTED_SERVICE_UNAVAILABLE" : code;
  return Response.json({ error: safeCode }, { status, headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": "60" } : {}) } });
}

export async function requirePaidRequest(request: Request, service: "nova" | "geocode") {
  const deviceId = await requireDevice(request);
  const { db } = await bindings();
  const date = new Date().toISOString();
  const day = `day:${date.slice(0, 10)}`, month = `month:${date.slice(0, 7)}`, minute = `minute:${date.slice(0, 16)}`;
  await consumeHostedBudget(db, `paid:${service}:global`, minute, service === "nova" ? 3 : 10);
  await consumeHostedBudget(db, `paid:${service}:${deviceId}`, day, service === "nova" ? 50 : 150);
  await consumeHostedBudget(db, `paid:${service}:global`, day, service === "nova" ? 50 : 150);
  await consumeHostedBudget(db, `paid:${service}:global`, month, service === "nova" ? 500 : 5000);
  return deviceId;
}

export async function reserveHostedUpload(deviceId: string, bytes: number) {
  const { db } = await bindings();
  const now = new Date().toISOString();
  await consumeHostedBudget(db, `uploads:${deviceId}`, `hour:${now.slice(0, 13)}`, 120);
  await consumeHostedBudget(db, `bytes:${deviceId}`, `day:${now.slice(0, 10)}`, 256 * 1024 * 1024, bytes);
  await consumeHostedBudget(db, "bytes:global", `day:${now.slice(0, 10)}`, 256 * 1024 * 1024, bytes);
  // Old counters have no bearing on current windows and must not accumulate.
  await db.prepare("DELETE FROM hosted_request_budgets WHERE bucket != 'lifetime' AND substr(bucket, instr(bucket, ':') + 1, 7) < ?").bind(now.slice(0, 7)).run();
}

/** Reclaim expired objects on hosted activity, deleting bytes before metadata
 * so an R2 failure remains retryable. Access checks reject expiry immediately. */
export async function pruneExpiredHostedObjects() {
  const { db, bucket } = await bindings();
  const now = new Date().toISOString();
  for (const table of ["hosted_checkpoints", "shared_reports"] as const) {
    const rows = (await db.prepare(`SELECT id, object_key FROM ${table} WHERE expires_at <= ? LIMIT 100`).bind(now).all<{ id: string; object_key: string }>()).results ?? [];
    if (!rows.length) continue;
    await bucket.delete(rows.map(row => row.object_key));
    await db.batch(rows.map(row => db.prepare(`DELETE FROM ${table} WHERE id = ? AND expires_at <= ?`).bind(row.id, now)));
  }
}

export async function pruneVerifiedCheckpoints(deviceId: string) {
  const { db, bucket } = await bindings();
  const rows = (await db.prepare("SELECT id, object_key, created_at, daily_bucket FROM hosted_checkpoints WHERE device_id = ? AND status = 'verified' ORDER BY created_at DESC").bind(deviceId).all<{ id: string; object_key: string; created_at: string; daily_bucket: string }>()).results ?? [];
  const keep = checkpointRetentionIds(rows, Date.now());
  const remove = rows.filter((row) => !keep.has(row.id)); if (!remove.length) return;
  await bucket.delete(remove.map((row) => row.object_key));
  await db.batch(remove.map((row) => db.prepare("DELETE FROM hosted_checkpoints WHERE id = ? AND device_id = ?").bind(row.id, deviceId)));
}

export function safeText(value: unknown, maximum = 200) { return typeof value === "string" ? value.trim().slice(0, maximum) : ""; }
