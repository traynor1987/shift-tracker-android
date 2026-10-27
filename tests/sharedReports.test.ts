import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildFrozenSharedReport } from "../lib/sharedReports.ts";
import { sharedReportAvailable } from "../lib/sharedReportPolicy.ts";
import { createShift, emptyData } from "../lib/domain.ts";

function reportData() {
  const data = emptyData(); (data.settings as unknown as Record<string, unknown>).privateApiKey = "SECRET-KEY";
  const shift = createShift(data.settings, new Date("2026-08-25T10:00:00.000Z")); shift.status = "completed"; shift.clockOut = "2026-08-25T18:00:00.000Z"; shift.updatedAt = shift.clockOut; shift.context = { managerOnDuty: "Manager", tags: ["unexpectedly_busy"], note: "Customer Jane at 42 Private Road", recordedAt: shift.clockIn, updatedAt: shift.clockIn };
  shift.activities = [{ id: "run", shiftId: shift.id, type: "single_delivery", start: "2026-08-25T11:00:00.000Z", end: "2026-08-25T11:30:00.000Z", backAtStoreAt: "2026-08-25T11:30:00.000Z", storeExitObserved: true, storeExitAt: "2026-08-25T11:02:00.000Z", storeEntryObserved: true, storeEntryAt: "2026-08-25T11:29:00.000Z", customerDeliveries: 1, deliveryDestinations: [{ fullAddress: "42 Private Road", houseNumberOrName: "42", street: "Private Road", postcode: "L39 2XX", addressSource: "manual", privacyStatus: "precise" }], routeEvidence: { status: "complete", startedAt: "2026-08-25T11:00:00.000Z", completedAt: "2026-08-25T11:30:00.000Z", points: Array.from({ length: 120 }, (_, index) => ({ latitude: 53.500001 + index / 100_000, longitude: -2.800001 - index / 100_000, timestamp: new Date(Date.parse("2026-08-25T11:00:00.000Z") + index * 1_000).toISOString(), accuracy: 8 })), recordedPointCount: 120, distanceMetres: 1000, gaps: [], issues: [{ timestamp: "2026-08-25T11:10:00.000Z", type: "resume", message: "GPS tracking resumed." }], detail: "standard", retention: "90", expiresAt: null } }]; data.shifts = [shift]; return { data, shift };
}

test("frozen shared report excludes private live fields and unrelated data", () => {
  const { data, shift } = reportData(); const report = buildFrozenSharedReport(data, [shift], "simplified", new Date("2026-08-26T12:00:00.000Z")); const text = JSON.stringify(report);
  for (const secret of ["SECRET-KEY", "Jane", "42 Private Road", "houseNumberOrName", "privateApiKey"]) assert.doesNotMatch(text, new RegExp(secret));
  assert.equal(report.version, 3); assert.equal(report.shifts.length, 1); assert.equal(report.expiresAt, "2026-09-02T12:00:00.000Z");
  assert.ok(report.metrics.length >= 8); assert.ok(report.highlights.length >= 4); assert.ok(report.timeBreakdown.length >= 5); assert.equal(report.dataQuality.trackedRoutes, 1);
  assert.equal(report.highlights.find((item) => item.label === "Average hustle out")?.value, "2m");
  assert.equal(report.highlights.find((item) => item.label === "Average hustle in")?.value, "1m");
  assert.equal(report.highlights.find((item) => item.label === "Average hustle combined")?.value, "3m");
  assert.equal(report.routes[0].issues[0], "GPS tracking resumed.");
});

test("route privacy supports full, simplified and no-map frozen reports", () => {
  const { data, shift } = reportData(); const full = buildFrozenSharedReport(data, [shift], "full"); const simplified = buildFrozenSharedReport(data, [shift], "simplified"); const none = buildFrozenSharedReport(data, [shift], "none");
  assert.equal(full.routes[0].points.length, 120); assert.ok(simplified.routes[0].points.length <= 61); assert.equal(simplified.routes[0].points[0].latitude, 53.5); assert.equal(none.routes.length, 0);
  assert.deepEqual(full.routes[0].timings.map((item) => item.label), ["Hustle out", "Customer stop", "Hustle in", "Combined hustle", "Away from store", "Total trip"]);
});

test("expired and revoked shared reports are unavailable", () => {
  const now = Date.parse("2026-08-26T12:00:00.000Z"); assert.equal(sharedReportAvailable("active", "2026-08-27T12:00:00.000Z", now), true); assert.equal(sharedReportAvailable("active", "2026-08-25T12:00:00.000Z", now), false); assert.equal(sharedReportAvailable("revoked", "2026-08-27T12:00:00.000Z", now), false);
});

test("public report route hashes view tokens, renders labels correctly and enforces no-index/no-store", async () => {
  const source = await readFile(new URL("../app/share/[token]/route.ts", import.meta.url), "utf8"); assert.match(source, /sha256Hex\(token\)/); assert.match(source, /noindex,nofollow/); assert.match(source, /Cache-Control.*no-store/); assert.match(source, /sharedReportAvailable/); assert.match(source, /tile\.openstreetmap\.org/); assert.match(source, /OpenStreetMap contributors/); assert.match(source, /metricCard\(item, index\)/); assert.match(source, /class="timing-rail"/); assert.match(source, /PRINT \/ SAVE PDF/); assert.match(source, /EVIDENCE METHOD/);
});
