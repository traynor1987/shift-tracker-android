import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decryptCheckpoint, encryptCheckpoint, locationCheckpointDue, locationCheckpointReason, meaningfulCheckpointReason, readHostedCapability, setHostedBackupEnabled, createHostedCapability, type HostedCapability } from "../lib/hostedBackup.ts";
import { checkpointRetentionIds } from "../lib/hostedRetention.ts";
import { createShift, emptyData } from "../lib/domain.ts";

const capability: HostedCapability = { version: 1, deviceId: "device-capability-abcdefghijklmnop", secret: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", backupEnabled: true, createdAt: "2026-08-26T09:00:00.000Z" };

test("disabled hosted recovery remains disabled when another feature reads its capability", () => {
  const original = globalThis.localStorage;
  const values = new Map<string, string>();
  Object.assign(globalThis, { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  try {
    setHostedBackupEnabled(false);
    createHostedCapability();
    assert.equal(readHostedCapability()?.backupEnabled, false);
  } finally { Object.assign(globalThis, { localStorage: original }); }
});

test("hosted checkpoint AES-GCM round-trip reconstructs and validates canonical AppData", async () => {
  const data = emptyData(); data.settings.hourlyRatePence = 1399;
  const encrypted = await encryptCheckpoint(data, "Clock In", capability, new Date("2026-08-26T09:00:00.000Z"));
  assert.doesNotMatch(new TextDecoder().decode(encrypted.bytes), /hourlyRatePence|1399/);
  const restored = await decryptCheckpoint(encrypted.bytes.buffer as ArrayBuffer, capability);
  assert.equal(restored.settings.hourlyRatePence, 1399);
});

test("wrong user-held recovery key cannot decrypt a hosted checkpoint", async () => {
  const encrypted = await encryptCheckpoint(emptyData(), "Clock Out", capability);
  const wrong = { ...capability, secret: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE" };
  await assert.rejects(() => decryptCheckpoint(encrypted.bytes.buffer as ArrayBuffer, wrong));
});

test("meaningful checkpoint detection excludes GPS-only route growth", () => {
  const before = emptyData(); const shift = createShift(before.settings, new Date("2026-08-26T09:00:00.000Z")); before.shifts = [shift];
  const after = structuredClone(before); after.shifts[0].activities = [{ id: "run-1", shiftId: shift.id, type: "single_delivery", start: "2026-08-26T10:00:00.000Z", end: null, customerDeliveries: 1, routeEvidence: { status: "recording", startedAt: "2026-08-26T10:00:00.000Z", completedAt: null, points: [], recordedPointCount: 0, distanceMetres: 0, gaps: [], issues: [], detail: "standard", retention: "90", expiresAt: null } }];
  const baseline = structuredClone(after); after.shifts[0].activities![0].routeEvidence!.points.push({ latitude: 53.5, longitude: -2.8, timestamp: "2026-08-26T10:01:00.000Z", accuracy: 8 });
  assert.equal(meaningfulCheckpointReason(baseline, after), null);
  assert.equal(locationCheckpointReason(baseline, after), null);
  after.shifts[0].activities![0].end = "2026-08-26T10:20:00.000Z";
  assert.equal(locationCheckpointReason(baseline, after), "Back at Store");
});

test("route progress checkpoints are bounded while delivery actions remain immediate", () => {
  const first = 1_000_000;
  assert.equal(locationCheckpointDue(0, first), true);
  assert.equal(locationCheckpointDue(first, first + 10_000), false);
  assert.equal(locationCheckpointDue(first, first + 5 * 60_000), true);
});

test("retention keeps one newest verified checkpoint per day for three days", () => {
  const now = Date.parse("2026-08-26T12:00:00.000Z"); const rows = Array.from({ length: 45 }, (_, index) => { const created = new Date(now - index * 6 * 60 * 60_000); return { id: `cp-${index}`, created_at: created.toISOString(), daily_bucket: created.toISOString().slice(0, 10) }; });
  const keep = checkpointRetentionIds(rows, now);
  assert.ok(keep.has("cp-0")); assert.ok(keep.has("cp-3")); assert.ok(keep.has("cp-7")); assert.equal(keep.size, 3);
});

test("production save path queues hosted backup only in the successful local-save continuation", async () => {
  const source = await readFile(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
  const savePath = source.slice(source.indexOf("void saveData(draft)"), source.indexOf("return draft;", source.indexOf("void saveData(draft)")));
  assert.ok(savePath.includes('checkpointMode === "location"'));
  assert.ok(savePath.includes('queueHostedCheckpoint(draft, checkpointReason ?? "Route progress")'));
  assert.ok(savePath.includes('queueHostedCheckpoint(draft, checkpointReason!)'));
  assert.ok(savePath.indexOf(".then(() => {") < savePath.indexOf("queueHostedCheckpoint(draft"));
  const ingestion = source.slice(source.indexOf("const applyLocationReading"), source.indexOf("const recordRouteIssue"));
  assert.match(ingestion, /\}, \(latest\) => \{[\s\S]*?\}, "location"\);/);
});

test("native replay reads the current delivery and coalesces duplicate queued samples", async () => {
  const source = await readFile(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
  const replay = source.slice(source.indexOf("const sample = readNativeLocationSample(event)"), source.indexOf("useEffect(() => {", source.indexOf("const sample = readNativeLocationSample(event)")));
  assert.ok(replay.includes("queuedNativeSampleIdsRef.current.has(sample.sampleId)"));
  assert.ok(replay.includes("applyNativeLocationReadingRef.current("));
  assert.match(replay, /\.finally\(\(\) => \{\s*queuedNativeSampleIdsRef\.current\.delete\(sample\.sampleId\)/);
});
