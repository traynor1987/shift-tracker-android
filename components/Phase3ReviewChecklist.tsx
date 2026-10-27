import type { Shift } from '../lib/domain';
import { phase3ReviewItems } from '../lib/phase3Status';
export default function Phase3ReviewChecklist({shift,now,legacy}:{shift:Shift;now:Date;legacy:boolean}) {
 return <section className="phase3-review-checklist" hidden={legacy} aria-label="Shift review checklist"><strong>Finish and review</strong><ul>{phase3ReviewItems(shift,now).map((item,index)=><li key={`${index}:${item.label}`}><span>{item.label}</span><em>{item.kind}</em></li>)}</ul><small>This checklist never changes your records or clock-out rules. Ratings remain optional.</small></section>;
}
