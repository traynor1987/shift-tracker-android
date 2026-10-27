import assert from 'node:assert/strict';
import test from 'node:test';
import { syncNativeShiftState, TRUSTED_SHIFT_TRACKER_ORIGIN } from '../lib/nativeBridge.ts';
import { emptyData, migrateAppData } from '../lib/domain.ts';

test('existing installations never opt in implicitly', () => {
 const data = emptyData();
 assert.notEqual(data.settings.alwaysOnShiftMonitoring, true);
 assert.notEqual(migrateAppData(data).settings.alwaysOnShiftMonitoring, true);
});

test('trusted mirror carries explicit monitoring mode and delivery evidence independently', () => {
 const old = globalThis.window;
 const sent:string[]=[];
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:TRUSTED_SHIFT_TRACKER_ORIGIN},ShiftTrackerNative:{postMessage:(value:string)=>sent.push(value)}}});
 try {
 const ok=syncNativeShiftState({stateRevision:'r',shiftId:'s',activityId:'d',shiftActive:true,shiftStartedAtEpochMs:1000,activity:'delivery_double',activityName:'Double',activityStartedAtEpochMs:2000,deliveries:2,estimatedPay:'0',allowedActions:['delivered'],deliveredCustomers:1,requiredCustomers:2,storeExitAtEpochMs:3000,storeExitObserved:true,latestDeliveredAtEpochMs:4000,settings:{alwaysOnShiftMonitoring:true,shiftMonitoringHighAccuracy:false,liveNotification:true,notificationActions:true,shiftReminders:false,breakReminders:false,taskReminders:false,photoCompression:'automatic'}});
 assert.equal(ok,true);const value=JSON.parse(sent[0]);
 assert.equal(value.settings.alwaysOnShiftMonitoring,true);assert.equal(value.settings.shiftMonitoringHighAccuracy,false);
 assert.deepEqual(value.allowedActions,['delivered']);assert.equal(value.storeExitObserved,true);assert.equal(value.latestDeliveredAtEpochMs,4000);
 } finally {Object.defineProperty(globalThis,'window',{configurable:true,value:old});}
});
