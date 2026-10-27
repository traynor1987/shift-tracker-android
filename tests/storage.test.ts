import test from "node:test";
import assert from "node:assert/strict";
import { backupFilename, createTodayStateTransfer, downloadFile, mergeTodayState, parseTodayStateTransfer, todayStateFilename, transferredDeliveryResumePresence } from "../lib/storage.ts";
import { createShift, emptyData } from "../lib/domain.ts";

test("each backup timestamp produces a unique filename", () => {
  const first = backupFilename(new Date("2026-08-10T22:12:34.123Z"));
  const second = backupFilename(new Date("2026-08-10T22:12:35.123Z"));
  assert.notEqual(first, second);
  assert.match(first, /^shift-tracker-backup-2026-08-10T22-12-34-123Z\.json$/);
});

test("today state transfer contains today plus an active overnight shift only", () => {
  const data = emptyData();
  const historic = createShift(data.settings, new Date("2026-08-20T12:00:00.000Z"));
  historic.id = "historic"; historic.activities?.forEach((activity) => { activity.shiftId = historic.id; }); historic.status = "completed"; historic.clockOut = "2026-08-20T18:00:00.000Z";
  const today = createShift(data.settings, new Date("2026-08-22T11:00:00.000Z"));
  today.id = "today"; today.activities?.forEach((activity) => { activity.shiftId = today.id; }); today.status = "completed"; today.clockOut = "2026-08-22T12:00:00.000Z";
  const overnight = createShift(data.settings, new Date("2026-08-21T20:00:00.000Z")); overnight.id = "overnight"; overnight.activities?.forEach((activity) => { activity.shiftId = overnight.id; });
  data.shifts = [historic, today, overnight];
  const transfer = createTodayStateTransfer(data, new Date("2026-08-22T13:00:00.000Z"));
  assert.deepEqual(transfer.data.shifts.map((shift) => shift.id), ["today", "overnight"]);
  assert.ok(parseTodayStateTransfer(transfer));
  assert.equal(parseTodayStateTransfer(data), null);
  assert.match(todayStateFilename(new Date("2026-08-22T13:14:15.000Z")), /^shift-tracker-today-2026-08-22-13-14-15\.json$/);
});

test("today state import preserves older history and device settings", () => {
  const current = emptyData(); current.settings.hourlyRatePence = 999;
  const history = createShift(current.settings, new Date("2026-08-20T11:00:00.000Z")); history.id = "keep-history"; history.status = "completed"; history.clockOut = "2026-08-20T18:00:00.000Z";
  const replacedToday = createShift(current.settings, new Date("2026-08-22T08:00:00.000Z")); replacedToday.id = "replace-today"; replacedToday.status = "completed"; replacedToday.clockOut = "2026-08-22T09:00:00.000Z";
  current.shifts = [history, replacedToday];
  const source = emptyData(); const imported = createShift(source.settings, new Date("2026-08-22T10:00:00.000Z")); imported.id = "imported-live"; source.shifts = [imported];
  const merged = mergeTodayState(current, createTodayStateTransfer(source, new Date("2026-08-22T13:00:00.000Z")));
  assert.equal(merged.settings.hourlyRatePence, 999);
  assert.deepEqual(merged.shifts.map((shift) => shift.id), ["keep-history", "imported-live"]);
});

test("a transferred delivery resumes from its recorded geofence phase", () => {
  assert.equal(transferredDeliveryResumePresence(null), "unknown");
  assert.equal(transferredDeliveryResumePresence({ storeExitAt: "2026-08-22T13:01:00.000Z" }), "outside");
  assert.equal(transferredDeliveryResumePresence({ storeExitAt: "2026-08-22T13:01:00.000Z", storeEntryAt: "2026-08-22T13:20:00.000Z" }), "inside");
  assert.equal(transferredDeliveryResumePresence({ dominosStoreExitAt: "2026-08-22T13:02:00.000Z" }, "dominos"), "outside");
});

test("backup download creates and clicks a real downloadable file link", () => {
  const globals = globalThis as typeof globalThis & { document?: unknown; window?: unknown };
  const originalDocument = globals.document; const originalWindow = globals.window;
  const originalCreateObjectUrl = URL.createObjectURL; const originalRevokeObjectUrl = URL.revokeObjectURL;
  let appended = false, clicked = false, removed = false, revoked = false;
  const anchor = { href: "", download: "", style: { display: "" }, click: () => { clicked = true; }, remove: () => { removed = true; } };
  globals.document = { createElement: () => anchor, body: { appendChild: () => { appended = true; return anchor; } } } as unknown as Document;
  globals.window = { setTimeout: (callback: () => void) => { callback(); return 1; } } as unknown as Window & typeof globalThis;
  URL.createObjectURL = () => "blob:backup-test"; URL.revokeObjectURL = () => { revoked = true; };
  try {
    downloadFile("shift-backup.json", "{\"version\":1}", "application/json");
    assert.equal(anchor.download, "shift-backup.json"); assert.equal(appended, true); assert.equal(clicked, true); assert.equal(removed, true); assert.equal(revoked, true);
  } finally {
    globals.document = originalDocument; globals.window = originalWindow;
    URL.createObjectURL = originalCreateObjectUrl; URL.revokeObjectURL = originalRevokeObjectUrl;
  }
});
