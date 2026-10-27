import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createWallClock } from '../lib/wallClock.ts';
import { startPerformanceMonitor } from '../lib/performanceMonitor.ts';

const source=execFileSync('git',['show','1013bed:components/ShiftTrackerApp.tsx'],{encoding:'utf8',maxBuffer:4*1024*1024});
const ast=ts.createSourceFile('baseline.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let baseline='';
function visit(node:ts.Node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes('let lastTick = performance.now()'))baseline=node.arguments[0].getText(ast);ts.forEachChild(node,visit);}visit(ast);
if(!baseline)throw Error('Phase1 production timer effect missing');
let stamp=0,hidden=false,baselineRoot=0,baselineTick=()=>{};
const baselineEvents=new Map<string,()=>void>();
class SyntheticDate extends Date {constructor(value?:string|number){super(value??stamp);}static now(){return stamp;}}
const windowHost={setInterval:(fn:()=>void)=>{baselineTick=fn;return 1;},clearInterval:()=>{},addEventListener:(event:string,fn:()=>void)=>baselineEvents.set(event,fn),removeEventListener:(event:string)=>baselineEvents.delete(event)};
const context=vm.createContext({Date:SyntheticDate,performance:{now:()=>stamp},document:{get hidden(){return hidden;},addEventListener:windowHost.addEventListener,removeEventListener:windowHost.removeEventListener},window:windowHost,setNow:()=>baselineRoot++,recordRuntimeMeasurement:()=>{}});
vm.runInContext(ts.transpileModule(`globalThis.dispose=(${baseline})();`,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.None}}).outputText,context);
let callback=()=>{},scheduled=0,cancelled=0,root=0,live=0;
const clock=createWallClock({now:()=>stamp,schedule:fn=>{callback=fn;scheduled++;return scheduled;},cancel:()=>cancelled++});
const stopRoot=clock.subscribe(15000,()=>root++),stopLive=clock.subscribe(1000,()=>live++);
for(let cycle=1;cycle<=50;cycle++){
 hidden=true;baselineEvents.get('visibilitychange')!();clock.setPaused(true);
 stamp+=60000;hidden=false;baselineEvents.get('visibilitychange')!();clock.setPaused(false);
 baselineEvents.get('focus')!();baselineEvents.get('pageshow')!();clock.wake();clock.wake();
}
const rapidResume={cycles:50,baselineRootStateUpdates:baselineRoot,postRootNotifications:root,postLiveNotifications:live,clockSchedules:scheduled,clockCancellations:cancelled,canonicalWallTime:clock.getSnapshot(),expectedWallTime:stamp};
stopLive();const rootStart=root,baselineStart=baselineRoot;
for(let tab=0;tab<200;tab++){const unmount=clock.subscribe(1000,()=>live++);stamp+=1000;baselineTick();callback();unmount();}
const navigation={swaps:200,baselineRootStateUpdates:baselineRoot-baselineStart,postRootNotifications:root-rootStart};
stopRoot();context.dispose();
let callbacks=0;const handlers=new Map<string,()=>void>();
for(let cycle=0;cycle<100;cycle++){
 const stop=startPerformanceMonitor({now:()=>stamp,hidden:()=>false,setTimer:()=>{callbacks++;return 1;},clearTimer:()=>{},on:(event,fn)=>{handlers.set(event,fn);return ()=>handlers.delete(event);},memory:()=>undefined});stop();
}
const report={node:process.version,rapidResume,navigation,monitorMountUnmount:{cycles:100,scheduled:callbacks,remainingEventListeners:handlers.size},scope:'Executed Phase1 root timer effect vs production Phase2 wall-clock/monitor engines. Controlled notification/lifecycle simulation, not full React rendering, real tab navigation, phone lock or device resume.'};
writeFileSync(process.argv[2]??'/tmp/lifecycle-benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
