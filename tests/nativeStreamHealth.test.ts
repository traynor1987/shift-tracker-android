import test from "node:test";
import assert from "node:assert/strict";
import { nativeStreamIsStalled } from "../lib/nativeLocationSync.ts";

test("fresh provider fixes prevent false stalls when route sampling waits or is disabled", () => {
  const now = 1_800_000_000_000;
  assert.equal(nativeStreamIsStalled("current", { deliveryId: "current", timestamp: now - 5_000 }, now - 40_000, now), false);
  assert.equal(nativeStreamIsStalled("current", { deliveryId: "current", timestamp: now - 5_000 }, null, now), false);
});
test("old recovery fixes and fixes for another delivery cannot claim a live stream", () => {
  const now = 1_800_000_000_000;
  assert.equal(nativeStreamIsStalled("current", { deliveryId: "previous", timestamp: now }, now - 40_000, now), true);
  assert.equal(nativeStreamIsStalled("current", { deliveryId: "current", timestamp: now - 90_000 }, null, now), true);
  assert.equal(nativeStreamIsStalled("current", { deliveryId: "current", timestamp: now + 10_000 }, null, now), true);
});
test("native-owned recovery uses the service's 60-second health window", () => {
  const now = 1_800_000_000_000;
  assert.equal(nativeStreamIsStalled("current", { deliveryId: "current", timestamp: now - 40_000 }, null, now, 60_000), false);
  assert.equal(nativeStreamIsStalled("current", { deliveryId: "current", timestamp: now - 61_000 }, null, now, 60_000), true);
});
