import { IDBFactory } from 'fake-indexeddb';
import { createShift, emptyData, repairShiftActivityIds } from '../lib/domain.ts';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const storage = await import(process.argv[2] ?? '../lib/indexedDbStorage.ts') as typeof import('../lib/indexedDbStorage.ts');
let data = emptyData();
const shift = repairShiftActivityIds(createShift(data.settings, new Date('2026-08-25T10:00:00Z')));
shift.activities!.push({ id:'replay-route',shiftId:shift.id,type:'single_delivery',start:shift.clockIn,end:null,customerDeliveries:1,routeEvidence:{status:'recording',startedAt:shift.clockIn,completedAt:null,recordedPointCount:0,distanceMetres:0,gaps:[],issues:[],stops:[],detail:'standard',retention:'90',expiresAt:null,points:[]} });data.shifts.push(shift);
const ctx={factory:new IDBFactory(),databaseName:'replay',localStorage:null,now:new Date('2026-09-29T10:00:00Z')};
await storage.loadIndexedDbData(ctx);await storage.saveIndexedDbData(data,ctx);
const samples:number[]=[];let interruptedDurablePoints=0;
for(let i=0;i<180;i++) {
 const evidence=data.shifts[0].activities!.at(-1)!.routeEvidence!;
 evidence.points.push({latitude:53+i/100000,longitude:-2,timestamp:new Date(ctx.now.getTime()).toISOString(),accuracy:7,speed:4,heading:90});evidence.recordedPointCount++;
 ctx.now=new Date(ctx.now.getTime()+10_000);
 if(i===90) {
  await assert.rejects(storage.saveIndexedDbData(data,{...ctx,testHooks:{failWrite:true}}));
  storage.resetIndexedDbSessionForTests(ctx.databaseName);
  const restarted=await storage.loadIndexedDbData(ctx);assert.notEqual(restarted.status,'failed');
  if(restarted.status==='failed')throw new Error(restarted.reason);
  interruptedDurablePoints=restarted.data.shifts[0].activities!.at(-1)!.routeEvidence!.points.length;
  assert.equal(interruptedDurablePoints,90);data=restarted.data;
  continue;
 }
 const started=performance.now();await storage.saveIndexedDbData(data,ctx);samples.push(performance.now()-started);
}
const reloaded=await storage.loadIndexedDbData(ctx);assert.notEqual(reloaded.status,'failed');
if(reloaded.status==='failed')throw new Error(reloaded.reason);
const durablePoints=reloaded.data.shifts[0].activities!.at(-1)!.routeEvidence!.points.length;assert.equal(durablePoints,179);
const sorted=[...samples].sort((a,b)=>a-b);
const report={node:process.version,at:new Date().toISOString(),method:'Artificial single working shift, 180 GPS samples with simulated 10-second spacing (30-minute timeline), fake-indexeddb actual storage pipeline, normal recovery cadence. No wall-clock 30-minute wait. At sample 91 injected transaction abort simulates interrupted local write; session reset/reload verifies previous 90 points retained, then resumes. No network dependency: offline local persistence behavior is exercised; does not simulate browser eviction, process kill, physical disk or cryptographic backup/export.',attemptedSamples:180,successfulSamples:samples.length,interruptedDurablePoints,finalDurablePoints:durablePoints,meanMs:samples.reduce((a,b)=>a+b)/samples.length,p95Ms:sorted[Math.floor(sorted.length*.95)],maximumMs:Math.max(...samples),samplesMs:samples};
writeFileSync(process.argv[3]??'/tmp/replay.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,samplesMs:undefined},null,2));
