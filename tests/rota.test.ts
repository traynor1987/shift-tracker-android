import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createShift, DEFAULT_SETTINGS, emptyData, repairShiftActivityIds } from "../lib/domain.ts";
import { addDays, attendanceStats, buildRotaReminders, clockInGuard, copyPreviousWeek, createRotaWeek, dueAbsenceEntries, findClockInRotaEntry, linkShiftToRota, missingNextWeekOnSunday, missingRotaPrompt, mondayKey, nextScheduledEntry, punctualityForShift, recordAttendance, rotaWeekForecast } from "../lib/rota.ts";
import { createBackupDocument, validateBackupDocument } from "../lib/backup.ts";

// Rota fixtures use UK local shift times, including BST and midnight boundaries.
process.env.TZ = "Europe/London";

const at = (value: string) => new Date(value);
const appSource = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("Sunday identifies a missing next week and stops once saved", () => {
  const data = emptyData(); const sunday = at("2026-08-30T12:00:00+01:00");
  assert.equal(missingNextWeekOnSunday(data, sunday), true);
  data.rotaWeeks!.push(createRotaWeek(addDays(mondayKey(sunday), 7)));
  assert.equal(missingNextWeekOnSunday(data, sunday), false);
});

test("rota forecast uses only shifts with explicit finish times and supports overnight work", () => {
  const week = createRotaWeek("2026-08-24");
  week.entries[0].status = "working"; week.entries[0].startTime = "11:00"; week.entries[0].scheduledEndTime = "19:00";
  week.entries[1].status = "working"; week.entries[1].startTime = "18:00"; week.entries[1].scheduledEndTime = "01:00";
  week.entries[2].status = "working"; week.entries[2].startTime = "11:00";
  const forecast = rotaWeekForecast(week, 1296);
  assert.equal(forecast.scheduledMs, 15 * 60 * 60_000);
  assert.equal(forecast.estimatedGrossPence, 19440);
  assert.equal(forecast.missingEndTimes, 1);
});

test("Shift prompt targets the current week, then next week on Sunday, and clears after any saved rota", () => {
  const data = emptyData();
  const tuesday = at("2026-08-25T12:00:00+01:00");
  assert.deepEqual(missingRotaPrompt(data, tuesday), { missing: true, weekStartDate: "2026-08-24", offset: 0, message: "This week’s rota has not been added yet." });
  data.rotaWeeks!.push(createRotaWeek("2026-08-24"));
  assert.equal(missingRotaPrompt(data, tuesday).missing, false);
  const sunday = at("2026-08-30T12:00:00+01:00");
  assert.deepEqual(missingRotaPrompt(data, sunday), { missing: true, weekStartDate: "2026-08-31", offset: 1, message: "Next week’s rota has not been added yet." });
  data.rotaWeeks!.push(createRotaWeek("2026-08-31"));
  assert.equal(missingRotaPrompt(data, sunday).missing, false);
});

test("Rota remains discoverable with no scheduled shift and the Shift tab exposes the missing-week action", () => {
  assert.match(appSource, /View or add your schedule/);
  assert.match(appSource, /ROTA NOT ADDED/);
  assert.match(appSource, /View or edit schedule/);
  assert.match(appSource, /rotaDue=\{rotaPrompt\.missing\}/);
});

test("off-shift home places the next rota shift after Last Shift and keeps the missing-rota fallback", () => {
  assert.match(appSource, /LAST SHIFT[\s\S]*home-next-shift-card/);
  assert.match(appSource, /SHIFT TODAY/);
  assert.match(appSource, /No upcoming shift entered/);
  assert.match(appSource, /rotaDue \? \(\s*<RotaReminder message=\{rotaMessage\}/);
});

test("next shift uses the earliest eligible rota entry", () => {
  const data = emptyData();
  const completed = createShift(DEFAULT_SETTINGS, at("2026-08-25T11:00:00+01:00")); completed.id = "completed-shift"; completed.status = "completed"; completed.clockOut = at("2026-08-25T19:00:00+01:00").toISOString(); data.shifts.push(completed);
  const week = createRotaWeek("2026-08-24");
  week.entries[1].status = "working"; week.entries[1].startTime = "11:00"; week.entries[1].linkedShiftId = "completed-shift";
  week.entries[2].status = "working"; week.entries[2].startTime = "13:00";
  week.entries[3].status = "working"; week.entries[3].startTime = "11:00";
  data.rotaWeeks!.push(week);
  assert.equal(nextScheduledEntry(data, at("2026-08-25T09:00:00+01:00"))?.id, week.entries[2].id);
});

test("a dangling link from a cancelled or deleted test shift does not hide today's rota", () => {
  const data = emptyData();
  const week = createRotaWeek("2026-08-24");
  week.entries[2].status = "working"; week.entries[2].startTime = "11:00"; week.entries[2].linkedShiftId = "deleted-test-shift";
  week.entries[4].status = "working"; week.entries[4].startTime = "17:30";
  data.rotaWeeks!.push(week);
  assert.equal(nextScheduledEntry(data, at("2026-08-26T09:20:00+01:00"))?.id, week.entries[2].id);
  assert.equal(findClockInRotaEntry(data, at("2026-08-26T11:00:00+01:00"))?.id, week.entries[2].id);
});

test("Rota editor and missing-week reminder retain visible controls without stretching the active shift", () => {
  assert.match(cssSource, /--teal:\s*var\(--blue\)/);
  assert.match(cssSource, /--soft:\s*var\(--surface-2\)/);
  assert.match(cssSource, /\.rota-day-title button\.active\{background:var\(--blue\);color:#fff/);
  assert.match(cssSource, /\.active-shift-page\.has-reminder/);
  assert.doesNotMatch(appSource, /active-shift-page\$\{backupDue \|\| rotaDue/);
});

test("rota editor uses the compact schedule-board treatment", () => {
  assert.match(appSource, /workingCount === 1 \? "shift" : "shifts"\} scheduled/);
  assert.match(appSource, /className=\{`rota-day-row \$\{entry\.status\}\$\{isToday \? " today" : ""\}`\}/);
  assert.match(appSource, /<i>TODAY<\/i>/);
  assert.match(cssSource, /\.rota-editor\{display:grid;gap:8px;padding:0;border:0;background:transparent/);
  assert.match(cssSource, /\.rota-editor-actions\{position:sticky;bottom:78px/);
});

test("weekly editor defaults to Off, 11:00 and Rush and copy preserves the schedule", () => {
  const previous = createRotaWeek("2026-08-24");
  previous.entries[0].status = "working"; previous.entries[0].startTime = "12:30"; previous.entries[0].shiftType = "L";
  const next = copyPreviousWeek(previous, "2026-08-31");
  assert.deepEqual([next.entries[0].status, next.entries[0].startTime, next.entries[0].shiftType], ["working", "12:30", "L"]);
  assert.deepEqual([next.entries[1].status, next.entries[1].startTime, next.entries[1].shiftType], ["off", "11:00", "R"]);
});

test("Clock In links the correct date and snapshots schedule immutably", () => {
  const data = emptyData(); const week = createRotaWeek("2026-08-24"); const entry = week.entries[1]; entry.status = "working"; entry.startTime = "11:00"; entry.shiftType = "R"; data.rotaWeeks!.push(week);
  const clock = at("2026-08-25T10:57:00+01:00"); const shift = createShift(DEFAULT_SETTINGS, clock);
  const matched = findClockInRotaEntry(data, clock); assert.equal(matched?.id, entry.id);
  linkShiftToRota(shift, matched!, 0); entry.startTime = "12:00";
  assert.equal(shift.scheduledStart, "11:00"); assert.equal(shift.scheduledShiftLabel, "Rush"); assert.equal(punctualityForShift(shift)?.classification, "early"); assert.equal(punctualityForShift(shift)?.differenceMinutes, -3);
});

test("Clock In gate covers approvals, keeps the first 10 late minutes on time and asks for context after that", () => {
  const data = emptyData();
  assert.equal(data.settings.punctualityToleranceMinutes, 10);
  assert.deepEqual(clockInGuard(data, at("2026-08-25T11:00:00+01:00")), { reason: "unscheduled" });
  const week = createRotaWeek("2026-08-24"); const entry = week.entries[1]; entry.status = "working"; entry.startTime = "11:00"; data.rotaWeeks!.push(week);
  assert.deepEqual(clockInGuard(data, at("2026-08-25T10:45:00+01:00")), { reason: "early", rotaEntryId: entry.id, scheduledStart: "11:00", minutesEarly: 15 });
  assert.equal(clockInGuard(data, at("2026-08-25T10:46:00+01:00")), null);
  assert.equal(clockInGuard(data, at("2026-08-25T11:08:00+01:00")), null);
  assert.equal(clockInGuard(data, at("2026-08-25T11:10:00+01:00")), null);
  assert.deepEqual(clockInGuard(data, at("2026-08-25T11:11:00+01:00")), { reason: "late", rotaEntryId: entry.id, scheduledStart: "11:00", minutesLate: 11 });
});

test("approved early clock-in evidence is retained in a valid full backup", () => {
  const data = emptyData(); const shift = repairShiftActivityIds(createShift(DEFAULT_SETTINGS, at("2026-08-25T10:45:00+01:00")));
  shift.clockInApproval = { reason: "early", managerName: "Alex Smith", areaManagerApprovalConfirmed: true, recordedAt: at("2026-08-25T10:44:30+01:00").toISOString(), scheduledStart: "11:00", minutesEarly: 15 };
  data.shifts.push(shift);
  assert.equal(validateBackupDocument(createBackupDocument(data, "2.1.54")).ok, true);
  assert.match(appSource, /Area manager approval confirmed/);
  assert.match(appSource, /Approving manager name/);
});

test("late clock-in reason is retained in a valid full backup without changing the clock-in time", () => {
  const data = emptyData(); const shift = repairShiftActivityIds(createShift(DEFAULT_SETTINGS, at("2026-08-25T11:14:00+01:00")));
  Object.assign(shift, { scheduledDate: "2026-08-25", scheduledStart: "11:00", punctualityToleranceMinutes: 10 });
  shift.lateClockInExplanation = { reason: "traffic", recordedAt: at("2026-08-25T11:14:05+01:00").toISOString(), scheduledStart: "11:00", minutesLate: 14 };
  data.shifts.push(shift);
  const result = validateBackupDocument(createBackupDocument(data, "2.1.57"));
  assert.equal(result.ok, true);
  assert.equal(shift.clockIn, at("2026-08-25T11:14:00+01:00").toISOString());
  assert.match(appSource, /Traffic or road delay/);
  assert.match(appSource, /counts as on time/);
});

test("punctuality uses the ten-minute grace period while preserving the displayed difference", () => {
  const shift = createShift(DEFAULT_SETTINGS, at("2026-08-25T11:10:00+01:00")); Object.assign(shift, { scheduledDate: "2026-08-25", scheduledStart: "11:00", punctualityToleranceMinutes: 10 });
  assert.deepEqual(punctualityForShift(shift), { differenceMinutes: 10, classification: "on_time" });
  shift.clockIn = at("2026-08-25T11:11:00+01:00").toISOString();
  assert.deepEqual(punctualityForShift(shift), { differenceMinutes: 11, classification: "late" });
});

test("punctuality classifies exact, tolerated and late without changing the difference", () => {
  const shift = createShift(DEFAULT_SETTINGS, at("2026-08-25T11:04:00+01:00")); Object.assign(shift, { scheduledDate: "2026-08-25", scheduledStart: "11:00", punctualityToleranceMinutes: 5 });
  assert.deepEqual(punctualityForShift(shift), { differenceMinutes: 4, classification: "on_time" });
  shift.clockIn = at("2026-08-25T11:06:00+01:00").toISOString();
  assert.deepEqual(punctualityForShift(shift), { differenceMinutes: 6, classification: "late" });
});

test("absence is due only after the scheduled local day and Off never creates absence", () => {
  const data = emptyData(); const week = createRotaWeek("2026-08-24"); week.entries[0].status = "working"; week.entries[1].status = "off"; data.rotaWeeks!.push(week);
  assert.equal(dueAbsenceEntries(data, at("2026-08-24T23:00:00+01:00")).length, 0);
  assert.deepEqual(dueAbsenceEntries(data, at("2026-08-25T08:00:00+01:00")).map((entry) => entry.id), [week.entries[0].id]);
  recordAttendance(week.entries[0], "holiday"); assert.equal(dueAbsenceEntries(data, at("2026-08-26T08:00:00+01:00")).length, 0);
});

test("reminder plan changes on edit, cancels linked shifts and keeps local DST wall time", () => {
  const data = emptyData(); const week = createRotaWeek("2026-10-19"); const entry = week.entries[6]; entry.status = "working"; entry.startTime = "11:00"; data.rotaWeeks!.push(week);
  const before = buildRotaReminders(data, at("2026-10-20T12:00:00+01:00"));
  const morning = before.find((item) => item.id === `${entry.id}:morning`)!; const local = new Date(morning.atEpochMs);
  assert.equal(`${local.getHours()}:${String(local.getMinutes()).padStart(2, "0")}`, "8:00");
  entry.startTime = "12:00"; const edited = buildRotaReminders(data, at("2026-10-20T12:00:00+01:00"));
  assert.notEqual(edited.find((item) => item.id === `${entry.id}:one_hour`)?.atEpochMs, before.find((item) => item.id === `${entry.id}:one_hour`)?.atEpochMs);
  entry.linkedShiftId = "shift-1"; assert.equal(buildRotaReminders(data, at("2026-10-20T12:00:00+01:00")).some((item) => item.rotaEntryId === entry.id), false);
});

test("old data migration remains rota-compatible without inferring history", async () => {
  const { migrateAppData } = await import("../lib/domain.ts");
  const old = emptyData(); delete old.rotaWeeks;
  const migrated = migrateAppData(old); assert.deepEqual(migrated.rotaWeeks, []); assert.equal(migrated.shifts.length, 0);
});

test("existing rota shifts migrate to the agreed ten-minute grace without changing timestamps", async () => {
  const { migrateAppData } = await import("../lib/domain.ts");
  const old = emptyData(); old.settingsRevision = 6; old.settings.punctualityToleranceMinutes = 0;
  const shift = createShift({ ...DEFAULT_SETTINGS, punctualityToleranceMinutes: 0 }, at("2026-08-25T11:02:00+01:00"));
  Object.assign(shift, { scheduledDate: "2026-08-25", scheduledStart: "11:00", punctualityToleranceMinutes: 0 }); old.shifts.push(shift);
  const migrated = migrateAppData(old);
  assert.equal(migrated.settings.punctualityToleranceMinutes, 10);
  assert.equal(migrated.shifts[0].punctualityToleranceMinutes, 10);
  assert.equal(migrated.shifts[0].clockIn, shift.clockIn);
  assert.equal(punctualityForShift(migrated.shifts[0])?.classification, "on_time");
});

test("full backup preserves rota, attendance and preferences while old backups remain valid", () => {
  const data = emptyData(); const week = createRotaWeek("2026-08-24"); week.entries[0].status = "working"; recordAttendance(week.entries[0], "store_cancelled", "Store closed"); data.rotaWeeks!.push(week); data.settings.rotaMorningReminderTime = "07:30";
  const current = validateBackupDocument(createBackupDocument(data, "2.1.51")); assert.equal(current.ok, true); if (current.ok) assert.equal(current.data.rotaWeeks?.[0].entries[0].attendance?.category, "store_cancelled");
  const old = structuredClone(data); delete old.rotaWeeks; delete old.settings.rotaMorningReminderTime; assert.equal(validateBackupDocument(old).ok, true);
});

test("punctuality stats expose counts, averages and earliest/latest without treating absence as lateness", () => {
  const data = emptyData(); const week = createRotaWeek("2026-08-24"); data.rotaWeeks!.push(week);
  const early = createShift(DEFAULT_SETTINGS, at("2026-08-24T10:55:00+01:00")); week.entries[0].status = "working"; linkShiftToRota(early, week.entries[0], 0); data.shifts.push(early);
  const late = createShift(DEFAULT_SETTINGS, at("2026-08-25T11:08:00+01:00")); week.entries[1].status = "working"; linkShiftToRota(late, week.entries[1], 0); data.shifts.push(late);
  week.entries[2].status = "working"; recordAttendance(week.entries[2], "holiday");
  const stats = attendanceStats(data, at("2026-08-24T00:00:00+01:00"), at("2026-08-31T00:00:00+01:00"));
  assert.deepEqual({ scheduled: stats.scheduled, worked: stats.worked, onTime: stats.onTime, late: stats.late, holiday: stats.holiday }, { scheduled: 3, worked: 2, onTime: 1, late: 1, holiday: 1 });
  assert.equal(stats.averageEarly, 5); assert.equal(stats.latestArrival, 8);
});
