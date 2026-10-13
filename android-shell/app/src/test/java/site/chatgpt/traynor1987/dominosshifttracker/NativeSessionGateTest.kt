package site.chatgpt.traynor1987.dominosshifttracker

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NativeSessionGateTest {
    @Test fun missingOrBlankTargetCannotStopCurrentSession() {
        val gate = NativeSessionGate(); val b = gate.begin("B")
        assertFalse(gate.stopTargeted(null)); assertFalse(gate.stopTargeted(" "))
        assertTrue(gate.isCurrent(b))
        assertTrue(gate.stopAll()); assertFalse(gate.isCurrent(b))
    }
    @Test fun commandAcceptedBeforeReplacementCannotStartLate() {
        val gate = NativeSessionGate(); val lateA = gate.begin("A"); val b = gate.begin("B")
        assertFalse(gate.isCurrent(lateA)); assertTrue(gate.isCurrent(b))
    }
    @Test fun queuedStopAllCannotCancelLaterStart() {
        val gate = NativeSessionGate(); gate.begin("A"); gate.stopAll()
        val stoppedGeneration = gate.generation
        val b = gate.begin("B")
        assertTrue(gate.generation != stoppedGeneration); assertTrue(gate.isCurrent(b))
    }
    @Test fun recoveredCommandAuthorityRejectsRetiredStart() {
        val firstProcess = NativeSessionGate(); val a = firstProcess.begin("A"); val b = firstProcess.begin("B")
        val recreated = NativeSessionGate(); recreated.restore(b.deliveryId, b.generation)
        assertFalse(recreated.isCurrent(a)); assertTrue(recreated.isCurrent(b))
        recreated.stopTargeted("B")
        val stoppedProcess = NativeSessionGate(); stoppedProcess.restore(null, recreated.generation)
        assertFalse(stoppedProcess.isCurrent(b))
        val restarted = stoppedProcess.begin("B")
        assertTrue(restarted.generation > b.generation)
    }
    @Test fun matchingStopInvalidatesCallbacks() {
        val gate = NativeSessionGate(); val a = gate.begin("A")
        assertTrue(gate.stopTargeted("A")); assertFalse(gate.isCurrent(a))
    }
    @Test fun staleStopCannotCancelReplacement() {
        val gate = NativeSessionGate(); val a = gate.begin("A"); val b = gate.begin("B")
        assertFalse(gate.stopTargeted("A")); assertTrue(gate.isCurrent(b)); assertFalse(gate.isCurrent(a))
    }
    @Test fun stopBeforePendingProviderCompletesRejectsCompletion() {
        val gate = NativeSessionGate(); val pending = gate.begin("A")
        gate.stopTargeted("A"); assertFalse(gate.isCurrent(pending))
    }
    @Test fun duplicateStopsAreHarmless() {
        val gate = NativeSessionGate(); gate.begin("A")
        assertTrue(gate.stopTargeted("A")); assertFalse(gate.stopTargeted("A"))
        val b = gate.begin("B"); assertFalse(gate.stopTargeted("A")); assertTrue(gate.isCurrent(b))
    }
    @Test fun sameDeliveryRestartCannotAcceptOldCallback() {
        val gate = NativeSessionGate(); val old = gate.begin("A")
        gate.stopTargeted("A"); val restarted = gate.begin("A")
        assertFalse(gate.isCurrent(old)); assertTrue(gate.isCurrent(restarted))
    }
    @Test fun recoveryInvalidatesOldProviderCallbacks() {
        val gate = NativeSessionGate(); val old = gate.begin("A"); val recovery = gate.begin("A")
        assertFalse(gate.isCurrent(old)); assertTrue(gate.isCurrent(recovery))
        assertTrue(gate.stopAll()); assertFalse(gate.isCurrent(recovery))
    }
    @Test fun queuedJournalCompletionCannotDispatchAfterReplacement() {
        val gate = NativeSessionGate()
        val old = gate.begin("A")
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val finished = CountDownLatch(1)
        val offered = mutableListOf<String>()
        val worker = GpsJournalWorker()
        try {
            worker.execute {
                entered.countDown()
                release.await(5, TimeUnit.SECONDS)
                if (gate.isCurrent(old)) offered.add(old.deliveryId)
                finished.countDown()
            }
            assertTrue(entered.await(5, TimeUnit.SECONDS))
            val replacement = gate.begin("B")
            release.countDown()
            assertTrue(finished.await(5, TimeUnit.SECONDS))
            assertTrue(offered.isEmpty())
            assertTrue(gate.isCurrent(replacement))
        } finally { release.countDown(); worker.close() }
    }
    @Test fun staleStopPreservesPendingPermissionStart() {
        val pending = NativeSessionGate()
        pending.begin("A")
        val b = pending.begin("B")
        assertFalse(pending.stopTargeted("A"))
        assertTrue(pending.isCurrent(b))
        assertTrue(pending.stopTargeted("B"))
        assertFalse(pending.isCurrent(b))
    }
    @Test fun explicitStopAllInvalidatesRecoveryWithoutActiveProvider() {
        val gate = NativeSessionGate()
        val recoveryGeneration = gate.generation
        assertTrue(gate.stopAll())
        assertTrue(gate.generation > recoveryGeneration)
    }
}
