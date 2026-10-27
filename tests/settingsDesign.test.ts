import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("Settings categories and location subsettings use the shared professional row structure", () => {
  assert.match(source, /className="settings-category-icon" aria-hidden="true"/);
  assert.match(source, /className="settings-category-card"/);
  assert.match(source, /className="settings-submenu-row"/);
  assert.match(styles, /\.settings-page\.settings-style-android\.settings-main \.settings-category-menu,[\s\S]*\.settings-page\.settings-style-android\.settings-location \.settings-submenu/);
  assert.match(styles, /grid-template-columns:38px minmax\(0,1fr\) 18px/);
});

test("Settings subpages keep accessible controls inside consistent grouped panels", () => {
  assert.match(styles, /\.settings-page\.settings-style-android:not\(\.settings-main\)>details,[\s\S]*border:1px solid var\(--line\)!important/);
  assert.match(styles, /\.settings-page\.settings-style-android:not\(\.settings-main\) \.setting-row\{min-height:68px/);
  assert.match(styles, /\.settings-page\.settings-style-android:not\(\.settings-main\) input,[\s\S]*min-height:48px/);
  assert.match(styles, /\.settings-page\.settings-style-android \.geofence-toggle\.active\{background:var\(--blue\)!important\}/);
});

test("Pay settings expose the fixed Corsa baseline used by live fuel estimates", () => {
  assert.match(source, /Corsa fuel baseline/);
  assert.match(source, /Petrol price per litre/);
  assert.match(source, /corsaFuelEstimate\(fuelEstimateMiles, settings\)/);
});

test("Fuel page compares GPS-backed reimbursement with Corsa fuel cost and excludes missing GPS history", () => {
  assert.match(source, /FUEL REALITY · GPS ONLY/);
  assert.match(source, /gpsFuelEstimate\.fuelPence/);
  assert.match(source, /no recorded driving GPS/);
});

test("Each saved delivery run shows its reimbursement against GPS-based Corsa fuel cost", () => {
  assert.match(source, /const reimbursementPence =\s*draft\.deliveries\.find/);
  assert.match(source, /const deliveryFuel = hasFuelGps\s*\? corsaFuelEstimate/);
  assert.match(source, /PAID BACK/);
  assert.match(source, /EST\. FUEL/);
  assert.match(source, /No GPS/);
  assert.match(styles, /\.delivery-fuel-comparison \{ display: grid;/);
  assert.match(styles, /\.live-fuel-stat em \{ color: #d8d0c9; font-size: 11px;/);
});

test("Shift details and the live shift both show earnings versus estimated fuel cost", () => {
  assert.match(source, /function ShiftEarningsReality/);
  assert.match(source, /function ShiftRealityModal/);
  assert.match(source, /EARNED FOR SHIFT/);
  assert.match(source, /LEFT AFTER FUEL/);
  assert.match(source, /className="shift-reality-button live"/);
  assert.match(source, /historicalGpsMiles/);
  assert.match(styles, /\.shift-reality-button \{ width:100%;/);
});

test("Native web update responses are confirmed against the cache-bypassed published version", () => {
  assert.match(source, /The Android shell's manifest can be one cache generation behind/);
  assert.match(source, /webRelease\.type === "available"\) \{\s*setWebUpdate\(\{ stage: "checking"/);
});

test("Professional Settings styling remains theme-aware", () => {
  assert.match(styles, /background:var\(--surface\)!important/);
  assert.match(styles, /color:var\(--ink\)/);
  assert.match(styles, /color:var\(--muted\)/);
  assert.doesNotMatch(styles.slice(styles.indexOf("Web App 2.1.49")), /background:#fff/);
});

test("Data and backup is the final Settings category and the main app panel stays quiet", () => {
  const categoriesStart = source.indexOf("const settingCategories");
  const categoriesEnd = source.indexOf("const locationSubsections", categoriesStart);
  const categories = source.slice(categoriesStart, categoriesEnd);
  assert.ok(categories.lastIndexOf('key: "data"') > categories.lastIndexOf('key: "display"'));

  const appStatusStart = source.indexOf('<section className="panel app-status-tools">');
  const dataToolsStart = source.indexOf('<section className="panel data-tools">', appStatusStart);
  const appStatus = source.slice(appStatusStart, dataToolsStart);
  const nativeUpdateCardsStart = source.indexOf("function NativeUpdateStatusCards");
  const nativeUpdateCards = source.slice(nativeUpdateCardsStart, source.indexOf("function EmptyState", nativeUpdateCardsStart));
  const dataTools = source.slice(dataToolsStart, source.indexOf('<section className="panel about-card', dataToolsStart));
  assert.match(appStatus, /WEB APP UPDATES/);
  assert.match(appStatus, /webUpdateAvailable \? "UPDATE AVAILABLE" : "UP TO DATE"/);
  assert.match(appStatus, /NativeUpdateStatusCards/);
  assert.match(nativeUpdateCards, /ANDROID APP UPDATES/);
  assert.match(nativeUpdateCards, /WEAR OS UPDATES/);
  assert.match(appStatus, /android-update-check/);
  assert.doesNotMatch(appStatus, /beta-data-toggle|onExportBackup|onImportTodayState|onExportCsv/);
  assert.match(dataTools, /beta-data-toggle/);
  assert.match(dataTools, /onExportTodayState/);
  assert.match(dataTools, /onImportTodayState/);
  assert.match(dataTools, /onExportBackup/);
  assert.match(dataTools, /onImport/);
  assert.match(dataTools, /onExportCsv/);
  assert.match(styles, /\.settings-page\.settings-main \.data-tools\{display:none!important\}/);
  assert.match(styles, /\.settings-page\.settings-data \.data-tools\{display:grid!important\}/);
  assert.match(styles, /\.settings-page:not\(\.settings-data\) \.hosted-backup-panel/);
  assert.match(styles, /\.settings-page:not\(\.settings-data\) \.shared-reports-manager/);
  assert.match(styles, /\.settings-page:not\(\.settings-main\) > \.local-note \{ display: none; \}/);
});

test("Settings manages custom quick-task buttons without replacing the built-in groups", () => {
  assert.match(source, /key: "quick-tasks"/);
  assert.match(source, /data-settings-panel="quick-tasks"/);
  assert.match(source, /addCustomQuickTask/);
  assert.match(source, /removeCustomQuickTask/);
  assert.match(source, /draft\.settings\.customQuickTasks/);
  assert.match(styles, /\.settings-page\.settings-quick-tasks > \[data-settings-panel="quick-tasks"\]\{display:block\}/);
  assert.match(styles, /\.custom-quick-task-list/);
});

test("Quick Jobs settings control visibility, category and ordering", () => {
  assert.match(source, /update\("quickTasksEnabled"/);
  assert.match(source, /hiddenQuickTaskIds/);
  assert.match(source, /customQuickTaskCategories/);
  assert.match(source, /moveQuickTask/);
  assert.match(source, /moveQuickTaskCategory/);
  assert.match(source, /RESET QUICK JOBS/);
  assert.match(styles, /\.quick-job-settings-list/);
});

test("Startup prompts belong to rota settings and version details stay on main Settings", () => {
  const rotaShortcut = source.indexOf('className="panel settings-open-rota"');
  const startupPanel = source.indexOf('className="panel startup-prompt-schedule-panel"');
  const remindersPanel = source.indexOf('data-settings-panel="rota-notifications"');
  assert.ok(rotaShortcut < startupPanel && startupPanel < remindersPanel);
  assert.match(source, /settingsSection === "schedule" && \(\s*<section className="panel startup-prompt-schedule-panel">/);
  assert.match(source, /className={`startup-prompt-details startup-prompt-settings-panel/);
  assert.match(styles, /\.settings-page:not\(\.settings-main\) \.about-card,[\s\S]*display:none!important/);
  assert.match(styles, /\.settings-page\.settings-display \.startup-prompt-details:not\(\.startup-prompt-settings-panel\)/);
  assert.match(styles, /\.startup-prompt-schedule-panel \.startup-prompt-details>summary[\s\S]*pointer-events:auto!important/);
  assert.match(styles, /\.settings-page\.settings-style-android\.settings-schedule>details>summary\{display:flex!important\}/);
});

test("geofence settings offer distinct selectable entry and exit chime previews", () => {
  assert.match(source, /Classic chime/);
  assert.match(source, /<option value="bell">Bell<\/option>/);
  assert.match(source, /<option value="double">Double chime<\/option>/);
  assert.match(source, /<option value="soft">Soft tone<\/option>/);
  assert.match(source, /<option value="digital">Digital ping<\/option>/);
  assert.match(source, /<option value="attention">Attention · loud triple<\/option>/);
  assert.match(source, /<option value="alarm">Alarm · loud pulse<\/option>/);
  assert.match(source, /<option value="siren">Siren · high visibility<\/option>/);
  assert.match(source, /PREVIEW EXIT/);
  assert.match(source, /PREVIEW ENTRY/);
});

test("Rota comparison uses distinct responsive rows instead of concatenated inline text", () => {
  assert.match(source, /className="panel schedule-comparison"/);
  assert.match(styles, /\.schedule-comparison>div\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.schedule-comparison>div>span:last-child\{grid-column:1\/-1\}/);
  assert.match(styles, /@media \(max-width:420px\)\{\.schedule-comparison>div\{grid-template-columns:1fr\}/);
});

test("Cleaning rota uses the current compact task toolbar and hides APK status on subpages", () => {
  assert.match(source, /className="rota-toolbar"/);
  assert.match(source, /\{DAY_NAMES\[weekday\]\} tasks/);
  assert.match(styles, /\.settings-page:not\(\.settings-main\) \.android-update-status\{display:none!important\}/);
  assert.match(styles, /\.settings-page\.settings-style-android\.settings-schedule \.rota-toolbar/);
});

test("Trends explains that Hustle averages are complete exit-to-re-entry trips", () => {
  assert.match(source, /Real trip outside zone/);
  assert.match(source, /Domino’s trip outside zone/);
  assert.match(source, /35 m exit → re-entry · outbound \+ customer \+ return/);
  assert.match(source, /Saved radius per run · exit → re-entry · outbound \+ customer \+ return/);
  assert.match(source, /Adjust only the amber comparison boundary/);
  assert.match(source, /dominosReferenceRadiusMetres/);
  assert.match(source, /metrics\.map\(\(\[label, value, detail\]\)/);
});
