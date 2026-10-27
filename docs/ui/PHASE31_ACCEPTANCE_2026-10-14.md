# Phase 3.1 acceptance — 14 October 2026

Source baseline Web2.1.236, commit46167ce92844bf4361e2975e7699ae0f286b760e / Sites485. Existing production project retained. Release Web2.1.237/cache161.

Implemented compact Shift header with CURRENT SHIFT elapsed time beside title, existing activity timer and Real Hustle below, unchanged canonical red Single/blue Double controls, compact wage/reimbursement/miles/fuel totals and one-line GPS/save status. Existing Shift Reality, backup/return details, delivery options, Early Dispatch/timing comparisons use native details disclosures in redesigned view. Visible Shift Actions above navigation provides Break/Clock Out access. No delivery, GPS, pay or task mutation logic changed. Header clock is an isolated LiveClockText leaf.

Tasks category/workspace grids use adaptive minimum widths and wrapped labels. Persistent Legacy View remains OFF by default, uses original components and byte-identical pre-Phase3 global styles, and disclosure helper returns original children without wrappers in Legacy. Same canonical state and mounted tracker engine.

## Executed verification

- Europe/London full suite: **602 passed,0 failed,0 skipped** (579 TypeScript/logic +23 rendered HTML/presentation). Three new focused disclosure/header tests included. Final presentation rerun23 passed.
- Strict TypeScript passed; ESLint0 errors,36 existing warnings; production build and deployment artifact validation passed.
- **13 real rendered-browser vertical-fit assertions passed,0 failed**. Cloud Chrome ran the actual production React root and built CSS inside controlled same-origin iframe viewports. Synthetic canonical records only. Top24px reserved in header and bottom24px reserved below navigation; physical system bars are not emulated. Normal text16px,125% text20px.
- Tested360×800 at-store100% and125%, active task125%, break125%, Single125%, Double125%, returning125%;384×824,768×960 and960×768 at-store and returning125%.
- All13: body scroll height equals viewport height, no horizontal overflow, page bottom above navigation. At360×800/125%, longest tested page bottom647.7px versus navigation top704px. Header88px including24px reserve; navigation72px plus24px lower reserve. Visible closed Shift Actions drawer occupies660–704px. Final drawer accessibility/tap checks passed after exposing its label above navigation.
- Real interaction checks: Tasks navigation tap with expanded drawer; Clock Out control revealed; Enter activates Quick Jobs; Tab moves to next visible control; folded/unfolded category labels do not overflow; Legacy switch retains Display subsection; fresh app load without reseeding restores Legacy and active delivery; original Legacy children have no new wrappers; Space switches Legacy OFF and delivery clock continues (00:05:19 →00:05:21), shift clock01:00:21.
- No physical Fold/driving/GPS acceptance is claimed. Fixture GPS permission prompts were declined. Existing Phase1/2 and return/recovery regression suite remains passing. Native source/release unchanged2.2.73/code78; no new native signing/CI run needed.

## Measured bundle

Same Linux/Node24.19.0 production measurement script and gzip method as Phase3.

| Artifact | Before bytes | After bytes | Change |
|---|---:|---:|---:|
|Main JS|919,292|920,559|+0.14%|
|Initial JS|1,190,704|1,191,971|+0.11%|
|Initial CSS|553,021|561,428|+1.52%|
|Lazy JS|231,228|231,228|+0.00%|

Maps/reports remain lazy-loaded; service-worker asset generation retained. No root one-second state update introduced. Raw bundle, browser-fit and interaction evidence are under docs/performance/phase31-*.json. Screenshot docs/ui/phase31-folded.jpg is an actual browser capture,360×800/125%, synthetic records.

## Repeat browser scenarios

Run production build, then node scripts/prepare-phase31-browser.mjs in an isolated QA checkout/browser profile. The generated phase31-qa.html/phase31-frame.html are ignored disposable files; do not use this fixture on a profile containing real records. Start the managed Sites preview and open /phase31-qa.html. Outer controls size the actual iframe viewport and select synthetic canonical states. Read body/element bounding rectangles, compare page/primary controls to bottom navigation, verify scrollHeight/scrollWidth. Use Tasks and Display navigation for interaction checks. Resume saved fixture reloads the app without reseeding, allowing persistent Legacy verification. Temporary fixture entrypoints are removed before publication and are not in the deployment archive.

## Remaining acceptance

Physical Fold/Android WebView/driving acceptance **NOT TESTED**. Browser125% root-font scaling does not establish every Samsung font/zoom setting, screen inset or keyboard configuration. Tested minimum height800px; smaller content viewports,200% text, unusually long task labels and expanded optional content may require scrolling. Essential controls remain readable rather than being forcibly clipped. Legacy intentionally retains its original presentation; compact no-scroll fit applies to redesigned view. Expanded details and Tasks may scroll normally. GPS continuity is covered by unchanged engine/reference tests, not a new physical GPS test.

Exact published commit/deployment are recorded in the final release response.
