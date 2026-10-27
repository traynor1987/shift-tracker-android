import { IDBFactory } from 'fake-indexeddb';
import { createShift, emptyData, repairShiftActivityIds } from '../lib/domain.ts';
import { loadIndexedDbData, saveIndexedDbData } from '../lib/indexedDbStorage.ts';
import { validateAppDataStructure } from '../lib/backup.ts';
import { writeFileSync } from 'node:fs';
const results=[];
for (const [name, shifts, points] of [['normal',10,100],['long-route',10,5000],['large-history',150,500]] as const) {
 const data=emptyData();
 for(let s=0;s<shifts;s++) {
  const shift=repairShiftActivityIds(createShift(data.settings,new Date('2026-08-25T10:00:00Z'))); shift.id=`s${s}`;
  shift.activities?.forEach(a=>{a.shiftId=shift.id;a.id=`${s}-${a.id}`;});
  shift.activities!.push({id:`route${s}`,shiftId:shift.id,type:'single_delivery',start:shift.clockIn,end:null,customerDeliveries:1, routeEvidence:{status:'recording',startedAt:shift.clockIn,completedAt:null,recordedPointCount:points,distanceMetres:500,gaps:[],issues:[],stops:[],detail:'standard',retention:'90',expiresAt:null,points:Array.from({length:points},(_,i)=>({latitude:53+i/100000,longitude:-2,timestamp:new Date(1787652000000+i*1000).toISOString(),accuracy:7,speed:4,heading:90}))}});
  data.shifts.push(shift);
 }
 const ctx={factory:new IDBFactory(),databaseName:`bench-${name}`,localStorage:null,now:new Date('2026-09-29T10:00:00Z'),recovery:false};
 await loadIndexedDbData(ctx); await saveIndexedDbData(data,ctx);
 const samples=[];
 for(let i=0;i<5;i++) { const evidence=data.shifts.at(-1)!.activities!.at(-1)!.routeEvidence!; evidence.points.push({...evidence.points.at(-1)!,timestamp:new Date(1787652000000+(points+i)*1000).toISOString()});evidence.recordedPointCount++;
 const start=performance.now(); await saveIndexedDbData(data,ctx); samples.push(performance.now()-start); }
 const timed=(fn:()=>unknown)=>{const start=performance.now();fn();return performance.now()-start;};
 results.push({name,shifts,points,samplesMs:samples,meanMs:samples.reduce((a,b)=>a+b)/samples.length,cloneMs:timed(()=>structuredClone(data)),serializationMs:timed(()=>JSON.stringify(data)),validationMs:timed(()=>validateAppDataStructure(data,{enforceRelationships:false})),comparisonMs:timed(()=>JSON.stringify(data)===JSON.stringify(data))});
}
const report={node:process.version,at:new Date().toISOString(),results};
writeFileSync(process.argv[2]??'/tmp/persistence-benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
