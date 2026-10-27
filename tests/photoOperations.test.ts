import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { emptyData, createShift, repairShiftActivityIds, type AppData } from '../lib/domain.ts';
import { loadDataSafely, saveData, resetStorageSessionForTests } from '../lib/storage.ts';
import { getPhoto, stagePhotoOperation, pendingPhotoOperations, finishPhotoOperation, cleanupExpiredPhotos } from '../lib/photoStorage.ts';

async function setup() {
  const factory=new IDBFactory(); Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:factory});
  const options={factory,localStorage:null,databaseName:'photo-canonical'};
  await loadDataSafely(options);
  let data=emptyData();const shift=repairShiftActivityIds(createShift(data.settings,new Date('2026-10-13T10:00:00Z')));data.shifts.push(shift);await saveData(data,options);
  let fail=false;let wait:Promise<void>|null=null;
  const env={readData:()=>data,commit:async(update:(draft:AppData)=>void|boolean)=>{
    const next=structuredClone(data);if(update(next)===false)return {status:'rejected' as const};data=next;
    if(wait)await wait;
    try{await saveData(data,{...options,testHooks:fail?{failWriteWithQuota:true}:undefined});return {status:'persisted' as const};}catch(error){return {status:'failed' as const,error};}
  }};
  const prepared={highRes:{blob:new Blob(['high']),width:5,height:5,size:4},compressed:{blob:new Blob(['small']),width:2,height:2,size:5}};
  const reload=async()=>{resetStorageSessionForTests(options.databaseName);const result=await loadDataSafely(options);assert.notEqual(result.status,'failed');if(result.status!=='failed')data=result.data;};
  return {env,prepared,shiftId:shift.id,taskId:shift.taskSnapshot![0].id,reload,setFail:(value:boolean)=>{fail=value;},setWait:(value:Promise<void>|null)=>{wait=value;}};
}
async function api(){const value=await import('../lib/photoOperations.ts').catch(()=>null);assert.ok(value,'recoverable photo operations must exist');return value;}

test('attachment waits for canonical persistence and retry does not duplicate evidence',async()=>{
  const ops=await api(),s=await setup();let finish!:()=>void;s.setWait(new Promise<void>(resolve=>{finish=resolve;}));
  let settled=false;const attaching=ops.attachTaskPhoto(s.env,s.shiftId,s.taskId,s.prepared).then(value=>{settled=true;return value;});
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(settled,false);finish();s.setWait(null);
  const proof=await attaching;await s.reload();
  assert.equal(s.env.readData().shifts[0].taskSnapshot![0].photoProofs!.length,1);assert.ok(await getPhoto(proof.highRes!.storageId));
  const duplicate=await ops.attachTaskPhoto(s.env,s.shiftId,s.taskId,s.prepared);assert.equal(duplicate.attachedAt,proof.attachedAt);
  assert.equal(s.env.readData().shifts[0].taskSnapshot![0].photoProofs!.length,1);
});

test('quota failure keeps staged attachment recoverable across reload',async()=>{
  const ops=await api(),s=await setup();s.setFail(true);
  await assert.rejects(ops.attachTaskPhoto(s.env,s.shiftId,s.taskId,s.prepared));
  s.setFail(false);await s.reload();assert.equal(s.env.readData().shifts[0].taskSnapshot![0].photoProofs?.length??0,0);
  const result=await ops.recoverPhotoOperations(s.env);assert.equal(result.pending,0);assert.equal(result.completed,1);
  await s.reload();assert.equal(s.env.readData().shifts[0].taskSnapshot![0].photoProofs!.length,1);
});

test('failed metadata deletion preserves bytes and retry after reload deletes only that proof',async()=>{
  const ops=await api(),s=await setup();const a=await ops.attachTaskPhoto(s.env,s.shiftId,s.taskId,s.prepared);
  const b=await ops.attachTaskPhoto(s.env,s.shiftId,s.taskId,{...s.prepared,highRes:{...s.prepared.highRes,blob:new Blob(['another'])}});
  s.setFail(true);await assert.rejects(ops.deleteTaskPhoto(s.env,s.shiftId,s.taskId,a.attachedAt));assert.ok(await getPhoto(a.highRes!.storageId));
  s.setFail(false);await s.reload();const result=await ops.recoverPhotoOperations(s.env);assert.equal(result.pending,0);
  assert.equal(await getPhoto(a.highRes!.storageId),null);assert.ok(await getPhoto(b.highRes!.storageId));
  await s.reload();assert.deepEqual(s.env.readData().shifts[0].taskSnapshot![0].photoProofs!.map(p=>p.attachedAt),[b.attachedAt]);
  await ops.deleteTaskPhoto(s.env,s.shiftId,s.taskId,a.attachedAt);
});

test('photo-store failure cannot attach metadata or claim success',async()=>{
  const ops=await api(),s=await setup();Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{open:()=>{throw new Error('photo database unavailable');}}});
  await assert.rejects(ops.attachTaskPhoto(s.env,s.shiftId,s.taskId,s.prepared),/photo database unavailable/);
  assert.equal(s.env.readData().shifts[0].taskSnapshot![0].photoProofs?.length??0,0);
});

test('task removed while photos process is rejected without attaching evidence elsewhere',async()=>{
  const ops=await api(),s=await setup();s.env.readData().shifts[0].taskSnapshot=[];
  await assert.rejects(ops.attachTaskPhoto(s.env,s.shiftId,s.taskId,s.prepared),/task|Task/);
  assert.equal((await ops.recoverPhotoOperations(s.env)).pending,0);
});


test('interrupted attachment before metadata replays durable intent once after reload',async()=>{
  const ops=await api(),s=await setup();
  const store={stage:stagePhotoOperation,pending:pendingPhotoOperations,finish:finishPhotoOperation,get:getPhoto};
  const interrupted={...s.env,commit:async()=>{throw new Error('process interrupted');},store};
  await assert.rejects(ops.attachTaskPhoto(interrupted,s.shiftId,s.taskId,s.prepared),/interrupted/);
  assert.equal((await pendingPhotoOperations()).length,1);
  await cleanupExpiredPhotos(Date.now()+40*86400000);
  const intent=(await pendingPhotoOperations())[0];assert.ok(await getPhoto(intent.proof.highRes!.storageId));
  await s.reload();assert.equal((await ops.recoverPhotoOperations(s.env)).pending,0);
  await s.reload();assert.equal(s.env.readData().shifts[0].taskSnapshot![0].photoProofs!.length,1);
  assert.equal((await ops.recoverPhotoOperations(s.env)).completed,0);
});

test('attachment metadata durable but interrupted intent cleanup is retryable without duplication',async()=>{
  const ops=await api(),s=await setup();
  const interrupted={...s.env,store:{stage:stagePhotoOperation,pending:pendingPhotoOperations,get:getPhoto,finish:async()=>{throw new Error('cleanup unavailable');}}};
  await assert.rejects(ops.attachTaskPhoto(interrupted,s.shiftId,s.taskId,s.prepared),/cleanup is incomplete/);
  await s.reload();assert.equal(s.env.readData().shifts[0].taskSnapshot![0].photoProofs!.length,1);
  assert.equal((await ops.recoverPhotoOperations(s.env)).pending,0);
  await ops.attachTaskPhoto(s.env,s.shiftId,s.taskId,s.prepared);
  assert.equal(s.env.readData().shifts[0].taskSnapshot![0].photoProofs!.length,1);
});

test('deletion blob cleanup failure is visible and restart retries only retained cleanup',async()=>{
  const ops=await api(),s=await setup();const proof=await ops.attachTaskPhoto(s.env,s.shiftId,s.taskId,s.prepared);
  const interrupted={...s.env,store:{stage:stagePhotoOperation,pending:pendingPhotoOperations,get:getPhoto,finish:async()=>{throw new Error('blob deletion failed');}}};
  await assert.rejects(ops.deleteTaskPhoto(interrupted,s.shiftId,s.taskId,proof.attachedAt),/cleanup is incomplete/);
  assert.ok(await getPhoto(proof.highRes!.storageId));await s.reload();
  assert.equal(s.env.readData().shifts[0].taskSnapshot![0].photoProofs!.length,0);
  await ops.deleteTaskPhoto(s.env,s.shiftId,s.taskId,proof.attachedAt);
  assert.equal(await getPhoto(proof.highRes!.storageId),null);assert.equal((await pendingPhotoOperations()).length,0);
});

test('task deleted after staging cleans staged bytes only after durable missing-task save',async()=>{
  const ops=await api(),s=await setup();
  const environment={...s.env,store:{pending:pendingPhotoOperations,finish:finishPhotoOperation,get:getPhoto,stage:async(...args:Parameters<typeof stagePhotoOperation>)=>{const operation=await stagePhotoOperation(...args);s.env.readData().shifts[0].taskSnapshot=s.env.readData().shifts[0].taskSnapshot!.filter(t=>t.id!==s.taskId);return operation;}}};
  await assert.rejects(ops.attachTaskPhoto(environment,s.shiftId,s.taskId,s.prepared),/deleted during/);
  assert.equal((await pendingPhotoOperations()).length,0);
  const stats=await import('../lib/photoStorage.ts');assert.equal((await stats.photoStats()).bytes,0);
  await s.reload();assert.equal(s.env.readData().shifts[0].taskSnapshot!.some(t=>t.id===s.taskId),false);
});

test('concurrent retry attaches one proof and quota staging rejection cannot reach metadata',async()=>{
  const ops=await api(),s=await setup();
  const proofs=await Promise.all([ops.attachTaskPhoto(s.env,s.shiftId,s.taskId,s.prepared),ops.attachTaskPhoto(s.env,s.shiftId,s.taskId,s.prepared)]);
  assert.equal(proofs[0].attachedAt,proofs[1].attachedAt);
  const blocked={...s.env,store:{pending:pendingPhotoOperations,finish:finishPhotoOperation,get:getPhoto,stage:async()=>{throw new DOMException('Full','QuotaExceededError');}}};
  await assert.rejects(ops.attachTaskPhoto(blocked,s.shiftId,s.taskId,{...s.prepared,highRes:{...s.prepared.highRes,blob:new Blob(['different'])}}),{name:'QuotaExceededError'});
  assert.equal(s.env.readData().shifts[0].taskSnapshot![0].photoProofs!.length,1);assert.equal((await pendingPhotoOperations()).length,0);
});

test('additive photo database upgrade retains legacy image records',async()=>{
  const factory=new IDBFactory();Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:factory});
  await new Promise<void>((resolve,reject)=>{const request=factory.open('shift-tracker-cleaning-photos',1);request.onupgradeneeded=()=>request.result.createObjectStore('photos',{keyPath:'id'});request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put({id:'legacy',blob:new Blob(['evidence']),kind:'high',createdAt:'2026-10-13',expiresAt:'2026-10-27',width:1,height:1,size:8});tx.oncomplete=()=>{db.close();resolve();};};});
  assert.equal((await getPhoto('legacy'))?.id,'legacy');assert.deepEqual(await pendingPhotoOperations(),[]);
});


test('successful deletion supersedes interrupted attachment without resurrection',async()=>{
  const ops=await api(),s=await setup();
  const interrupted={...s.env,store:{stage:stagePhotoOperation,pending:pendingPhotoOperations,get:getPhoto,finish:async()=>{throw new Error('interrupted cleanup');}}};
  await assert.rejects(ops.attachTaskPhoto(interrupted,s.shiftId,s.taskId,s.prepared));
  const proof=s.env.readData().shifts[0].taskSnapshot![0].photoProofs![0];
  await ops.deleteTaskPhoto(s.env,s.shiftId,s.taskId,proof.attachedAt);
  await s.reload();assert.equal((await ops.recoverPhotoOperations(s.env)).pending,0);
  assert.equal(s.env.readData().shifts[0].taskSnapshot![0].photoProofs!.length,0);
  assert.equal(await getPhoto(proof.highRes!.storageId),null);
});

test('re-upload after retained bytes expire produces fresh durable evidence',async()=>{
  const ops=await api(),s=await setup();const original=await ops.attachTaskPhoto(s.env,s.shiftId,s.taskId,s.prepared);
  await cleanupExpiredPhotos(Date.now()+15*86400000);assert.equal(await getPhoto(original.highRes!.storageId),null);
  const renewed=await ops.attachTaskPhoto(s.env,s.shiftId,s.taskId,s.prepared);
  assert.notEqual(renewed.highRes!.storageId,original.highRes!.storageId);assert.ok(await getPhoto(renewed.highRes!.storageId));
  assert.equal((await pendingPhotoOperations()).length,0);
});
