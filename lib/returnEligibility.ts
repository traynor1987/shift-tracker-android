import type { ActivityRecord, StorePresence } from './domain.ts';
import { confirmedStoreReturnAt, deliveryCustomersComplete, locationAllowsDeliveryCompletion } from './domain.ts';
/** Canonical delivery evidence wins over transient live presence; proof remains independent. */
export function returnEligibility(activity:ActivityRecord|null|undefined, location:{status:string;presence:StorePresence}, proof={required:false,confirmed:true,message:''}) {
  const confirmedAt=activity ? confirmedStoreReturnAt(activity) : null;
  if(!activity || activity.end)return {allowed:false,confirmedAt:null,reason:'no_active_delivery' as const};
  if(!deliveryCustomersComplete(activity))return {allowed:false,confirmedAt:null,reason:'customers_outstanding' as const};
  if(proof.required&&!proof.confirmed)return {allowed:false,confirmedAt,reason:'store_proof_required' as const};
  const allowed=Boolean(confirmedAt)||locationAllowsDeliveryCompletion(activity.locationAssistEnabled,location.status==='ready',location.presence);
  return {allowed,confirmedAt,reason:allowed?'ready' as const:'return_evidence_required' as const};
}
/** Notification is a consequence of the active canonical session, never a GPS callback. */
export function returnNotification(activity:ActivityRecord|null|undefined,previousDeliveryId:string|null) {
 if(!activity || activity.end || activity.id===previousDeliveryId)return null;
 const at=confirmedStoreReturnAt(activity);
 return at ? {deliveryId:activity.id,at} : null;
}
export function dispatchReturnNotification(activity:ActivityRecord|null|undefined,previousDeliveryId:string|null,send:(at:string)=>boolean) {
 const notification=returnNotification(activity,previousDeliveryId);
 if(!notification)return null;
 try{return send(notification.at)?notification:null;}catch{return null;}
}
export function storeProofExpiryDelay(timestamp:string,now=Date.now()) {
 const remaining=Date.parse(timestamp)+30_000-now;
 return Number.isFinite(remaining)&&remaining>=0 ? remaining+1 : null;
}
