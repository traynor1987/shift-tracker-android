import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackupExport, BackupExportError } from '../lib/backupExportData.ts';
import { validateBackupDocument, createBackupDocument } from '../lib/backup.ts';
import { createShift, emptyData, repairShiftActivityIds } from '../lib/domain.ts';
const stamp = '2026-10-12T12:00:00.000Z';

test('empty full export remains current-format compatible and does not mutate metadata', () => {
  const data = emptyData(); const before = structuredClone(data);
  const result = buildBackupExport(data, '2.1.250', stamp);
  assert.deepEqual(JSON.parse(result.content), createBackupDocument(data, '2.1.250', new Date(stamp)));
  assert.equal(validateBackupDocument(JSON.parse(result.content)).ok, true);
  assert.deepEqual(data, before);
  assert.equal(result.recordCounts.shifts, 0);
});
test('full snapshot retains historical and active stores, payroll, Unicode and large GPS without modifying the live dataset', () => {
  const data = emptyData();
  const historical = repairShiftActivityIds(createShift(data.settings, new Date('2026-09-01T12:00:00.000Z')));
  historical.id = 'history'; historical.storeId = 'ormskirk'; historical.status = 'completed'; historical.clockOut = '2026-09-01T18:00:00.000Z'; historical.activities = [];
  const active = repairShiftActivityIds(createShift(data.settings, new Date('2026-10-12T10:00:00.000Z')));
  active.id = 'active'; active.storeId = 'maghull'; active.activities = [{ id: 'route', shiftId: 'active', type: 'single_delivery', start: '2026-10-12T11:00:00.000Z', end: null, tracked: true,
    routeEvidence: { startedAt: '2026-10-12T11:00:00.000Z', status: 'recording', completedAt: null, distanceMetres: 0, gaps: [], issues: [], detail: 'high', retention: 'forever', expiresAt: null, points: Array.from({length: 225_000}, (_, i) => ({latitude:53.57, longitude:-2.88, accuracy:8, timestamp: new Date(Date.parse('2026-10-12T11:00:00.000Z') + i).toISOString()})), recordedPointCount:225_000 }, taskName: '🚙 café' }];
  data.shifts = [historical, active];
  data.payments = [{id:'pay',date:'2026-09-02T12:00:00.000Z',amountPence:12345,expectedAmountPence:12345,shiftIds:['history'],reversedAt:null}];
  data.payrollSchedules = [{monthKey:'2026-09',periodStartDate:'2026-09-01',cutoffDate:'2026-09-30',paydayDate:'2026-10-05',paidAt:null,payslip:null}];
  const before = JSON.stringify(data);
  const result = buildBackupExport(data, '2.1.250', stamp);
  assert.ok(result.content.length > 20_000_000);
  assert.equal(result.recordCounts.routePoints, 225_000);
  const restored = validateBackupDocument(JSON.parse(result.content));
  assert.equal(restored.ok, true); if (!restored.ok) return;
  assert.deepEqual(restored.data.shifts.map(shift => [shift.id, shift.storeId, shift.status]), [['history','ormskirk','completed'],['active','maghull','working']]);
  assert.deepEqual(restored.data.payments,data.payments); assert.deepEqual(restored.data.payrollSchedules,data.payrollSchedules);
  assert.equal(restored.data.shifts[1].activities?.find(item=>item.id==='route')?.routeEvidence?.points.length,225_000);
  assert.equal(JSON.stringify(data), before);
});
test('validation failure has a safe stage and cannot change canonical state', () => {
  const data = emptyData(); data.payments = [{id:'invalid',date:'bad',amountPence:1,expectedAmountPence:1,shiftIds:[],reversedAt:null}];
  const before = structuredClone(data);
  assert.throws(() => buildBackupExport(data,'2.1.250',stamp), error => error instanceof BackupExportError && error.stage === 'validation');
  assert.deepEqual(data,before);
});
