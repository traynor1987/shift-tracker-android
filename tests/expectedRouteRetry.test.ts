import test from "node:test";
import assert from "node:assert/strict";
import type { ActivityRecord } from "../lib/domain";
import { expectedRouteRetryState, GOOGLE_ROUTE_RETRY_COOLDOWN_MS } from "../lib/expectedRouteRetry.ts";

const failedActivity = (calculatedAt: string, reason = "GOOGLE_API_UNAVAILABLE") => ({
  id: "delivery-retry",
  shiftId: "shift-retry",
  type: "single_delivery",
  start: "2026-08-25T10:00:00.000Z",
  end: "2026-08-25T10:30:00.000Z",
  tracked: true,
  expectedRoute: {
    status: "unavailable",
    customer: { latitude: 53.57, longitude: -2.88, accuracy: 8, source: "manual_delivered" },
    serviceAllowanceSeconds: 120,
    calculatedAt,
    calculationVersion: 1,
    reason,
  },
}) as ActivityRecord;

test("Google route retry remains locked until ten minutes after failure", () => {
  const failedAt = Date.parse("2026-08-25T10:31:00.000Z");
  const before = expectedRouteRetryState(failedActivity(new Date(failedAt).toISOString()), failedAt + GOOGLE_ROUTE_RETRY_COOLDOWN_MS - 1);
  assert.equal(before.retryable, true);
  assert.equal(before.available, false);
  assert.equal(before.remainingMinutes, 1);

  const ready = expectedRouteRetryState(failedActivity(new Date(failedAt).toISOString()), failedAt + GOOGLE_ROUTE_RETRY_COOLDOWN_MS);
  assert.equal(ready.available, true);
  assert.equal(ready.remainingMinutes, 0);
});

test("Google safety-limit failures never expose another retry", () => {
  const activity = failedActivity("2026-08-25T10:31:00.000Z", "DELIVERY_GOOGLE_API_OVERRIDE_LIMIT_REACHED");
  assert.equal(expectedRouteRetryState(activity, Date.parse("2026-08-25T11:00:00.000Z")).retryable, false);
});

test("route retry requires a saved customer point", () => {
  const activity = failedActivity("2026-08-25T10:31:00.000Z");
  activity.expectedRoute!.customer = null;
  assert.equal(expectedRouteRetryState(activity, Date.parse("2026-08-25T11:00:00.000Z")).retryable, false);
});
