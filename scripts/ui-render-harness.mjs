import { build } from 'esbuild';
import { mkdir,readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
export async function loadPresentationComponents(baseline=false) {
 const directory=resolve('.sites-runtime/ui-tests');await mkdir(directory,{recursive:true});
 const contents=baseline ? execFileSync('git',['show','3fd17544:components/ShiftTrackerApp.tsx'],{encoding:'utf8',maxBuffer:4*1024*1024}) : await readFile('components/ShiftTrackerApp.tsx','utf8');
 const output=resolve(directory,baseline?`baseline-${process.pid}.cjs`:`current-${process.pid}.cjs`);
 await build({stdin:{contents:contents+'\nexport { ActiveShift, TasksPage, SettingsPage };',resolveDir:resolve('components'),sourcefile:'acceptance.tsx',loader:'tsx'},outfile:output,bundle:true,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':resolve('.')},external:['react','react/*','react-dom','react-dom/*'],logLevel:'silent'});
 const require=createRequire(import.meta.url);delete require.cache[output];return require(output);
}
