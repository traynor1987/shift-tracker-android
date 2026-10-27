import type { ActivityRecord } from "@/lib/domain";

export const GOOGLE_ROUTE_RETRY_COOLDOWN_MS = 10 * 60_000;

const NEVER_RETRY_REASONS = new Set([
  "GOOGLE_API_HARD_LIMIT_REACHED",
  "GOOGLE_API_DAILY_LIMIT_REACHED",
  "DELIVERY_GOOGLE_API_OVERRIDE_LIMIT_REACHED",
]);

export function expectedRouteRetryState(activity: ActivityRecord, now = Date.now()) {
  const expected = activity.expectedRoute;
  const calculatedAt = Date.parse(expected?.calculatedAt ?? "");
  const retryable = Boolean(
    expected?.status === "unavailable"
    && expected.customer
    && !NEVER_RETRY_REASONS.has(expected.reason ?? ""),
  );
  const availableAt = Number.isFinite(calculatedAt)
    ? calculatedAt + GOOGLE_ROUTE_RETRY_COOLDOWN_MS
    : now;
  const remainingMs = retryable ? Math.max(0, availableAt - now) : 0;
  return {
    retryable,
    availableAt,
    remainingMs,
    remainingMinutes: Math.max(0, Math.ceil(remainingMs / 60_000)),
    available: retryable && remainingMs === 0,
  };
}
