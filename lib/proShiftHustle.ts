import type {ActivityRecord} from './domain.ts';
import {confirmedStoreReturnAt,deliveryGeofenceDurations,formatTimingDuration} from './domain.ts';
/** Display only: completed Real timing stays domain-owned; live duration is explicitly provisional. */
export function proShiftHustle(activity:ActivityRecord|null|undefined,now:Date) {
 if(!activity)return {value:'—',detail:'No active run'};
 if(activity.badDelivery)return {value:'Excluded',detail:'Stats excluded'};
 const measured=deliveryGeofenceDurations(activity,'real',now).hustleMs;
 if(measured!=null)return {value:formatTimingDuration(measured),detail:'Observed exit → entry'};
 if(activity.storeEntryUnobserved||confirmedStoreReturnAt(activity))return {value:'—',detail:'GPS gap · no exact entry'};
 const exit=Date.parse(activity.storeExitAt??'');
 if(activity.storeExitObserved&&Number.isFinite(exit)&&exit>=Date.parse(activity.start)&&now.getTime()>=exit)return {value:formatTimingDuration(now.getTime()-exit),detail:'Live · entry pending'};
 return {value:'—',detail:'Awaiting observed exit'};
}
