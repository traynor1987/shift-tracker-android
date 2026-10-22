# Matching Web changes

Base Sites source: c6c64272d2d13144e3b751a453833ac1f2cf816b (Web 2.1.244, Sites 493).
Apply `always-on-shift-monitoring.patch` to that exact source, then copy
`shiftMonitoringBridge.test.ts` into tests/. The patch is source backup, not proof
of publication. It preserves the canonical Web ingestion/evidence engine.

New native settings default OFF. Explicit enable maintains shift monitoring;
manual Back at Store remains mandatory in this mode (existing carryout and
time-allowance automatic completion remain available when this mode is OFF).
New optional mirror fields carry observed exit and latest manual Delivered time.
Install Android 2.2.74+ before enabling the setting. Older shells ignore the new
fields. Native route replay uses the existing durable-before-ack protocol.
