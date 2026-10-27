import assert from "node:assert/strict";
import test from "node:test";
import { loadReportIntoWindow } from "../lib/lazyPdfReports.ts";

test("report window opens synchronously before module loading and renders only after loading", async () => {
  const events: string[] = [];
  const popup = { document: { body: { textContent: "" } }, closed: false } as unknown as Window;
  const old = globalThis.window;
  globalThis.window = { open: () => { events.push("open"); return popup; } } as unknown as Window & typeof globalThis;
  try {
    let release!: (value: typeof import("../lib/pdfReports.ts")) => void;
    const result = loadReportIntoWindow((_reports, target) => { assert.equal(target, popup); events.push("render"); return true; }, () => { events.push("load"); return new Promise((resolve) => { release = resolve; }); });
    assert.deepEqual(events, ["open", "load"]);
    assert.equal(popup.document.body.textContent, "Loading saved report…");
    release({} as typeof import("../lib/pdfReports.ts"));
    assert.equal(await result, true);
    assert.deepEqual(events, ["open", "load", "render"]);
  } finally { globalThis.window = old; }
});
test("a failed report chunk presents retry text without an unhandled rejection", async () => {
  const old = globalThis.window;
  const popup = { document: { body: { textContent: "" } }, closed: false } as unknown as Window;
  globalThis.window = { open: () => popup } as unknown as Window & typeof globalThis;
  try {
    assert.equal(await loadReportIntoWindow(() => { throw new Error("must not render"); }, async () => { throw new Error("offline"); }), false);
    assert.match(popup.document.body.textContent ?? "", /try again.*saved shift data is safe/);
  } finally { globalThis.window = old; }
});
