import test from 'node:test';
import assert from 'node:assert/strict';
import { saveFileWithNativeShell, resumePendingNativeFileSave, TRUSTED_SHIFT_TRACKER_ORIGIN } from '../lib/nativeBridge.ts';

async function shell(run: (sent: Record<string, unknown>[], reply: (message: unknown) => void) => Promise<void>, respond: (message: Record<string, unknown>, reply: (value: unknown) => void) => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const listeners = new Set<(event: MessageEvent) => void>();
  const sent: Record<string, unknown>[] = [];
  const values = new Map<string,string>();
  const windowListeners = new Map<string,Set<() => void>>();
  const reply = (data: unknown) => { for (const listener of listeners) listener({ data: JSON.stringify(data) } as MessageEvent); };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: { origin: TRUSTED_SHIFT_TRACKER_ORIGIN },
    localStorage: { getItem(key: string) { return values.get(key) ?? null; }, setItem(key: string, value: string) {values.set(key,value);}, removeItem(key: string) {values.delete(key);} },
    addEventListener(type: string, listener: () => void) { if(!windowListeners.has(type)) windowListeners.set(type,new Set()); windowListeners.get(type)!.add(listener); },
    removeEventListener(type: string, listener: () => void) { windowListeners.get(type)?.delete(listener); },
    dispatchEvent(event: Event) { windowListeners.get(event.type)?.forEach(listener=>listener()); },
    setTimeout, clearTimeout, setInterval, clearInterval,
    ShiftTrackerNative: {
      addEventListener(_name: string, listener: (event: MessageEvent) => void) { listeners.add(listener); },
      removeEventListener(_name: string, listener: (event: MessageEvent) => void) { listeners.delete(listener); },
      postMessage(raw: string) { const message = JSON.parse(raw); sent.push(message); queueMicrotask(() => respond(message, reply)); },
    },
  }});
  try { await run(sent, reply); } finally { if (original) Object.defineProperty(globalThis, 'window', original); else Reflect.deleteProperty(globalThis, 'window'); }
}
const respond = (message: Record<string, unknown>, reply: (value: unknown) => void) => {
  const requestId = message.requestId;
  if (message.type === 'shift_tracker_file:capabilities') reply({type: 'shift_tracker_file:capabilities', requestId, protocol: 2});
  if (message.type === 'shift_tracker_file:save_begin' || message.type === 'shift_tracker_file:save_chunk') reply({type: 'shift_tracker_file:progress', requestId, sequence: message.sequence ?? -1});
  if (message.type === 'shift_tracker_file:save_commit') reply({type: 'shift_tracker_file:save_result', requestId, status: 'saved', verified: true, bytes: 20000001, sha256: 'a'.repeat(64), stage: 'verified'});
  // Reproduce the shipping native guard without allocating Android/WebView.
  if (message.type === 'shift_tracker_file:save') reply({type: 'shift_tracker_file:save_result', requestId, status: String(message.content).length > 20_000_000 ? 'error' : 'saved', message: 'The requested export was not an allowed JSON or CSV file'});
};
test('a full GPS export above the existing 20M limit transfers bounded chunks then waits for verified save', async () => {
  await shell(async sent => {
    const content = 'x'.repeat(20_000_001);
    const result = await saveFileWithNativeShell('full.json', content, 'application/json');
    assert.equal(result?.status, 'saved');
    assert.ok(sent.every(message => !message.content || String(message.content).length <= 48 * 1024));
    assert.equal(sent.filter(message => message.type === 'shift_tracker_file:save_chunk').map(message => message.content).join(''), content);
  }, respond);
});
test('native cancellation and readback failure remain distinct', async () => {
  for (const status of ['cancelled', 'error']) await shell(async () => {
    const result = await saveFileWithNativeShell('full.json', '{}', 'application/json');
    assert.equal(result?.status, status);
  }, (message, reply) => {
    if (message.type === 'shift_tracker_file:save_commit' || message.type === 'shift_tracker_file:save') reply({type: 'shift_tracker_file:save_result', requestId: message.requestId, status, stage: status === 'error' ? 'verify' : 'picker'});
    else respond(message, reply);
  });
});
test('unverified v2 completion is rejected', async () => {
  await shell(async () => assert.equal((await saveFileWithNativeShell('full.json', '{}', 'application/json'))?.status, 'error'), (message, reply) => {
    if (message.type === 'shift_tracker_file:save_commit' || message.type === 'shift_tracker_file:save') reply({type: 'shift_tracker_file:save_result', requestId: message.requestId, status: 'saved'});
    else respond(message, reply);
  });
});

test('older APKs retain small export compatibility and explain large export upgrade requirement', async () => {
  await shell(async sent => {
    assert.equal((await saveFileWithNativeShell('small.json','{}','application/json'))?.status,'saved');
    const large = await saveFileWithNativeShell('large.json','x'.repeat(20_000_001),'application/json');
    assert.equal(large?.status,'error'); assert.equal(large?.stage,'compatibility');
    assert.equal(sent.filter(item=>item.type==='shift_tracker_file:save').length,1);
  }, (message, reply) => { if(message.type!=='shift_tracker_file:capabilities') respond(message,reply); });
});
test('UTF-16 chunk boundaries preserve Unicode byte-for-byte', async () => {
  await shell(async sent => {
    const content = 'x'.repeat(48*1024-1)+'🚙é';
    assert.equal((await saveFileWithNativeShell('unicode.json',content,'application/json'))?.status,'saved');
    const chunks = sent.filter(item=>item.type==='shift_tracker_file:save_chunk').map(item=>String(item.content));
    assert.deepEqual(Buffer.concat(chunks.map(chunk=>Buffer.from(chunk,'utf8'))), Buffer.from(content,'utf8'));
  },respond);
});
test('a recreated WebView recovers a persisted native receipt without resending file content', async () => {
  await shell(async sent => {
    window.localStorage.setItem('shift-tracker-pending-file-receipt-v2',JSON.stringify({requestId:'file-123-abc',startedAt:Date.now()}));
    const result = await resumePendingNativeFileSave();
    assert.equal(result?.status,'saved'); assert.equal(result?.verified,true);
    assert.equal(window.localStorage.getItem('shift-tracker-pending-file-receipt-v2'),null);
    assert.ok(sent.every(message=>message.type==='shift_tracker_file:save_status'));
  },(message,reply)=>reply({type:'shift_tracker_file:save_result',requestId:message.requestId,status:'saved',verified:true,bytes:2,sha256:'b'.repeat(64),stage:'verified'}));
});
test('resume re-queries a dropped native completion callback', async () => {
  await shell(async () => {
    const result = await saveFileWithNativeShell('resume.json','{}','application/json');
    assert.equal(result?.status,'saved');
  },(message,reply)=>{
    if(message.type==='shift_tracker_file:save_commit') queueMicrotask(()=>window.dispatchEvent(new Event('focus')));
    else if(message.type==='shift_tracker_file:save_status') reply({type:'shift_tracker_file:save_result',requestId:message.requestId,status:'saved',verified:true,bytes:2,sha256:'b'.repeat(64),stage:'verified'});
    else respond(message,reply);
  });
});

test('malformed or premature chunk completion can never trigger browser fallback or report success', async () => {
  for (const status of ['unknown','saved']) await shell(async () => {
    const result = await saveFileWithNativeShell('full.json','{}','application/json');
    assert.equal(result?.status,'error');
    assert.equal(result?.stage,'staging');
  },(message,reply)=>{
    if(message.type==='shift_tracker_file:save_chunk') reply({type:'shift_tracker_file:save_result',requestId:message.requestId,status,verified:true,bytes:2,sha256:'b'.repeat(64)});
    else respond(message,reply);
  });
});
