import test from 'node:test';import assert from 'node:assert/strict';
import { phase3SaveLabel,phase3ReturnStatus,phase3ReviewItems } from '../lib/phase3Status.ts';
import { emptyData,createShift,type ActivityRecord } from '../lib/domain.ts';
test('local save states remain truthful and independent of GPS/cloud',()=>{
 assert.match(phase3SaveLabel({status:'saving',pending:1,savedAt:null}),/pending/);assert.match(phase3SaveLabel({status:'failed',pending:0,savedAt:null}),/only be in memory/);assert.equal(phase3SaveLabel({status:'saved',pending:0,savedAt:'2026-10-13T10:00:00Z'}),'Saved on phone');
});
test('operational return with GPS gap never displays a fabricated crossing',()=>{
 const a:ActivityRecord={id:'a',shiftId:'s',type:'single_delivery',start:'2026-10-13T10:00:00Z',end:null,storeExitObserved:true,storeExitAt:'2026-10-13T10:01:00Z',storeEntryUnobserved:true,storeReturnConfirmedAt:'2026-10-13T10:20:00Z',customerEvents:[{source:'manual_delivered',timestamp:'2026-10-13T10:15:00Z',pointIndex:0,latitude:0,longitude:0,accuracy:5}]};
 const before=JSON.stringify(a),status=phase3ReturnStatus(a)!;assert.equal(status.label,'Back at store confirmed');assert.match(status.exact,/unavailable — GPS gap/);assert.match(status.evidence,/not an observed crossing/);assert.equal(JSON.stringify(a),before);
});
test('management blocked is not unfinished/completed work; review ratings remain optional',()=>{
 const d=emptyData(),s=createShift(d.settings,new Date('2026-10-13T10:00:00Z'));s.taskSnapshot!.forEach(t=>{t.managementBlockedAt='2026-10-13T10:01:00Z';});
 const before=JSON.stringify(s),items=phase3ReviewItems(s,new Date('2026-10-13T10:30:00Z'));assert.equal(items.some(i=>/task outcome/.test(i.label)),false);assert.equal(items.filter(i=>i.kind==='Optional review').length,2);assert.equal(JSON.stringify(s),before);
});
