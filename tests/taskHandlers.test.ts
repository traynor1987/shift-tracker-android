import { returnEligibility } from "../lib/returnEligibility.ts";
import { traceReturn } from "../lib/returnDiagnostics.ts";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as domain from '../lib/domain.ts';
import * as timing from '../lib/taskTiming.ts';
import { validateAppDataStructure, createBackupDocument, validateBackupDocument } from '../lib/backup.ts';
import { IDBFactory } from 'fake-indexeddb';
import { loadIndexedDbData, saveIndexedDbData, resetIndexedDbSessionForTests } from '../lib/indexedDbStorage.ts';

const source=readFileSync(new URL('../components/ShiftTrackerApp.tsx', import.meta.url),'utf8');
const ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function handler(name:string) {
  let expression='';
  function visit(node:ts.Node) {
    if(ts.isVariableDeclaration(node) && node.name.getText(ast)===name && node.initializer) expression=node.initializer.getText(ast);
    if(ts.isFunctionDeclaration(node) && node.name?.text===name) expression=node.getText(ast);
    ts.forEachChild(node,visit);
  }
  visit(ast); assert.ok(expression, name);
  return ts.transpileModule(`globalThis.run = (${expression});`,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.None}}).outputText;
}
function harness(options: { deferCommits?: boolean } = {}) {
  let clock=Date.parse('2026-09-24T10:10:00.500Z');
  let data=domain.emptyData();
  const shift=domain.repairShiftActivityIds(domain.createShift(data.settings,new Date('2026-09-24T10:00:00Z')));
  data.shifts=[shift];
  const task={...data.cleaningRota![0],id:'test-task',sourceTaskId:'test-source',category:'cleaning',status:'not_started',segments:[],completedAt:null,quickCompleted:false,shiftNotes:''} as domain.ShiftTaskRecord;
  shift.taskSnapshot=[task];
  data.settings.storePresenceStartProofEnabled=false;data.settings.storePresenceProofEnabled=false; data.settings.locationAssistEnabled=false;data.settings.recordDeliveryRoutes=false;
  const notices:string[]=[];
  const effects:string[]=[];
  let beforeCommit: (()=>void)|undefined;
  let deferEffects=false;
  const pendingEffects: Array<(latest:domain.AppData)=>void>=[];
  const pendingCommits: Array<()=>void>=[];
  const noop=()=>{};
  class Clock extends Date {constructor(value?:string|number){super(value ?? clock);} static now(){return clock;}}
  const sandbox:Record<string, unknown>={...domain,...timing,Date:Clock,structuredClone,console,
    lastCommittedDataRef:{get current(){return data;}},
    timeFormat:new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",hour:"2-digit",minute:"2-digit"}),CUSTOMER_WAIT_REVIEW_MS:180000,STORE_PRESENCE_RETURN_PROOF_RADIUS_METRES:10,STORE_PRESENCE_START_PROOF_DEFAULT_RADIUS_METRES:25,STORE_PRESENCE_START_PROOF_MIN_RADIUS_METRES:5,STORE_PRESENCE_START_PROOF_MAX_RADIUS_METRES:50,
    now:new Date(clock-500),storeProofFix:null,locationState:{status:'off',presence:'unknown',accuracy:null},
    deliveryTapLockRef:{current:0},nativeCanonicalSampleDeliveryRef:{current:null},transferredReturnGuardRef:{current:null},realGeofenceOwnerRef:{current:null},dominosGeofenceStateRef:{current:null},lastLocationSampleAtRef:{current:0},nativeTrackingRequestedRef:{current:false},nativeTrackingActiveRef:{current:false},
    setRealGeofenceEvaluatorState:()=>effects.push("geofence"),setLocationState:noop,notify:(s:string)=>{notices.push(s);},startNativeDeliveryTracking:()=>{effects.push("native-start");return false;},stopLocationWatch:noop,armNativeStartWatchdog:noop,
    clearGoogleAddressLookupCache:noop,clearNovaVisionCache:noop,resetEndedDeliveryCompanionPresentation:()=>effects.push("native-stop"),setCustomerWaitPrompt:noop,cleanupExpiredPhotos:()=>Promise.resolve(),refreshPhotoStorage:noop,
    nativeDeliveryId:undefined,nativeSampleId:undefined,nativeUnpersistedSampleIdsRef:{current:new Set<string>()},carryoutDepartureStateRef:{current:{deliveryId:'',autoReturning:false}},
    window:{dispatchEvent:noop},Event:class{},
  };
  Object.defineProperties(sandbox,{data:{get:()=>data},active:{get:()=>data.shifts[0]},taskEditingShift:{get:()=>data.shifts[0]}});
  sandbox.commit=(update:(draft:domain.AppData)=>void|boolean,onApplied?:(latest:domain.AppData)=>void)=>new Promise(resolve=>{
    const apply=()=>{
      const before=structuredClone(data); const intercept=beforeCommit;beforeCommit=undefined;intercept?.();
      const draft=structuredClone(data);
      try {if(update(draft)===false){resolve({status:'rejected'});return;}timing.assertTaskMutationCurrent(before,data,draft);} catch(error) {notices.push(String(error));resolve({status:'rejected'});return;}
      data=draft;
      if(onApplied){if(deferEffects)pendingEffects.push(onApplied);else onApplied(data);}
      resolve({status:'persisted'});
    };
    if(options.deferCommits)pendingCommits.push(apply);else apply();
  });
  sandbox.traceReturn=traceReturn; sandbox.returnEligibility=returnEligibility;
  const context=vm.createContext(sandbox);
  for(const name of ["storePresenceStartProofRadius","storePresenceStartProofStatus","storePresenceProofEnabled","storePresenceProofStatus"]) {vm.runInContext(handler(name),context);sandbox[name]=sandbox.run;}
  const stageLocationBatch = () => {
    const batch = source.slice(source.indexOf('    const pendingMutations:', source.indexOf('const applyLocationReading')), source.indexOf('    const latestData = lastCommittedDataRef.current;', source.indexOf('const applyLocationReading')));
    const attempt = source.slice(source.indexOf('          carryoutState.autoReturning = true;', source.indexOf('const applyLocationReading')), source.indexOf('        }\n        setCarryoutZoneStatus', source.indexOf('          carryoutState.autoReturning = true;', source.indexOf('const applyLocationReading'))));
    vm.runInContext(handler('finishDelivery'), context); sandbox.finishDelivery = sandbox.run;
    const script = ts.transpileModule(`{ ${batch} globalThis.locationPersist = persist; globalThis.flushLocationBatch = finish; globalThis.attemptCarryoutReturn = (sampleTimestamp) => { const deliveryActivity = data.shifts[0].activities.at(-1); const carryoutState = carryoutDepartureStateRef.current; carryoutState.deliveryId = deliveryActivity.id; ${attempt} }; }`, {compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.None}}).outputText;
    vm.runInContext(script, context);
    return {persist:sandbox.locationPersist, flush:sandbox.flushLocationBatch as (accepted:boolean)=>Promise<{status:string}>, attempt:sandbox.attemptCarryoutReturn as (stamp:string)=>void, get autoReturning(){return (sandbox.carryoutDepartureStateRef as {current:{autoReturning:boolean}}).current.autoReturning;}};
  };
  return {stageLocationBatch,get data(){return data;},notices,effects,interceptNextCommit:(fn:()=>void)=>{beforeCommit=fn;},deferEffects:()=>{deferEffects=true;},flushEffects:()=>{pendingEffects.splice(0).forEach(fn=>fn(data));},flushCommits:()=>{pendingCommits.splice(0).forEach(apply=>apply());},advance:(ms:number)=>{clock+=ms;},call:(name:string,...args:unknown[])=>{vm.runInContext(handler(name),context);return (sandbox.run as (...values:unknown[])=>unknown)(...args);},get task(){return data.shifts[0].taskSnapshot![0];}};
}

for(const kind of ['single','double'] as const) test(`${kind}: actual start/task pause/Back at Store/resume handlers save and reload`,async()=>{
  const h=harness();h.call('startTask','test-task');
  assert.equal(h.task.status,'active');h.advance(100);
  assert.equal(h.call('addDelivery',kind,true),true);
  assert.equal(h.task.status,'paused');
  const run=h.data.shifts[0].activities!.at(-1)!;
  assert.ok(Date.parse(h.task.segments[0].end!) >= Date.parse(h.task.segments[0].start));
  assert.equal(h.call('addDelivery',kind,true),false);
  h.advance(60_000);
  run.customerEvents=Array.from({length:kind==='double'?2:1},(_,i)=>({id:`customer-${i}`,latitude:null,longitude:null,accuracy:null,pointIndex:null,timestamp:'2026-09-24T10:10:30Z',source:'manual_delivered' as const}));
  h.call('finishDelivery',false);assert.ok(h.data.shifts[0].activities!.at(-1)!.end);
  h.call('resumeTask','test-task');assert.equal(h.task.status,'active');assert.equal(h.task.segments.length,2);
  h.call('resumeTask','test-task');assert.equal(h.task.segments.length,2);
  const validated=validateAppDataStructure(h.data);assert.equal(validated.ok,true,JSON.stringify(validated));
  assert.equal(validateBackupDocument(createBackupDocument(h.data,'2.1.213')).ok,true);
  const ctx={factory:new IDBFactory(),databaseName:`handler-${kind}`,localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}};
  await loadIndexedDbData(ctx);await saveIndexedDbData(h.data,ctx);resetIndexedDbSessionForTests(ctx.databaseName);
  const loaded=await loadIndexedDbData(ctx);
  assert.ok("data" in loaded);
  assert.deepEqual(loaded.data.shifts[0].taskSnapshot!.find(t=>t.id==='test-task')!.segments,h.task.segments);
});

test('Quick Tasks to Single closes the actual quick stack at a valid action boundary',()=>{
  const h=harness();assert.equal(h.call('startQuickTask','Bins'),true);h.advance(100);
  assert.equal(h.call('addDelivery','single',false),true);
  const quick=h.data.shifts[0].activities!.find(a=>a.quickStack)!;
  assert.ok(Date.parse(quick.end!)>=Date.parse(quick.start));
  assert.equal(validateAppDataStructure(h.data).ok,true);
});
for(const mode of ['before','during'] as const) test(`early dispatch ${mode} delivery leaves task/Real transition untouched`,()=>{
  const h=harness();h.call('startTask','test-task');h.advance(100);
  const shift=h.data.shifts[0];
  if(mode==='before') shift.pendingEarlyDispatch={dominosDispatchStartedAt:'2026-09-24T10:01:00Z',dominosGeofenceExitedAt:null,dominosGeofenceLatitude:53.56845,dominosGeofenceLongitude:-2.88802,dominosGeofenceRadius:100};
  h.call('addDelivery','single',true);
  const run=shift===h.data.shifts[0] ? shift.activities!.at(-1)! : h.data.shifts[0].activities!.at(-1)!;
  const real=run.start, taskEnd=h.task.segments[0].end;
  if(mode==='during') assert.equal(domain.markRunningDeliveryEarlyDispatch(run,120),true);
  assert.equal(run.start,real);assert.equal(h.task.segments[0].end,taskEnd);
  assert.ok(Date.parse(run.dominosDispatchStartedAt!)<Date.parse(run.start));
  assert.ok(Date.parse(taskEnd!)>=Date.parse(h.task.segments[0].start));
  assert.equal(validateAppDataStructure(h.data).ok,true);
});
for(const kind of ['single','double'] as const) test(`carryout confirmation / watch canonical ${kind} is idempotent with an older exit`,()=>{
  const h=harness();h.call('startTask','test-task');h.advance(100);
  h.data.settings.carryoutDepartureAssistEnabled=true;
  h.data.settings.carryoutDepartureZone=domain.buildCarryoutDepartureZone(['front_left','front_right','back_right','back_left'].map((label,i)=>({label:label as domain.CarryoutZoneCorner['label'],latitude:53.568+(i>1 ? -0.0001 : 0.0001),longitude:-2.888+(i===1||i===2 ? 0.0001 : -0.0001),accuracy:8,capturedAt:'2026-09-24T10:00:00Z'})));
  assert.ok(domain.carryoutDepartureZoneIsValid(h.data.settings.carryoutDepartureZone));
  h.data.shifts[0].pendingCarryoutDepartureAt='2026-09-24T10:05:00Z';
  // Watch dispatch uses exactly addDelivery(kind, true); carryout confirmation also delegates here.
  assert.match(source,new RegExp(`addDelivery\\("${kind}", true\\)`));
  h.call('addDelivery',kind,true);h.call('addDelivery',kind,true);
  assert.equal(h.data.shifts[0].deliveries.length,1);
  assert.equal(h.task.segments.filter(s=>s.end!=null).length,1);
  assert.ok(Date.parse(h.task.segments[0].end!)>=Date.parse(h.task.segments[0].start));
});
test('Stock Run does not interrupt resumable work',()=>{
 const h=harness();h.call('startTask','test-task');h.advance(100);
 assert.equal(h.call('addDelivery','stock',true),false);
 assert.equal(h.task.status,'active');assert.equal(h.task.segments[0].end,null);
});

test('Blocked Time pauses cleaning and a Single closes Blocked Time before delivery starts',async()=>{
  const h=harness();h.call('startTask','test-task');h.advance(100);
  assert.equal(await h.call('startBlocked','idiot_in_charge','Manager stopped cleaning'),true);
  assert.equal(h.task.status,'paused');
  assert.equal(h.data.shifts[0].activities!.find(a=>a.type==='blocked_time')!.end,null);h.advance(100);
  assert.equal(h.call('addDelivery','single',false),true);
  const run=h.data.shifts[0].activities!.findLast(a=>a.type==='single_delivery')!;
  const blocked=h.data.shifts[0].activities!.find(a=>a.type==='blocked_time')!;
  assert.equal(blocked.end,run.start);
  assert.deepEqual(h.data.shifts[0].pendingResumeBlockedTime,{reason:'idiot_in_charge',note:'Manager stopped cleaning'});
  assert.ok(Date.parse(blocked.end!)>=Date.parse(blocked.start));
  assert.equal(validateAppDataStructure(h.data).ok,true);
});

test('Blocked Time start and end wait for a deferred React commit before reporting the result',async()=>{
  const h=harness({deferCommits:true});
  const starting=h.call('startBlocked','idiot_in_charge','Manager stopped cleaning') as Promise<boolean>;
  assert.equal(typeof starting?.then,'function');
  assert.deepEqual(h.notices,[]);
  h.flushCommits();
  assert.equal(await starting,true);
  assert.equal(h.data.shifts[0].activities!.findLast(a=>a.type==='blocked_time')?.end,null);

  h.advance(1_000);
  const ending=h.call('finishBlocked') as Promise<boolean>;
  assert.equal(typeof ending?.then,'function');
  h.flushCommits();
  assert.equal(await ending,true);
  assert.equal(h.data.shifts[0].activities!.findLast(a=>a.type==='blocked_time')?.end,'2026-09-24T10:10:01.500Z');
});

test('management-blocked bulk actions report their real deferred commit counts',async()=>{
  const h=harness({deferCommits:true});
  const marking=h.call('markManagementBlockedTasks') as Promise<number>;
  assert.equal(typeof marking?.then,'function');
  assert.deepEqual(h.notices,[]);
  h.flushCommits();
  assert.equal(await marking,1);
  assert.ok(h.task.managementBlockedAt);

  const clearing=h.call('clearManagementBlocked') as Promise<number>;
  assert.equal(typeof clearing?.then,'function');
  h.flushCommits();
  assert.equal(await clearing,1);
  assert.equal(h.task.managementBlockedAt,null);
});

test('starting cleaning deliberately ends Blocked Time at the same non-overlapping boundary',async()=>{
  const h=harness();assert.equal(await h.call('startBlocked','waiting_for_instruction',''),true);h.advance(100);
  h.call('startTask','test-task');
  const blocked=h.data.shifts[0].activities!.find(a=>a.type==='blocked_time')!;
  assert.equal(blocked.end,h.task.segments[0].start);
  assert.equal(h.task.status,'active');
  assert.equal(validateAppDataStructure(h.data).ok,true);
});

test('an individually completed management-blocked task records the real completion timestamp',async()=>{
  const h=harness();
  assert.equal(await h.call('markManagementBlockedTasks'),1);
  assert.ok(h.task.managementBlockedAt);
  h.advance(32*60_000);
  await h.call('completeTask','test-task',true);
  assert.equal(h.task.status,'complete');
  assert.equal(h.task.completedAt,'2026-09-24T10:42:00.500Z');
  assert.equal(h.task.managementBlockedAt,null);
  assert.equal(h.task.managementBlockedBatchId,null);
  assert.equal(validateAppDataStructure(h.data).ok,true);
});


test('rejected stale Single has no native/geofence side effects',()=>{
  const h=harness();h.call('startTask','test-task');h.advance(100);
  h.interceptNextCommit(()=>{
    h.task.segments[0].end='2026-09-24T10:10:00.550Z';
    h.task.segments.push({start:'2026-09-24T10:12:00Z',end:null});
  });
  h.call('addDelivery','single',true);
  assert.equal(h.data.shifts[0].deliveries.length,0);
  assert.deepEqual(h.effects,[]);
  assert.equal(h.task.segments.at(-1)!.end,null);
});
test('accepted start superseded before its callback cannot steal GPS ownership',()=>{
  const h=harness();h.deferEffects();h.call('addDelivery','single',false);
  h.data.shifts[0].activities!.at(-1)!.end='2026-09-24T10:11:00Z';
  h.flushEffects();assert.deepEqual(h.effects,[]);
});
test('rejected delivery-to-task handoff does not stop the current delivery GPS',()=>{
  const h=harness();h.call('addDelivery','single',false);h.effects.length=0;
  h.interceptNextCommit(()=>{h.task.status='active';h.task.segments.push({start:'2026-09-24T10:12:00Z',end:null});});
  h.call('finishDeliveryAndStartTask','test-task');
  assert.equal(h.data.shifts[0].activities!.at(-1)!.end,null);
  assert.deepEqual(h.effects,[]);
});


function returnedRun(h: ReturnType<typeof harness>) {
  h.call('addDelivery', 'single', false);
  const run = h.data.shifts[0].activities!.at(-1)!;
  run.storeExitAt = '2026-09-24T10:11:00.000Z'; run.storeExitObserved = true;
  run.customerEvents = [{ timestamp: '2026-09-24T10:15:00.000Z', latitude: null, longitude: null, accuracy: null, pointIndex: null, source: 'manual_delivered' }];
  run.storeEntryAt = '2026-09-24T10:22:00.000Z'; run.storeEntryObserved = true;
  h.advance(46 * 60_000);
  return run;
}

test('overdue automatic return closes at its original due time after resume and survives durable reload', async () => {
  const h = harness(); const run = returnedRun(h);
  await h.call('finishDelivery', false, { entryAt: run.storeEntryAt, allowanceMs: 60_000 });
  const finished = h.data.shifts[0].activities!.at(-1)!;
  assert.equal(finished.backAtStoreAt, '2026-09-24T10:23:00.000Z');
  assert.equal(finished.end, finished.backAtStoreAt);
  assert.equal(domain.deliveryGeofenceDurations(finished).returnDelayMs, 60_000);
  const before = structuredClone(finished);
  h.advance(20 * 60_000);
  await h.call('finishDelivery', false, { entryAt: run.storeEntryAt, allowanceMs: 60_000 });
  assert.deepEqual(structuredClone(h.data.shifts[0].activities!.at(-1)), before);
  const options = { factory: new IDBFactory(), databaseName: 'automatic-return-resume', localStorage: null };
  await loadIndexedDbData(options); await saveIndexedDbData(h.data, options);
  resetIndexedDbSessionForTests(options.databaseName);
  const loaded = await loadIndexedDbData(options);
  assert.ok('data' in loaded);
  assert.equal(loaded.data.shifts[0].activities!.at(-1)!.backAtStoreAt, before.backAtStoreAt);
  assert.equal(validateBackupDocument(createBackupDocument(loaded.data, '2.1.232')).ok, true);
});

test('calibrated-zone automatic return keeps its observed event time rather than callback time', async () => {
  const h = harness(); const run = returnedRun(h);
  const observedAt = '2026-09-24T10:56:00.000Z';
  await h.call('finishDelivery', false, undefined, { entryAt: observedAt });
  assert.equal(h.data.shifts[0].activities!.at(-1)!.backAtStoreAt, observedAt);
  assert.equal(h.data.shifts[0].activities!.at(-1)!.storeEntryAt, run.storeEntryAt);
});

test('manual return still records the tap time and invalid automatic evidence leaves the run open', async () => {
  const h = harness(); returnedRun(h);
  await h.call('finishDelivery', false, undefined, { entryAt: '2026-09-24T10:09:00.000Z' });
  assert.equal(h.data.shifts[0].activities!.at(-1)!.end, null);
  await h.call('finishDelivery', false);
  assert.equal(h.data.shifts[0].activities!.at(-1)!.backAtStoreAt, '2026-09-24T10:56:00.500Z');
});

for (const correction of ['customer', 'entry', 'unconfirmed'] as const) test(`automatic return rejects a queued ${correction} correction before committing`, async () => {
  const h = harness(); const run = returnedRun(h);
  const stopsBefore = h.effects.filter(effect => effect === 'native-stop').length;
  const noticesBefore = h.notices.length;
  h.interceptNextCommit(() => {
    const current = h.data.shifts[0].activities!.at(-1)!;
    if (correction === 'customer') current.customerEvents![0].timestamp = '2026-09-24T10:24:00.000Z';
    if (correction === 'entry') current.storeEntryAt = '2026-09-24T10:21:00.000Z';
    if (correction === 'unconfirmed') current.storeEntryObserved = false;
  });
  const result = await h.call('finishDelivery', false, { entryAt: run.storeEntryAt, allowanceMs: 60_000 }) as { status: string };
  assert.equal(result.status, 'rejected');
  assert.equal(h.data.shifts[0].activities!.at(-1)!.end, null);
  assert.equal(h.effects.filter(effect => effect === 'native-stop').length, stopsBefore);
  assert.equal(h.notices.length, noticesBefore);
});

for (const rejected of [false, true]) test(`GPS-batched return reports completion only after an accepted atomic mutation (rejected=${rejected})`, async () => {
  const h = harness(); returnedRun(h);
  const batch = h.stageLocationBatch();
  const stopsBefore = h.effects.filter(effect => effect === 'native-stop').length;
  const noticesBefore = h.notices.length;
  await h.call('finishDelivery', false, undefined, {entryAt:'2026-09-24T10:56:00.000Z'}, batch.persist);
  assert.equal(h.data.shifts[0].activities!.at(-1)!.end, null);
  assert.equal(h.effects.filter(effect => effect === 'native-stop').length, stopsBefore);
  if (rejected) h.interceptNextCommit(() => {
    h.data.shifts[0].activities!.at(-1)!.customerEvents![0].timestamp = '2026-09-24T10:56:00.250Z';
  });
  const result = await batch.flush(true);
  assert.equal(result.status, rejected ? 'rejected' : 'persisted');
  assert.equal(Boolean(h.data.shifts[0].activities!.at(-1)!.end), !rejected);
  assert.equal(h.effects.filter(effect => effect === 'native-stop').length, stopsBefore + (rejected ? 0 : 1));
  assert.equal(h.notices.length, noticesBefore + (rejected ? 0 : 1));
});

test('rejected GPS carryout return releases its latch so a fresh sample can retry', async () => {
  const h = harness(); returnedRun(h);
  const batch = h.stageLocationBatch();
  batch.attempt('2026-09-24T10:56:00.000Z');
  assert.equal(batch.autoReturning, true);
  h.interceptNextCommit(() => { h.data.shifts[0].activities!.at(-1)!.customerEvents![0].timestamp = '2026-09-24T10:56:00.250Z'; });
  assert.equal((await batch.flush(true)).status, 'rejected');
  assert.equal(batch.autoReturning, false);
  assert.equal(h.data.shifts[0].activities!.at(-1)!.end, null);
  h.advance(1000);
  const retry = h.stageLocationBatch();
  retry.attempt('2026-09-24T10:56:01.000Z');
  assert.equal((await retry.flush(true)).status, 'persisted');
  assert.equal(h.data.shifts[0].activities!.at(-1)!.backAtStoreAt, '2026-09-24T10:56:01.000Z');
});

test('invalid carryout timing releases the latch without queuing a completion', async () => {
  const h = harness(); returnedRun(h);
  const batch = h.stageLocationBatch();
  batch.attempt('2026-09-24T10:09:00.000Z');
  assert.equal(batch.autoReturning, false);
  assert.equal((await batch.flush(true)).status, 'rejected');
  assert.equal(h.data.shifts[0].activities!.at(-1)!.end, null);
});


test('always-on monitoring preserves manual completion even after an overdue return', async () => {
  const h=harness();const run=returnedRun(h);
  h.data.settings.alwaysOnShiftMonitoring=true;
  await h.call('finishDelivery',false,{entryAt:run.storeEntryAt,allowanceMs:60000});
  assert.equal(h.data.shifts[0].activities!.at(-1)!.end,null);
  await h.call('finishDelivery',false,undefined,{entryAt:run.storeEntryAt});
  assert.equal(h.data.shifts[0].activities!.at(-1)!.end,null);
  await h.call('finishDelivery');
  assert.ok(h.data.shifts[0].activities!.at(-1)!.end);
});
