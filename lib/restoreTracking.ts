import type { ActivityRecord, AppData } from "./domain.ts";

export type RestoreTrackingPlan = {
  currentDelivery: ActivityRecord | null;
  restoredDelivery: ActivityRecord | null;
  stopCurrent: boolean;
  startRestored: boolean;
  changedDelivery: boolean;
};

/** Finds only a delivery owned by the operational non-completed shift. */
export function operationalOpenDelivery(data: AppData): ActivityRecord | null {
  const active = data.shifts.find((shift) => shift.status !== "completed") ?? null;
  return active?.activities?.findLast((activity) => (activity.type === "single_delivery" || activity.type === "double_delivery") && !activity.end) ?? null;
}

/** Pure plan used before any native bridge side effects occur. */
export function planRestoreTracking(current: AppData, replacement: AppData, nativeTrackingActive: boolean): RestoreTrackingPlan {
  const currentDelivery = operationalOpenDelivery(current);
  const restoredDelivery = operationalOpenDelivery(replacement);
  const changedDelivery = currentDelivery?.id !== restoredDelivery?.id;
  return {
    currentDelivery,
    restoredDelivery,
    changedDelivery,
    stopCurrent: nativeTrackingActive && (changedDelivery || !restoredDelivery),
    startRestored: Boolean(restoredDelivery && (changedDelivery || !nativeTrackingActive)),
  };
}

/**
 * A delayed stop acknowledgement for the previous delivery must not tear down
 * the native state that now belongs to a restored open delivery. A stop event
 * without an owner is only authoritative once there is no current delivery.
 */
export function nativeStoppedStateMatchesDelivery(currentDeliveryId: string | null, stoppedDeliveryId?: string) {
  return currentDeliveryId == null || stoppedDeliveryId === currentDeliveryId;
}

/** Only the delivery named by a stop acknowledgement owns its transfer guard. */
export function nativeStoppedStateClearsTransferGuard(guardDeliveryId: string | null, stoppedDeliveryId?: string) {
  return guardDeliveryId == null || stoppedDeliveryId === guardDeliveryId;
}
