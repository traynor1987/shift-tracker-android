import assert from "node:assert/strict";
import test from "node:test";
import { createBackupDocument, validateBackupDocument } from "../lib/backup.ts";
import * as domain from "../lib/domain.ts";
import { buildShiftReportBody } from "../lib/pdfReports.ts";

function completedShift() {
  const data = domain.emptyData();
  const shift = domain.repairShiftActivityIds(
    domain.createShift(
      data.settings,
      new Date("2026-09-28T10:00:00.000Z"),
    ),
  );
  shift.status = "completed";
  shift.clockOut = "2026-09-28T18:00:00.000Z";
  shift.updatedAt = shift.clockOut;
  shift.activities = (shift.activities ?? []).map((activity) => ({
    ...activity,
    end: activity.end ?? activity.start,
  }));
  data.shifts = [shift];
  return { data, shift };
}

test("shift and manager ratings keep candid private labels out of professional output", () => {
  const overallLabel = (domain as typeof domain & {
    shiftOverallRatingLabel: (rating: number, audience?: "private" | "professional") => string;
  }).shiftOverallRatingLabel;
  const managerLabel = (domain as typeof domain & {
    managerRatingLabel: (rating: number, audience?: "private" | "professional") => string;
  }).managerRatingLabel;

  assert.equal(typeof overallLabel, "function");
  assert.equal(typeof managerLabel, "function");
  assert.equal(overallLabel(1), "Shit show");
  assert.equal(overallLabel(1, "professional"), "Very difficult");
  assert.equal(managerLabel(1), "Idiot in charge");
  assert.equal(managerLabel(1, "professional"), "Management obstructive");
  assert.equal(overallLabel(5), "Excellent");
  assert.equal(managerLabel(5, "professional"), "Excellent");
});

test("a shift rating and its operational context survive strict backup validation", () => {
  const { data, shift } = completedShift();
  shift.context = {
    managerOnDuty: "Alex",
    tags: ["understaffed", "management_blocked", "good_teamwork"],
    note: "Available for work throughout.",
    recordedAt: shift.clockOut!,
    updatedAt: shift.clockOut!,
  };
  shift.ratingReview = {
    overallRating: 1,
    managerRating: 1,
    recordedAt: shift.clockOut!,
    updatedAt: shift.clockOut!,
  };

  const result = validateBackupDocument(createBackupDocument(data, "2.1.221"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.shifts[0].ratingReview?.overallRating, 1);
  assert.deepEqual(result.data.shifts[0].context?.tags, [
    "understaffed",
    "management_blocked",
    "good_teamwork",
  ]);
});

test("backup validation rejects out-of-range shift ratings", () => {
  const { data, shift } = completedShift();
  shift.ratingReview = {
    overallRating: 0 as 1,
    managerRating: 6 as 5,
    recordedAt: shift.clockOut!,
    updatedAt: shift.clockOut!,
  };

  const result = validateBackupDocument(createBackupDocument(data, "2.1.221"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /ratingReview/);
});

test("professional shift PDF reports ratings without private wording", () => {
  const { shift } = completedShift();
  shift.context = {
    managerOnDuty: "Alex",
    tags: ["understaffed", "management_blocked"],
    recordedAt: shift.clockOut!,
    updatedAt: shift.clockOut!,
  };
  shift.ratingReview = {
    overallRating: 1,
    managerRating: 1,
    recordedAt: shift.clockOut!,
    updatedAt: shift.clockOut!,
  };

  const report = buildShiftReportBody(shift);
  assert.match(report, /Shift review/);
  assert.match(report, /Very difficult/);
  assert.match(report, /Management obstructive/);
  assert.match(report, /Alex/);
  assert.doesNotMatch(report, /Shit show|Idiot in charge/);
});

test("historic shifts remain valid without a rating review", () => {
  const { data } = completedShift();
  const result = validateBackupDocument(createBackupDocument(data, "2.1.220"));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.shifts[0].ratingReview, undefined);
});

test("saving a shift review trims context and preserves its original recorded time on edits", () => {
  const { shift } = completedShift();
  const apply = (domain as typeof domain & {
    applyShiftRatingReview: (
      shift: domain.Shift,
      review: {
        overallRating: number;
        managerRating: number;
        managerOnDuty?: string;
        tags: domain.ShiftContextTag[];
        note?: string;
      },
      at: string,
    ) => { ok: boolean };
  }).applyShiftRatingReview;
  assert.equal(typeof apply, "function");

  assert.deepEqual(apply(shift, {
    overallRating: 1,
    managerRating: 1,
    managerOnDuty: "  Alex  ",
    tags: ["understaffed", "management_blocked"],
    note: "  No useful work was permitted.  ",
  }, "2026-09-28T18:05:00.000Z"), { ok: true });
  assert.equal(shift.context?.managerOnDuty, "Alex");
  assert.equal(shift.context?.note, "No useful work was permitted.");
  assert.equal(shift.ratingReview?.recordedAt, "2026-09-28T18:05:00.000Z");

  assert.deepEqual(apply(shift, {
    overallRating: 2,
    managerRating: 2,
    managerOnDuty: "Alex",
    tags: ["understaffed"],
  }, "2026-09-28T19:00:00.000Z"), { ok: true });
  assert.equal(shift.ratingReview?.recordedAt, "2026-09-28T18:05:00.000Z");
  assert.equal(shift.ratingReview?.updatedAt, "2026-09-28T19:00:00.000Z");
});

test("an invalid rating cannot partially alter a shift review", () => {
  const { shift } = completedShift();
  const before = structuredClone(shift);
  const apply = (domain as typeof domain & {
    applyShiftRatingReview: (
      shift: domain.Shift,
      review: { overallRating: number; managerRating: number; tags: domain.ShiftContextTag[] },
      at: string,
    ) => { ok: boolean; message?: string };
  }).applyShiftRatingReview;
  assert.equal(typeof apply, "function");
  const result = apply(shift, {
    overallRating: 0,
    managerRating: 5,
    tags: [],
  }, "2026-09-28T18:05:00.000Z");
  assert.equal(result.ok, false);
  assert.deepEqual(shift, before);
});
