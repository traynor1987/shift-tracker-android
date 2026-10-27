# Status layout correction — Web 2.1.230

The physical screenshots from 30 September show the new status strip occupying a large card, pushing delivery controls down and shifting the task summary into the wrong row. Android settings show all-time and precise location enabled.

## Cause and correction

Web 2.1.229 added the status component as a direct child of the active page's fixed-row grid. The status inherited the row intended for delivery controls; subsequent cards moved into the wrong rows. The strip now sits inside the existing shift hero with intrinsic height, a 44px minimum touch target and no new page-grid item. Idle hero height grows with its content, while the existing delivery, summary and drawer rows retain their positions. Active-delivery sizing and action semantics are preserved. The status detail dialog uses a body portal so hero clipping and text styles cannot affect it.

The app's location-explanation acknowledgement previously used the same `permission` state as actual provider permission failures. That made the new label falsely imply an Android permission problem. The explanation now has its own `setup` state. The status dialog lets the user reopen the existing GPS setup confirmation. Actual permission-failure events still retain their existing handling. When native diagnostics explicitly report foreground access as precise or approximate, health describes a connection retry rather than asking for an already-granted phone permission.

Diagnostics now include only the allowlisted foreground-location enum (`precise`, `approximate`, `missing`) alongside existing numeric/boolean health. No locations, records or secrets are added.

## Verification scope

Regression tests reproduce both pre-fix failures: incorrect setup label and a status component directly occupying the page grid. The corrected tests cover setup versus native-granted/missing permission and assert the component's actual JSX parent using the TypeScript parser. The production build and rendered-artifact check passed; the full application suite passed 490 tests with zero failures. Lint reported zero errors and 33 existing warnings. Strict TypeScript still reports 138 baseline errors, with none in the new status modules or layout test.

Browser interaction and physical Fold testing remain unavailable in this environment. Automated checks establish the corrected grid structure and state handling; they do not prove all handset GPS/freezing problems resolved. Native source, geofence decisions, task states, saved delivery records and permissions are unchanged.
