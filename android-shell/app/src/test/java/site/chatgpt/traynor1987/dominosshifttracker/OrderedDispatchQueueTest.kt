package site.chatgpt.traynor1987.dominosshifttracker

import kotlin.test.*

class OrderedDispatchQueueTest {
    @Test fun replayAndLiveRemainOrderedAcrossYieldingBatches() {
        val scheduled = ArrayDeque<() -> Unit>(); val received = mutableListOf<Int>()
        val queue = OrderedDispatchQueue(2) { scheduled.add(it) }
        queue.offer((0 until 5).map { n -> { received.add(n); Unit } })
        scheduled.removeFirst().invoke()
        queue.offer(listOf({ received.add(5); Unit }))
        while (scheduled.isNotEmpty()) scheduled.removeFirst().invoke()
        assertEquals((0..5).toList(), received)
    }
    @Test fun deliverySwitchInvalidatesQueuedOldOffersAndKeepsNewLive() {
        val scheduled = ArrayDeque<() -> Unit>(); val received = mutableListOf<String>()
        val gate = NativeSessionGate(); val a = gate.begin("A")
        val queue = OrderedDispatchQueue(1) { scheduled.add(it) }
        queue.offer(listOf({ if (gate.isCurrent(a)) received.add("A"); Unit }))
        val b = gate.begin("B")
        queue.offer(listOf({ if (gate.isCurrent(b)) received.add("B"); Unit }))
        while (scheduled.isNotEmpty()) scheduled.removeFirst().invoke()
        assertEquals(listOf("B"), received)
    }
    @Test fun reconnectReplayPrecedesPreviouslyQueuedNewLiveFix() {
        val scheduled = ArrayDeque<() -> Unit>(); val received = mutableListOf<Int>()
        val queue = OrderedDispatchQueue(1) { scheduled.add(it) }
        queue.offer(listOf({ received.add(3); Unit }))
        queue.beginReplay()
        scheduled.removeFirst().invoke()
        assertTrue(received.isEmpty())
        queue.endReplay(listOf({ received.add(1); Unit }, { received.add(2); Unit }))
        while (scheduled.isNotEmpty()) scheduled.removeFirst().invoke()
        assertEquals(listOf(1, 2, 3), received)
    }
    @Test fun overlappingReplayBarriersHoldLiveUntilAllSnapshotsArrive() {
        val scheduled = ArrayDeque<() -> Unit>(); val received = mutableListOf<Int>()
        val queue = OrderedDispatchQueue(1) { scheduled.add(it) }
        queue.beginReplay(); queue.beginReplay()
        queue.offer(listOf({ received.add(3); Unit }))
        queue.endReplay(listOf({ received.add(1); Unit }))
        assertTrue(scheduled.isEmpty())
        queue.endReplay(emptyList())
        while (scheduled.isNotEmpty()) scheduled.removeFirst().invoke()
        assertEquals(listOf(1, 3), received)
    }
    @Test fun overlappingNonEmptyReplaySnapshotsRemainFifo() {
        val scheduled = ArrayDeque<() -> Unit>(); val received = mutableListOf<Int>()
        val queue = OrderedDispatchQueue(1) { scheduled.add(it) }
        queue.beginReplay(); queue.beginReplay()
        queue.endReplay(listOf({ received.add(1); Unit }, { received.add(2); Unit }))
        queue.endReplay(listOf({ received.add(1); Unit }, { received.add(2); Unit }, { received.add(3); Unit }))
        while (scheduled.isNotEmpty()) scheduled.removeFirst().invoke()
        assertEquals(listOf(1, 2, 1, 2, 3), received)
        assertEquals(0, queue.backlogCount)
    }
    @Test fun partialReplayKeepsItsRemainderBeforeReflush() {
        val scheduled = ArrayDeque<() -> Unit>(); val received = mutableListOf<Int>()
        val queue = OrderedDispatchQueue(1) { scheduled.add(it) }
        queue.beginReplay()
        queue.endReplay(listOf({ received.add(1); Unit }, { received.add(2); Unit }))
        scheduled.removeFirst().invoke()
        queue.beginReplay()
        queue.endReplay(listOf({ received.add(3); Unit }))
        while (scheduled.isNotEmpty()) scheduled.removeFirst().invoke()
        assertEquals(listOf(1, 2, 3), received)
    }
    @Test fun barrierRaisedInsideDispatchStopsRemainingBatchImmediately() {
        val scheduled = ArrayDeque<() -> Unit>(); val received = mutableListOf<Int>()
        val queue = OrderedDispatchQueue(16) { scheduled.add(it) }
        queue.offer(listOf({ received.add(1); queue.beginReplay() }, { received.add(3); Unit }))
        scheduled.removeFirst().invoke()
        assertEquals(listOf(1), received); assertTrue(scheduled.isEmpty())
        queue.endReplay(listOf({ received.add(2); Unit }))
        while (scheduled.isNotEmpty()) scheduled.removeFirst().invoke()
        assertEquals(listOf(1, 2, 3), received)
    }
}
