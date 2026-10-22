package site.chatgpt.traynor1987.dominosshifttracker;
import org.junit.Test;
import static org.junit.Assert.*;
public class NativeReturnPolicyTest {
 @Test public void returnWithoutWebView() { NativeReturnPolicy p=new NativeReturnPolicy(); p.observe(1000,0,5); p.observe(3000,100,5); assertTrue(p.observe(70000,0,5)); assertEquals(70000,p.confirmedAt); assertEquals(0,p.exactEntryAt); }
 @Test public void continuousReturnPreservesFirstObservation() { NativeReturnPolicy p=new NativeReturnPolicy(); p.observe(1000,0,5);p.observe(3000,100,5);p.observe(40000,100,5); assertFalse(p.observe(65000,34,10));assertTrue(p.observe(67000,33,10));assertEquals(65000,p.firstInsideAt);assertEquals(65000,p.exactEntryAt); }
 @Test public void inaccurateRejected() { NativeReturnPolicy p=new NativeReturnPolicy();assertFalse(p.observe(1000,0,66));assertEquals(0,p.lastAt); }
 @Test public void duplicateRejected() { NativeReturnPolicy p=new NativeReturnPolicy();p.observe(1000,0,5);assertFalse(p.observe(1000,100,5));assertEquals("inside",p.presence); }
 @Test public void rapidReentryRejected() { NativeReturnPolicy p=new NativeReturnPolicy();p.observe(1000,0,5);p.observe(3000,100,5);assertFalse(p.observe(5000,0,5));assertEquals(0,p.confirmedAt); }
 @Test public void borderlineFalseEntryRejected() { NativeReturnPolicy p=new NativeReturnPolicy();p.observe(1000,0,5);p.observe(3000,100,5);p.observe(40000,100,5);assertFalse(p.observe(65000,34,10));assertFalse(p.observe(67000,100,5));assertEquals(0,p.confirmedAt); }
 @Test public void startedOutsideCannotInventExit() { NativeReturnPolicy p=new NativeReturnPolicy();p.observe(1000,100,5);assertFalse(p.observe(70000,0,5));assertEquals(0,p.exitAt); }
 @Test public void modeOffByDefault() {assertEquals("stopped",ShiftMonitoringPolicy.mode(false,true,false,false));}
 @Test public void shiftLifecycle() {assertEquals("adaptive",ShiftMonitoringPolicy.mode(true,true,false,false));assertEquals("delivery",ShiftMonitoringPolicy.mode(true,true,true,false));assertEquals("stopped",ShiftMonitoringPolicy.mode(true,false,false,false));}
 @Test public void highAccuracyChoice() {assertEquals("high_accuracy",ShiftMonitoringPolicy.mode(true,true,false,true));}
}
