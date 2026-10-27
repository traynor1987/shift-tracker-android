import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createShift, emptyData, type ShiftTaskRecord } from '../lib/domain.ts';

const app = readFileSync(new URL('../components/ShiftTrackerApp.tsx', import.meta.url), 'utf8');
test('Single/Double samples the action clock, not the last rendered clock', () => {
  const start = app.slice(app.indexOf('  const addDelivery ='), app.indexOf('  const openCustomerWaitReview ='));
  assert.doesNotMatch(start, /const tapTime = now\.getTime\(\)/);
});

export function fixture() {
  const data = emptyData();
  const shift = createShift(data.settings, new Date('2026-09-24T10:00:00Z'));
  const task = { id:'task', sourceTaskId:'source', name:'Clean', area:'Store', description:'Clean store', weekday:4, order:0, category:'cleaning', status:'active', segments:[{ start:'2026-09-24T10:10:00.500Z', end:null }], completedAt:null, quickCompleted:false, shiftNotes:'' } as ShiftTaskRecord;
  shift.taskSnapshot = [task];
  shift.activities = [{id:'task-activity', shiftId:shift.id, type:'cleaning_task', taskId:task.id, taskName:task.name, start:task.segments[0].start, end:null, segments:structuredClone(task.segments)}];
  data.shifts = [shift];
  return {data, shift, task};
}

import { assertTaskMutationCurrent, closeTaskSegment, deliveryTransitionTime, hasReversedTaskSegments, isFreshOperationalSample, openTaskSegment, repairReversedTaskSegments } from '../lib/taskTiming.ts';
import { createBackupDocument, validateAppDataStructure, validateBackupDocument } from '../lib/backup.ts';
import { IDBFactory } from 'fake-indexeddb';
import { saveIndexedDbData, loadIndexedDbData, resetIndexedDbSessionForTests } from '../lib/indexedDbStorage.ts';

test('stale display/exit time cannot close a newly resumed task backwards', () => {
  const {shift,task} = fixture();
  const at = deliveryTransitionTime(shift, Date.parse('2026-09-24T10:10:01Z'), '2026-09-24T10:09:00Z');
  assert.equal(at, '2026-09-24T10:10:01.000Z');
  closeTaskSegment(task, at);
  assert.ok(Date.parse(task.segments[0].end!) >= Date.parse(task.segments[0].start));
});
test('credible carryout departure is retained; repeated close is idempotent; equal boundary is valid', () => {
  const {shift,task} = fixture();
  const at = deliveryTransitionTime(shift, Date.parse('2026-09-24T10:11:00Z'), task.segments[0].start);
  assert.equal(at, task.segments[0].start);
  assert.equal(closeTaskSegment(task, at), true);
  assert.equal(closeTaskSegment(task, '2026-09-24T11:00:00Z'), false);
  assert.equal(task.segments[0].end, task.segments[0].start);
});
test('stale callback and reversed event rejected without changing the new segment', () => {
  const {data, task} = fixture();
  assert.throws(() => closeTaskSegment(task, '2026-09-24T10:10:00Z'), /Stale/);
  const current = structuredClone(data);
  current.shifts[0].taskSnapshot![0].segments.push({start:'2026-09-24T10:30:00Z',end:null});
  const candidate = structuredClone(current);
  closeTaskSegment(candidate.shifts[0].taskSnapshot![0], '2026-09-24T10:31:00Z');
  assert.throws(() => assertTaskMutationCurrent(data,current,candidate), /Stale/);
  assert.equal(current.shifts[0].taskSnapshot![0].segments.at(-1)!.end,null);
});
test('GPS/native samples must be current, ordered and from this work generation', () => {
  assert.equal(isFreshOperationalSample(100,200,150,0),false);
  assert.equal(isFreshOperationalSample(100,200,0,110),false);
  assert.equal(isFreshOperationalSample(100,40000,0,0),false);
  assert.equal(isFreshOperationalSample(201,200,0,0),false);
  assert.equal(isFreshOperationalSample(190,200,150,180),true);
  assert.equal(isFreshOperationalSample(190,200,190,180),false);
});
test('repair preserves starts, valid neighbours, delivery history and original boundary audit', async () => {
  const {data,shift,task} = fixture();
  task.segments[0].end='2026-09-24T10:10:00Z'; task.status='paused';
  task.segments.push({start:'2026-09-24T10:20:00Z',end:'2026-09-24T10:21:00Z'});
  shift.activities![0].end=task.segments[0].end;
  shift.activities![0].segments=structuredClone(task.segments);
  const original=structuredClone(data);
  assert.equal(validateAppDataStructure(data).ok,false);
  const repaired=repairReversedTaskSegments(data,'2026-09-24T12:00:00Z');
  assert.equal(repaired.ok,true, JSON.stringify(repaired));
  if (!repaired.ok) return;
  assert.deepEqual(data,original);
  const fixed=repaired.data.shifts[0].taskSnapshot![0];
  assert.equal(fixed.segments[0].start,task.segments[0].start);
  assert.equal(fixed.segments[0].end,task.segments[0].start);
  assert.deepEqual(fixed.segments[1],task.segments[1]);
  assert.match(fixed.shiftNotes!,/original end 2026-09-24T10:10:00Z/);
  assert.deepEqual(repaired.data.shifts[0].deliveries,shift.deliveries);
  assert.equal(hasReversedTaskSegments(repaired.data),false);
  assert.equal(validateBackupDocument(createBackupDocument(repaired.data,'2.1.213')).ok,true);
  const ctx={factory:new IDBFactory(),databaseName:'repaired-task',localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}};
  await loadIndexedDbData(ctx);
  await assert.rejects(saveIndexedDbData(data,ctx));
  await saveIndexedDbData(repaired.data,ctx);
  resetIndexedDbSessionForTests(ctx.databaseName);
  const loaded=await loadIndexedDbData(ctx);
  assert.ok("data" in loaded);
  assert.deepEqual(loaded.data.shifts[0].taskSnapshot!.find(t=>t.id===fixed.id)!.segments, fixed.segments);
  assert.equal(loaded.data.shifts[0].taskSnapshot!.find(t=>t.id===fixed.id)!.shiftNotes, fixed.shiftNotes);
  assert.equal(validateAppDataStructure(loaded.data).ok,true);
  assert.equal(repairReversedTaskSegments(repaired.data).repairs.length,0);
});
test('repair refuses unrelated corruption and never mutates input', () => {
  const {data,task}=fixture();task.segments[0].end='2026-09-24T10:00:00Z';
  data.shifts[0].hourlyRatePence=-1;
  const copy=structuredClone(data);
  assert.equal(repairReversedTaskSegments(data).ok,false);
  assert.deepEqual(data,copy);
});

test('resume never opens a second segment even when task status is stale',()=>{
  const {shift,task}=fixture();task.status='paused';shift.activities=[];
  assert.equal(openTaskSegment(shift,task,'2026-09-24T10:12:00Z'),false);
  assert.equal(task.segments.length,1);
});
