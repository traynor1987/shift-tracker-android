package site.chatgpt.traynor1987.dominosshifttracker

import org.junit.Assert.*
import org.junit.Test

class NativeDrainPolicyTest {
    @Test fun capturedSampleMustBeDurablyRemoved() {
        assertFalse(NativeDrainPolicy.complete(setOf("d:1", "d:2"), setOf("d:2")))
        assertTrue(NativeDrainPolicy.complete(setOf("d:1", "d:2"), emptySet()))
    }
    @Test fun laterSamplesCannotStarveExplicitFinish() {
        assertTrue(NativeDrainPolicy.complete(setOf("d:1"), setOf("d:2", "other:1")))
    }
    @Test fun unreadableJournalNeverLooksDrained() {
        assertFalse(NativeDrainPolicy.complete(emptySet(), null))
    }
    @Test fun failedAcknowledgementRemainsInBarrier() {
        val disk = mutableListOf("d:1")
        val journal = JournalSnapshot(10, { it: String -> it }, { disk.toList() }, { "disk_full" })
        val watermark = journal.pending().toSet()
        assertEquals("disk_full", journal.remove("d:1"))
        assertFalse(NativeDrainPolicy.complete(watermark, journal.pending().toSet()))
    }
}
