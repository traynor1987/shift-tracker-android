import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, createShift, confirmedStoreReturnAt, applyRealGeofenceTransition, type ActivityRecord } from '../lib/domain.ts';
import { nativeStoreProfile, STORES } from '../lib/storeProfiles.ts';
import { returnEligibility, returnNotification } from '../lib/returnEligibility.ts';
import { TRUSTED_SHIFT_TRACKER_ORIGIN, subscribeToNativeMessages } from '../lib/nativeBridge.ts';
import { readNativeReturnEvent, reconcileNativeReturnEvent, persistNativeReturnEvent, acknowledgeNativeReturnEvent, requestNativeDeliveryDrain, type NativeReturnEvent } from '../lib/nativeReturnEvidence.ts';

import { validateAppDataStructure } from '../lib/backup.ts';
import { IDBFactory } from 'fake-indexeddb';
import { loadDataSafely, saveData, resetStorageSessionForTests } from '../lib/storage.ts';

const t=Date.parse('2026-11-13T10:00:00Z'), iso=(n:number)=>new Date(t+n).toISOString();
function fixture() {
 const data=emptyData(); const shift=createShift(data.settings,new Date(t)); shift.id='shift';shift.storeId='ormskirk';
 const activity:ActivityRecord={id:'delivery',shiftId:shift.id,type:'single_delivery',start:iso(1000),end:null,locationAssistEnabled:true,storeExitAt:iso(2000),storeExitObserved:true,customerEvents:[{source:'manual_delivered',timestamp:iso(60000),pointIndex:0,latitude:0,longitude:0,accuracy:5}]};
 shift.activities=[activity];data.shifts=[shift];const profile=nativeStoreProfile(data.settings,'ormskirk');
 const event:NativeReturnEvent={eventId:'return-1',kind:'returned' as const,shiftId:shift.id,deliveryId:activity.id,storeId:'ormskirk' as const,storeRevision:profile.revision,storeIdentity:`ormskirk|${profile.latitude}|${profile.longitude}|${profile.radius}.0|true|${profile.revision}`,generation:1,timestampEpochMs:t+120000,observedAtEpochMs:t+118000,exitAt:t+2000,entryAt:0,accuracy:5,source:'native_gps' as const,status:'pending' as const,notificationAt:t+120100};
 return {data,shift,activity,event};
}
const now=t+300000;
function shell(event:unknown,origin=TRUSTED_SHIFT_TRACKER_ORIGIN) {return {origin,data:JSON.stringify({type:'shift_tracker_shell:ready',trustedOrigin:TRUSTED_SHIFT_TRACKER_ORIGIN,bridgeVersion:1,shellVersion:'test',diagnostics:{nativeReturnEvent:event}})} as MessageEvent;}
function onOrigin(fn:()=>void) {const old=globalThis.window;Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:TRUSTED_SHIFT_TRACKER_ORIGIN}}});try{fn();}finally{Object.defineProperty(globalThis,'window',{configurable:true,value:old});}}

test('trusted ready/state diagnostics parse strict independent evidence; hostile origins/schema rejected',()=>onOrigin(()=>{
 const {event}=fixture();assert.deepEqual(readNativeReturnEvent(shell(event)),event);
 assert.equal(readNativeReturnEvent(shell(event,'https://evil.example')),null);
 for(const patch of [{generation:-1},{accuracy:66},{entryAt:'0'},{timestampEpochMs:Infinity},{status:'invented'},{source:'web'},{eventId:''},{observedAtEpochMs:0},{storeIdentity:'x'.repeat(2000)}])assert.equal(readNativeReturnEvent(shell({...event,...patch})),null);
 const state={origin:TRUSTED_SHIFT_TRACKER_ORIGIN,data:{type:'shift_tracker_location:state',status:'sample_received',diagnostics:{nativeReturnEvent:event}}} as MessageEvent;
 assert.deepEqual(readNativeReturnEvent(state),event);
}));

test('resumed native return enables canonical controls before any route replay; no mileage or completion',()=>{
 const {data,activity,event}=fixture();const route=activity.routeEvidence;
 assert.equal(reconcileNativeReturnEvent(data,event,now),'applied');
 assert.equal(confirmedStoreReturnAt(activity),iso(120000));
 assert.equal(returnEligibility(activity,{status:'searching',presence:'unknown'}).allowed,true);
 assert.equal(activity.storeEntryAt,undefined);assert.equal(activity.storeEntryObserved,undefined);assert.equal(activity.storeEntryUnobserved,true);
 assert.equal(activity.nativeReturnEvidence?.observedAtEpochMs,event.observedAtEpochMs);
 assert.equal(activity.end,null);assert.equal(activity.backAtStoreAt,undefined);assert.equal(activity.routeEvidence,route);
 assert.equal(data.shifts[0].activities?.length,1);assert.equal(returnNotification(activity,null),null);
});

test('exact entry retains first observed time and duplicate replay is idempotent',()=>{
 const {data,activity,event}=fixture();event.entryAt=event.observedAtEpochMs;
 assert.equal(reconcileNativeReturnEvent(data,event,now),'applied');const before=JSON.stringify(data);
 assert.equal(activity.storeEntryAt,iso(118000));assert.equal(confirmedStoreReturnAt(activity),iso(118000));
 assert.equal(reconcileNativeReturnEvent(data,event,now),'duplicate');assert.equal(JSON.stringify(data),before);
});

test('gap return stays canonical through replay of historical outside/inside fixes',()=>{
 const {data,activity,event}=fixture();reconcileNativeReturnEvent(data,event,now);
 applyRealGeofenceTransition(activity,{from:'inside',to:'outside',timestamp:iso(10000),observed:true});
 applyRealGeofenceTransition(activity,{from:'outside',to:'inside',timestamp:iso(110000),observed:true});
 assert.equal(confirmedStoreReturnAt(activity),iso(120000));assert.equal(activity.storeEntryAt,undefined);assert.equal(activity.end,null);
});

for(const reason of ['previous shift','previous delivery','completed','paused','Maghull unverified','wrong store revision','wrong identity','future','before Delivered','before exit','exit mismatch','double incomplete','older generation'])test(`reject ${reason} without mutating canonical state`,()=>{
 const {data,shift,activity,event}=fixture();
 if(reason==='previous shift')event.shiftId='old';if(reason==='previous delivery')event.deliveryId='old';
 if(reason==='completed')activity.end=iso(200000);if(reason==='paused')shift.status='break';
 if(reason==='Maghull unverified'){shift.storeId='maghull';event.storeId='maghull';}
 if(reason==='wrong store revision')event.storeRevision='old';if(reason==='wrong identity')event.storeIdentity=event.storeIdentity.replace('true','false');
 if(reason==='future')event.timestampEpochMs=now+6000;if(reason==='before Delivered')event.observedAtEpochMs=t+50000;
 if(reason==='before exit')event.observedAtEpochMs=t+1000;if(reason==='exit mismatch')event.exitAt=t+3000;
 if(reason==='double incomplete')activity.type='double_delivery';
 if(reason==='older generation'){reconcileNativeReturnEvent(data,event,now);event.eventId='old';event.generation=0;}
 const before=JSON.stringify(data);assert.equal(reconcileNativeReturnEvent(data,event,now),'rejected');assert.equal(JSON.stringify(data),before);
});

test('return retry after failed persistence ACKs only once a durable canonical save succeeds',async()=>{
 const {data,event}=fixture();let ack=0;let durable=false;
 const commit=async(update:(draft:typeof data)=>void|boolean)=>{if(update(data)===false)return {status:'rejected' as const};return {status:durable?'persisted' as const:'failed' as const};};
 assert.equal(await persistNativeReturnEvent(event,commit,()=>{ack++;},now),'failed');assert.equal(ack,0);
 durable=true;assert.equal(await persistNativeReturnEvent(event,commit,()=>{ack++;},now),'persisted');assert.equal(ack,1);
});

test('durable completion barrier precedes ACK and route replay while rejected events never ACK',async()=>{
 const {data,event}=fixture();const order:string[]=[];let release!:()=>void;
 const barrier=persistNativeReturnEvent(event,async update=>{update(data);order.push('canonical');await new Promise<void>(resolve=>{release=resolve;});order.push('durable');return {status:'persisted'};},()=>{order.push('ack');},now);
 const replay=barrier.then(()=>order.push('replay'));assert.deepEqual(order,['canonical']);release();await replay;
 assert.deepEqual(order,['canonical','durable','ack','replay']);
 await persistNativeReturnEvent({...event,deliveryId:'old'},async update=>({status:update(data)===false?'rejected':'persisted'}),()=>{assert.fail('must not ack stale event');},now);
});

test('ack uses exact trusted bridge and event identity',()=>onOrigin(()=>{
 const sent:string[]=[];window.ShiftTrackerNative={postMessage:value=>sent.push(value)};
 assert.equal(acknowledgeNativeReturnEvent('event-1'),true);assert.deepEqual(JSON.parse(sent[0]),{type:'shift_tracker_native_return:ack',eventId:'event-1'});
}));

test('Undo Delivered then re-Delivered accepts new qualified evidence from the same native generation',()=>{
 const {data,activity,event}=fixture();reconcileNativeReturnEvent(data,event,now);
 activity.customerEvents![0].timestamp=iso(150000);assert.equal(confirmedStoreReturnAt(activity),null);
 const renewed={...event,eventId:'return-2',timestampEpochMs:t+180000,observedAtEpochMs:t+178000,notificationAt:0};
 assert.equal(reconcileNativeReturnEvent(data,renewed,now),'applied');assert.equal(confirmedStoreReturnAt(activity),iso(180000));
 assert.equal(reconcileNativeReturnEvent(data,event,now),'rejected');
});


test('calibrated Maghull synthetic evidence is scoped to its accepted profile revision',()=>{
 const {data,shift,activity,event}=fixture();shift.storeId='maghull';
 const fix=(latitude:number)=>({latitude,longitude:STORES.maghull.longitude,accuracy:4,capturedAt:iso(-10000)});
 // Synthetic geometry only: this does not activate a real device's calibration.
 data.settings.maghullGeofence={latitude:STORES.maghull.latitude,longitude:STORES.maghull.longitude,radius:70,verifiedAt:iso(0),insideProof:fix(STORES.maghull.latitude),carParkProof:fix(STORES.maghull.latitude+.00025),outsideProof:fix(STORES.maghull.latitude+.002)};
 const profile=nativeStoreProfile(data.settings,'maghull');
 Object.assign(event,{storeId:'maghull',storeRevision:profile.revision,storeIdentity:`maghull|${profile.latitude}|${profile.longitude}|70.0|true|${profile.revision}`});
 assert.equal(reconcileNativeReturnEvent(data,event,now),'applied');assert.equal(confirmedStoreReturnAt(activity),iso(120000));
 data.settings.maghullGeofence.radius=80;
 assert.equal(reconcileNativeReturnEvent(data,event,now),'rejected');
});

test('paused shift rejects evidence and the same event can reconcile after resume',()=>{
 const {data,shift,event}=fixture();shift.status='break';assert.equal(reconcileNativeReturnEvent(data,event,now),'rejected');
 shift.status='working';assert.equal(reconcileNativeReturnEvent(data,event,now),'applied');
});

test('native marker survives durable reload and malformed imported marker is rejected',async()=>{
 const {data,activity,event}=fixture();reconcileNativeReturnEvent(data,event,now);
 const options={factory:new IDBFactory(),localStorage:null,databaseName:'independent-return'};
 await loadDataSafely(options);assert.equal(validateAppDataStructure(data).ok,true);await saveData(data,options);resetStorageSessionForTests(options.databaseName);
 const loaded=await loadDataSafely(options);assert.notEqual(loaded.status,'failed');if(loaded.status==='failed')return;
 const restored=loaded.data.shifts[0].activities!.find(item=>item.id===activity.id)!;
 assert.deepEqual(restored.nativeReturnEvidence,activity.nativeReturnEvidence);assert.equal(confirmedStoreReturnAt(restored),iso(120000));
 for(const patch of [{eventId:''},{storeRevision:''},{generation:-1},{eventId:2},{observedAtEpochMs:now+1},{notificationAt:-1},{storeId:'other'}]){
  const malformed=structuredClone(data);Object.assign(malformed.shifts[0].activities![0].nativeReturnEvidence!,patch);
  assert.equal(validateAppDataStructure(malformed).ok,false);
 }
});

for(const error of [undefined,'journal unavailable'])test(`native drain keeps main GPS subscription live and ${error?'rejects native error':'matches exact session reply'}`,async()=>{
 const old=globalThis.window;const sent:string[]=[];let samples=0;
 const bridge={postMessage:(value:string)=>sent.push(value),onmessage:null as ((event:MessageEvent)=>void)|null};
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:TRUSTED_SHIFT_TRACKER_ORIGIN},ShiftTrackerNative:bridge,addEventListener:()=>{},removeEventListener:()=>{},setTimeout,clearTimeout}});
 try {
  const unsubscribe=subscribeToNativeMessages(()=>{samples++;});
  const pending=requestNativeDeliveryDrain('shift','delivery');const request=JSON.parse(sent[0]);
  bridge.onmessage!({data:JSON.stringify({type:'shift_tracker_location:sample'})} as MessageEvent);
  assert.equal(samples,1);
  bridge.onmessage!({data:JSON.stringify({...request,type:'shift_tracker_location:drained',error})} as MessageEvent);
  assert.equal(await pending,!error);assert.equal(samples,2);
  bridge.onmessage!({data:'next GPS sample'} as MessageEvent);assert.equal(samples,3);unsubscribe();
 } finally {Object.defineProperty(globalThis,'window',{configurable:true,value:old});}
});
