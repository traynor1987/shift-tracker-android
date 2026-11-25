import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeReplayBatch as createBatch } from '../lib/nativeReplay.ts';
import { emptyData } from '../lib/domain.ts';


test('recovered points share one durable save and retain concurrent user changes', async () => {
  let canonical = emptyData();
  const batch = createBatch(canonical);
  for (let i = 0; i < 32; i++) {
    await batch.commit((data: typeof canonical) => { data.settings.hourlyRatePence += 1; });
  }
  const before = canonical.settings.hourlyRatePence;
  assert.equal(batch.data.settings.hourlyRatePence, before + 32);
  let saves = 0;
  canonical.settings.nextStoreId = 'maghull';
  const result = await batch.persist(async (update: (data: typeof canonical) => boolean | void) => {
    saves++;
    const draft = structuredClone(canonical);
    if (update(draft) === false) return {status:'rejected'};
    canonical = draft;
    return {status:'persisted'};
  });
  assert.equal(result.status, 'persisted');
  assert.equal(saves, 1);
  assert.equal(canonical.settings.hourlyRatePence, before + 32);
  assert.equal(canonical.settings.nextStoreId, 'maghull');
});

test('failed batch persistence runs no saved callbacks and reports failure for journal retention', async () => {
  const canonical = emptyData();
  const batch = createBatch(canonical);
  let effects = 0;
  await batch.commit((data: typeof canonical) => { data.lastBackupAt = '2026-11-25T10:00:00Z'; }, () => { effects++; });
  const result = await batch.persist(async () => ({status:'failed',error:new Error('disk')}));
  assert.equal(result.status, 'failed');
  assert.equal(effects, 0);
  assert.equal(canonical.lastBackupAt, null);
});

test('actual incoming native fix marks provider live before the recovery-save queue runs', async () => {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const ts = await import('typescript');
  const { acceptedNativeFix } = await import('../lib/nativeLocationSync.ts');
  const { nativeSampleIsFresh } = await import('../lib/nativeBridge.ts');
  const source = readFileSync(new URL('../components/ShiftTrackerApp.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('      const liveDelivery = activeDeliveryForRecovery;', source.indexOf('const sample = readNativeLocationSample(event)'));
  const end = source.indexOf('      nativeReplayPendingRef.current.push(sample);', start);
  assert.ok(start > 0 && end > start);
  const now = Date.now();
  let recovering = true;
  let status = 'searching';
  const latest = {current: null as {deliveryId: string; timestamp: number} | null};
  const context = vm.createContext({
    activeDeliveryForRecovery: {id:'current', start:new Date(now - 600_000).toISOString()},
    sample:{deliveryId:'current',timestampEpochMs:now},
    nativeSampleIsFresh, acceptedNativeFix, Date,
    latestNativeProviderFixRef:latest,
    setNativeGpsStalled:(value: boolean) => { recovering = value; },
    setLocationState:(update: (current: {status: string}) => {status: string}) => {status = update({status}).status;},
  });
  const code = ts.transpileModule(source.slice(start, end), {compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.None}}).outputText;
  vm.runInContext(`{${code}}`, context);
  assert.equal(recovering, false);
  assert.equal(status, 'ready');
  assert.equal(latest.current?.timestamp, now);
  context.sample.timestampEpochMs = now - 120_000;
  vm.runInContext(`{${code}}`, context);
  assert.equal(latest.current?.timestamp, now);
  context.sample.deliveryId = 'previous';
  context.sample.timestampEpochMs = now + 1000;
  vm.runInContext(`{${code}}`, context);
  assert.equal(latest.current?.timestamp, now);
});

for (const fails of [false, true]) test(`actual replay processor saves 32 ordered fixes once and acknowledges only durable success (failure=${fails})`, async () => {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const ts = await import('typescript');
  const { flushNativeSamples } = await import('../lib/nativeLocationSync.ts');
  const source = readFileSync(new URL('../components/ShiftTrackerApp.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let body = '';
  function visit(node: import('typescript').Node) {
    if (ts.isBinaryExpression(node) && node.left.getText(ast) === 'processNativeReplayRef.current') body = node.right.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(body);
  let canonical = emptyData();
  const ack: string[] = [];
  const ingested: number[] = [];
  let saves = 0;
  let release!: () => void;
  const persisted = new Promise<void>(resolve => {release = resolve;});
  const unpersisted = {current:new Set<string>()};
  const blocked = {current:false};
  const context = vm.createContext({
    nativeReturnFlushRef:{current:Promise.resolve()},nativeSamplePersistenceBlockedRef:blocked,
    lastCommittedDataRef:{get current(){return canonical;}},createNativeReplayBatch:createBatch,
    performance,flushNativeSamples,
    applyNativeLocationReadingRef:{current:async (position: {timestamp:number}, _deliveryId: string, _sampleId: string, batch: ReturnType<typeof createBatch>) => {
      ingested.push(position.timestamp);
      await batch.commit(data => {data.settings.hourlyRatePence += 1;});
      return {accepted:true,status:'persisted'};
    }},
    commit:async (update: (data: typeof canonical) => boolean | void, applied: (data: typeof canonical) => void) => {
      saves++;
      const draft = structuredClone(canonical);
      if (update(draft) === false) return {status:'rejected'};
      await persisted;
      if (fails) return {status:'failed',error:new Error('disk')};
      canonical = draft;
      applied(canonical);
      return {status:'persisted'};
    },
    nativeUnpersistedSampleIdsRef:unpersisted,acknowledgeNativeLocationSample:(id: string) => ack.push(id),
    recordRuntimeMeasurement:() => {},appendDeveloperLog:() => {},
  });
  vm.runInContext(ts.transpileModule(`globalThis.processBatch=(${body});`,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.None}}).outputText,context);
  const samples = Array.from({length:32},(_,i)=>({sampleId:`sample-${i}`,deliveryId:'run',timestampEpochMs:i+1,latitude:0,longitude:0,accuracy:5}));
  const pending = context.processBatch(samples);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(saves,1);
  assert.equal(ack.length,0);
  release();
  await pending;
  assert.deepEqual(ingested,Array.from({length:32},(_,i)=>i+1));
  assert.equal(ack.length,fails ? 0 : 32);
  assert.equal(unpersisted.current.size,fails ? 32 : 0);
  assert.equal(blocked.current,fails);
});
