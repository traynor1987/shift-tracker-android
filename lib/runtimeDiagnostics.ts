export const PERFORMANCE_METRICS = {
  foreground_timer_gap: 'Delay between visible clock ticks (ms).',
  local_save: 'Canonical save, including queue wait (ms).',
  native_queue_wait: 'Native sample wait before web ingestion (ms).',
  native_ingestion: 'Native sample ingestion and durable save (ms).',
  native_queue_depth: 'Native samples waiting for canonical ingestion (count).',
  persistence_snapshot: 'Immutable save snapshot clone (ms).',
  persistence_validation: 'Canonical record validation (ms).',
  persistence_split: 'Separate records and routes for storage (ms).',
  persistence_compare: 'Compare changed canonical records/routes (ms).',
  persistence_serialization: 'Serialize canonical records for comparison (ms).',
  persistence_write: 'Canonical write path after queue wait, including validation/recovery reads (ms).',
  persistence_transaction: 'IndexedDB transaction to durable completion (ms).',
  persistence_queue_wait: 'Canonical save waiting for previous saves (ms).',
  persistence_queue_depth: 'Pending canonical writes (count).',
  main_thread_stall: 'Visible event-loop delay beyond a one-second probe (ms).',
  gps_callback_age: 'Age of last raw GPS provider timestamp (ms).',
  gps_accepted_fix_age: 'Age of last useful accepted GPS fix (ms).',
  native_journal_backlog: 'Native unacknowledged encrypted samples (count).',
  replay_duration: 'Drain time of queued native samples; includes persistence (ms).',
  resume_reconciliation: 'Resume hello to trusted shell-ready response (ms).',
  visual_tick: 'Visible timer notifications (count).',
  timer_render: 'Live text timer formatting work; excludes React commit/frame time (ms).',
  memory_used_mb: 'JavaScript heap in MB when supported; unavailable otherwise.',
} as const;
export type Stage = keyof typeof PERFORMANCE_METRICS;
type Measurement = { count: number; last: number; maximum: number; total: number; observedAt: number };
const measurements = new Map<Stage, Measurement>();
const RETENTION_MS = 30 * 60_000;
function prune(now: number) { for(const [key,value] of measurements)if(now-value.observedAt>RETENTION_MS)measurements.delete(key); }

/** Fixed allowlist, aggregate numbers only, thirty-minute inactivity retention. */
export function recordRuntimeMeasurement(stage: Stage, value: number, observedAt = Date.now()) {
  if (!Object.hasOwn(PERFORMANCE_METRICS,stage) || !Number.isFinite(value) || value < 0 || !Number.isFinite(observedAt)) return;
  prune(observedAt);
  const previous = measurements.get(stage) ?? { count: 0, last: 0, maximum: 0, total: 0, observedAt };
  measurements.set(stage, { count: previous.count + 1, last: Math.round(value), maximum: Math.max(previous.maximum, Math.round(value)), total: previous.total + value, observedAt });
}
export function runtimeDiagnosticsSnapshot(now = Date.now()) {
  prune(now);
  return Object.fromEntries([...measurements].map(([stage,value])=>[stage,{count:value.count,last:value.last,maximum:value.maximum,average:Math.round(value.total/value.count)}])) as Partial<Record<Stage,{count:number;last:number;maximum:number;average:number}>>;
}
