import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { runAfterLocalSaves, trackLocalSave } from "../lib/localSaveStatus.ts";

const source = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function realHandler(name: string, calls: string[]) {
  let body = "";
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) body = node.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.ok(body, name);
  const script = ts.transpileModule(`globalThis.run = (${body});`, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.None } }).outputText;
  const context = vm.createContext({ ready: true, Error, runAfterLocalSaves, notify: (message: string) => calls.push(message),
    setWebUpdate: () => undefined, requestNativeWebUpdate: (action: string) => { calls.push(action); return true; },
    window: { location: { reload: () => calls.push("reload") } } });
  vm.runInContext(script, context);
  return context.run as () => Promise<unknown>;
}

test("actual web install handler waits for a pending return save before contacting Android", async () => {
  const calls: string[] = []; let finish!: () => void;
  const saving = trackLocalSave(() => new Promise<void>(resolve => { finish = resolve; }));
  const installing = realHandler("installWebUpdate", calls)();
  await Promise.resolve(); assert.deepEqual(calls, []);
  finish(); await saving; await installing;
  assert.deepEqual(calls, ["install"]);
});

test("actual web reopen handler keeps the app open after a failed save", async () => {
  await assert.rejects(trackLocalSave(() => Promise.reject(new Error("quota"))));
  const calls: string[] = [];
  assert.equal(await realHandler("reloadAppAfterLocalSaves", calls)(), false);
  assert.equal(calls.includes("reload"), false);
  await trackLocalSave(() => Promise.resolve());
  assert.equal(await realHandler("reloadAppAfterLocalSaves", calls)(), true);
  assert.equal(calls.filter(call => call === "reload").length, 1);
});
