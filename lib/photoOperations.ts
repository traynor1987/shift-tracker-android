import type { AppData, CleaningPhotoProof, ShiftTaskRecord } from './domain.ts';
import { stagePhotoOperation, pendingPhotoOperations, finishPhotoOperation, getPhoto, type PhotoOperation, type PhotoRecord, type preparePhoto } from './photoStorage.ts';

export type PhotoCommitResult = {status:'persisted'} | {status:'rejected'} | {status:'failed';error:unknown};
export type PhotoEnvironment = {
  readData:()=>AppData;
  commit:(update:(draft:AppData)=>void|boolean)=>Promise<PhotoCommitResult>;
  store?: {stage:typeof stagePhotoOperation;pending:typeof pendingPhotoOperations;finish:typeof finishPhotoOperation;get:typeof getPhoto};
};
const defaultStore={stage:stagePhotoOperation,pending:pendingPhotoOperations,finish:finishPhotoOperation,get:getPhoto};
export const photoProofs=(task:Pick<ShiftTaskRecord,'photoProof'|'photoProofs'>):CleaningPhotoProof[] =>
  task.photoProofs?.length?task.photoProofs:task.photoProof?.photoProof?[task.photoProof]:[];
const taskFor=(data:AppData,shiftId:string,taskId:string)=>data.shifts.find(s=>s.id===shiftId)?.taskSnapshot?.find(t=>t.id===taskId);
const ids=(proof:CleaningPhotoProof)=>[proof.highRes?.storageId,proof.compressed?.storageId].filter((id):id is string=>Boolean(id));
const matches=(a:CleaningPhotoProof,b:CleaningPhotoProof)=>a.attachedAt===b.attachedAt && ids(a).join('|')===ids(b).join('|');
const referenced=(data:AppData,id:string)=>data.shifts.some(s=>s.taskSnapshot?.some(t=>photoProofs(t).some(p=>ids(p).includes(id))));
let queue:Promise<unknown>=Promise.resolve();
function serial<T>(action:()=>Promise<T>):Promise<T>{
  const work=queue.catch(()=>undefined).then(async()=>{
    if(typeof navigator!=='undefined'&&navigator.locks)return await navigator.locks.request('shift-tracker-photo-operations',action);
    return await action();
  });
  queue=work;return work;
}
function requirePersisted(result:PhotoCommitResult){
  if(result.status==='failed')throw new Error(`Photo operation is not saved yet; retained for retry. ${result.error instanceof Error?result.error.message:'Canonical save failed.'}`);
  if(result.status==='rejected')throw new Error('Photo operation changed or was rejected; retained for retry.');
}

async function reconcile(env:PhotoEnvironment,operation:PhotoOperation):Promise<CleaningPhotoProof|null>{
  const store=env.store??defaultStore;
  let missing=false;let saved:AppData|undefined;
  if(operation.kind==='attach'&&taskFor(env.readData(),operation.shiftId,operation.taskId)){
    for(const id of ids(operation.proof))if(!await store.get(id))throw new Error('Staged photo bytes are unavailable; attachment cannot be reported saved.');
  }
  const result=await env.commit(draft=>{
    const task=taskFor(draft,operation.shiftId,operation.taskId);
    if(!task){missing=true;saved=structuredClone(draft);return;}
    const proofs=photoProofs(task);
    if(operation.kind==='attach'){
      if(!proofs.some(p=>matches(p,operation.proof)))task.photoProofs=[...proofs,operation.proof];
      task.photoProof??=operation.proof;
    }else{
      task.photoProofs=proofs.filter(p=>!matches(p,operation.proof));task.photoProof=task.photoProofs[0]??null;
    }
    saved=structuredClone(draft);
  });
  requirePersisted(result);
  const deleteIds=operation.kind==='delete'||missing?ids(operation.proof).filter(id=>!referenced(saved!,id)&&!referenced(env.readData(),id)):[];
  try{await store.finish(operation,deleteIds);}catch(error){throw new Error(`Photo record saved, but cleanup is incomplete and retained for retry. ${error instanceof Error?error.message:'Photo cleanup failed.'}`);}
  if(missing&&operation.kind==='attach')throw new Error('The task was deleted during photo processing; staged photos were cleaned up.');
  return operation.kind==='attach'?operation.proof:null;
}

export function attachTaskPhoto(env:PhotoEnvironment,shiftId:string,taskId:string,prepared:Awaited<ReturnType<typeof preparePhoto>>):Promise<CleaningPhotoProof>{
  return serial(async()=>{
    if(!taskFor(env.readData(),shiftId,taskId))throw new Error('The selected task no longer exists.');
    const digest=await crypto.subtle.digest('SHA-256',await new Blob([prepared.highRes.blob,prepared.compressed.blob]).arrayBuffer());
    const key=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
    let base=`${shiftId}-${taskId}-${key}`;
    const store=env.store??defaultStore;
    for(const pending of await store.pending())if(pending.kind==='delete'&&pending.shiftId===shiftId&&pending.taskId===taskId)await reconcile(env,pending);
    const task=taskFor(env.readData(),shiftId,taskId)!;
    let previous=photoProofs(task).findLast(p=>p.highRes?.storageId.startsWith(`${base}-`)&&p.compressed?.storageId.startsWith(`${base}-`));
    if(previous && (!(await store.get(previous.highRes!.storageId)) || !(await store.get(previous.compressed!.storageId)))) { previous=undefined;base+=`-${Date.now()}`; }
    let stampMs=Date.now();while(photoProofs(task).some(p=>p.attachedAt===new Date(stampMs).toISOString()))stampMs++;
    const stamp=new Date(stampMs).toISOString();
    const variant=(kind:'high'|'compressed',value:typeof prepared.highRes,days:number)=>({storageId:`${base}-${kind==='high'?'high':'compressed'}`,createdAt:stamp,expiresAt:new Date(stampMs+days*86400000).toISOString(),width:value.width,height:value.height,size:value.size});
    const proof=previous??{photoProof:true,attachedAt:stamp,highRes:variant('high',prepared.highRes,14),compressed:variant('compressed',prepared.compressed,30)};
    const operation:PhotoOperation={id:`attach:${base}`,kind:'attach',shiftId,taskId,proof,createdAt:stamp};
    const records:PhotoRecord[]=[{id:proof.highRes!.storageId,kind:'high',blob:prepared.highRes.blob,...proof.highRes!},{id:proof.compressed!.storageId,kind:'compressed',blob:prepared.compressed.blob,...proof.compressed!}];
    const staged=await (env.store??defaultStore).stage(operation,previous?[]:records);
    return (await reconcile(env,staged))!;
  });
}

export function deleteTaskPhoto(env:PhotoEnvironment,shiftId:string,taskId:string,attachedAt:string):Promise<void>{
  return serial(async()=>{
    const store=env.store??defaultStore;
    const existing=(await store.pending()).find(op=>op.kind==='delete'&&op.shiftId===shiftId&&op.taskId===taskId&&op.proof.attachedAt===attachedAt);
    const task=taskFor(env.readData(),shiftId,taskId);const proof=existing?.proof??(task?photoProofs(task).find(p=>p.attachedAt===attachedAt):undefined);
    if(!proof)return;
    const operation=existing??await store.stage({id:`delete:${shiftId}:${taskId}:${attachedAt}`,kind:'delete',shiftId,taskId,proof,createdAt:new Date().toISOString()});
    await reconcile(env,operation);
  });
}
export function recoverPhotoOperations(env:PhotoEnvironment):Promise<{completed:number;pending:number;errors:string[]}>{
  return serial(async()=>{
    const store=env.store??defaultStore;let completed=0;const errors:string[]=[];
    for(const operation of await store.pending())try{await reconcile(env,operation);completed++;}catch(error){errors.push(error instanceof Error?error.message:'Photo recovery failed');}
    return {completed,pending:(await store.pending()).length,errors};
  });
}
