import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { emptyData } from "../lib/domain.ts";
import { loadDataSafely, saveData } from "../lib/storage.ts";
import { localSaveSnapshot, trackLocalSave, runAfterLocalSaves } from "../lib/localSaveStatus.ts";

test("save indicator reports pending writes then durable completion and rejects a failed save", async () => {
  const options = { factory: new IDBFactory(), localStorage: null, databaseName: "save-health" };
  const loaded = await loadDataSafely(options);
  assert.notEqual(loaded.status, "failed");
  const data = emptyData();
  const saving = saveData(data, options);
  assert.equal(localSaveSnapshot().status, "saving");
  await saving;
  assert.equal(localSaveSnapshot().status, "saved");
  assert.equal(localSaveSnapshot().pending, 0);
  data.settings.hourlyRatePence = -1;
  await assert.rejects(() => saveData(data, options));
  assert.equal(localSaveSnapshot().status, "failed");
  data.settings.hourlyRatePence = 1296;
  await saveData(data, options);
  assert.equal(localSaveSnapshot().status, "saved");
});


test('web reload waits for every actual local save, including a write added while waiting', async () => {
  let finishFirst!: () => void; let finishSecond!: () => void;
  const first = trackLocalSave(() => new Promise<void>(resolve => { finishFirst = resolve; }));
  let reloads = 0;
  const reloading = runAfterLocalSaves(() => { reloads += 1; return 'reloaded'; });
  await Promise.resolve(); assert.equal(reloads, 0);
  const second = trackLocalSave(() => new Promise<void>(resolve => { finishSecond = resolve; }));
  finishFirst(); await first; await Promise.resolve(); assert.equal(reloads, 0);
  finishSecond(); await second;
  assert.equal(await reloading, 'reloaded'); assert.equal(reloads, 1);
});

test('failed local save blocks the update action until a successful save repairs it', async () => {
  await assert.rejects(trackLocalSave(() => Promise.reject(new Error('quota'))));
  let updates = 0;
  await assert.rejects(runAfterLocalSaves(() => { updates += 1; }), /save/i);
  assert.equal(updates, 0);
  await trackLocalSave(() => Promise.resolve());
  await runAfterLocalSaves(() => { updates += 1; });
  assert.equal(updates, 1);
});


test('a write queued in the same turn as an idle update gate still blocks reload', async () => {
  await trackLocalSave(() => Promise.resolve());
  await new Promise<void>(resolve => setImmediate(resolve));
  let reloads = 0; let finish!: () => void;
  const reloading = runAfterLocalSaves(() => { reloads += 1; });
  const saving = trackLocalSave(() => new Promise<void>(resolve => { finish = resolve; }));
  await new Promise<void>(resolve => setImmediate(resolve));
  const beforeFinish = reloads;
  finish(); await saving; await reloading;
  assert.equal(beforeFinish, 0); assert.equal(reloads, 1);
});

test('an unfinished save times out safely without starting an update', async () => {
  let finish!: () => void;
  const saving = trackLocalSave(() => new Promise<void>(resolve => { finish = resolve; }));
  let updates = 0;
  await assert.rejects(runAfterLocalSaves(() => { updates += 1; }, 10), /still saving/);
  assert.equal(updates, 0);
  finish(); await saving;
});
