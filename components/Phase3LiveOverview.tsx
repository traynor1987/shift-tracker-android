import { phase3NextAction, type LiveActionState } from '../lib/phase3NextAction';

type Props = {
  legacy: boolean;
  state: string;
  action: LiveActionState;
  realHustle: string;
  hustleDetail: string;
  wages: string;
  reimbursement: string;
  gps: string;
};
/** Presentation only. The original controls remain the sole mutation path. */
export default function Phase3LiveOverview(props: Props) {
  const next = phase3NextAction(props.action);
  return <section className="phase3-live-overview" hidden={props.legacy} aria-label="Live shift overview">
    <div className="phase3-live-state"><small>RIGHT NOW</small><strong>{props.state}</strong></div>
    <div className="phase3-next-action"><small>NEXT ACTION</small><strong>{next.label}</strong><p>{next.detail}</p></div>
    <div className="phase3-hustle-metric"><small>REALHUSTLE</small><strong className={/^\d/.test(props.realHustle) ? undefined : "is-unavailable"}>{props.realHustle}</strong><p>{props.hustleDetail}</p></div>
    <div className="phase3-earnings"><span><small>EST. WAGES</small><strong>{props.wages}</strong></span><span><small>DELIVERY REIMBURSEMENT</small><strong>{props.reimbursement}</strong></span></div>
    <div className="phase3-live-trust"><span>GPS · {props.gps}</span><span>Save status is separate from GPS · check the status strip</span></div>
  </section>;
}
