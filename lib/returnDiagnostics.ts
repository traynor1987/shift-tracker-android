/** Bounded return pipeline breadcrumbs. IDs are replaced by export-local aliases; no positions. */
export type ReturnStage='sample_received'|'sample_accepted'|'sample_rejected'|'qualifying_inside'|'exact_entry'|'operational_confirmation'|'canonical_updated'|'persistence_completed'|'persistence_failed'|'bridge_notified'|'action_eligible'|'button_frame'|'notification_requested'|'action_completed';
type Event={session:string;stage:ReturnStage;wallAt:string;monotonicMs:number;evidenceAt?:string;reason?:string};
const events:Event[]=[];const sessions=new Map<string,string>();let sequence=0;
export function traceReturn(id:string|undefined,stage:ReturnStage,evidenceAt?:string,reason?:'accepted'|'validation_or_session'|'customers_outstanding'|'store_proof_required'|'return_evidence_required'|'ready'|'no_active_delivery'|'stale_session'|'stale_or_duplicate'|'inaccurate'|'pending_confirmation') {
 if(!id)return;const wall=Date.now();while(events.length&&Date.parse(events[0].wallAt)<wall-30*60000)events.shift();
 if(!sessions.has(id)){if(sessions.size>=8)sessions.delete(sessions.keys().next().value!);sessions.set(id,`session-${++sequence}`);}
 const stamp=evidenceAt&&Number.isFinite(Date.parse(evidenceAt))?evidenceAt:undefined;
 events.push({session:sessions.get(id)!,stage,wallAt:new Date(wall).toISOString(),monotonicMs:Math.round(performance.now()*100)/100,...(stamp?{evidenceAt:stamp}:{}),...(reason?{reason}:{})});if(events.length>200)events.splice(0,events.length-200);
}
export function returnDiagnosticsSnapshot(){const cutoff=Date.now()-30*60000;return events.filter(e=>Date.parse(e.wallAt)>=cutoff).map(e=>({...e}));}
