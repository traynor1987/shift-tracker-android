import test from 'node:test';
import assert from 'node:assert/strict';
import { recordRuntimeMeasurement, runtimeDiagnosticsSnapshot } from '../lib/runtimeDiagnostics.ts';

test('metrics reject unapproved fields and expire bounded aggregates',()=>{
  recordRuntimeMeasurement('customer-address' as never,2,100);
  recordRuntimeMeasurement('resume_reconciliation',10,100);
  const snapshot=runtimeDiagnosticsSnapshot(101);
  assert.equal('customer-address' in snapshot,false);
  assert.equal(snapshot.resume_reconciliation?.last,10);
  assert.equal(runtimeDiagnosticsSnapshot(100+31*60_000).resume_reconciliation,undefined);
});

test('visible stalls and memory gauges are bounded; hidden suspension is not a stall',async()=>{
  const api=await import('../lib/performanceMonitor.ts').catch(()=>null);assert.ok(api,'performance monitor must exist');
  let now=0,hidden=false,callback:(()=>void)|undefined;const handlers=new Map<string,()=>void>();let cleared=0;
  const host={now:()=>now,hidden:()=>hidden,setTimer:(fn:()=>void)=>{callback=fn;return 1;},clearTimer:()=>{cleared++;},on:(type:string,fn:()=>void)=>{handlers.set(type,fn);return ()=>handlers.delete(type);},memory:()=>({usedJSHeapSize:4*1024*1024}),gauges:()=>({gps_accepted_fix_age:42})};
  const stop=api.startPerformanceMonitor(host);
  now=1500;callback!();assert.equal(runtimeDiagnosticsSnapshot().main_thread_stall?.last,500);
  hidden=true;handlers.get('visibilitychange')!();now=50000;callback!();
  hidden=false;handlers.get('visibilitychange')!();now+=1000;callback!();
  assert.equal(runtimeDiagnosticsSnapshot().main_thread_stall?.count,1);
  assert.equal(runtimeDiagnosticsSnapshot().memory_used_mb?.last,4);
  assert.equal(runtimeDiagnosticsSnapshot().gps_accepted_fix_age?.last,42);
  stop();assert.equal(handlers.size,0);assert.ok(cleared>0);
});

test('timer formatting records duration without storing its rendered contents',async()=>{
 const api=await import('../lib/performanceMonitor.ts');assert.equal(typeof api.measureTimerRender,'function');
 let time=0;const result=api.measureTimerRender(()=>{time=3;return 'private rendered text';},()=>time);
 assert.equal(result,'private rendered text');assert.equal(runtimeDiagnosticsSnapshot().timer_render?.last,3);
 assert.equal(JSON.stringify(runtimeDiagnosticsSnapshot()).includes('private rendered text'),false);
});
