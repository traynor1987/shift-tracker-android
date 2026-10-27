import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { consumeHostedBudget, insertHostedDevice, checkpointExpiry, checkpointAvailable, readBoundedBody } from "../lib/hostedLimits.ts";

test("parallel enrollment and denied retries consume only actual device slots", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE hosted_devices (id TEXT PRIMARY KEY, auth_hash TEXT, created_at TEXT, updated_at TEXT)");
  const db = { prepare(sql: string) { return { bind(...values: (string | number)[]) { return { async first() { return sqlite.prepare(sql).get(...values) ?? null; } }; } }; } };
  try {
    const requests = await Promise.all(Array.from({ length: 80 }, (_, i) => insertHostedDevice(db, `device-${i}`, "hash", "2026-09-30T12:00:00.000Z")));
    assert.equal(requests.filter(Boolean).length, 4);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM hosted_devices").get()?.count, 4);
    assert.ok(await insertHostedDevice(db, "tomorrow", "hash", "2026-10-01T12:00:00.000Z"));
    assert.equal(await insertHostedDevice(db, "tomorrow", "hash", "2026-10-01T12:00:00.000Z"), null);
    for (let i = 5; i < 64; i++) assert.ok(await insertHostedDevice(db, `lifetime-${i}`, "hash", new Date(Date.UTC(2026, 9, i)).toISOString()));
    assert.equal(await insertHostedDevice(db, "over-limit", "hash", "2027-01-01T12:00:00.000Z"), null);
  } finally { sqlite.close(); }
});

test("durable budget cannot be bypassed by parallel requests or a new worker instance", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE hosted_request_budgets (scope TEXT NOT NULL, bucket TEXT NOT NULL, used INTEGER NOT NULL, PRIMARY KEY(scope, bucket))");
  const db = { prepare(sql: string) { return { bind(...values: (string | number)[]) { return { async first() { return sqlite.prepare(sql).get(...values) ?? null; } }; } }; } };
  try {
    const requests = await Promise.allSettled(Array.from({ length: 12 }, () => consumeHostedBudget(db, "nova:global", "day", 3)));
    assert.equal(requests.filter(x => x.status === "fulfilled").length, 3);
    assert.equal(sqlite.prepare("SELECT used FROM hosted_request_budgets").get()?.used, 3);
    await assert.rejects(() => consumeHostedBudget(db, "nova:global", "day", 3), /HOSTED_LIMIT_REACHED/);
    await consumeHostedBudget(db, "nova:global", "next-day", 3);
    await assert.rejects(() => consumeHostedBudget(db, "bytes", "day", 10, 11), /INVALID_BUDGET/);
  } finally { sqlite.close(); }
});

test("checkpoint expiry rejects future/expired metadata and reads reject expired stored copies", () => {
  const now = Date.parse("2026-09-30T10:00:00Z");
  assert.equal(checkpointExpiry("2026-09-30T09:00:00Z", now), "2026-10-03T09:00:00.000Z");
  assert.throws(() => checkpointExpiry("2026-10-30T09:00:00Z", now), /INVALID_CHECKPOINT_DATE/);
  assert.throws(() => checkpointExpiry("2026-09-20T09:00:00Z", now), /INVALID_CHECKPOINT_DATE/);
  assert.equal(checkpointAvailable("stored", "2026-09-30T10:00:00Z", now), false);
  assert.equal(checkpointAvailable("verified", "invalid", now), false);
  assert.equal(checkpointAvailable("verified", "2026-10-01T10:00:00Z", now), true);
});

test("request size is bounded even without a Content-Length header", async () => {
  const request = new Request("https://tracker.test/api", { method: "POST", body: "123456789" });
  await assert.rejects(() => readBoundedBody(request, 4), /INVALID_REQUEST_SIZE/);
  const small = new Request("https://tracker.test/api", { method: "POST", body: "test" });
  assert.equal(new TextDecoder().decode(await readBoundedBody(small, 4)), "test");
});
