import assert from "node:assert/strict";
import test from "node:test";
import {
  appendDeveloperLog,
  clearDeveloperLog,
  getDeveloperLog,
  nativeDiagnosticsSummary,
  normaliseDeveloperSettings,
  setDeveloperModeEnabled,
} from "../lib/developerConsole.ts";

function withStorage(run: () => void) {
  const globals = globalThis as unknown as { window?: unknown };
  const originalWindow = globals.window;
  const values = new Map<string, string>();
  globals.window = {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    dispatchEvent: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  try { clearDeveloperLog(); run(); } finally { clearDeveloperLog(); globals.window = originalWindow; }
}

test("developer numeric controls are bounded and cannot become unsafe values", () => {
  const settings = normaliseDeveloperSettings({ statusHeartbeatSeconds: 0, maxEntries: 50_000, waitingWarningSeconds: -2, accuracyWarningMetres: 999 });
  assert.equal(settings.statusHeartbeatSeconds, 5);
  assert.equal(settings.maxEntries, 500);
  assert.equal(settings.waitingWarningSeconds, 5);
  assert.equal(settings.accuracyWarningMetres, 250);
});

test("developer logging is hidden until explicitly unlocked and remains bounded", () => withStorage(() => {
  appendDeveloperLog("GPS", "before_unlock", "ignored");
  assert.equal(getDeveloperLog().length, 0);
  setDeveloperModeEnabled(true);
  clearDeveloperLog();
  appendDeveloperLog("GPS", "native sample received", "accuracy=8m; coordinates omitted", "success");
  assert.equal(getDeveloperLog().length, 1);
  assert.equal(getDeveloperLog()[0].event, "NATIVE_SAMPLE_RECEIVED");
  assert.equal(getDeveloperLog()[0].detail, "accuracy=8m; coordinates omitted");
}));

test("native diagnostic summaries whitelist pipeline fields and omit sensitive extras", () => {
  const summary = nativeDiagnosticsSummary({ diagnostic: "WAITING_FOR_FIX", locationCallbackCount: 2, latitude: 53.5, longitude: -2.8, apiKey: "secret" });
  assert.match(summary, /WAITING_FOR_FIX/);
  assert.match(summary, /locationCallbackCount=2/);
  assert.doesNotMatch(summary, /latitude|longitude|secret|apiKey/);
});

test("diagnostic storage failures cannot interrupt GPS or tracker actions", () => {
  const original = globalThis.window;
  Object.assign(globalThis, { window: {
    localStorage: { getItem: (key: string) => key.includes("mode") ? "1" : null,
      setItem: () => { throw new Error("QuotaExceededError"); }, removeItem: () => { throw new Error("SecurityError"); } },
    dispatchEvent: () => true,
  } });
  try {
    assert.doesNotThrow(() => appendDeveloperLog("GPS", "SAMPLE", "accuracy=8"));
    assert.doesNotThrow(() => clearDeveloperLog());
  } finally { Object.assign(globalThis, { window: original }); }
});
