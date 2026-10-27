import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createShift, DEFAULT_SETTINGS, periodTotals } from '../lib/domain.ts';

test('production dashboard memo retains separate periods and invalidates history edits and navigation', () => {
 const source=fs.readFileSync(new URL('../components/ShiftTrackerApp.tsx',import.meta.url),'utf8');
 const ast=ts.createSourceFile('app.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const dashboard=ast.statements.find((node)=>ts.isFunctionDeclaration(node)&&node.name?.text==='Dashboard') as ts.FunctionDeclaration;
 const declarations=dashboard.body!.statements.filter((node)=>ts.isVariableStatement(node)&&node.declarationList.declarations.some((d)=>['weekStartMs','weekEndMs','monthStartMs','monthEndMs','week','month','all'].includes(d.name.getText(ast))));
 const code=declarations.map((node)=>node.getText(ast)).join('\n')+'\nglobalThis.result={week,month,all};';
 const shift=createShift(DEFAULT_SETTINGS,new Date('2026-10-12T10:00:00Z'));
 shift.status='completed'; shift.clockOut='2026-10-12T18:00:00Z';
 let calls=0, index=0;
 const hooks:Array<{deps:unknown[];value:unknown}>=[];
 const context=vm.createContext({
   data:{shifts:[shift]},cleaningShifts:[shift],weekStart:new Date('2026-10-12'),weekEnd:new Date('2026-10-19'),monthStart:new Date('2026-10-01'),monthEnd:new Date('2026-11-01'),
   periodTotals:(...args:Parameters<typeof periodTotals>)=>{calls++;return periodTotals(...args);},
   useMemo:(fn:()=>unknown,deps:unknown[])=>{const previous=hooks[index];const next=previous&&deps.every((dep,i)=>Object.is(dep,previous.deps[i]))?previous:{deps,value:fn()};hooks[index++]=next;return next.value;},
 });
 const script=ts.transpileModule(`{ ${code} }`,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.None}}).outputText;
 const render=()=>{index=0;vm.runInContext(script,context);return context.result;};
 const initial=render(); assert.equal(calls,3);
 for(let tick=0;tick<60;tick++)assert.equal(render().week,initial.week);
 assert.equal(calls,3);
 context.weekStart=new Date('2026-10-19'); context.weekEnd=new Date('2026-10-26');
 const navigated=render(); assert.equal(calls,4);assert.equal(navigated.week.paidMs,0);assert.equal(navigated.month,initial.month);
 const edited=structuredClone(shift);edited.clockOut='2026-10-12T19:00:00Z';
 context.data={shifts:[edited]};context.cleaningShifts=[edited];
 const changed=render(); assert.equal(calls,7);assert.equal(changed.month.paidMs-initial.month.paidMs,3600000);
});
