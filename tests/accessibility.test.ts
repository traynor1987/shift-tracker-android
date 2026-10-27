import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  cycleModalFocusIndex,
  isSafeSingleActionDismissal,
  togglePressedFromClassName,
} from "../lib/modalAccessibility.ts";

const component = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
const focusManager = readFileSync(new URL("../lib/modalAccessibility.ts", import.meta.url), "utf8");
const focusComponent = readFileSync(new URL("../components/ModalFocusManager.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("modal focus order wraps forward and backwards", () => {
  assert.equal(cycleModalFocusIndex(2, 3, false), 0);
  assert.equal(cycleModalFocusIndex(0, 3, true), 2);
  assert.equal(cycleModalFocusIndex(-1, 3, false), 0);
  assert.equal(cycleModalFocusIndex(-1, 3, true), 2);
  assert.equal(cycleModalFocusIndex(0, 0, false), -1);
});

test("Escape is inferred only for a single harmless informational action", () => {
  assert.equal(isSafeSingleActionDismissal(["OK"]), true);
  assert.equal(isSafeSingleActionDismissal(["GOT IT"]), true);
  assert.equal(isSafeSingleActionDismissal(["CLOSE PHOTO"]), true);
  assert.equal(isSafeSingleActionDismissal(["CANCEL", "DELETE"]), false);
  assert.equal(isSafeSingleActionDismissal(["RESTORE BACKUP"]), false);
});

test("shared modal manager installs once at the application root", () => {
  assert.equal((component.match(/<ModalFocusManager \/>/g) ?? []).length, 1);
  assert.match(focusComponent, /installModalFocusManagement\(\)/);
  assert.match(focusManager, /MutationObserver/);
  assert.match(focusManager, /\[role="dialog"\]\[aria-modal="true"\]/);
});

test("active modal receives focus, traps Tab and restores the opener", () => {
  assert.match(focusManager, /\[data-modal-initial-focus\], \[autofocus\]/);
  assert.match(focusManager, /event\.key !== "Tab"/);
  assert.match(focusManager, /event\.shiftKey/);
  assert.match(focusManager, /focusable\[nextIndex\]\.focus/);
  assert.match(focusManager, /removed\.at\(-1\)\?\.opener\?\.isConnected/);
  assert.match(focusManager, /active\.dialog\.contains\(nestedOpener\)/);
  assert.match(focusManager, /\[aria-current="page"\], \.main-content button, main/);
});

test("dialogs gain an accessible title association and icon close buttons gain a name", () => {
  assert.match(focusManager, /h1, h2, h3, h4, h5, h6/);
  assert.match(focusManager, /setAttribute\("aria-labelledby", heading\.id\)/);
  assert.match(focusManager, /imageDescription \|\| "Dialog"/);
  assert.match(focusManager, /setAttribute\("aria-label", "Close dialog"\)/);
  const dialogs = component.match(/<[^<>]+role="dialog"[^<>]*>/g) ?? [];
  assert.ok(dialogs.length > 0);
  for (const dialog of dialogs) assert.match(dialog, /aria-modal="true"/);
});

test("application-style toggles expose pressed and disabled state", () => {
  assert.equal(togglePressedFromClassName("geofence-toggle active"), true);
  assert.equal(togglePressedFromClassName("geofence-toggle"), false);
  assert.match(focusManager, /button\.geofence-toggle/);
  assert.match(focusManager, /setAttribute\("aria-pressed"/);
  assert.match(component, /disabled\s+aria-label="Complete-route corridor loading is locked"/);
});

test("custom historical sections expose and update expanded state for keyboard users", () => {
  assert.match(component, /header\.setAttribute\("aria-expanded", "false"\)/);
  assert.match(component, /header\.setAttribute\("aria-expanded", String\(!collapsed\)\)/);
  assert.match(component, /event\.key === "Enter" \|\| event\.key === " "/);
});

test("mobile CSS keeps large text, keyboard forms and fixed navigation reachable", () => {
  assert.match(styles, /\.app-shell \{[^}]*padding-bottom: calc\(84px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(styles, /\.confirm-modal\{[\s\S]*?100dvh/);
  assert.match(styles, /\.active-main \.main-content\{[\s\S]*?overflow-y:auto/);
  assert.match(styles, /scroll-margin-block:16px 110px/);
  assert.match(styles, /\.route-map-toolbar button\{min-height:44px\}/);
  assert.match(styles, /\.bottom-nav button \{[^}]*overflow-wrap: anywhere/);
});
