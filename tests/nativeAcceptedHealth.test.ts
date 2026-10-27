import { returnEligibility } from "../lib/returnEligibility.ts";
import { traceReturn } from "../lib/returnDiagnostics.ts";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { emptyData,createShift,type ActivityRecord } from '../lib/domain.ts';

test('raw callbacks do not refresh useful accepted-fix health; old sessions/future fixes are fenced',async()=>{
 const api=await import('../lib/nativeLocationSync.ts');
 assert.equal(typeof api.acceptedNativeFix,'function');
 const old={deliveryId:'B',timestamp:100};
 assert.deepEqual(api.acceptedNativeFix(old,{deliveryId:'A',timestamp:200},'B',true,300),old);
 assert.deepEqual(api.acceptedNativeFix(old,{deliveryId:'B',timestamp:200},'B',false,300),old);
 assert.deepEqual(api.acceptedNativeFix(old,{deliveryId:'B',timestamp:200},'B',true,300),{deliveryId:'B',timestamp:200});
 assert.deepEqual(api.acceptedNativeFix(old,{deliveryId:'B',timestamp:10000},'B',true,300),old);
});

test('actual ingestion reads canonical session before queued old callback can mutate it',async()=>{
 const source=readFileSync(new URL('../components/ShiftTrackerApp.tsx',import.meta.url),'utf8');
 const ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let body='';
 const visit=(node:ts.Node)=>{if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='applyLocationReading')body=node.initializer!.getText(ast);ts.forEachChild(node,visit);};visit(ast);
 const stale=emptyData(),latest=emptyData();for(const [data,id] of [[stale,'A'],[latest,'B']] as const){const shift=createShift(data.settings,new Date('2026-10-13T10:00:00Z'));shift.activities=[{id,shiftId:shift.id,type:'single_delivery',start:'2026-10-13T10:10:00Z',end:null} as ActivityRecord];data.shifts=[shift];}
 const original=JSON.stringify(latest);let writes=0;
 const context=vm.createContext({traceReturn,returnEligibility,data:stale,lastCommittedDataRef:{current:latest},nativeUnpersistedSampleIdsRef:{current:new Set()},appendDeveloperLog:()=>{},commit:async()=>{writes++;return {status:'persisted'};}});
 vm.runInContext(ts.transpileModule(`globalThis.run=(${body});`,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.None}}).outputText,context);
 const result=await context.run({timestamp:Date.parse('2026-10-13T10:15:00Z'),coords:{latitude:0,longitude:0,accuracy:5}},'A','old');
 assert.equal(result.accepted,false);assert.equal(writes,0);assert.equal(JSON.stringify(latest),original);
});
