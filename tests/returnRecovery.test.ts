import { returnEligibility } from "../lib/returnEligibility.ts";
import { traceReturn } from "../lib/returnDiagnostics.ts";
import assert from 'node:assert/strict';
import test from 'node:test';
import * as domain from '../lib/domain.ts';
import { realGeofenceDefinitionForSettings, maghullGeofenceVerified } from '../lib/storeProfiles.ts';
import { automaticReturnCompletionAt } from '../lib/taskTiming.ts';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { IDBFactory } from 'fake-indexeddb';
import { loadDataSafely, saveData, resetStorageSessionForTests, transferredDeliveryResumePresence } from '../lib/storage.ts';
import { validateAppDataStructure } from '../lib/backup.ts';
import * as restore from '../lib/restoreTracking.ts';

const t = Date.parse('2026-10-13T10:00:00Z');
const fence: domain.GeofenceDefinition = { id:'real', label:'Real', latitude:0, longitude:0, radius:35 };
const point = (seconds:number, accuracy=5, metres=0): domain.DeliveryRoutePoint => ({latitude:0,longitude:metres/111_320,accuracy,timestamp:new Date(t+seconds*1000).toISOString()});
const outside = () => ({...domain.initialGeofenceEvaluatorState('outside',t),exitAt:new Date(t-300_000).toISOString()});

test('two-fix return confirmation preserves the gap before its first candidate', () => {
  const first = domain.evaluateGeofenceSample(outside(),fence,point(120,40));
  const second = domain.evaluateGeofenceSample(first.state,fence,point(122,40));
  assert.equal(second.transition?.observed,false);
  assert.equal(second.transition?.timestamp,point(120).timestamp);
});

test('pending candidate from before a long gap cannot be reused as the return time', () => {
  const first = domain.evaluateGeofenceSample(outside(),fence,point(10,40));
  const second = domain.evaluateGeofenceSample(first.state,fence,point(120,40));
  assert.equal(second.transition,null);
  const third = domain.evaluateGeofenceSample(second.state,fence,point(122,40));
  assert.equal(third.transition?.observed,false);
  assert.equal(third.transition?.timestamp,point(120).timestamp);
});

test('gap return can finish from confirmed presence without fabricating a Hustle entry', () => {
  const api = domain as unknown as {recordStoreReturnPresence?: (activity:domain.ActivityRecord,state:domain.GeofenceEvaluatorState,sample:domain.DeliveryRoutePoint,definition:domain.GeofenceDefinition)=>boolean; confirmedStoreReturnAt?: (activity:domain.ActivityRecord)=>string|null};
  assert.equal(typeof api.recordStoreReturnPresence,'function');
  assert.equal(typeof api.confirmedStoreReturnAt,'function');
  const activity = {id:'run',shiftId:'shift',type:'single_delivery',start:new Date(t-400_000).toISOString(),end:null,storeExitAt:outside().exitAt,storeExitObserved:true,customerEvents:[{source:'manual_delivered',timestamp:new Date(t-10_000).toISOString()}]} as domain.ActivityRecord;
  const sample=point(120);
  const result=domain.evaluateGeofenceSample(outside(),fence,sample);
  domain.applyRealGeofenceTransition(activity,result.transition!);
  assert.equal(api.recordStoreReturnPresence!(activity,result.state,sample,fence),true);
  assert.equal(activity.storeEntryAt,undefined);
  assert.equal(domain.hasConfirmedStoreReturn(activity),false);
  const recovered=JSON.parse(JSON.stringify(activity)) as domain.ActivityRecord;
  assert.equal(api.confirmedStoreReturnAt!(recovered),sample.timestamp);
  assert.equal(automaticReturnCompletionAt(recovered,t+600_000,api.confirmedStoreReturnAt!(recovered)!,60_000),point(180).timestamp);
  assert.equal(domain.deliveryGeofenceDurations(recovered).hustleMs,null);
  assert.equal(api.recordStoreReturnPresence!(activity,result.state,point(122),fence),false);
});

test('return presence ignores uncertain, out-of-boundary and pre-customer fixes', () => {
  const api=domain as unknown as {recordStoreReturnPresence?: (activity:domain.ActivityRecord,state:domain.GeofenceEvaluatorState,sample:domain.DeliveryRoutePoint,definition:domain.GeofenceDefinition)=>boolean};
  assert.equal(typeof api.recordStoreReturnPresence,'function');
  const activity={id:'run',shiftId:'shift',type:'single_delivery',start:new Date(t-400_000).toISOString(),end:null,storeExitAt:outside().exitAt,storeExitObserved:true,customerEvents:[{source:'manual_delivered',timestamp:point(121).timestamp}]} as domain.ActivityRecord;
  const state=domain.initialGeofenceEvaluatorState('inside',t+120_000);
  assert.equal(api.recordStoreReturnPresence!(activity,state,point(120),fence),false);
  assert.equal(api.recordStoreReturnPresence!(activity,state,point(122,70),fence),false);
  assert.equal(api.recordStoreReturnPresence!(activity,state,point(122,5,40),fence),false);
});

test('an older inside fix rejected by the evaluator cannot supply operational return evidence', () => {
  const activity={id:'run',shiftId:'shift',type:'single_delivery',start:new Date(t-400_000).toISOString(),end:null,storeExitAt:outside().exitAt,storeExitObserved:true,customerEvents:[{source:'manual_delivered',timestamp:new Date(t-10_000).toISOString()}]} as domain.ActivityRecord;
  const state=domain.initialGeofenceEvaluatorState('inside',t+150_000);
  const sample=point(120);
  const rejected=domain.evaluateGeofenceSample(state,fence,sample);
  assert.equal(domain.recordStoreReturnPresence(activity,rejected.state,sample,fence),false);
  assert.equal(activity.storeReturnConfirmedAt,undefined);
});

test('actual completion handler finishes recovered presence with unavailable crossing time', async () => {
  const source=readFileSync(new URL('../components/ShiftTrackerApp.tsx',import.meta.url),'utf8');
  const ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let body='';
  const visit=(node:ts.Node)=>{if(ts.isFunctionDeclaration(node)&&node.name?.text==='finishDelivery')body=node.getText(ast);ts.forEachChild(node,visit);};visit(ast);
  assert.ok(body);
  const activity={id:'run',shiftId:'shift',type:'single_delivery',start:new Date(t-400_000).toISOString(),end:null,storeExitAt:outside().exitAt,storeExitObserved:true,storeEntryUnobserved:true,storeReturnConfirmedAt:point(120).timestamp,customerEvents:[{source:'manual_delivered',timestamp:new Date(t-10_000).toISOString()}]} as domain.ActivityRecord;
  const shift={id:'shift',activities:[activity]};
  const messages:string[]=[];
  class TestDate extends Date { static now() { return t+600_000; } }
  const context=vm.createContext({traceReturn,returnEligibility,active:shift,data:{settings:{}},lastCommittedDataRef:{current:{settings:{}}},Date:TestDate,structuredClone,
    deliveryCustomersComplete:domain.deliveryCustomersComplete,hasConfirmedStoreReturn:domain.hasConfirmedStoreReturn,
    confirmedStoreReturnAt:domain.confirmedStoreReturnAt,automaticReturnCompletionAt,
    storePresenceProofStatus:()=>({required:false,confirmed:true}),storeProofFix:null,
    locationState:{status:'searching',presence:'unknown'},locationAllowsDeliveryCompletion:domain.locationAllowsDeliveryCompletion,
    finaliseDeliveryActivity:domain.finaliseDeliveryActivity,recordRealHustleExitMetrics:domain.recordRealHustleExitMetrics,
    customerStopDurationMs:()=>0,notify:(message:string)=>messages.push(message),timeFormat:new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit'}),formatTimingDuration:()=> '1m'});
  activity.locationAssistEnabled=true;
  vm.runInContext(ts.transpileModule(`globalThis.run=(${body});`,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.None}}).outputText,context);
  const commit=async(update:(draft:unknown)=>void)=>{update({shifts:[shift],settings:{}});return {status:'persisted'};};
  await context.run(false,{entryAt:point(120).timestamp,allowanceMs:60_000},undefined,commit);
  assert.deepEqual(messages,[]);
  assert.equal(activity.end,point(180).timestamp);
  assert.equal(activity.storeEntryAt,undefined);
  assert.match(activity.notes!,/crossing time unavailable/);
});

test('confirmed presence survives canonical save and reload and malformed backup evidence is rejected', async () => {
  const options={factory:new IDBFactory(),localStorage:null,databaseName:'return-recovery'};
  await loadDataSafely(options);
  const data=domain.emptyData();
  const shift=domain.repairShiftActivityIds(domain.createShift(data.settings,new Date(t-400_000)));
  const activity:domain.ActivityRecord={id:'return-run',shiftId:shift.id,type:'single_delivery',start:new Date(t-400_000).toISOString(),end:null,storeExitAt:outside().exitAt,storeExitObserved:true,storeEntryUnobserved:true,storeReturnConfirmedAt:point(120).timestamp,customerEvents:[{source:'manual_delivered',timestamp:new Date(t-10_000).toISOString(),pointIndex:0,latitude:0,longitude:0,accuracy:5}]};
  shift.activities!.push(activity); data.shifts.push(shift);
  assert.equal(validateAppDataStructure(data).ok,true);
  await saveData(data,options); resetStorageSessionForTests(options.databaseName);
  const reloaded=await loadDataSafely(options);
  assert.notEqual(reloaded.status,'failed');
  if(reloaded.status==='failed')return;
  const saved=reloaded.data.shifts[0].activities!.find(item=>item.id===activity.id)!;
  assert.equal(domain.confirmedStoreReturnAt(saved),point(120).timestamp);
  assert.equal(saved.storeEntryAt,undefined);
  const invalid=structuredClone(data);invalid.shifts[0].activities!.find(item=>item.id===activity.id)!.storeReturnConfirmedAt='invalid';
  assert.equal(validateAppDataStructure(invalid).ok,false);
});

test('actual GPS ingestion recovers a closed-page return from the retained native fix', async () => {
  const source=readFileSync(new URL('../components/ShiftTrackerApp.tsx',import.meta.url),'utf8');
  const ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let body=''; const visit=(node:ts.Node)=>{if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='applyLocationReading')body=node.initializer!.getText(ast);ts.forEachChild(node,visit);};visit(ast);assert.ok(body);
  const data=domain.emptyData();
  const shift=domain.repairShiftActivityIds(domain.createShift(data.settings,new Date(t-400_000)));
  const activity:domain.ActivityRecord={id:'closed-run',shiftId:shift.id,type:'single_delivery',start:new Date(t-400_000).toISOString(),end:null,locationAssistEnabled:true,storeExitAt:outside().exitAt,storeExitObserved:true,customerEvents:[{source:'manual_delivered',timestamp:new Date(t-10_000).toISOString(),pointIndex:0,latitude:0,longitude:0,accuracy:5}]};
  shift.activities!.push(activity);data.shifts.push(shift);
  const realRef={current:domain.initialGeofenceEvaluatorState()};
  const realFence={...fence,latitude:53.56845,longitude:-2.88802};
  activity.routeEvidence={status:'partial',startedAt:activity.start,completedAt:null,points:[{...point(120,40),latitude:realFence.latitude,longitude:realFence.longitude}],recordedPointCount:1,distanceMetres:0,gaps:[],issues:[],detail:'standard',retention:'90',expiresAt:null};
  class TestDate extends Date { static now(){return t+600_000;} }
  const context=vm.createContext({traceReturn,returnEligibility,realGeofenceDefinitionForSettings,maghullGeofenceVerified,...domain,...restore,transferredDeliveryResumePresence,Date:TestDate,data,lastCommittedDataRef:{current:data},performance,
    nativeUnpersistedSampleIdsRef:{current:new Set()},carryoutDepartureStateRef:{current:{}},
    latestBrowserProviderFixRef:{current:null},lastOperationalSampleRef:{current:0},
    realGeofenceOwnerRef:{current:null},realGeofenceStateRef:realRef,
    dominosGeofenceStateRef:{current:domain.initialGeofenceEvaluatorState()},lastLocationSampleAtRef:{current:0},
    setRealGeofenceEvaluatorState:(state:domain.GeofenceEvaluatorState)=>{realRef.current=state;},
    setLocationState:()=>undefined,setStoreProofFix:()=>undefined,setCarryoutZoneStatus:()=>undefined,
    appendDeveloperLog:()=>undefined,getDeveloperSettings:()=>({includeSampleMetadata:false}),
    isFreshOperationalSample:()=>false,REAL_GEOFENCE_DEFINITION:realFence,
    playGeofenceTone:()=>undefined,showNativeGeofenceAlert:()=>undefined,navigator:{},makeId:()=> 'return-marker',
    commit:async(update:(draft:domain.AppData)=>void)=>{update(data);return {status:'persisted'};}});
  vm.runInContext(ts.transpileModule(`globalThis.run=(${body});`,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.None}}).outputText,context);
  const result=await context.run({coords:{latitude:realFence.latitude,longitude:realFence.longitude,accuracy:5},timestamp:t+125_000},activity.id,'retained-fix');
  assert.equal(result.status,'persisted');
  assert.equal(activity.storeEntryUnobserved,true);
  assert.equal(activity.storeEntryAt,undefined);
  assert.equal(domain.confirmedStoreReturnAt(activity),point(125).timestamp);
});

test('recovery continuity ignores retained fixes rejected for geofence accuracy', () => {
  const api=domain as unknown as {realGeofenceRecoveryTimestamp?:(activity:domain.ActivityRecord)=>number};
  assert.equal(typeof api.realGeofenceRecoveryTimestamp,'function');
  const activity={start:new Date(t-400_000).toISOString(),storeExitAt:new Date(t).toISOString(),storeExitObserved:true,routeEvidence:{points:[point(0,5,100),point(120,100,100)]}} as domain.ActivityRecord;
  const state={...domain.initialGeofenceEvaluatorState('outside',api.realGeofenceRecoveryTimestamp!(activity)),exitAt:activity.storeExitAt ?? null};
  assert.equal(domain.evaluateGeofenceSample(state,fence,point(125)).transition?.observed,false);
});

test('fresh inside confirmation replaces evidence invalidated by undo and re-Delivered', () => {
  const activity={id:'run',shiftId:'shift',type:'single_delivery',start:new Date(t-400_000).toISOString(),end:null,storeExitAt:outside().exitAt,storeExitObserved:true,storeReturnConfirmedAt:point(120).timestamp,customerEvents:[{source:'manual_delivered',timestamp:point(130).timestamp}]} as domain.ActivityRecord;
  assert.equal(domain.confirmedStoreReturnAt(activity),null);
  const state=domain.initialGeofenceEvaluatorState('inside',t+140_000);
  assert.equal(domain.recordStoreReturnPresence(activity,state,point(140),fence),true);
  assert.equal(domain.confirmedStoreReturnAt(activity),point(140).timestamp);
});

test('exact entry before Delivered cannot mask valid later operational confirmation', () => {
  const activity={id:'run',shiftId:'shift',type:'single_delivery',start:new Date(t-400_000).toISOString(),end:null,storeExitAt:outside().exitAt,storeExitObserved:true,storeEntryAt:point(120).timestamp,storeEntryObserved:true,storeReturnConfirmedAt:point(140).timestamp,customerEvents:[{source:'manual_delivered',timestamp:point(130).timestamp}]} as domain.ActivityRecord;
  assert.equal(domain.confirmedStoreReturnAt(activity),point(140).timestamp);
  assert.equal(activity.storeEntryAt,point(120).timestamp);
});
