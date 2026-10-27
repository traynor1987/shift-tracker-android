import assert from "node:assert/strict";
import test from "node:test";
import { emptyData, createShift, repairShiftActivityIds } from "../lib/domain.ts";
import { verifyTrackerData } from "../lib/dataHealth.ts";
import { buildTrendSummary, shiftAnomalies } from "../lib/shiftInsights.ts";
import { validateAppDataStructure } from "../lib/backup.ts";

test("data health self-check is read-only", () => {
  const data = emptyData(); const before = JSON.stringify(data);
  const result = verifyTrackerData(data, "2026-08-25T12:00:00.000Z");
  assert.equal(result.status, "healthy"); assert.equal(JSON.stringify(data), before);
});

test("incident markers retain their exact timestamp and validate", () => {
  const data = emptyData(); const shift = repairShiftActivityIds(createShift(data.settings, new Date("2026-08-25T10:00:00.000Z")));
  const capturedAt = "2026-08-25T11:22:33.456Z";
  shift.incidents = [{ id: "incident-1", shiftId: shift.id, capturedAt }]; data.shifts.push(shift);
  assert.equal(shift.incidents[0].capturedAt, capturedAt); assert.equal(validateAppDataStructure(data, { enforceRelationships: false }).ok, true);
});

test("shift context and anomaly decisions do not alter calculations", () => {
  const data = emptyData(); const shift = createShift(data.settings, new Date("2026-08-25T10:00:00.000Z")); shift.status = "completed"; shift.clockOut = "2026-08-25T11:00:00.000Z";
  const before = JSON.stringify({ mileage: shift.mileage, deliveries: shift.deliveries, rate: shift.hourlyRatePence });
  shift.context = { tags: ["unexpectedly_busy"], managerOnDuty: "Manager", recordedAt: shift.clockIn, updatedAt: shift.clockOut };
  const flags = shiftAnomalies(shift, []); assert.ok(flags.some((item) => item.rule === "very_short_shift"));
  shift.anomalyReviews = [{ rule: "very_short_shift", status: "expected", updatedAt: shift.clockOut }];
  assert.equal(shiftAnomalies(shift, []).some((item) => item.rule === "very_short_shift"), false); assert.equal(JSON.stringify({ mileage: shift.mileage, deliveries: shift.deliveries, rate: shift.hourlyRatePence }), before);
});

test("trends respect Beta filtering", () => {
  const data = emptyData(); const beta = createShift(data.settings, new Date("2026-08-22T10:00:00.000Z")); beta.status = "completed"; beta.clockOut = "2026-08-22T14:00:00.000Z"; data.shifts.push(beta);
  data.settings.includeBetaData = false; assert.equal(buildTrendSummary(data, "overall", new Date("2026-08-25T12:00:00.000Z")).sampleSize, 0);
  data.settings.includeBetaData = true; assert.equal(buildTrendSummary(data, "overall", new Date("2026-08-25T12:00:00.000Z")).sampleSize, 1);
});

test("anomaly generation itself never mutates a shift", () => {
  const data = emptyData(); const shift = createShift(data.settings, new Date("2026-08-25T10:00:00.000Z")); shift.status = "completed"; shift.clockOut = "2026-08-25T11:00:00.000Z"; const before = JSON.stringify(shift);
  shiftAnomalies(shift, []); assert.equal(JSON.stringify(shift), before);
});
