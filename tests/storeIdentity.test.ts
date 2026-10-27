import test from 'node:test';
import assert from 'node:assert/strict';
import { createShift, emptyData, repairShiftActivityIds, CLEANING_ROTA, PREPARATION_ROTA } from '../lib/domain.ts';
import { createBackupDocument, validateBackupDocument, applyValidatedBackup } from '../lib/backup.ts';

test('new shifts default to Ormskirk and can carry a cover-store identity', () => {
  const data = emptyData();
  assert.equal(createShift(data.settings).storeId, 'ormskirk');
  const cover = createShift(data.settings, new Date('2026-10-29T11:00:00Z'), undefined, 'other', CLEANING_ROTA, PREPARATION_ROTA, 'maghull');
  assert.equal(cover.storeId, 'maghull');
});

test('backup validates and retains a cover-store identity', () => {
  const data = emptyData();
  const shift = repairShiftActivityIds(createShift(data.settings, new Date('2026-10-29T11:00:00Z'), undefined, 'other', CLEANING_ROTA, PREPARATION_ROTA, 'maghull'));
  data.shifts.push(shift);
  const result = validateBackupDocument(createBackupDocument(data, '2.1.246'));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(applyValidatedBackup(emptyData(), result, true).shifts[0].storeId, 'maghull');
});
