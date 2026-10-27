import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createShift, emptyData, deliverySummary, deliveryGeofenceDurations, deliveryGeofenceTimingsForShift, gpsRouteMilesTenths, hustleAnalyticsShifts, trackedActivityTotals, setBadDelivery, setDeliveryRunCountWithIntegrity } from '../lib/domain.ts';
import { createBackupDocument, validateBackupDocument, validateAppDataStructure } from '../lib/backup.ts';
import { loadIndexedDbData, saveIndexedDbData, resetIndexedDbSessionForTests } from '../lib/indexedDbStorage.ts';
function fixture(type: 'single' | 'double' = 'single') {
  const data = emptyData();
  const shift = createShift(data.settings, new Date('2026-09-24T10:00:00Z'));
  shift.activities = [{ id:'run',shiftId:shift.id,type:type === 'single' ? 'single_delivery':'double_delivery',start:'2026-09-24T10:05:00Z',end:'2026-09-24T10:35:00Z',deliveryEventId:'event',customerDeliveries:type === 'single'?1:2,storeExitAt:'2026-09-24T10:06:00Z',storeEntryAt:'2026-09-24T10:34:00Z',storeExitObserved:true,storeEntryObserved:true,routeEvidence:{status:'complete',startedAt:'2026-09-24T10:05:00Z',completedAt:'2026-09-24T10:35:00Z',recordedPointCount:0,distanceMetres:1609.344,points:[],gaps:[],issues:[],detail:'standard',retention:'90',expiresAt:null}}];
  shift.deliveries=[{id:'event',activityId:'run',type,timestamp:'2026-09-24T10:05:00Z',reimbursementPence:type==='single'?100:150}];
  data.shifts=[shift];
  return {data,shift,run:shift.activities[0]};
}
for (const type of ['single','double'] as const) test(`${type}: bad delivery keeps money/history and reversibly excludes GPS and both Hustle sources`, () => {
  const {shift,run}=fixture(type); const before=structuredClone(run); const money=deliverySummary(shift);
  assert.equal(gpsRouteMilesTenths(shift),10);
  assert.equal(setBadDelivery(shift,run.id,true),true);
  assert.deepEqual(deliverySummary(shift),money);
  assert.deepEqual(run.routeEvidence,before.routeEvidence);
  assert.equal(run.start,before.start); assert.equal(run.end,before.end);
  for (const source of ['real','dominos'] as const) {
    assert.deepEqual(deliveryGeofenceDurations(run,source),{totalMs:null,preDepartureMs:null,hustleMs:null,returnDelayMs:null});
    assert.equal(deliveryGeofenceTimingsForShift(shift,source).length,0);
  }
  assert.equal(gpsRouteMilesTenths(shift),null);
  assert.equal(trackedActivityTotals(shift).deliveryMs,0);
  for(const includeBeta of [false,true]) assert.equal(hustleAnalyticsShifts([shift],includeBeta)[0].activities?.length,0);
  assert.equal(setBadDelivery(shift,run.id,false),true);
  assert.equal(gpsRouteMilesTenths(shift),10);
  assert.equal(deliveryGeofenceDurations(run).totalMs,1800000);
});
test('active run can be marked and repeated marks preserve events',()=>{
  const {shift,run}=fixture(); run.end=null;
  assert.equal(setBadDelivery(shift,run.id,true),true);
  setBadDelivery(shift,run.id,true);
  assert.equal(shift.deliveries.length,1); assert.equal(run.end,null);
  assert.equal(setBadDelivery(shift,'missing',true),false);
});
test('backup validation is strict and flag survives save/reload',async()=>{
  const {data,shift,run}=fixture(); setBadDelivery(shift,run.id,true);
  const backup=validateBackupDocument(createBackupDocument(data,'2.1.214'));
  assert.equal(backup.ok,true);
  if(backup.ok) assert.equal(backup.data.shifts[0].activities?.[0].badDelivery,true);
  const ctx={factory:new IDBFactory(),databaseName:'bad-delivery',localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}};
  await loadIndexedDbData(ctx); await saveIndexedDbData(data,ctx); resetIndexedDbSessionForTests(ctx.databaseName);
  const loaded=await loadIndexedDbData(ctx); assert.ok('data' in loaded);
  assert.equal(loaded.data.shifts[0].activities?.[0].badDelivery,true);
  assert.deepEqual(deliverySummary(loaded.data.shifts[0]),deliverySummary(shift));
  (run as unknown as { badDelivery: unknown }).badDelivery='true'; assert.equal(validateAppDataStructure(data).ok,false);
});
test('missing run count correction adds money without fabricated GPS or timing',()=>{
  const {shift}=fixture(); const before=structuredClone(shift.activities);
  assert.equal(setDeliveryRunCountWithIntegrity(shift,'single',3).ok,true);
  assert.equal(deliverySummary(shift).singles,3);
  assert.equal(deliverySummary(shift).reimbursementPence,300);
  assert.deepEqual(shift.activities,before);
});

import { liveWorkMilesTenths } from '../lib/domain.ts';
import { buildFrozenSharedReport } from '../lib/sharedReports.ts';
import { readFileSync } from 'node:fs';
test('excluding an old GPS baseline run does not swallow later good mileage',()=>{
  const {shift,run}=fixture();
  shift.mileage={method:'direct',directTenths:100,startTenths:null,endTenths:null,gpsBaselineTenths:10};
  setBadDelivery(shift,run.id,true);
  const good=structuredClone(run); good.id='good';good.badDelivery=false;good.start='2026-09-24T11:00:00Z'; good.end='2026-09-24T11:30:00Z';shift.activities!.push(good);
  assert.equal(liveWorkMilesTenths(shift),110);
  setBadDelivery(shift,good.id,true);
  assert.equal(liveWorkMilesTenths(shift),100);
  setBadDelivery(shift,good.id,false);
  assert.equal(liveWorkMilesTenths(shift),110);
  shift.mileage.gpsBaselineTenths=15;
  assert.equal(liveWorkMilesTenths(shift),105);
  assert.equal(shift.mileage.directTenths,100);
});
test('shared reports keep the money/count but omit excluded routes/customer samples',()=>{
  const {data,shift,run}=fixture();shift.clockOut='2026-09-24T12:00:00Z';shift.status='completed';
  run.customerEvents=[{timestamp:'2026-09-24T10:20:00Z',source:'manual_delivered',pointIndex:0,latitude:53,longitude:-2,accuracy:5}];
  setBadDelivery(shift,run.id,true);
  const report=buildFrozenSharedReport(data,[shift],'full');
  assert.equal(report.metrics.find(item=>item.label==='Deliveries')?.value,'1');
  assert.equal(report.metrics.find(item=>item.label==='Fuel reimbursement')?.value,'£1.00');
  assert.equal(report.metrics.find(item=>item.label==='Average customer leg')?.value,'Not available');
  assert.equal(report.routes.length,0);
});
test('historical exclusion is on retained delivery rows, never Stock Runs; live Hustle suppresses excluded fallback timers',()=>{
  const source=readFileSync(new URL('../components/ShiftTrackerApp.tsx',import.meta.url),'utf8');
  const stock=source.slice(source.indexOf('{stockRunActivities.map'),source.indexOf('{recordedDeliveryActivities.map'));
  const recorded=source.slice(source.indexOf('{recordedDeliveryActivities.map'));
  assert.doesNotMatch(stock,/bad-delivery-control/);
  assert.match(recorded,/setBadDelivery\(value, activity.id, excluded\)/);
  assert.match(source,/if \(latest\?\.badDelivery && legacy\) return/);
  assert.match(source,/hidden=\{latest\?\.badDelivery && !legacy\}/);
});
