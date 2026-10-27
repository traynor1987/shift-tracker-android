/** Optional, owner-invoked recovery for an OLD bundle that is still open.
 * Never runs on normal startup; never reads/writes storage or sends AppData.
 * The old app's existing Retry Save remains the persistence authority. */
import { hasReversedTaskSegments, repairReversedTaskSegments } from '../lib/taskTiming';
import type { AppData } from '../lib/domain';

type Fiber = { return?: Fiber; memoizedState?: Hook };
type Hook = { memoizedState?: unknown; queue?: { dispatch?: (update: (current: AppData) => AppData) => void }; next?: Hook };
const isAppData = (value: unknown): value is AppData => {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<AppData>;
  return data.version === 1 && Array.isArray(data.shifts) && Array.isArray(data.payments) && !!data.settings;
};

function installRecovery() {
  if (location.origin !== 'https://dominos-shift-tracker.traynor1987.chatgpt.site') throw new Error('Use recovery only on the existing Shift Tracker origin.');
  if (document.getElementById('task-timing-live-recovery')) return;
  const dispatchers = new Set<NonNullable<NonNullable<Hook['queue']>['dispatch']>>();
  const seen = new Set<Fiber>();
  for (const element of document.querySelectorAll('*')) {
    const key = Object.keys(element).find(k => k.startsWith('__reactFiber$'));
    if (!key) continue;
    let fiber = (element as unknown as Record<string, Fiber>)[key];
    while (fiber && !seen.has(fiber)) {
      seen.add(fiber);
      let hook = fiber.memoizedState;
      while (hook) {
        if (isAppData(hook.memoizedState) && hook.queue?.dispatch) dispatchers.add(hook.queue.dispatch);
        hook = hook.next;
      }
      fiber = fiber.return!;
    }
  }
  if (dispatchers.size !== 1) throw new Error('Could not identify exactly one live AppData state. Nothing changed. Keep the app open.');
  const dispatch = [...dispatchers][0];
  const panel = document.createElement('section');
  panel.id = 'task-timing-live-recovery';
  panel.style.cssText = 'position:fixed;inset:auto 12px 12px;z-index:2147483647;padding:18px;background:#151719;color:white;border:2px solid #e7ad42;border-radius:12px;font:14px system-ui;max-height:40vh;overflow:auto';
  const explanation = document.createElement('p');
  explanation.textContent = 'Repair open Shift Tracker memory: preserve segment starts and all records; set only reversed ends to their starts (0s), with audit notes. Full validation is required. No refresh or storage clearing.';
  const button = document.createElement('button');
  button.textContent = 'REPAIR CURRENT SHIFT';
  button.style.cssText = 'padding:14px;font-weight:bold';
  const close = document.createElement('button');
  close.textContent = 'CLOSE';
  close.style.cssText = 'padding:14px;margin-left:8px';
  close.onclick = () => panel.remove();
  button.onclick = () => {
    button.disabled = true;
    dispatch(current => {
      if (!isAppData(current)) { explanation.textContent = 'State changed. Nothing repaired; keep the app open.'; return current; }
      if (!hasReversedTaskSegments(current)) { explanation.textContent = 'No reversed task segments found. Nothing changed.'; return current; }
      const result = repairReversedTaskSegments(current);
      if (!result.ok) { explanation.textContent = `Nothing changed: full validation still fails. ${result.issues.join('; ')}`; return current; }
      console.info('[Shift Tracker] Explicit task timing repair', result.repairs);
      explanation.textContent = 'Repair validated in memory. Close this panel, press the existing RETRY SAVE, then export a Full Backup. Only update/refresh after saving succeeds. Original boundaries are recorded in task notes.';
      return result.data;
    });
  };
  panel.append(explanation, button, close);
  document.body.append(panel);
}
installRecovery();
