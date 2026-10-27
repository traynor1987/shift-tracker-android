import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createBackupDocument, validateBackupDocument } from "../lib/backup.ts";
import { emptyData, migrateAppData } from "../lib/domain.ts";
import { formatShelfLifeExpiry, SHELF_LIFE_PRODUCT_CATALOG, SHELF_LIFE_REFERENCE_RULES, SHELF_LIFE_SECTIONS, shelfLifeExpiry, shelfLifeProductId } from "../lib/shelfLife.ts";

test("day shelf lives include the date opened as day one", () => {
  const opened = new Date(2026, 7, 25, 9, 30);
  const expiry = shelfLifeExpiry(opened, { label: "From delivery", amount: 7, unit: "days" });
  assert.equal(expiry.getFullYear(), 2026);
  assert.equal(expiry.getMonth(), 7);
  assert.equal(expiry.getDate(), 31);
  assert.match(formatShelfLifeExpiry(opened, { label: "From delivery", amount: 7, unit: "days" }), /Mon 31 Aug/);
});

test("calendar-day shelf lives remain local across the UK clock change", () => {
  const opened = new Date(2026, 9, 24, 23, 30);
  const expiry = shelfLifeExpiry(opened, { label: "Prepped", amount: 7, unit: "days" });
  assert.equal(expiry.getDate(), 30);
  assert.equal(expiry.getHours(), 12);
});

test("hour-based chart rules retain exact elapsed-hour semantics", () => {
  const opened = new Date(2026, 7, 25, 9, 30);
  const expiry = shelfLifeExpiry(opened, { label: "Prepped", amount: 48, unit: "hours" });
  assert.equal(expiry.getTime() - opened.getTime(), 48 * 60 * 60 * 1000);
});

test("the complete Campaign 4 guide is grouped and every calculated period is valid", () => {
  assert.deepEqual(SHELF_LIFE_SECTIONS.map((section) => section.id), ["defrosted", "chilled", "ambient-before-use", "ambient"]);
  const products = SHELF_LIFE_SECTIONS.flatMap((section) => section.items.flatMap((item) => item.products));
  for (const required of ["Fries", "Potato wedges", "Pepperoni", "Pesto drizzle", "Habanero Hot Honey", "Tuna"]) assert.ok(products.includes(required), `${required} should be present`);
  for (const section of SHELF_LIFE_SECTIONS) for (const item of section.items) for (const period of item.periods) {
    assert.ok(period.amount > 0);
    assert.ok(Number.isFinite(shelfLifeExpiry(new Date(2026, 7, 25, 12), period).getTime()));
  }
  assert.equal(SHELF_LIFE_REFERENCE_RULES.length, 3);
  assert.ok(SHELF_LIFE_PRODUCT_CATALOG.length > products.length, "pack-date products should also be selectable");
});

test("Dashboard has a priority hierarchy and Tasks/Rota pages have isolated identities", () => {
  const source = readFileSync(new URL("../components/ShiftTrackerApp.tsx", import.meta.url), "utf8");
  assert.match(source, /<ShelfLifeGuide\s+now=\{now\}\s+hiddenProductIds=/);
  const day = source.indexOf('aria-labelledby="dashboard-now-title"');
  const summary = source.indexOf('aria-labelledby="dashboard-summary-title"');
  const pay = source.indexOf('aria-labelledby="dashboard-pay-title"');
  const performance = source.indexOf('aria-labelledby="dashboard-performance-title"');
  const reference = source.indexOf('aria-labelledby="dashboard-reference-title"');
  assert.ok(day >= 0 && day < summary && summary < pay && pay < performance && performance < reference);
  assert.match(source, /aria-label="Work summary period"/);
  assert.match(source, /summaryRange === "week" \? \(\s*<PeriodCard/);
  assert.match(source, /<TasksPage\s+key="tasks-page"/);
  assert.match(source, /<RotaPage\s+key="rota-page"/);
});

test("unused product choices persist in valid backups and old data defaults to all products", () => {
  const data = emptyData();
  data.settings.shelfLifeHiddenProductIds = [shelfLifeProductId("Fries"), shelfLifeProductId("Tuna")];
  const validated = validateBackupDocument(createBackupDocument(data, "2.1.60"));
  assert.equal(validated.ok, true);
  if (validated.ok) assert.deepEqual(validated.data.settings.shelfLifeHiddenProductIds, ["fries", "tuna"]);

  const old = emptyData();
  delete old.settings.shelfLifeHiddenProductIds;
  assert.deepEqual(migrateAppData(old).settings.shelfLifeHiddenProductIds, []);
});
