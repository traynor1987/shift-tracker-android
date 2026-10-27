import test from "node:test";
import assert from "node:assert/strict";
import { recordRuntimeMeasurement, runtimeDiagnosticsSnapshot } from "../lib/runtimeDiagnostics.ts";

test("runtime evidence aggregates numeric timings without retaining sample data", () => {
  recordRuntimeMeasurement("local_save", 10);
  recordRuntimeMeasurement("local_save", 30);
  recordRuntimeMeasurement("local_save", Number.NaN);
  recordRuntimeMeasurement("local_save", -1);
  assert.deepEqual(runtimeDiagnosticsSnapshot().local_save, { count: 2, last: 30, maximum: 30, average: 20 });
  assert.deepEqual(Object.keys(runtimeDiagnosticsSnapshot()), ["local_save"]);
});
