# Phase 3.2 release acceptance — Web 2.1.243

Continues verified Web 2.1.242 / Sites 491 / 484ce4f13d94f02da0a760aedb237cff1cf2ae0a. Native remains 2.2.73, code 78; no native changes or APK.

## Implementation

The default Shift screen now uses a separate stateless presentation adapter: compact activity/Real Hustle panel with the original financial summary, delivery actions immediately below, then Hustle timing, compact save/GPS status and shift actions. Shift Reality, run counts, routes/evidence and secondary information remain in expandable Shift details. All modal nodes remain outside collapsed content. Current shift elapsed appears only in the header when idle; timers retain existing leaf clocks. Maps and reports remain lazy.

Existing canonical handlers, pay, GPS, tasks, persistence and delivery transitions are unchanged. Live Real Hustle explicitly says “Live · entry pending”; operational confirmation without an observed crossing says “GPS gap · no exact entry”. No crossing evidence is invented.

Legacy short-circuits the adapter and renders the original child tree. Original global CSS is unchanged. Settings → Display → Legacy View remains persistent and defaults OFF. Browser switching during an active delivery and saved reload were exercised; the active delivery remained present. The original layout is materially distinct.

## Automated verification

- Europe/London full suite: **643 passed, 0 failed** (34 rendered/source MJS + 609 TypeScript tests).
- New focused coverage: 7 production-rendered presentation cases plus 5 Real Hustle display cases; all pass.
- Strict TypeScript: pass. ESLint: 0 errors, 36 existing warnings.
- Production build and artifact validation: pass, including final CSS. Git whitespace check: pass.
- Existing return, recovery, persistence, timer isolation and Legacy tests remain green.
- Browser: actual production React root, compiled artifact CSS and synthetic canonical IndexedDB records; no production records modified. Tested off-shift, idle, task/cleaning, break, Single, Double before/after first customer, both delivered, returning, operational gap and exact confirmation, pending/failed save, Early Dispatch, walking, keyboard controls, Legacy, light/dark, 125% and 150% text, unfolded portrait/landscape.
- Pending status rendered “Saving locally…”; failures remained prominent. Keyboard Shift Actions followed immediately by Clock Out opened the existing confirmation/checklist. Pro drawer animation was removed to avoid moving targets.

## Rendered viewport measurements (CSS pixels)

Chrome cloud browser, folded iframe **360 × 800**, synthetic top inset 24 and bottom reserve 24; bottom navigation occupies y=704–776. These simulate available bounds, not physical Android system bars.

| State | Activity height | Delivery controls bottom | Hustle bottom | Status bottom | Navigation top |
|---|---:|---:|---:|---:|---:|
| At store, normal text | 152.6 | 382.6 | 509.2 | 558.2 | 704 |
| Task, 125%, final light/dark | 168.2 | 397.6 | 545.8 | 594.8 | 704 |
| Single, normal | 154.4 | 384.6 | 517.1 | 566.1 | 704 |
| Double, 125% | 181.4 | 415.6 | 570.5 | 619.5 | 704 |
| Returning, 125% | 189.6 | 480.9 | 635.7 | 684.7 | 704 |
| Confirmed GPS gap, 125% | 189.6 | 480.9 | 619.5 | 685.4 | 704 |

Essential controls fit above navigation in these folded scenarios. At store/task/Single/Double require no page scroll. Returning at 125% allows approximately 20px of secondary content scrolling; primary controls and status remain above navigation. At 150%, readable secondary content may scroll; no horizontal overflow was observed. Unfolded 768×960 and 960×768 use two columns with controls, timing and status above navigation. Larger accessibility text is allowed to grow rather than clip.

Before screenshot used the actual previous commit's component source. Its task summary was 234.3px high; the final equivalent Pro panel is 168.2px (28.2% shorter). Final 125% task page ends y=701.8, above navigation y=704.

## Bundle measurements

Executed `scripts/benchmark-bundle.mjs` against production outputs. Baseline: `docs/performance/return-state-bundle.json`; new: `phase32-pro-bundle.json`.

| Asset | Before bytes | After bytes | Change |
|---|---:|---:|---:|
| Main JS | 921274 | 925280 | +4006 (+0.43%) |
| Initial JS | 1192686 | 1196692 | +4006 (+0.34%) |
| Main JS gzip | 236754 | 238004 | +1250 |
| Initial JS gzip | 320588 | 321838 | +1250 |
| CSS | 576746 | 584861 | +8115 |
| CSS gzip | 81441 | 82568 | +1127 |

No heavy dependency added; lazy map/report footprint unchanged at 231228 bytes. Service-worker/version metadata consistently updated to 2.1.243, cache sequence 167.

## Visual evidence

- [Before](phase32/before.jpg)
- [Pro light](phase32/pro-light.jpg)
- [Pro dark](phase32/pro-dark.jpg)
- [Actual Legacy](phase32/legacy.jpg)

## Limits and preserved behaviour

Physical Fold, driving, screen lock and suspended WebView acceptance: **NOT TESTED**. Browser simulations do not prove physical GPS/background performance. Existing automatic return recovery after its grace period predates this milestone and remains unchanged; therefore this release does not claim a strictly manual-only completion rule. The UI redesign adds no automatic completion. Changing that existing rule would require a separate delivery-logic correction.

Publication identifiers are recorded by the release result; this document records pre-publication verification.

## Follow-up 2.1.244 — physical screenshot polish

Reduced idle At store typography, compacted Early Dispatch into a 44px header action, renamed the Pro comparison to IN-STORE RETURN (existing GPS entry → Back button explanation retained), and added a rotating disclosure chevron. Legacy label/layout and all canonical handlers remain unchanged.

Validation: full Europe/London suite 643 passed / 0 failed, strict TypeScript/build/artifact pass; final focused rendered tests 7/7; lint 0 errors / 36 existing warnings. Chrome folded 360×800: normal status bottom553.4, shift actions602.4, page660.4; 125% text light/dark status590.4, actions639.4, page697.4, navigation top704. No scrolling or horizontal overflow. Early Dispatch measured119.9×44px at normal scale. Keyboard disclosure verified; unfolded768×960 and actual Legacy rendered checks pass. Physical follow-up remains pending.

[Follow-up screenshot](phase32/polish-244.jpg).
