package site.chatgpt.traynor1987.dominosshifttracker

import kotlin.test.*

class AcceptedFixProgressTest {
    @Test fun acceptedWriteRenewsWatchdogWhileReplayIsBlocked() {
        val progress = AcceptedFixProgress()
        val scheduled = ArrayDeque<() -> Unit>()
        val queue = OrderedDispatchQueue(1) { scheduled.add(it) }
        queue.beginReplay()
        queue.offer(listOf({ error("Replay barrier must hold live dispatch") }))
        progress.accepted("A:1", 60_000)
        assertTrue(scheduled.isEmpty())
        assertFalse(NativeTrackingPolicy.shouldRecoverStalledStream(61_000, 1_000, progress.lastReceiptElapsedMs, null))
    }
    @Test fun duplicatesDoNotRenewAndRestartResetsMonotonicClock() {
        val progress = AcceptedFixProgress()
        progress.accepted("A:1", 2_000); progress.accepted("A:1", 70_000)
        assertEquals(2_000L, progress.lastReceiptElapsedMs)
        assertTrue(NativeTrackingPolicy.shouldRecoverStalledStream(62_000, 1_000, progress.lastReceiptElapsedMs, null))
        progress.reset(); assertNull(progress.lastReceiptElapsedMs)
        progress.accepted("B:1", 1_000); assertEquals(1_000L, progress.lastReceiptElapsedMs)
    }
}
