import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
const bridge = readFileSync(new URL("../lib/nativeBridge.ts", import.meta.url), "utf8");

test("native Android and Wear updates use one in-app progress modal", () => {
  assert.match(source, /function NativeUpdateProgressModal/);
  assert.match(source, /Downloading Android update/);
  assert.match(source, /Android installer opened/);
  assert.match(source, /Downloading Wear update/);
  assert.match(source, /Sending update to watch/);
  assert.match(source, /Ready to install on watch/);
  assert.match(source, /CONTINUE IN BACKGROUND/);
  assert.match(source, /requestNativeApkUpdate\("install"\)/);
  assert.match(source, /requestNativeWearUpdate\("send"\)/);
  assert.doesNotMatch(source.slice(source.indexOf("function NativeUpdateStatusCards")), /fetch\(|ArrayBuffer|Blob/);
});

test("manual native update checks show an explicit result", () => {
  assert.match(source, /function NativeUpdateCheckModal/);
  assert.match(source, /Update Not Needed/);
  assert.match(source, /Checking GitHub release/);
  assert.match(source, /const checkAndroidUpdate/);
  assert.match(source, /const checkWearUpdate/);
});

test("progress parsing accepts only native updater states", () => {
  assert.match(bridge, /"verified"/);
  assert.match(bridge, /"sending_to_watch"/);
  assert.match(bridge, /shift_tracker_apk_update:\$\{action\}/);
  assert.match(bridge, /shift_tracker_wear_update:\$\{action\}/);
});
