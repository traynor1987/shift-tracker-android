import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { presentWearUpdate } from "../lib/wearUpdate.ts";

test("Wear presentation keeps update channels independent", () => {
  assert.equal(presentWearUpdate({ state: "available", installedVersion: "2.2.23", installedVersionCode: 28, latestVersion: "2.2.24", latestVersionCode: 29, updateAvailable: true }, "2.2.23", true).label, "UPDATE AVAILABLE");
  assert.equal(presentWearUpdate({ state: "up_to_date", installedVersion: "2.2.24", installedVersionCode: 29 }, "2.2.24", true).label, "UP TO DATE");
  assert.equal(presentWearUpdate({ state: "watch_not_connected", latestVersion: "2.2.24" }, "2.2.23", false).label, "WATCH NOT CONNECTED");
  assert.equal(presentWearUpdate({ state: "unavailable" }, null, null).label, "STATUS UNAVAILABLE");
});

test("Wear App Status uses the existing native bridge, never browser APK transfer", () => {
  const source = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
  const bridge = readFileSync(new URL("../lib/nativeBridge.ts", import.meta.url), "utf8");
  assert.match(source, /WEAR OS UPDATES/);
  assert.match(source, /requestNativeWearUpdate\("send"\)/);
  assert.match(source, /requestNativeWearUpdate\("check"/);
  assert.match(bridge, /shift_tracker_wear_update:\$\{action\}/);
  assert.doesNotMatch(source.slice(source.indexOf("function NativeUpdateStatusCards")), /fetch\(|ArrayBuffer|Blob/);
});
