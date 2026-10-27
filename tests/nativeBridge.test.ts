import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  readNativeLocationSample,
  readNativeShellInfo,
  readNativeTrackingState,
  nativeShellBridgeAvailable,
  nativeSampleIsFresh,
  readNativeActionRequest,
  readNativeDispatchNotification,
  respondNativeAction,
  clearNativeWorkStatus,
  retractNativeShift,
  requestNativeBackgroundLocation,
  setNativeWorkStatus,
  showNativeGeofenceAlert,
  startNativeDeliveryTracking,
  stopNativeDeliveryTracking,
  subscribeToNativeMessages,
  TRUSTED_SHIFT_TRACKER_ORIGIN,
} from "../lib/nativeBridge.ts";
import { flushNativeSamples } from "../lib/nativeLocationSync.ts";

test("native sample acknowledgement waits for persisted ingestion", async () => {
  let finishPersistence!: () => void;
  const persistence = new Promise<void>((resolve) => {
    finishPersistence = resolve;
  });
  const acknowledged: string[] = [];
  const flushing = flushNativeSamples(
    [{ sampleId: "sample-1", deliveryId: "delivery-1" }],
    async () => {
      await persistence;
      return { status: "persisted" as const };
    },
    (sampleId) => acknowledged.push(sampleId),
  );

  await Promise.resolve();
  assert.deepEqual(acknowledged, []);
  finishPersistence();
  await flushing;
  assert.deepEqual(acknowledged, ["sample-1"]);
});

test("native sample remains pending when persistence fails", async () => {
  const acknowledged: string[] = [];
  await assert.rejects(
    flushNativeSamples(
      [{ sampleId: "sample-1", deliveryId: "delivery-1" }],
      async () => {
        throw new Error("IndexedDB transaction aborted");
      },
      (sampleId) => acknowledged.push(sampleId),
    ),
    /IndexedDB transaction aborted/,
  );
  assert.deepEqual(acknowledged, []);
});

test("native replay rejects a previous delivery without mutating the active delivery", async () => {
  const activeRoute: string[] = [];
  const acknowledged: string[] = [];
  await flushNativeSamples(
    [{ sampleId: "old-sample", deliveryId: "previous-delivery" }],
    async (sample) => {
      if (sample.deliveryId !== "current-delivery")
        return { status: "rejected" as const };
      activeRoute.push(sample.sampleId);
      return { status: "persisted" as const };
    },
    (sampleId) => acknowledged.push(sampleId),
  );
  assert.deepEqual(activeRoute, []);
  assert.deepEqual(acknowledged, ["old-sample"]);
});

test("native sample replay after a successful commit is idempotent", async () => {
  const persisted = new Set<string>();
  const route: string[] = [];
  const acknowledged: string[] = [];
  const sample = { sampleId: "sample-1", deliveryId: "delivery-1" };
  const ingest = async (candidate: typeof sample) => {
    if (persisted.has(candidate.sampleId)) return { status: "rejected" as const };
    persisted.add(candidate.sampleId);
    route.push(candidate.sampleId);
    return { status: "persisted" as const };
  };

  await flushNativeSamples([sample], ingest, (sampleId) => acknowledged.push(sampleId));
  await flushNativeSamples([sample], ingest, (sampleId) => acknowledged.push(sampleId));

  assert.deepEqual(route, ["sample-1"]);
  assert.deepEqual(acknowledged, ["sample-1", "sample-1"]);
});

test("one native sample uses one canonical commit and failed optimistic state is re-saved", () => {
  const component = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
  const handler = component.slice(
    component.indexOf("const applyLocationReading"),
    component.indexOf("const recordRouteIssue"),
  );

  assert.match(handler, /const pendingMutations:/);
  assert.match(handler, /const result = await commit\(\(draft\) =>/);
  assert.match(handler, /nativeUnpersistedSampleIdsRef\.current\.has\(nativeSampleId!\)/);
  assert.match(handler, /pendingMutations\.push\(\(\) => undefined\)/);
  assert.doesNotMatch(handler, /const operation = commit\(updater\)/);
  assert.match(component, /pendingSample\.deliveryId,\s*pendingSample\.sampleId,/);
  assert.match(component, /nativeUnpersistedSampleIdsRef\.current\.add\(sample\.sampleId\)/);
});

test("native GPS freshness rejects stale or future customer points", () => {
  const now = Date.parse("2026-08-26T12:10:00.000Z");
  assert.equal(nativeSampleIsFresh("2026-08-26T12:09:30.000Z", now), true);
  assert.equal(nativeSampleIsFresh("2026-08-26T12:08:59.999Z", now), false);
  assert.equal(nativeSampleIsFresh("2026-08-26T12:10:06.000Z", now), false);
  assert.equal(nativeSampleIsFresh(null, now), false);
});

test("a deleted shift sends one bounded production retraction to the Android shell", () => withTrustedWindow((messages) => {
  assert.equal(retractNativeShift({ shiftId: "shift-delete-1", revision: 42, retractedAtEpochMs: 1_789_000_000_000 }), true);
  assert.deepEqual(JSON.parse(messages[0]), {
    type: "shift_tracker_shift:retracted",
    shiftId: "shift-delete-1",
    revision: 42,
    retractedAtEpochMs: 1_789_000_000_000,
  });
  assert.equal(retractNativeShift({ shiftId: "", revision: 42, retractedAtEpochMs: 1 }), false);
}));

test("Delivered preserves its tap but never attaches a stale native customer coordinate", () => {
  const component = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
  assert.match(component, /nativeSampleIsFresh\(latestNativePoint\?\.timestamp\)[\s\S]*?\? latestNativePoint[\s\S]*?: null/);
  assert.match(component, /stale GPS location was not attached/);
  assert.match(component, /NATIVE_GPS_STALL_RECOVERY/);
  assert.match(component, /stopNativeDeliveryTracking\(delivery\.id\)[\s\S]*startNativeDeliveryTracking\(\s*delivery\.id/);
  assert.match(component, /nativeStreamIsStalled\(/);
  assert.match(component, /NATIVE_PERMISSION_STATE_DEFERRED/);
  assert.match(component, /Recent native route evidence exists/);
});

test("Delivered still queues Google from retained GPS when the exact native sample is stale", () => {
  const component = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
  assert.match(component, /const retainedRoutePoint = points\.at\(-1\) \?\? null/);
  assert.match(component, /source: "gps_estimate" as const/);
  assert.match(component, /GOOGLE_API_CUSTOMER_POINT_UNAVAILABLE/);
  assert.match(component, /if \(shouldQueueRoute && routeCustomer\)\s+queueLiveExpectedRoute/);
});

function withTrustedWindow(run: (messages: string[]) => void, postMessage?: (message: string) => void) {
  const globals = globalThis as unknown as { window?: unknown };
  const originalWindow = globals.window;
  const messages: string[] = [];
  globals.window = {
    location: { origin: TRUSTED_SHIFT_TRACKER_ORIGIN },
    ShiftTrackerNative: { postMessage: postMessage ?? ((message: string) => messages.push(message)) },
  };
  try { run(messages); } finally { globals.window = originalWindow; }
}

function event(data: unknown, origin = TRUSTED_SHIFT_TRACKER_ORIGIN) {
  return { data, origin } as MessageEvent<unknown>;
}

test("Android JSON-string WebMessages are accepted only from the exact trusted origin", () => withTrustedWindow(() => {
  const payload = JSON.stringify({ type: "shift_tracker_shell:ready", shellVersion: "2.2.0", bridgeVersion: 1, trustedOrigin: TRUSTED_SHIFT_TRACKER_ORIGIN, trackingActive: true, trackedDeliveryId: "delivery-current", diagnostics: { backgroundLocationGranted: true } });
  assert.equal(readNativeShellInfo(event(payload))?.shellVersion, "2.2.0");
  assert.equal(readNativeShellInfo(event(payload))?.diagnostics?.backgroundLocationGranted, true);
  assert.equal(readNativeShellInfo(event(payload))?.trackedDeliveryId, "delivery-current");
  assert.equal(readNativeShellInfo(event(payload, "https://example.com")), null);
  assert.equal(readNativeShellInfo(event("not-json")), null);
}));

test("companion actions carry optional PWA state identity and receive a structured result", () => withTrustedWindow((messages) => {
  const action = readNativeActionRequest(event(JSON.stringify({ type: "shift_tracker_native_action:requested", id: "watch-1", action: "single", expectedStateRevision: "state-1", expectedShiftId: "shift-1" })));
  assert.deepEqual(action, { id: "watch-1", action: "single", expectedStateRevision: "state-1", expectedShiftId: "shift-1", expectedActivityId: undefined, taskName: undefined });
  assert.equal(respondNativeAction("watch-1", "stale_state", { stateRevision: "state-2", shiftId: "shift-2" }), true);
  assert.deepEqual(JSON.parse(messages[0]), { type: "shift_tracker_native_action:result", id: "watch-1", outcome: "stale_state", stateRevision: "state-2", shiftId: "shift-2" });
}));

test("Order Dispatched notifications accept only a bounded trusted timestamp", () => withTrustedWindow(() => {
  const received = readNativeDispatchNotification(event(JSON.stringify({ type: "shift_tracker_dispatch_notification:received", id: "dispatch-1", receivedAtEpochMs: 1_788_000_000_000 })));
  assert.deepEqual(received, { id: "dispatch-1", receivedAtEpochMs: 1_788_000_000_000 });
  assert.equal(readNativeDispatchNotification(event(JSON.stringify({ type: "shift_tracker_dispatch_notification:received", id: "", receivedAtEpochMs: 1 }))), null);
  assert.equal(readNativeDispatchNotification(event(JSON.stringify({ type: "shift_tracker_dispatch_notification:received", id: "dispatch-2", receivedAtEpochMs: "now" }))), null);
}));

test("the delivery screen queues an Order Dispatched notice received during an active run", () => {
  const component = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
  assert.match(component, /shift\.queuedEarlyDispatch = dispatch/);
  assert.match(component, /active\.pendingEarlyDispatch \?\? active\.queuedEarlyDispatch/);
  assert.match(component, /Next delivery dispatch saved from order notification/);
});

test("watch Quick Task actions preserve only a bounded task label", () => withTrustedWindow(() => {
  const action = readNativeActionRequest(event(JSON.stringify({
    type: "shift_tracker_native_action:requested",
    id: "watch-quick-1",
    action: "start_quick_task",
    taskName: "  Wash dishes  ",
  })));
  assert.equal(action?.taskName, "Wash dishes");
  assert.equal(readNativeActionRequest(event(JSON.stringify({
    type: "shift_tracker_native_action:requested",
    id: "watch-quick-2",
    action: "start_quick_task",
    taskName: "x".repeat(61),
  })))?.taskName, undefined);
}));

test("native-shell UI detection requires the exact trusted origin and injected bridge", () => {
  const globals = globalThis as unknown as { window?: unknown };
  const originalWindow = globals.window;
  try {
    globals.window = { location: { origin: TRUSTED_SHIFT_TRACKER_ORIGIN }, ShiftTrackerNative: { postMessage: () => undefined } };
    assert.equal(nativeShellBridgeAvailable(), true);
    globals.window = { location: { origin: "https://example.com" }, ShiftTrackerNative: { postMessage: () => undefined } };
    assert.equal(nativeShellBridgeAvailable(), false);
    globals.window = { location: { origin: TRUSTED_SHIFT_TRACKER_ORIGIN } };
    assert.equal(nativeShellBridgeAvailable(), false);
  } finally {
    globals.window = originalWindow;
  }
});

test("native GPS samples retain provider timestamp and accuracy after string parsing", () => withTrustedWindow(() => {
  const sample = readNativeLocationSample(event(JSON.stringify({ type: "shift_tracker_location:sample", sample: { sampleId: "delivery-1:123", deliveryId: "delivery-1", latitude: 51.5, longitude: -0.1, timestampEpochMs: 123, accuracy: 8.5, speed: 3 } })));
  assert.deepEqual(sample, { sampleId: "delivery-1:123", deliveryId: "delivery-1", latitude: 51.5, longitude: -0.1, timestampEpochMs: 123, accuracy: 8.5, speed: 3, heading: null });
}));

test("modern native states and staged background request remain named and bounded", () => withTrustedWindow((messages) => {
  const state = readNativeTrackingState(event(JSON.stringify({ type: "shift_tracker_location:state", status: "waiting_for_fix", diagnostic: "WAITING_FOR_FIX", diagnostics: { serviceRunning: true } })));
  assert.equal(state?.status, "waiting_for_fix");
  assert.equal(state?.diagnostics?.serviceRunning, true);
  assert.equal(requestNativeBackgroundLocation(), true);
  assert.deepEqual(JSON.parse(messages[0]), { type: "shift_tracker_location:background_request" });
}));

test("work status and confirmed geofence alerts use bounded exact-origin bridge messages", () => withTrustedWindow((messages) => {
  assert.equal(setNativeWorkStatus({ kind: "cleaning", taskId: "customer-area", taskName: "Customer Area", startedAtEpochMs: 1_777_000_000_000, paused: false }), true);
  assert.equal(showNativeGeofenceAlert("left", 1_777_000_001_000), true);
  assert.equal(clearNativeWorkStatus(), true);
  assert.deepEqual(JSON.parse(messages[0]), { type: "shift_tracker_work:set", kind: "cleaning", taskId: "customer-area", taskName: "Customer Area", startedAtEpochMs: 1_777_000_000_000, paused: false });
  assert.deepEqual(JSON.parse(messages[1]), { type: "shift_tracker_geofence:alert", direction: "left", observedAtEpochMs: 1_777_000_001_000 });
  assert.deepEqual(JSON.parse(messages[2]), { type: "shift_tracker_work:clear" });
}));

test("native work and geofence bridge commands reject empty or invalid data", () => withTrustedWindow((messages) => {
  assert.equal(setNativeWorkStatus({ kind: "prep", taskId: "", taskName: "Cookies", paused: false }), false);
  assert.equal(showNativeGeofenceAlert("returned", Number.NaN), false);
  assert.equal(messages.length, 0);
}));

test("native tracking bridge failures are contained and reported as unsent", () => {
  withTrustedWindow(() => {
    assert.equal(stopNativeDeliveryTracking("delivery-a"), false);
    assert.equal(startNativeDeliveryTracking("delivery-b"), false);
  }, () => { throw new Error("bridge unavailable"); });
});

test("oversized or invalid native samples are rejected", () => withTrustedWindow(() => {
  assert.equal(readNativeShellInfo(event(`{"type":"shift_tracker_shell:ready","padding":"${"x".repeat(70_000)}"}`)), null);
  assert.equal(readNativeLocationSample(event(JSON.stringify({ type: "shift_tracker_location:sample", sample: { sampleId: "x", deliveryId: "y", latitude: 999, longitude: 0, timestampEpochMs: 1, accuracy: 5 } }))), null);
}));

test("origin-locked injected bridge replies are normalised into trusted native messages", () => {
  const globals = globalThis as unknown as { window?: unknown };
  const originalWindow = globals.window;
  let bridgeListener: ((message: MessageEvent<unknown>) => void) | undefined;
  globals.window = {
    location: { origin: TRUSTED_SHIFT_TRACKER_ORIGIN },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    ShiftTrackerNative: {
      postMessage: () => undefined,
      addEventListener: (_type: "message", listener: (message: MessageEvent<unknown>) => void) => { bridgeListener = listener; },
      removeEventListener: () => undefined,
    },
  };
  try {
    let shellVersion: string | undefined;
    const unsubscribe = subscribeToNativeMessages((message) => { shellVersion = readNativeShellInfo(message)?.shellVersion; });
    bridgeListener?.({ data: JSON.stringify({ type: "shift_tracker_shell:ready", shellVersion: "2.2.1", bridgeVersion: 1, trustedOrigin: TRUSTED_SHIFT_TRACKER_ORIGIN }) } as MessageEvent<unknown>);
    unsubscribe();
    assert.equal(shellVersion, "2.2.1");
  } finally {
    globals.window = originalWindow;
  }
});

test("native re-entry, delivery sizing and Google setup recovery stay trusted-shell-only", () => {
  const component = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8") + readFileSync(new URL("../components/RouteMapModal.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(component, /const \[nativeShellDetected, setNativeShellDetected\] = useState\(\(\) =>\s*nativeShellBridgeAvailable\(\)/);
  assert.match(component, /const isNativeShell = nativeShellDetected \|\| nativeShellBridgeAvailable\(\)/);
  assert.match(component, /window\.addEventListener\("pageshow", confirmNativeShell\)/);
  assert.match(component, /REAL_ENTRY_REJECTED_NO_CURRENT_EXIT/);
  assert.match(component, /info\.trackedDeliveryId !== currentDeliveryId/);
  assert.match(component, /NATIVE_START_TIMEOUT/);
  assert.match(component, /isNativeShell && previous\.reason === "GOOGLE_API_NOT_CONFIGURED"/);
  assert.match(component, /nativeGoogleSetupMissing = Boolean\(\s*isNativeShell &&\s*isLive/);
  assert.match(component, /:\s*isLive\s*\?\s*"Available after Delivered"/);
  assert.match(css, /\.native-shell\.active-main \.active-delivery-card\.single/);
  assert.match(css, /\.native-shell\.active-main \.delivery-timing-card/);
  assert.match(css, /\.native-shell\.active-main \.delivery-timing-card \.section-title/);
  assert.match(css, /\.native-shell\.active-main \.hustle-timing-grid > span/);
  assert.match(css, /\.native-shell\.active-main \.active-shift-page\.has-active-delivery\s*\{[^}]*grid-template-rows:/);
});

test("sticky header owns Android's full status area while keeping controls below it", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.app-shell \{ --app-safe-top: env\(safe-area-inset-top, 0px\);[^}]*padding-top: 0;/);
  assert.match(css, /\.app-shell\.native-shell \{ --app-safe-top: max\(env\(safe-area-inset-top, 0px\), 28px\); \}/);
  assert.match(css, /\.topbar \{ position: sticky; top: 0;[^}]*height: calc\(76px \+ var\(--app-safe-top\)\);[^}]*padding: calc\(12px \+ var\(--app-safe-top\)\)[^}]*background: var\(--bg\);/);
  assert.match(css, /\.active-main \.topbar \{ height: calc\(60px \+ var\(--app-safe-top\)\); padding-top: calc\(7px \+ var\(--app-safe-top\)\);/);
  assert.match(css, /height: calc\(100dvh - 134px - env\(safe-area-inset-bottom\) - var\(--app-safe-top\)\);/);
});

test("active delivery keeps Hustle and its action row above the fixed navigation", () => {
  const component = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const timing = component.indexOf("<DeliveryTimingCard");
  const action = component.indexOf("delivery-action-row", timing);
  assert.ok(timing >= 0 && action > timing);
  assert.match(component, /<nav className="bottom-nav" aria-label="Main navigation">/);
  assert.match(css, /\.native-shell\.active-main \.active-shift-page\.has-active-delivery\s*\{[^}]*grid-template-rows:[^}]*minmax\(44px,52px\)/);
  assert.match(css, /\.active-shift-page \.delivery-action-row \.delivered-button\{[^}]*height:100%;[^}]*min-height:0/);
  assert.equal((component.match(/<HoldToOverrideButton/g) ?? []).length, 1, "Return-to-store has one primary control");
  assert.match(css, /\.delivery-action-row\s*>\s*\.back-at-store-button\s*\{[^}]*min-height:44px/);
});

test("open Shift Actions keeps its drag handle above the controls and closes from the same handle", () => {
  const component = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const drawer = component.indexOf("shift-action-drawer");
  const handle = component.indexOf("shift-action-lip", drawer);
  const body = component.indexOf("shift-action-drawer-body", handle);
  assert.ok(drawer >= 0 && handle > drawer && body > handle);
  assert.match(component, /"--shift-action-max-offset": `\$\{maxOffset\}px`/);
  assert.match(component, /"--shift-action-nav-overlap": `\$\{Math\.min\(25, \(offset \/ maxOffset\) \* 25\)\}px`/);
  assert.match(css, /\.shift-action-drawer \{[^}]*z-index: 21;[^}]*display: flex;[^}]*flex-direction: column/);
  assert.match(css, /\.shift-action-drawer \{[^}]*transform: translateX\(-50%\) translateY\(var\(--shift-action-nav-overlap, 0px\)\)/);
  assert.match(css, /\.shift-action-drawer-body \{[^}]*position: relative;[^}]*height: calc\(var\(--shift-action-max-offset\) - var\(--shift-action-offset\)\);[^}]*padding: 0;[^}]*border: 0;[^}]*transform: none/);
  assert.match(component, /onClick=\{handleShiftActionClick\}[\s\S]*?onPointerDown=\{handleShiftActionPointerDown\}[\s\S]*?onPointerMove=\{handleShiftActionPointerMove\}[\s\S]*?onPointerUp=\{handleShiftActionPointerUp\}/);
  assert.match(component, /onPointerCancel=\{handleShiftActionPointerUp\}/);
  assert.match(component, /if \(!drag\.moved\) \{[\s\S]*?setShiftActionDragOffset\(null\);[\s\S]*?return;/);
  assert.match(css, /\.shift-action-drawer:not\(\.open\):not\(\.dragging\) \.shift-action-drawer-body \{ height: 0;/);
});

test("delivery deletion and beta inclusion retain explicit safety gates", () => {
  const component = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
  assert.match(component, /className="confirm-modal delivery-delete-confirm"/);
  assert.match(component, /className="today-delivery-delete-button"/);
  assert.match(component, /aria-label="Type DELETE to confirm today delivery deletion"/);
  assert.match(component, /disabled=\{todayDeletePhrase\.trim\(\) !== "DELETE"\}/);
  assert.match(component, /disabled=\{deleteDeliveryPhrase\.trim\(\) !== "DELETE"\}/);
  assert.match(component, /setDeleteDeliveryPhrase\(event\.target\.value\.toUpperCase\(\)\)/);
  assert.match(component, /className=\{`beta-data-toggle\$\{settings\.includeBetaData === true \? " selected" : ""\}`\}/);
  assert.match(component, /className="beta-toggle-switch"/);
  assert.match(component, /Full backups still retain every record/);
  assert.match(component, /settings\.includeBetaData === true && \(\s*<>/);
  assert.match(component, /settings\.includeBetaCleaningData === true \? " selected" : ""/);
  assert.match(component, /Include <b className="beta-stamp">BETA<\/b> cleaning records/);
  assert.match(component, /Excluded from cleaning compliance and statistics; the shifts stay included/);
  assert.match(component, /Include unusual <b className="beta-stamp">BETA<\/b> Hustle\s+times/);
  assert.match(component, /Excluded from Hustle averages and records; the shifts stay included/);
});

test("the no-cleaning status tick cannot be flex-squeezed into a pill", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.not-required-message > span \{[^}]*flex: 0 0 34px;[^}]*aspect-ratio: 1;[^}]*border-radius: 50%;[^}]*\}/);
});


test("capability-aware explicit stop-all preserves targeted and older-shell compatibility",()=>withTrustedWindow(messages=>{
  const ready={type:"shift_tracker_shell:ready",trustedOrigin:TRUSTED_SHIFT_TRACKER_ORIGIN,bridgeVersion:1,shellVersion:"2.2.71",diagnostics:{sessionScopedCommands:true}};
  assert.ok(readNativeShellInfo(event(ready)));
  stopNativeDeliveryTracking();stopNativeDeliveryTracking("old-A");
  assert.equal(JSON.parse(messages[0]).type,"shift_tracker_location:stop_all");
  assert.deepEqual(JSON.parse(messages[1]),{type:"shift_tracker_location:stop",deliveryId:"old-A"});
  assert.ok(readNativeShellInfo(event({...ready,shellVersion:"2.2.70",diagnostics:{}})));
  stopNativeDeliveryTracking();assert.equal(JSON.parse(messages[2]).type,"shift_tracker_location:stop");
}));
