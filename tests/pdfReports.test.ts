import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildShiftReportBody } from "../lib/pdfReports.ts";
import { createShift, emptyData } from "../lib/domain.ts";

const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const reports = readFileSync(new URL("../lib/pdfReports.ts", import.meta.url), "utf8");

test("generated reports always include a safe route back to Shift Tracker", () => {
  assert.match(reports, /← BACK TO SHIFT TRACKER/);
  assert.match(reports, /reportShell\(title, subtitle, body, window\.location\.href\)/);
  assert.match(reports, /window\.opener/);
  assert.match(reports, /window\.close\(\)/);
  assert.match(reports, /window\.location\.replace\(fallback\)/);
  assert.match(reports, /@media print\{\.no-print\{display:none!important\}\}/);
  assert.match(reports, /\.print-toolbar\{position:sticky/);
  assert.match(reports, /viewport-fit=cover/);
  assert.match(reports, /env\(safe-area-inset-top\)/);
  assert.match(reports, /const printOnce/);
});

test("delivery PDF explicitly reports absent and partial GPS without hiding statistics", () => {
  assert.match(reports, /No recorded GPS route available\. Delivery timings remain saved/);
  assert.match(reports, /Partial GPS record:/);
  assert.match(reports, /usableRoute/);
});

test("an individual shift PDF body executes for a shift containing delivery evidence", () => {
  const data = emptyData();
  const shift = createShift(data.settings, new Date("2026-08-23T16:00:00.000Z"));
  shift.status = "completed";
  shift.clockOut = "2026-08-23T22:00:00.000Z";
  shift.deliveries = [{ id: "event-1", type: "single", timestamp: "2026-08-23T17:30:00.000Z", reimbursementPence: 100, activityId: "run-1" }];
  shift.activities = [{
    id: "run-1", shiftId: shift.id, type: "single_delivery", start: "2026-08-23T17:00:00.000Z", end: "2026-08-23T17:30:00.000Z", deliveryEventId: "event-1",
    storeExitAt: "2026-08-23T17:02:00.000Z", storeEntryAt: "2026-08-23T17:28:00.000Z",
    routeEvidence: { status: "complete", startedAt: "2026-08-23T17:00:00.000Z", completedAt: "2026-08-23T17:30:00.000Z", points: [{ latitude: 53.568, longitude: -2.888, timestamp: "2026-08-23T17:00:00.000Z", accuracy: 8 }, { latitude: 53.57, longitude: -2.87, timestamp: "2026-08-23T17:20:00.000Z", accuracy: 8 }], recordedPointCount: 2, distanceMetres: 1609.344, gaps: [], issues: [], detail: "standard", retention: "90", expiresAt: null },
  }];
  const body = buildShiftReportBody(shift);
  assert.match(body, /1\.00 mi recorded/);
  assert.match(body, /Single delivery/);
  assert.doesNotMatch(reports, /routeMiles\(/);
});

test("Android changelog headings remain readable in explicit and system dark mode", () => {
  assert.match(styles, /:root\[data-theme="dark"\] \.settings-page\.settings-style-android \.about-changelog > summary strong/);
  assert.match(styles, /:root:not\(\[data-theme="light"\]\) \.settings-page\.settings-style-android \.about-changelog > summary strong/);
  assert.match(styles, /color:#f5f3f0!important/);
});

test("Store Location geofence headings remain readable in explicit and system dark mode", () => {
  assert.match(styles, /:root\[data-theme="dark"\] \.settings-page\.settings-style-android \.geofence-map-label strong/);
  assert.match(styles, /:root\[data-theme="dark"\] \.settings-page\.settings-style-android \.settings-geofence-boundaries b/);
  assert.match(styles, /:root:not\(\[data-theme="light"\]\) \.settings-page\.settings-style-android \.geofence-map-label strong/);
  assert.match(styles, /:root:not\(\[data-theme="light"\]\) \.settings-page\.settings-style-android \.settings-geofence-boundaries strong/);
  assert.match(styles, /color:var\(--ink\)!important/);
});
