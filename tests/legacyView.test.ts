import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { emptyData,createShift,migrateAppData,DEFAULT_SETTINGS } from '../lib/domain.ts';
import { validateAppDataStructure } from '../lib/backup.ts';
import { loadIndexedDbData,saveIndexedDbData,resetIndexedDbSessionForTests } from '../lib/indexedDbStorage.ts';

test('Legacy View defaults off, validates and survives canonical save/reload',async()=>{
 assert.equal(DEFAULT_SETTINGS.legacyView,false);
 const data=emptyData();delete data.settings.legacyView;
 assert.equal(migrateAppData(data).settings.legacyView,false);
 data.settings.legacyView=true;const factory=new IDBFactory(),options={factory,localStorage:null,databaseName:'phase3-view'};
 await loadIndexedDbData(options);await saveIndexedDbData(data,options);resetIndexedDbSessionForTests(options.databaseName);
 const reload=await loadIndexedDbData(options);assert.notEqual(reload.status,'failed');if(reload.status!=='failed')assert.equal(reload.data.settings.legacyView,true);
 (data.settings as unknown as Record<string,unknown>).legacyView='true';assert.equal(validateAppDataStructure(data).ok,false);
});

test('presentation-only switch preserves active session references, timestamps and navigation inputs',async()=>{
 const api=await import('../lib/presentationPreference.ts').catch(()=>null);assert.ok(api,'presentation reference preservation must exist');
 const current=emptyData();const shift=createShift(current.settings,new Date('2026-10-13T10:00:00Z'));shift.activities=[{id:'active-A',shiftId:shift.id,type:'single_delivery',start:'2026-10-13T10:01:00Z',end:null}];current.shifts=[shift];
 const original=JSON.stringify(current.shifts);const next=structuredClone(current);next.settings.legacyView=true;
 const result=api.preservePresentationReferences(current,next);
 assert.equal(result.shifts,current.shifts);assert.equal(result.settings.carryoutDepartureZone,current.settings.carryoutDepartureZone);
 assert.equal(result.shifts[0].activities![0],current.shifts[0].activities![0]);assert.equal(JSON.stringify(result.shifts),original);
 const changed=structuredClone(result);changed.shifts[0].activities![0].end='2026-10-13T11:00:00Z';changed.settings.legacyView=false;
 assert.equal(api.preservePresentationReferences(result,changed),changed);
});
