# Native compact grid correction — Web 2.1.238

Baseline: d4c2cfdd78a4c98b35b45743805b16a021a01f24, Web 2.1.237 / Sites 486. Owner physical screenshot showed large gaps and a missing save/GPS strip.

Reproduced in a real browser by adding the native-shell CSS class to the synthetic full React fixture. Android-specific :not/:has grid selectors overrode modern content-sized tracks with 206px/132px fixed tracks. At 360×800 / 125% text, body height was 856px; totals ended at 516.1px while status began at 466.1px: 50px overlap.

Correction: explicitly scope content-sized grid tracks to redesigned native active pages and delivery panels. Legacy original CSS remains untouched. No tracker logic changed. The nativecss harness option tests CSS only, not native bridge/GPS or physical WebView behavior.

Final browser matrix: 12 passed, zero failed. Native idle/task/delivery at 360×800, 768×960 and 960×768; native task at 384×824; two regular PWA regressions at 384×824. The native cases use 125% text and existing synthetic 24px inset reservations. Each assertion checks no totals/status overlap, the page above navigation, and no viewport overflow. Fixed native task at 360×800: body 800px, totals bottom 440.1px, status start 442.1px, page bottom 641.6px, navigation top 704px.

Strict TypeScript, full Europe/London suite (602 passed: 23 presentation + 579 logic), ESLint (zero errors, 36 existing warnings), production build and artifact validation passed. Focused review found no blocking issue. Native APK remains 2.2.73/code78.

The owner's screenshot physically establishes the old defect. The corrected release's physical acceptance is NOT TESTED. Browser CSS-class testing is not a native service/bridge test. Browser screenshot/evidence files could not be synchronized to the main workspace, so no unavailable screenshot is linked.
