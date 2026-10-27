import test from 'node:test';
import assert from 'node:assert/strict';
import { createWallClock } from '../lib/wallClock.ts';

test('wall clock reads actual elapsed time after throttling and isolates subscriber cadence', () => {
  let time = 0;
  let callback: (() => void) | undefined;
  let cleared = 0;
  const clock = createWallClock({ now: () => time, schedule: (fn) => { callback = fn; return 1; }, cancel: () => { cleared++; } });
  const live: number[] = [], operational: number[] = [];
  const stopLive = clock.subscribe(1000, () => live.push(clock.getSnapshot()));
  const stopOperational = clock.subscribe(15000, () => operational.push(clock.getSnapshot()));
  for (time = 1000; time <= 14000; time += 1000) callback!();
  assert.equal(live.length, 14);
  assert.equal(operational.length, 0);
  time = 65000; callback!();
  assert.equal(clock.getSnapshot(), 65000);
  assert.deepEqual(operational, [65000]);
  stopLive(); stopOperational();
  assert.equal(cleared, 1);
});

test('wake immediately refreshes all cadences and removed subscribers never receive ticks', () => {
  let time = 100;
  const clock = createWallClock({ now: () => time, schedule: () => 1, cancel: () => {} });
  let renders = 0;
  const stop = clock.subscribe(15000, () => renders++);
  time = 43210; clock.wake();
  assert.equal(clock.getSnapshot(), time);
  assert.equal(renders, 1);
  stop(); time++; clock.wake();
  assert.equal(renders, 1);
});

test('hidden visual clocks stop scheduling and resume at canonical wall time', () => {
 let time=0, scheduled=0, cancelled=0;
 const clock=createWallClock({now:()=>time,schedule:()=>{scheduled++;return scheduled;},cancel:()=>{cancelled++;}});
 let rendered=0;
 const stop=clock.subscribe(1000,()=>rendered++);
 clock.setPaused(true);
 time=900000;
 assert.equal(rendered,0);
 assert.equal(cancelled,1);
 clock.setPaused(false);
 assert.equal(clock.getSnapshot(),900000);
 assert.equal(rendered,1);
 assert.equal(scheduled,2);
 stop();
 assert.equal(cancelled,2);
});

test('rapid focus/pageshow/visibility replies at one timestamp notify only once',()=>{
 let time=0,count=0;const clock=createWallClock({now:()=>time,schedule:()=>1,cancel:()=>{}});
 const stop=clock.subscribe(15000,()=>count++);
 for(let cycle=1;cycle<=50;cycle++){time=cycle*1000;clock.wake();clock.wake();clock.wake();}
 assert.equal(count,50);stop();
});
