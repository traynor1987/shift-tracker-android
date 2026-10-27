import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { putPhotos, type PhotoRecord } from "../lib/photoStorage.ts";

test("a high/compressed photo pair uses one completed transaction and closes its database connection", async () => {
  const stored: string[] = [];
  let transactionCount = 0;
  let closeCount = 0;
  const database = {
    close: () => { closeCount += 1; },
    transaction: () => {
      transactionCount += 1;
      let pending = 0;
      const transaction: Record<string, unknown> = {
        error: null,
        abort: () => undefined,
        objectStore: () => ({
          put: (record: PhotoRecord) => {
            pending += 1;
            const request: Record<string, unknown> = { error: null };
            setTimeout(() => {
              stored.push(record.id);
              (request.onsuccess as (() => void) | undefined)?.();
              pending -= 1;
              if (!pending) setTimeout(() => (transaction.oncomplete as (() => void) | undefined)?.(), 0);
            }, 0);
            return request;
          },
        }),
      };
      return transaction;
    },
  };
  const previous = globalThis.indexedDB;
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: { open: () => {
    const request: Record<string, unknown> = { result: database, error: null };
    setTimeout(() => (request.onsuccess as (() => void) | undefined)?.(), 0);
    return request;
  } } });
  try {
    const stamp = new Date("2026-08-25T12:00:00+01:00").toISOString();
    const record = (id: string, kind: "high" | "compressed"): PhotoRecord => ({ id, kind, blob: new Blob([id]), createdAt: stamp, expiresAt: stamp, width: 100, height: 100, size: id.length });
    await putPhotos([record("photo-high", "high"), record("photo-compressed", "compressed")]);
    assert.deepEqual(stored.sort(), ["photo-compressed", "photo-high"]);
    assert.equal(transactionCount, 1);
    assert.equal(closeCount, 1);
  } finally { Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: previous }); }
});

test("multi-photo UI saves each selection sequentially and reports per-photo progress", () => {
  const component = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(component, /for \(let index = 0; index < files\.length; index \+= 1\)[\s\S]*await preparePhoto\(file\)/);
  assert.match(component, /const input = event\.currentTarget;[\s\S]*const prepared = await preparePhoto\(file\)[\s\S]*input\.value = ""/);
  assert.doesNotMatch(component, /setPhotoProgress\(progress\);\s*await/);
  assert.match(component, /Processing photo \{progress\.current\} of \{progress\.total\}/);
  assert.match(component, /failures\.push\([\s\S]*index: index \+ 1/);
  assert.match(component, /setPhotoError\(\s*`\$\{saved\} of \$\{files\.length\}/);
  assert.match(component, /className="photo-modal-error"\s+role="alert"/);
  assert.match(component, /CHOOSE PHOTOS/);
  assert.match(css, /\.photo-processing-spinner/);
  assert.match(css, /\.toast \{ position: fixed; z-index: 80/);
  assert.match(css, /\.modal-backdrop \{ position: fixed; z-index: 60/);
});

test("Android generic photo MIME metadata reaches the image decoder", () => {
  const storage = readFileSync(new URL("../lib/photoStorage.ts", import.meta.url), "utf8");
  assert.match(storage, /declaredType !== "application\/octet-stream"/);
  assert.match(storage, /if \(declaredType &&[\s\S]*!declaredType\.startsWith\("image\/"\)\)/);
});

test("History task editor can add, retain and delete photo proof", () => {
  const component = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
  assert.match(component, /HISTORY PHOTO/);
  assert.match(component, /onAdd=\{\(\) => requestHistoryPhoto\(task\.id\)\}/);
  assert.match(component, /historyPickerRef[\s\S]*multiple\s+onChange=\{handleHistoryPhoto\}/);
  assert.match(component, /const proof = await onAddPhoto\(taskId, prepared\)/);
  assert.match(component, /return removeHistoryPhoto\(task\.id, attachedAt\)/);
});
