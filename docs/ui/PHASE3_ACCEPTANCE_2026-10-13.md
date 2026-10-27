# Phase 3 implementation and acceptance — 13 October 2026

Authoritative baseline: web 3fd17544cdad5ec18c5ff3bcc60562c59fdf2dd0, Web 2.1.235 / Sites 484; Android 6211d15066a4aaea89eff30956966d9c72fd99fb, 2.2.72/code77. No rollback or data reset.

## Implemented

| Area | Result |
|---|---|
| U1 dashboard | Read-only next-action guidance, distinct estimated hourly wages/reimbursement, existing canonical action controls preserved. |
| U2 timers | Large evidence-based Real Hustle and delivery timing typography; missing evidence explicitly unavailable. Original timer calculations and isolated clocks retained. |
| U3 Fold | Scoped single/two-column responsive rules, safe areas, text/keyboard scrolling, standalone wide-screen orientation; Android expanded-window rotation without recreating WebView. |
| U4 tasks | Active and paused work overview, compact Quick Tasks, cleaning/preparation, Rush Ready/named work, blocked bulk-outcome navigation. Existing time/outcome/review controls retained. |
| U5 settings | Everyday, Tracking & GPS, Pay & Fuel, Backup & Recovery, Advanced; search; Advanced closed by default; per-session panel expansion choices. Original nested navigation preserved. |
| U6 status/GPS | Phone save, native GPS and cloud checkpoint shown separately. Operational return versus unavailable exact crossing distinguished; no fabricated timestamps. |
| U7 recovery | Coverage and excluded actual photo bytes explained; existing generations, validated restore previews, encryption and consent preserved. |
| U8 review | Existing finish warnings presented as checklist with optional ratings; no new clock-out rules or automatic record edits. |
| U9 Wear | Existing next valid action emphasized, sync age/stale/rejected feedback, circular control geometry; unchanged bridge protocol and GPS backend. |
| Legacy View | Settings → Display → Legacy View, default OFF; persisted canonical boolean. Original JSX controls and byte-identical 2.1.235 global stylesheet retained. Same mounted engine, navigation and timers. View-only saves preserve active session/geofence references. Original presentation already shipped, so no duplicated legacy bundle introduced. |

## Executed verification

- Europe/London complete suite: **599 passed, 0 failed, 0 skipped**: 579 TypeScript/logic tests and 20 HTML/component/presentation tests. 31 additional tests versus Phase 2.
- Final presentation rerun after production build: 20 passed, 0 failed.
- Strict TypeScript: passed. ESLint: 0 errors, 36 existing warnings.
- Production build and artifact validation: passed. Service worker Web 2.1.236/cache160; original lazy map/report modules and offline asset generation retained.
- Synthetic rendered states: no shift; working at store; Single; Double before/after each Delivered; returning; operational return/GPS gap; Quick Tasks; paused work; Management Blocked; pending/failed/saved local writes; cloud unavailable/failed; Settings search/navigation/Legacy switch; shift review. Callback tests cover presentation navigation; responsive tests are CSS contracts, not browser visual acceptance.
- Canonical Legacy preference save/reload uses fake IndexedDB. Switch tests preserve active delivery/geofence identities and records. Existing resume/clock/GPS/recovery tests retained; real WebView switch/background interaction is not physically verified.
- Independent final diff review: no blocking issue identified. Original pay, GPS, return, task and journal mutation paths retained.
- Native signed CI run38479416738 and debug38479416748 passed. Independently recounted downloaded JUnit XML: **104 passed, 0 failed/errors/skipped** (62 phone +42 Wear). Twelve new presentation/orientation tests included.
- Android/Wear **2.2.73/code78**, commit **1ae628d5e56a959b9f7bc4709c5640db6645c499**, published 2026-10-13T22:44:13Z. Package unchanged. Certificate SHA-256 fdfd0db43b2d1ef9a7516aad5c78f62a16c1f6ae048eccb8c7024f3ceda5d4e1. GPS service/session/journal source diff empty.

## Measured bundle comparison

Environment: Linux, Node24.19.0, production Vinext/Vite build, same bundle measurement script and local gzip method. Baseline raw measurements are docs/performance/phase2-bundle.json; new measurements phase3-bundle.json.

| Artifact | Before bytes | After bytes | Change |
|---|---:|---:|---:|
| Main JS | 903,631 | 919,292 | +1.73% |
| Initial JS closure | 1,175,043 | 1,190,704 | +1.33% |
| Initial CSS | 542,472 | 553,021 | +1.94% |
| Lazy JS | 231,228 | 231,228 | +0.00% |

This is a bounded presentation increase, not a measured responsiveness improvement. No historical freeze is claimed fixed by this redesign.

## Outstanding acceptance

**Physical delivery/Fold/Wear acceptance: NOT TESTED.** Browser-control tooling is unavailable in this environment; no screenshots or browser layout/keyboard automation are claimed. CSS contracts and actual SSR/component callbacks do not establish overflow, touch usability or focus behavior on a physical Fold. Narrow/unfolded portrait and landscape, text scaling, modal keyboards, and Legacy switch while backgrounding need browser/device acceptance. Native instrumentation was not run because no connected device/emulator was available.

Native orientation changes at shorter current-window dimension ≥600dp. Wear 1–3 control geometry is tested at192/216/240dp; smaller displays or >3 controls remain unverified.

Representative files under docs/ui/phase3 are **actual synthetic SSR HTML with production source styles**, not browser screenshots or an interactive installed app. They contain no production records.

Web publication is recorded in the final conversation report, with exact pushed commit and server-returned Sites version/deployment.
