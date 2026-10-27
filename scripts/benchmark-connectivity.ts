import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync,writeFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const before=execFileSync('git',['show','1013bed:components/ShiftTrackerApp.tsx'],{encoding:'utf8',maxBuffer:4*1024*1024});
const after=readFileSync(new URL('../components/ShiftTrackerApp.tsx',import.meta.url),'utf8');
const rows=[];
for(const [version,source] of [['before',before],['after',after]]){
 const ast=ts.createSourceFile('app.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='hasStableInternetProbe');assert.ok(fn);
 for(const mode of ['offline','weak','interrupted','healthy']){
  let requests=0,timeout:(()=>void)|undefined,cleared=0;
  const context=vm.createContext({navigator:{onLine:mode!=='offline'},Date,AbortController,GOOGLE_CONNECTION_PROBE_TIMEOUT_MS:8000,window:{setTimeout:(callback:()=>void)=>{timeout=callback;return 1;},clearTimeout:()=>cleared++},fetch:async(_url:string,options:{signal:AbortSignal})=>{requests++;if(mode==='weak')throw Error('synthetic connection loss');if(mode==='interrupted')return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('synthetic abort'))));return {status:204};}});
  vm.runInContext(ts.transpileModule(fn.getText(ast)+'\nglobalThis.run=hasStableInternetProbe;',{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.None}}).outputText,context);
  const outcomes=[];const start=performance.now();
  for(let i=0;i<20;i++){const pending=context.run();if(mode==='interrupted')timeout!();outcomes.push(await pending);}
  assert.ok(outcomes.every(value=>value===(mode==='healthy')));assert.equal(requests,mode==='offline'?0:20);
  rows.push({version,mode,probes:20,requests,successful:outcomes.filter(Boolean).length,clearedTimers:cleared,elapsedMs:performance.now()-start});
 }
}
const report={node:process.version,rows,scope:'Actual existing production connection probe, controlled offline/rejected-request/timeout/204 responses. Timings are JavaScript harness execution, not radio/network latency. No connectivity behavior change or speed improvement claimed. Local GPS persistence/recovery is benchmarked separately without network calls.'};
writeFileSync(process.argv[2]??'/tmp/connectivity-benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
