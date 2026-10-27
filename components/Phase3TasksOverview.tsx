type WorkItem = { id: string; name: string; time: string };
type Props = {
  hidden: boolean;
  current: { name: string; time: string; target: 'scheduled' | 'quick' | 'rush' | 'other' | 'blocked' | null } | null;
  paused: WorkItem[];
  cleaning: number;
  preparation: number;
  managementBlocked: number;
  onJump: (target: 'scheduled' | 'quick' | 'rush' | 'other' | 'blocked', taskId?: string) => void;
};
/** Read-only presentation; navigation reveals the original task controls. */
export default function Phase3TasksOverview(props: Props) {
  return <section className="phase3-tasks-overview" hidden={props.hidden} aria-label="Task work overview">
    <div className="phase3-task-now">
      <div><p className="eyebrow">WORK RIGHT NOW</p><h2>{props.current?.name ?? 'Choose your next task'}</h2>
        <p>{props.current ? props.current.time : 'Start a scheduled task, a short job, or named store work below.'}</p></div>
      {props.current?.target && <button type="button" onClick={() => props.onJump(props.current!.target!)}>OPEN CURRENT CONTROLS</button>}
    </div>
    {props.paused.length > 0 && <div className="phase3-paused-tasks" aria-label="Paused tasks">
      <strong>Paused · ready to resume</strong>
      {props.paused.map(task => <button key={task.id} type="button" onClick={() => props.onJump('scheduled', task.id)}><span>{task.name}</span><small>{task.time} worked · open resume controls</small></button>)}
    </div>}
    <nav className="phase3-task-groups" aria-label="Work groups">
      <button type="button" onClick={() => props.onJump('quick')}><strong>Quick Tasks</strong><small>Short paid jobs · shared timer</small></button>
      <button type="button" onClick={() => props.onJump('scheduled')}><strong>Cleaning & preparation</strong><small>{props.cleaning} cleaning · {props.preparation} preparation</small></button>
      <button type="button" onClick={() => props.onJump('rush')}><strong>Rush Ready</strong><small>Repeatable store preparation</small></button>
      <button type="button" onClick={() => props.onJump('other')}><strong>Named store work</strong><small>Describe and time another job</small></button>
    </nav>
    <button type="button" className="phase3-blocked-link" onClick={() => props.onJump('blocked')}><strong>Management blocked{props.managementBlocked > 0 ? ` · ${props.managementBlocked} affected` : ''}</strong><small>Blocked time and bulk task outcomes · separate from completion</small></button>
    <p className="phase3-task-outcome-help">Expected time is a guide. Use Unable to complete for prevented work, or Not required when preparation is not needed.</p>
  </section>;
}
