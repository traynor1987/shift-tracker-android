import assert from "node:assert/strict";
import test from "node:test";
import { readNativeWearSettings, requestNativeWearSettings, TRUSTED_SHIFT_TRACKER_ORIGIN } from "../lib/nativeBridge.ts";

test("watch settings use the named origin-restricted bridge and retain the watch acknowledgement", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const sent: string[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: TRUSTED_SHIFT_TRACKER_ORIGIN }, ShiftTrackerNative: { postMessage: (value: string) => sent.push(value) } } });
  try {
    assert.equal(requestNativeWearSettings("set", "break_minutes", "20"), true);
    assert.deepEqual(JSON.parse(sent[0]), { type: "shift_tracker_wear_settings:set", key: "break_minutes", value: "20" });
    const values = { keep_awake: "true", battery_saver_display: "true", show_earnings: "false", haptic_geofence: "true", break_alert: "false", dim_delay: "30000", break_minutes: "20", deliveries: "30", hours: "6", main_timer: "shift", main_stat: "deliveries_earnings", break_ring: "true", battery_tracking: "true" };
    const payload = { type: "shift_tracker_wear_settings:status", ready: true, pending: true, values };
    const event = (data: unknown, origin = TRUSTED_SHIFT_TRACKER_ORIGIN) => ({ data, origin }) as MessageEvent;
    assert.deepEqual(readNativeWearSettings(event(JSON.stringify(payload))), { ready: true, pending: true, values });
    assert.equal(readNativeWearSettings(event({ ...payload, values: { ...values, hold_actions: "true" } }))?.values.hold_actions, "true");
    assert.equal(readNativeWearSettings(event(payload, "https://example.com")), null);
    assert.equal(readNativeWearSettings(event({ ...payload, values: {} })), null);
    assert.equal(readNativeWearSettings(event({ ...payload, pending: "no" })), null);
    assert.deepEqual(readNativeWearSettings(event({ ...payload, values: { ...values, hourly_pay: "0" } }))?.values, values);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original); else Reflect.deleteProperty(globalThis, "window");
  }
});
