import type { ActivityRecord } from '../lib/domain';
import type { LocalSaveState } from '../lib/localSaveStatus';
import { phase3SaveLabel,phase3ReturnStatus } from '../lib/phase3Status';
type Cloud={enabled:boolean;pendingReason:string|null;lastSuccessAt:string|null;lastError:string|null};
export default function Phase3OperationalStatus({legacy,save,cloud,nativeActive,activity}:{legacy:boolean;save:LocalSaveState;cloud:Cloud;nativeActive:boolean;activity?:ActivityRecord|null}) {
 const returned=phase3ReturnStatus(activity);
 const cloudLabel=!cloud.enabled?'Cloud backup unavailable · not enabled':cloud.lastError?'Cloud backup failed · retry remains pending':cloud.pendingReason?'Cloud backup pending':cloud.lastSuccessAt?'Cloud checkpoint verified':'No verified cloud checkpoint yet';
 return <section className="phase3-status-panel" hidden={legacy} aria-label="Separate tracker statuses">
  <dl><dt>Phone records</dt><dd role="status">{phase3SaveLabel(save)}</dd><dt>Last save</dt><dd>{save.savedAt?new Date(save.savedAt).toLocaleTimeString('en-GB'):'No successful new save this session'}</dd><dt>Native GPS</dt><dd>{nativeActive?'Active · separate from accepted-fix health':'Not currently active'}</dd><dt>Cloud backup</dt><dd>{cloudLabel}{cloud.lastSuccessAt?` · last success ${new Date(cloud.lastSuccessAt).toLocaleString('en-GB')}`:''}</dd></dl>
  {returned&&<details><summary>{returned.label}</summary><dl><dt>Operational confirmation</dt><dd>{returned.operational}</dd><dt>Exact crossing</dt><dd>{returned.exact}</dd><dt>Evidence</dt><dd>{returned.evidence}</dd><dt>Timing allowance</dt><dd>{returned.allowance}</dd></dl></details>}
  <small>GPS health, local saves and cloud backups are independent. JSON and hosted backups retain photo metadata, not image bytes.</small>
 </section>;
}
