import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("Tasks today content follows the action-first source order", () => {
  const current = component.indexOf("tasks-current-status");
  const quick = component.indexOf("quick-work-card", current);
  const cleaning = component.indexOf("tasks-cleaning-area", quick);
  const timed = component.indexOf("tasks-timed-work", cleaning);
  const breakdown = component.indexOf("tasks-today-breakdown", timed);

  assert.ok(current > 0);
  assert.ok(current < quick && quick < cleaning && cleaning < timed && timed < breakdown);
});

test("Quick Jobs retain the existing stacked timer and custom settings source", () => {
  assert.match(component, /quickTaskGroups\.map/);
  assert.match(component, /data\.settings\.customQuickTasks/);
  assert.match(component, /requestQuickTaskStart\(job\.label\)/);
  assert.match(component, /onFinishQuickTasks/);
  assert.match(component, /disabled=\{Boolean\(running && !quickStackRunning\)\}/);
});

test("Tasks provides compact scheduled and quick-job workspaces", () => {
  assert.match(component, /className="tasks-workspace-tabs"/);
  assert.match(component, /setWorkView\("scheduled"\)/);
  assert.match(component, /setWorkView\("quick"\)/);
  assert.match(component, /className="quick-job-grid"/);
  assert.match(component, /frequentQuickJobs\(/);
  assert.match(styles, /\.quick-job-grid\{[^}]*grid-template-columns:repeat\(auto-fit,minmax\(160px,1fr\)\)/);
  assert.match(styles, /\.quick-job-tile\{[^}]*min-height:52px/);
  assert.match(component, /className="quick-category-tabs"/);
  assert.match(component, /setQuickCategory\(group\.id\)/);
});

test("Quick jobs record immediately while Stock Run keeps its dedicated action", () => {
  assert.match(component, /onStartQuickTask\(label\)/);
  assert.match(component, /onClick=\{onStartStockRun\}/);
  assert.match(component, /GPS tracked · no delivery fuel/);
});

test("Quick Job catalogue and frequency scans are memoized across live timer ticks", () => {
  assert.match(component, /useMemo\(\(\) => resolveQuickJobs\(data\.settings\)/);
  assert.match(component, /useMemo\(\(\) => frequentQuickJobs\(data\.shifts, quickJobs\)/);
});

test("a running Quick Job stack cannot leak into the editable named-work card", () => {
  assert.match(component, /if \(activity\?\.quickStack\) return;/);
  assert.match(component, /const namedOtherWorkRunning = Boolean\([\s\S]*!quickStackRunning/);
  assert.match(component, /tasks-timed-work scheduled-workspace-only\$\{namedOtherWorkRunning/);
});

test("active scheduled work is promoted above the workspace switch", () => {
  assert.match(component, /className="panel tasks-active-work"/);
  assert.match(component, />ACTIVE TASK</);
  assert.match(component, /onPauseTask\(running\.id\)/);
});

test("active-delivery Hustle cells retain readable supporting labels", () => {
  assert.match(styles, /has-active-delivery \.hustle-timing-grid>span\{[^}]*padding:7px 7px/);
  assert.match(styles, /has-active-delivery \.hustle-timing-grid em\{[^}]*white-space:normal/);
});

test("post-clock-out and History expose the same optional shift rating editor", () => {
  assert.match(component, /function ShiftRatingEditor\(/);
  assert.match(component, /<ShiftRatingEditor[\s\S]*mode="post-clockout"/);
  assert.match(component, /<ShiftRatingEditor[\s\S]*mode="history"/);
  assert.match(component, /type="range"[\s\S]*aria-label="Overall shift rating"/);
  assert.match(component, /type="range"[\s\S]*aria-label="Manager rating"/);
  assert.match(component, /shiftOverallRatingLabel\(overallRating\)/);
  assert.match(component, /managerRatingLabel\(managerRating\)/);
  assert.match(component, /Blocked time[\s\S]*Management blocked[\s\S]*Deliveries/);
});

test("expanded scheduled-task secondary actions share a compact row", () => {
  assert.match(component, /className="task-secondary-actions"/);
  assert.match(styles, /\.task-secondary-actions\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.task-other-completion\{[^}]*min-height:44px/);
});

test("Single and Double hand off task timers without changing Stock Run", () => {
  const addDelivery = component.slice(
    component.indexOf("const addDelivery ="),
    component.indexOf("const startGoogleRoutesTestDelivery ="),
  );
  assert.match(addDelivery, /type !== "stock" && quickStack/);
  assert.match(addDelivery, /shift\.pendingResumeTaskId = task\.id/);
  assert.match(addDelivery, /shift\.pendingResumeOtherTaskId = otherTask\.id/);
  assert.match(addDelivery, /item\.type === "cleaning_task" \|\| item\.type === "prep_task"/);
  assert.match(component, /timedActivity\.kind === "prep"/);
  assert.match(component, /timedActivity\.kind === "other"/);
  assert.match(component, /Restart \{pendingResumeName\}\?/);
  assert.match(component, /onResumeOtherTask\(pendingResumeOtherTask\.id\)/);
});

test("active delivery summary cannot absorb the remaining viewport height", () => {
  const releaseRuleStart = styles.lastIndexOf(".active-main .active-shift-page.has-active-delivery{");
  const releaseRule = styles.slice(releaseRuleStart, styles.indexOf("}", releaseRuleStart) + 1);
  assert.ok(releaseRuleStart > 0);
  assert.doesNotMatch(releaseRule, /1fr/);
  assert.match(releaseRule, /align-content:start/);
});

test("Blocked Time interrupted by delivery exposes a persisted continuation prompt", () => {
  assert.match(component, /pendingResumeBlockedTime/);
  assert.match(component, /Continue Blocked Time\?/);
  assert.match(component, /CONTINUE BLOCKED TIME/);
  assert.match(component, /onDismissResumeBlocked/);
});

test("Cleaning assignment, progress and task controls remain available", () => {
  assert.match(component, /summary\?\.required \? "Needs attention" : "No cleaning due"/);
  assert.match(component, /onResponsibility\(role, null\)/);
  assert.match(component, /onResponsibility\(role, true\)/);
  assert.match(component, /onResponsibility\(role, false\)/);
  assert.match(component, /requestStart\(task\.id\)/);
  assert.match(component, /onCompleteTask\(task\.id, true\)/);
});

test("Tasks use a view-only operational filter and compact default rows", () => {
  assert.match(component, /taskFilter, setTaskFilter/);
  assert.match(component, /TO DO/);
  assert.match(component, /RUNNING/);
  assert.match(component, /DONE/);
  assert.match(component, /const visibleTasks = tasks\.filter/);
  assert.match(component, /tasks = visibleTasks/);
  assert.match(component, /TODAY’S TASKS/);
  assert.match(component, /TRACKED TASK TIME/);
  assert.match(styles, /\.task-filter\{/);
  assert.match(styles, /\.task-card-quick button\{display:none!important\}/);
  assert.match(styles, /\.task-card > summary \.task-card-quick > i \{ display: grid !important; font-size: 0 !important; \}/);
});

test("Cleaning and preparation retain their documented outcomes and evidence controls", () => {
  assert.match(component, /onMarkPrepNotRequired\(task\.id, true\)/);
  assert.match(component, /onCompleteTaskBySomeoneElse\(task\.id\)/);
  assert.match(component, /CleaningPhotoGallery/);
  assert.match(component, /onUpdateNote\(task\.id/);
  assert.match(component, /onMarkTaskUnable\(unableTaskId, unableReason, unableManager\)/);
});

test("Rush Ready uses the unified task card while Other Paid Work remains separate", () => {
  assert.match(component, /tasks-rush-ready-area/);
  assert.match(component, /showRushReady/);
  assert.match(component, /Rush Ready is repeatable store work/);
  assert.match(component, /Logged ·/);
  assert.match(component, /rush-ready-task-card/);
  assert.match(component, /FINISH TASK/);
  assert.match(component, /onRecordRushReadyOutcome\("someone_else"\)/);
  assert.match(component, /Completed by someone else/);
  assert.match(component, /aria-labelledby="tasks-timed-work-title"/);
  assert.match(component, /onStartOtherTask\("Getting rush ready"\)/);
  assert.match(component, /placeholder="e\.g\. Stock delivery"/);
  assert.match(component, /onStartOtherTask\(otherTaskName\)/);
});

test("running Other Paid Work can edit its name and safe start time", () => {
  assert.match(component, /openOtherTaskEditor/);
  assert.match(component, /EDIT OTHER PAID WORK/);
  assert.match(component, /LAST BACK AT STORE/);
  assert.match(component, /activity\.taskName = name/);
  assert.match(component, /activity\.start = requestedStart/);
  assert.match(component, /overlaps a delivery, break or another timed task/);
});

test("Today's complete existing detail set is collapsed with native semantics", () => {
  assert.match(component, /<details\s+className="panel tasks-today-breakdown(?: [^"]*)?">/);
  assert.match(component, /<strong>TODAY’S BREAKDOWN<\/strong>/);
  for (const label of [
    "TOTAL SHIFT TIME",
    "TOTAL DELIVERY TIME",
    "TOTAL STORE WORK",
    "TIME LEFT TO ALLOCATE",
    "TODAY’S DELIVERIES",
    "OTHER WORK TODAY",
  ]) assert.ok(component.includes(label), `${label} should remain available`);
  assert.match(styles, /\.tasks-today-breakdown > summary:focus-visible/);
  assert.match(styles, /\.tasks-today-breakdown\[open\] > summary i/);
});

test("Tasks mobile layout stays compact without sacrificing bottom reachability", () => {
  assert.match(styles, /\.tasks-current-grid \{[^}]*grid-template-columns: repeat\(4/);
  assert.match(styles, /@media \(max-width: 600px\) \{[\s\S]*?\.tasks-current-grid \{ grid-template-columns: repeat\(2/);
  assert.match(styles, /\.app-shell \{[^}]*padding-bottom: calc\(84px \+ env\(safe-area-inset-bottom\)\)/);
});

test("clock-in first-task prompt starts a rota task or Rush Ready and can be skipped", () => {
  assert.match(component, /firstTaskPromptHandled === false/);
  assert.match(component, /What are you starting first\?/);
  assert.match(component, /onFirstTaskChoice\(task\.id\)/);
  assert.match(component, /onFirstTaskChoice\("rush_ready"\)/);
  assert.match(component, /onFirstTaskChoice\(null\)/);
});

test("unable cleaning outcomes require a professional reason and manager", () => {
  assert.match(component, /TASK_UNABLE_REASONS/);
  assert.match(component, /Manager on shift/);
  assert.match(component, /Enter the manager on shift/);
  assert.match(component, /onMarkTaskUnable\(unableTaskId, unableReason, unableManager\)/);
  assert.match(component, /This documents the task; it does not mark it as completed/);
});

test("GPS delivery miles prefill clock-out without overwriting saved mileage", () => {
  assert.match(component, /gpsRouteMilesTenths\(shift\)/);
  assert.match(component, /shift\.mileage\.directTenths == null/);
  assert.match(component, /onMileage\("directTenths", \(gpsMilesTenths \/ 10\)\.toFixed\(1\)\)/);
  assert.match(component, /Prefilled from recorded GPS delivery miles · editable/);
});

test("beta data labels use a consistent visible stamp", () => {
  assert.equal((component.match(/className="beta-stamp">BETA<\/b>/g) ?? []).length, 5);
  assert.match(styles, /\.beta-setting-title \.beta-stamp/);
});

test("clock-out offers both a normal finish and a saved-time review", () => {
  assert.match(component, /SAVE TIME &amp; REVIEW SHIFT/);
  assert.match(component, /YES, CLOCK OUT/);
  assert.match(component, /setPostClockOutReviewShiftId\(active\.id\)/);
  assert.match(component, /Your clock-out time is fixed at/);
  assert.match(component, /FINISH REVIEW/);
});

test("post-clock-out task review supports evidence, notes and documented outcomes", () => {
  assert.match(component, /reviewMode\s*\|\|\s*status === "active"/);
  assert.match(component, /onUpdateNote\(task\.id/);
  assert.match(component, /requestPhoto\(task\.id\)/);
  assert.match(component, /UNABLE TO COMPLETE/);
});

test("completed shift review can record, edit and clear unable outcomes", () => {
  assert.match(component, /historicalUnableTaskId/);
  assert.match(component, /Record unable to complete/);
  assert.match(component, /EDIT UNABLE OUTCOME/);
  assert.match(component, /RETURN TO INCOMPLETE/);
  assert.match(component, /target\.unableAt\s*=\s*value\.clockOut\s*\?\?\s*value\.clockIn/);
  assert.match(component, /without marking the task as completed\s+or changing your saved clock-out time/);
});

test("completed shifts can reopen task review with photos and visible review state", () => {
  assert.match(component, /onReviewTasks/);
  assert.match(component, /REVIEW TASKS/);
  assert.match(component, /shiftTaskReviewNeeded\(draft\)/);
  assert.match(component, /Add outcomes, notes or photos/);
});

test("task accordions use clean rotating chevrons without a circular background", () => {
  assert.match(component, /className="task-disclosure-chevron"/);
  assert.match(styles, /\.task-disclosure-chevron::before/);
  assert.match(styles, /\.historical-task-list details\[open\] > summary \.task-disclosure-chevron \{[^}]*transform: rotate\(180deg\)/);
  assert.doesNotMatch(styles, /\.task-card summary i \{[^}]*background:/);
});

test("history supports validated manual missed shifts", () => {
  assert.match(component, /ADD MISSED SHIFT/);
  assert.match(component, /className="manual-shift-icon"/);
  assert.match(component, /manualEntry\s*=\s*\{\s*reason:\s*"missed_tracking"/);
  assert.match(component, /validateAppDataStructure\(candidate\)/);
  assert.match(component, /ADD &amp; REVIEW SHIFT/);
});

test("history actions use a compact Fold-safe responsive row", () => {
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.history-page \.history-heading \{[^}]*flex-direction: column/);
  assert.match(styles, /\.history-page \.history-heading-actions \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.manual-shift-button \{[^}]*white-space: nowrap/);
});

test("a recent completed shift can restart with its clock-out gap preserved as a break", () => {
  assert.match(component, /Only your latest completed shift can be restarted/);
  assert.match(component, /outside the safe 12-hour restart window/);
  assert.match(component, /restartCompletedShift\(\s*shift,\s*restartedAt,?\s*\)/);
  assert.match(component, /clock-out gap saved as an extra break/);
  assert.match(component, /YES, RESTART SHIFT/);
  assert.match(component, /deliveries, rota link, tasks, rates and existing evidence\s+stay attached/i);
  assert.match(styles, /\.restart-shift-card/);
});

test("partial and absent GPS evidence retain report actions", () => {
  assert.match(component, /className="route-view-button"[\s\S]{0,320}>\s*VIEW EVIDENCE\s*<\/button>/);
  assert.match(component, /className="route-pdf-button"[\s\S]{0,320}>\s*SAVE PDF\s*<\/button>/);
  assert.match(component, /No recorded GPS route is available for this delivery/);
  assert.match(component, /SAVE PDF REPORT/);
});

test("backup reminders are quiet and recovery readiness is non-destructive", () => {
  assert.match(component, /backupDays >= 30 \|\| completedSinceBackup >= 10/);
  assert.match(component, /completedSinceBackup >= 3/);
  assert.match(component, /TEST RECOVERY READINESS/);
  assert.match(component, /Read-only validation/);
});

test("delivery preparation supports not-required outcomes", () => {
  assert.match(component, />\s*NOT REQUIRED\s*<\/button>/);
  assert.match(component, /MARK AS REQUIRED/);
  assert.match(component, /Not required · not needed for this shift/);
  assert.match(styles, /\.task-card\.not-required/);
});
