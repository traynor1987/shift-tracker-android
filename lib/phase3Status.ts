import type { ActivityRecord, Shift } from './domain.ts';
import { confirmedStoreReturnAt, hasConfirmedStoreReturn, deliveryCustomersComplete } from './domain.ts';
import { shiftFinishChecklist } from './trackerHealth.ts';
import type { LocalSaveState } from './localSaveStatus.ts';
export function phase3SaveLabel(save:LocalSaveState) {
 return save.status==='failed'?'Save failed — latest changes may only be in memory':save.status==='saving'?`Save pending · ${save.pending} write${save.pending===1?'':'s'}`:save.status==='saved'?'Saved on phone':'Saved records loaded';
}
export function phase3ReturnStatus(activity:ActivityRecord|null|undefined) {
 if(!activity)return null;
 const operational=confirmedStoreReturnAt(activity);
 const exact=hasConfirmedStoreReturn(activity)&&activity.storeEntryObserved===true?activity.storeEntryAt:null;
 if(!operational&&!activity.storeEntryUnobserved)return null;
 const format=(value:string)=>new Date(value).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
 return {label:operational?'Back at store confirmed':'Return not yet confirmed',operational:operational?format(operational):'Not recorded',exact:exact?format(exact):'Exact crossing time unavailable — GPS gap',evidence:exact?'Observed delivery-owned GPS exit and entry':operational?'Confirmed inside fix after Delivered; not an observed crossing':'Waiting for credible store-presence evidence',allowance:activity.end?activity.notes?.includes('return allowance')?'Applied — see the recorded delivery note':'No automatic allowance recorded':'Pending — existing return controls determine completion'};
}
export function phase3ReviewItems(shift:Shift,now:Date) {
 const attention=shiftFinishChecklist(shift,now);
 const items=attention.map(item=>({label:item.message,kind:'Needs attention'}));
 const incomplete=(shift.activities??[]).filter(a=>!a.stockRun&&!a.testOnly&&(a.type==='single_delivery'||a.type==='double_delivery')&&a.end&&!deliveryCustomersComplete(a)).length;
 if(incomplete)items.push({label:`${incomplete} delivery outcome${incomplete===1?'':'s'} to review`,kind:'Needs attention'});
 items.push({label:shift.ratingReview?'Shift rating recorded':'Shift rating',kind:'Optional review'},{label:shift.ratingReview?'Manager rating recorded':'Manager rating',kind:'Optional review'});
 return items;
}
