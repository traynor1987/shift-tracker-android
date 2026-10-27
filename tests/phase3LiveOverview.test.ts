import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { phase3NextAction, type LiveActionState } from '../lib/phase3NextAction.ts';
const base: LiveActionState = {status:'working',delivery:false,allCustomersDelivered:false,captureBusy:false,backAtStoreAllowed:false,backAtStoreLabel:'WAITING FOR GPS',blocked:false,currentTaskName:null,cooldownSeconds:0};
test('next-action labels follow existing canonical lifecycle guards',()=>{
 assert.equal(phase3NextAction(base).label,'Start a delivery or task');
 assert.equal(phase3NextAction({...base,status:'break'}).label,'End break');
 assert.equal(phase3NextAction({...base,blocked:true}).label,'End blocked time');
 assert.equal(phase3NextAction({...base,cooldownSeconds:30}).label,'Delivery cooldown · 30s');
 assert.equal(phase3NextAction({...base,currentTaskName:'Wash pots'}).label,'Continue current task');
 assert.equal(phase3NextAction({...base,delivery:true}).label,'Mark customer delivered');
 assert.equal(phase3NextAction({...base,delivery:true,captureBusy:true}).label,'Capturing GPS…');
 assert.equal(phase3NextAction({...base,delivery:true,allCustomersDelivered:true}).label,'WAITING FOR GPS');
 assert.equal(phase3NextAction({...base,delivery:true,allCustomersDelivered:true,backAtStoreLabel:'STORE PROOF REQUIRED'}).label,'STORE PROOF REQUIRED');
 assert.equal(phase3NextAction({...base,delivery:true,allCustomersDelivered:true,backAtStoreAllowed:true}).label,'Back at store');
});
const source=fs.readFileSync(new URL('../components/Phase3LiveOverview.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const loadedModule={exports:{} as {default:(props:Record<string,unknown>)=>React.ReactNode}};
const require=createRequire(import.meta.url);
vm.runInNewContext(code,{exports:loadedModule.exports,module:loadedModule,require:(name:string)=>name.includes('phase3NextAction')?{phase3NextAction}:require(name)});
const props={legacy:false,state:'Double delivery',action:{...base,delivery:true},realHustle:'01:30',hustleDetail:'Current run · observed GPS',wages:'£25.00',reimbursement:'£1.50',gps:'ready · outside'};
test('actual production overview renders distinct wage and reimbursement, evidence, and no duplicate controls',()=>{
 const html=renderToStaticMarkup(loadedModule.exports.default(props));
 assert.match(html,/Double delivery/);assert.match(html,/REALHUSTLE/);assert.match(html,/01:30/);
 assert.match(html,/EST\. WAGES/);assert.match(html,/DELIVERY REIMBURSEMENT/);assert.match(html,/£25\.00/);assert.match(html,/£1\.50/);assert.match(html,/ready · outside/);
 assert.doesNotMatch(html,/<button|<input|<a /);assert.doesNotMatch(html,/hidden=/);
});
test('legacy hides the same production overview without changing its contents',()=>{
 const legacy=renderToStaticMarkup(loadedModule.exports.default({...props,legacy:true}));
 const modern=renderToStaticMarkup(loadedModule.exports.default(props));
 assert.equal(legacy.replace(' hidden=""',''),modern);
});
test('familiar ActiveShift retains canonical controls and removes duplicate overview',()=>{
 const app=fs.readFileSync(new URL('../components/ShiftTrackerApp.tsx',import.meta.url),'utf8');
 const start=app.indexOf('function ActiveShift('); const end=app.indexOf('function HoldToOverrideButton(',start);const active=app.slice(start,end);
 assert.doesNotMatch(active,/<Phase3LiveOverview/);
 assert.match(active,/legacy=\{settings\.legacyView === true\}/);
 assert.match(active,/disabled=\{deliveredCaptureBusy\}\s+onClick=\{onMarkDelivered\}/);
 assert.match(active,/allowed=\{backAtStoreAllowed\}\s+overrideAllowed=\{!proofState.required\}/);
 assert.equal((active.match(/const now = useWallClock\(\)/g)??[]).length,1);
});
