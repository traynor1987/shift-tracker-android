type BudgetDb = { prepare(sql: string): { bind(...values: (string | number)[]): { first(): Promise<unknown> } } };

/** Count and insert in one SQLite statement: denied enrollment consumes no
 * permanent slots, and concurrent workers cannot exceed either ceiling. */
export async function insertHostedDevice(db: BudgetDb, id: string, hash: string, now: string) {
  return db.prepare(`INSERT INTO hosted_devices (id, auth_hash, created_at, updated_at)
    SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM hosted_devices) < 64
    AND (SELECT COUNT(*) FROM hosted_devices WHERE substr(created_at, 1, 10) = ?) < 4
    ON CONFLICT(id) DO NOTHING RETURNING id`).bind(id, hash, now, now, now.slice(0, 10)).first();
}

/** One atomic SQLite/D1 statement, shared by every worker instance. */
export async function consumeHostedBudget(db: BudgetDb, scope: string, bucket: string, limit: number, units = 1) {
  if (!Number.isSafeInteger(units) || units <= 0 || units > limit) throw new Error("INVALID_BUDGET");
  const row = await db.prepare(`INSERT INTO hosted_request_budgets (scope, bucket, used) VALUES (?, ?, ?)
    ON CONFLICT(scope, bucket) DO UPDATE SET used = used + excluded.used
    WHERE used <= ? - excluded.used RETURNING used`).bind(scope, bucket, units, limit).first();
  if (!row) throw new Error("HOSTED_LIMIT_REACHED");
}

export async function readBoundedBody(request: Request, maximum: number): Promise<ArrayBuffer> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maximum) throw new Error("INVALID_REQUEST_SIZE");
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new Error("INVALID_REQUEST_SIZE"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result.buffer;
}

export async function readBoundedJson<T>(request: Request, maximum: number): Promise<T> {
  try {
    const value = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, maximum)));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_REQUEST");
    return value as T;
  } catch (error) { if (error instanceof Error && error.message.startsWith("INVALID_")) throw error; throw new Error("INVALID_REQUEST"); }
}

export function checkpointExpiry(createdAt: string, now = Date.now()) {
  const stamp = Date.parse(createdAt);
  const expiry = Math.min(stamp, now) + 3 * 86_400_000;
  if (!Number.isFinite(stamp) || stamp > now + 5 * 60_000 || expiry <= now) throw new Error("INVALID_CHECKPOINT_DATE");
  return new Date(expiry).toISOString();
}
export function checkpointAvailable(status: string, expiresAt: string, now = Date.now()) {
  return (status === "stored" || status === "verified") && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) > now;
}
