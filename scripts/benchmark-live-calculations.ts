import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import vm from 'node:vm';
import { periodTotals, deliveryGeofenceDurations, type Shift, type ActivityRecord } from '../lib/domain.ts';
import { createHustleAllowanceCache } from '../lib/hustleAllowanceCache.ts';
import { createWallClock } from '../lib/wallClock.ts';

// The baseline implementation is loaded from Phase 1, not duplicated in this benchmark.
const original = execFileSync('git',['show','1013bed:components/ShiftTrackerApp.tsx'],{encoding:'utf8',maxBuffer:4*1024*1024});
const ast=ts.createSourceFile('baseline.tsx',original,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const fn=ast.statements.find((node)=>ts.isFunctionDeclaration(node)&&node.name?.text==='weeklyHustleAllowance')!;
const context=vm.createContext({deliveryGeofenceDurations});
vm.runInContext(ts.transpileModule(fn.getText(ast)+'\nglobalThis.baseline=weeklyHustleAllowance;', {compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.None}}).outputText, context);
const baseline=context.baseline as ReturnType<typeof createHustleAllowanceCache>;
const fixture=(count:number,runs:number) => Array.from({length:count},(_,index)=>({
 id:`s${index}`, status:'completed',clockIn:'2026-10-12T10:00:00Z',clockOut:'2026-10-12T18:00:00Z',hourlyRatePence:1200,singleRatePence:100,doubleRatePence:200,
 breaks:[],deliveries:[],taskSnapshot:[],mileage:{method:'direct',directTenths:100},reimbursementStatus:'awaiting',
 activities:Array.from({length:runs},(_,run)=>({id:`a${index}-${run}`,type:'single_delivery',start:'2026-10-12T10:00:00Z',end:'2026-10-12T10:20:00Z',storeExitAt:'2026-10-12T10:01:00Z',storeEntryAt:'2026-10-12T10:18:00Z',storeExitObserved:true,storeEntryObserved:true})),
})) as unknown as Shift[];
const time=(fn:()=>void,repeats:number) => {const start=performance.now();for(let i=0;i<repeats;i++) fn();return +(performance.now()-start).toFixed(3);};
const target={id:'live',start:'2026-10-12T12:00:00Z'} as ActivityRecord;
const rows=[];
for(const [name,count,runs] of [['normal',40,8],['long-history',500,20]] as const){
 const history=fixture(count,runs), cache=createHustleAllowanceCache();
 baseline(history,target);cache(history,target);
 const periods=[[new Date('2026-10-12'),new Date('2026-10-19')],[new Date('2026-10-01'),new Date('2026-11-01')],[new Date(0),new Date(8640000000000000)]];
 const totals=()=>periods.map(([start,end])=>periodTotals(history,start,end,history));
 // A clock-only render keeps these exact immutable dependencies; one generation computes each period.
 rows.push({scenario:name,shifts:count,runs:count*runs,iterations:60,weeklyBaselineMs:time(()=>baseline(history,target),60),weeklyValueCacheMs:time(()=>cache(history,target),60),periodsBaselineMs:time(totals,60),periodsMemoGenerationMs:time(totals,1)});
}
let stamp=0,callback:()=>void=()=>{};
const clock=createWallClock({now:()=>stamp,schedule:(fn)=>{callback=fn;return 1;},cancel:()=>{}});
let root=0,live=0;
const stopRoot=clock.subscribe(15000,()=>root++),stopLive=clock.subscribe(1000,()=>live++);
for(stamp=1000;stamp<=60000;stamp+=1000)callback();
stopRoot();stopLive();
console.log(JSON.stringify({rows,clock60s:{baselineRootUpdates:60,postRootNotifications:root,liveScreenNotifications:live},limitations:['Calculation microbenchmark and production clock notification counts; not browser frame, React commit or memory measurements.','Value-keyed cache still scans completed timing fields to validate mutable edits.','Live screen boundaries still render each second.']},null,2));
