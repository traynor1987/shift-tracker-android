import test from 'node:test';
import assert from 'node:assert/strict';
import { createShift, repairShiftActivityIds, emptyData, type AppData } from '../lib/domain.ts';
import { createHistoricalRepair, type HistoricalRepairCommit } from '../lib/historicalRepair.ts';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { loadIndexedDbData, saveIndexedDbData, resetIndexedDbSessionForTests } from '../lib/indexedDbStorage.ts';

function fixture() {
  const data = emptyData();
  data.shifts = [repairShiftActivityIds(createShift(data.settings, new Date('2026-08-25T10:00:00Z'))), repairShiftActivityIds(createShift(data.settings, new Date('2026-08-26T10:00:00Z')))];
  const original = structuredClone(data.shifts[0]);
  const updated = structuredClone(original); updated.updatedAt = '2026-08-25T11:00:00.000Z';
  return {data, original, updated};
}
function memoryCommit(read: () => AppData, apply: (data: AppData) => void): HistoricalRepairCommit {
  return async updater => { const draft = structuredClone(read()); if(updater(draft) === false) return {status:'rejected'}; apply(draft); return {status:'persisted'}; };
}
test('repair uses latest data and preserves unrelated history and settings', async () => {
  const {original, updated, data:initialData} = fixture(); let data=initialData; data.settings.hourlyRatePence = 1234; data.shifts[1].updatedAt = '2026-08-26T11:00:00.000Z';
  const repair = createHistoricalRepair();
  assert.deepEqual(await repair({updated, original, readLatest:()=>data, commit:memoryCommit(()=>data, next=>{data=next;})}), {ok:true});
  assert.equal(data.shifts[0].updatedAt, '2026-08-25T11:00:00.000Z'); assert.equal(data.shifts[1].updatedAt, '2026-08-26T11:00:00.000Z'); assert.equal(data.settings.hourlyRatePence,1234);
});
test('pending durable save blocks duplicate repair and does not report success early', async () => {
  const {data, original, updated} = fixture(); const repair=createHistoricalRepair(); let release!: (value:{status:'persisted'})=>void; let settled=false;
  const commit: HistoricalRepairCommit = async updater => { updater(structuredClone(data)); return new Promise(resolve=>{release=resolve;}); };
  const pending=repair({updated,original,readLatest:()=>data,commit}).then(result=>{settled=true; return result;});
  assert.equal(settled,false); assert.equal((await repair({updated,original,readLatest:()=>data,commit})).ok,false);
  release({status:'persisted'}); assert.deepEqual(await pending,{ok:true});
});
test('same-shift stale editor or commit-time change is rejected without overwriting',async()=>{
  const {data,original,updated}=fixture(); const repair=createHistoricalRepair();
  const commit=memoryCommit(()=>data,next=>{Object.assign(data,next);}); data.shifts[0].updatedAt='2026-08-25T12:00:00.000Z';
  assert.equal((await repair({updated,original,readLatest:()=>data,commit})).ok,false); assert.equal(data.shifts[0].updatedAt,'2026-08-25T12:00:00.000Z');
  data.shifts[0]=structuredClone(original);
  const concurrent:HistoricalRepairCommit=async updater=>{data.shifts[0].updatedAt='2026-08-25T13:00:00.000Z'; return updater(structuredClone(data))===false?{status:'rejected'}:{status:'persisted'};};
  assert.equal((await repair({updated,original,readLatest:()=>data,commit:concurrent})).ok,false);
});
test('invalid repair is rejected before applying',async()=>{
 const {data,original,updated}=fixture(); updated.clockIn='invalid';
 const result=await createHistoricalRepair()({updated,original,readLatest:()=>data,commit:memoryCommit(()=>data,next=>{Object.assign(data,next);})});
 assert.equal(result.ok,false); assert.equal(data.shifts[0].clockIn,original.clockIn);
});
for(const outcome of ['rejected','failed','throw'] as const) test(`${outcome} durable outcome never reports repair success`,async()=>{
 const {data,original,updated}=fixture(); const commit:HistoricalRepairCommit=async()=>{if(outcome==='throw')throw new Error('Quota exceeded'); return outcome==='failed'?{status:'failed',error:new Error('Revision conflict')}:{status:'rejected'};};
 const result=await createHistoricalRepair()({updated,original,readLatest:()=>data,commit}); assert.equal(result.ok,false); if(!result.ok)assert.ok(result.message);
});
test('IndexedDB durable success survives reload and quota failure keeps original persisted repair',async()=>{
 let {data,original,updated}=fixture(); const options={factory:new IDBFactory(),databaseName:'historical-repair-test'};
 await loadIndexedDbData(options); await saveIndexedDbData(data,options);
 const commit:HistoricalRepairCommit=async updater=>{const draft=structuredClone(data); if(updater(draft)===false)return {status:'rejected'}; data=draft; try{await saveIndexedDbData(data,options);return {status:'persisted'};}catch(error){return {status:'failed',error};}};
 const repair=createHistoricalRepair(); assert.deepEqual(await repair({updated,original,readLatest:()=>data,commit}),{ok:true});
 const reloaded = await loadIndexedDbData(options); assert.notEqual(reloaded.status,'failed'); if(reloaded.status !== 'failed') assert.equal(reloaded.data.shifts.find(shift=>shift.id===original.id)?.updatedAt,'2026-08-25T11:00:00.000Z');
 original=structuredClone(updated); updated=structuredClone(updated); updated.updatedAt='2026-08-25T14:00:00.000Z';
 const put=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(){throw new DOMException('Quota exceeded','QuotaExceededError');};
 try{assert.equal((await repair({updated,original,readLatest:()=>data,commit})).ok,false);}finally{IDBObjectStore.prototype.put=put;}
 assert.equal(data.shifts[0].updatedAt,'2026-08-25T14:00:00.000Z'); const failedReload = await loadIndexedDbData(options); assert.notEqual(failedReload.status,'failed'); if(failedReload.status !== 'failed') assert.equal(failedReload.data.shifts.find(shift=>shift.id===original.id)?.updatedAt,'2026-08-25T11:00:00.000Z'); resetIndexedDbSessionForTests(options.databaseName);
});

test('same editor retries failed optimistic repair durably without duplicating the repair', async () => {
  const {original,updated,data:initialData}=fixture(); let data=initialData;
  updated.breaks.push({id:'review-break',start:'2026-08-25T10:05:00.000Z',end:'2026-08-25T10:10:00.000Z'});
  const options={factory:new IDBFactory(),databaseName:'historical-repair-retry-test'};
  await loadIndexedDbData(options); await saveIndexedDbData(data,options);
  let fail=true;
  const commit:HistoricalRepairCommit=async updater=>{const draft=structuredClone(data);if(updater(draft)===false)return {status:'rejected'};data=draft;if(fail)return {status:'failed',error:new DOMException('Quota exceeded','QuotaExceededError')};await saveIndexedDbData(data,options);return {status:'persisted'};};
  const repair=createHistoricalRepair();
  assert.equal((await repair({updated,original,readLatest:()=>data,commit})).ok,false);
  fail=false;
  assert.deepEqual(await repair({updated,original,readLatest:()=>data,commit}),{ok:true});
  const reloaded=await loadIndexedDbData(options);assert.notEqual(reloaded.status,'failed');
  if(reloaded.status!=='failed')assert.equal(reloaded.data.shifts.find(shift=>shift.id===original.id)?.breaks.filter(item=>item.id==='review-break').length,1);
  resetIndexedDbSessionForTests(options.databaseName);
});

test('another edit after optimistic repair failure prevents stale editor retry',async()=>{
  const {original,updated,data:initialData}=fixture(); let data=initialData; const repair=createHistoricalRepair();
  const commit:HistoricalRepairCommit=async updater=>{const draft=structuredClone(data);if(updater(draft)===false)return {status:'rejected'};data=draft;return {status:'failed',error:new Error('quota')};};
  assert.equal((await repair({updated,original,readLatest:()=>data,commit})).ok,false);
  data.shifts[0].updatedAt='2026-08-25T15:00:00.000Z';
  assert.equal((await repair({updated,original,readLatest:()=>data,commit})).ok,false);
  assert.equal(data.shifts[0].updatedAt,'2026-08-25T15:00:00.000Z');
});
