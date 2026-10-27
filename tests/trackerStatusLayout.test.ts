import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

test("the status strip stays inside the working card so it cannot take the delivery grid row", async () => {
  const source = await readFile(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
  const parsed = ts.createSourceFile("ShiftTrackerApp.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let strips = 0;
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(parsed) === "TrackerHealthStrip") {
      strips++;
      const parent = node.parent;
      assert.ok(ts.isJsxElement(parent));
      assert.equal(parent.openingElement.tagName.getText(parsed), "section");
      assert.match(parent.openingElement.attributes.getText(parsed), /working-card/);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert.equal(strips, 1);
});
