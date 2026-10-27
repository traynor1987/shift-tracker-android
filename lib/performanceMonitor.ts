import { recordRuntimeMeasurement, type Stage } from './runtimeDiagnostics.ts';
export type MonitorHost = {
  now:()=>number; hidden:()=>boolean;
  setTimer:(callback:()=>void,delay:number)=>unknown; clearTimer:(timer:unknown)=>void;
  on:(event:string,callback:()=>void)=>()=>void;
  memory:()=>{usedJSHeapSize?:number}|undefined;
  gauges?:()=>Partial<Record<Stage,number>>;
};
/** One cheap visible event-loop probe. Background sleep is never a freeze. */
export function startPerformanceMonitor(host:MonitorHost):()=>void {
  let timer:unknown,last=host.now(),visible=!host.hidden(),stopped=false;
  const tick=()=>{
    if(stopped)return;
    const now=host.now();
    if(visible&&!host.hidden()){
      const delay=now-last-1000;
      if(delay>250)recordRuntimeMeasurement('main_thread_stall',delay);
      const memory=host.memory()?.usedJSHeapSize;
      if(memory!=null)recordRuntimeMeasurement('memory_used_mb',memory/1024/1024);
      for(const [stage,value] of Object.entries(host.gauges?.()??{}))if(value!=null)recordRuntimeMeasurement(stage as Stage,value);
    }
    last=now;visible=!host.hidden();
    if(visible)timer=host.setTimer(tick,1000);
  };
  const wake=()=>{
    host.clearTimer(timer);last=host.now();visible=!host.hidden();
    if(visible&&!stopped)timer=host.setTimer(tick,1000);
  };
  const cleanups=['focus','pageshow','visibilitychange'].map(event=>host.on(event,wake));
  if(visible)timer=host.setTimer(tick,1000);
  return ()=>{stopped=true;host.clearTimer(timer);cleanups.forEach(cleanup=>cleanup());};
}


/** Formatter work only; this is not a React commit/frame duration. */
export function measureTimerRender<T>(render:()=>T, now:()=>number=()=>performance.now()):T {
  const started=now();
  try { return render(); }
  finally { recordRuntimeMeasurement('timer_render',now()-started); }
}
