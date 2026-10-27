import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../components/ShiftTrackerApp.tsx', import.meta.url), 'utf8');
test('clock-in picker is locked out during a shift and resets to home after creation', () => {
 assert.match(source, /aria-label="Store for next shift"/);
 assert.match(source, /if \(draft.shifts.some\(item => item.status !== "completed"\)\) return false/);
 assert.match(source, /draft.settings.nextStoreId = "ormskirk"/);
 assert.match(source, /data.settings.nextStoreId === "maghull" \? "maghull" : "ormskirk"/);
});
test('active cover-store rendering projects safe settings and rejects stale GPS samples', () => {
 assert.match(source, /settingsForStore\(storedData.settings, currentStore\)/);
 assert.match(source, /storeId === "maghull"\) return finish\(false\)/);
});
