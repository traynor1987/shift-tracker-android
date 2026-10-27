import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as timing from '../lib/taskTiming.ts';
import { createShift, emptyData, type AppData, type ShiftTaskRecord } from '../lib/domain.ts';
import { validateAppDataStructure } from '../lib/backup.ts';

const script=ts.transpileModule(readFileSync(new URL('../scripts/live-task-repair.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.CommonJS}}).outputText;
type FakeElement = {style:{cssText:string};children:FakeElement[];textContent?:string;id?:string;disabled?:boolean;onclick?:()=>void;append:(...items:FakeElement[])=>void;remove:()=>void};
function openApp(ambiguous=false) {
  let data=emptyData();
  const shift=createShift(data.settings,new Date('2026-09-24T10:00:00Z'));
  shift.activities=[];
  shift.taskSnapshot=[{...data.cleaningRota![0],id:'recovery',status:'paused',segments:[{start:'2026-09-24T10:10:00Z',end:'2026-09-24T10:09:59Z'}],completedAt:null,quickCompleted:false} as ShiftTaskRecord];
  data.shifts=[shift];
  const original=structuredClone(data);
  const dispatch=(update:(d:AppData)=>AppData)=>{data=update(data);};
  const children: FakeElement[]=[];
  const roots=[{__reactFiber$test:{memoizedState:{memoizedState:data,queue:{dispatch}}}}];
  if(ambiguous) roots.push({__reactFiber$test:{memoizedState:{memoizedState:data,queue:{dispatch:()=>{}}}}});
  const document={getElementById:()=>null,querySelectorAll:()=>roots,createElement:()=>({style:{cssText:''},children:[] as FakeElement[],append(...items:FakeElement[]){this.children.push(...items);},remove(){}}),body:{append:(node:FakeElement)=>children.push(node)}};
  const context={exports:{},require:()=>timing,location:{origin:'https://dominos-shift-tracker.traynor1987.chatgpt.site'},document,console:{info:()=>{}}};
  return {run:()=>vm.runInNewContext(script,context),get data(){return data;},original,children};
}
test('old running bundle recovery is explicit, validates memory and leaves persistence to Retry Save',()=>{
  const app=openApp();app.run();assert.deepEqual(app.data,app.original);
  const panel=app.children[0];assert.equal(panel.children[1].textContent,'REPAIR CURRENT SHIFT');
  panel.children[1].onclick!();
  assert.equal(validateAppDataStructure(app.data).ok,true);
  assert.equal(app.data.shifts[0].taskSnapshot![0].segments[0].end,'2026-09-24T10:10:00Z');
  assert.match(panel.children[0].textContent!,/RETRY SAVE/);
  assert.match(app.data.shifts[0].taskSnapshot![0].shiftNotes!,/original end/);
});
test('old bundle recovery refuses ambiguous React state and changes nothing',()=>{
  const app=openApp(true);assert.throws(app.run,/exactly one/);assert.deepEqual(app.data,app.original);
});
