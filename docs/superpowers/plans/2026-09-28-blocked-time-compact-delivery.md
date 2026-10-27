# Blocked Time and Compact Delivery Implementation Plan

1. Add failing domain, backup, report, persistence, and transition tests for Blocked Time.
2. Add the persisted Blocked Time activity model, canonical transition helpers, strict validation, totals, and professional label mapping.
3. Wire start/end and conflict resolution through the existing app commit handlers and Tasks UI.
4. Add Blocked Time totals and reason breakdowns to shift details and the professional day report.
5. Add failing rendered-layout coverage, then remove the duplicate return action and apply compact responsive active-delivery CSS.
6. Run focused tests, Europe/London tests, full tests, production build, artifact validation, and Android compatibility checks.
7. Bump the web/SW version, self-review the diff, commit and push exact source, publish the existing Sites project, and verify production.

