package site.chatgpt.traynor1987.dominosshifttracker

import kotlin.test.*

class JournalSnapshotTest {
    private data class Row(val id: String, val delivery: String = "A")
    private class Disk {
        var rows = listOf<Row>()
        var reads = 0
        var writes = 0
        var fail = false
        fun journal(limit: Int = 20_000) = JournalSnapshot<Row>(limit, { it.id }, {
            reads++; rows.toList()
        }, { next ->
            writes++
            if (fail) "write_failed" else { rows = next.toList(); null }
        })
    }
    @Test fun rapidLongDeliveryUsesOneReadAndPreservesOrder() {
        val disk = Disk(); val journal = disk.journal()
        repeat(2_000) { assertNull(journal.append(Row("A:$it")).failure); assertEquals(it + 1, journal.count()) }
        assertEquals(1, disk.reads)
        assertEquals((0 until 2_000).map { "A:$it" }, journal.pending().map { it.id })
    }
    @Test fun duplicateAndDelayedAbsentAcknowledgementsDoNotRewrite() {
        val disk = Disk(); val journal = disk.journal()
        journal.append(Row("1")); journal.append(Row("1"))
        assertEquals(1, disk.writes)
        journal.remove("1"); journal.remove("1")
        assertEquals(2, disk.writes); assertEquals(0, journal.count())
    }
    @Test fun failedWriteNeverPublishesAndRestartReplaysCommittedRows() {
        val disk = Disk(); val journal = disk.journal()
        journal.append(Row("1")); disk.fail = true
        assertEquals("write_failed", journal.append(Row("2")).failure)
        assertEquals(listOf("1"), journal.pending().map { it.id })
        assertEquals(listOf("1"), disk.journal().pending().map { it.id })
        assertEquals("write_failed", journal.remove("1"))
        assertEquals(1, journal.count())
    }
    @Test fun capacityPreservesEveryUnacknowledgedOfflineRow() {
        val disk = Disk(); val journal = disk.journal(2)
        journal.append(Row("1")); journal.append(Row("2"))
        assertEquals("capacity_reached", journal.append(Row("3")).failure)
        assertEquals(listOf("1", "2"), disk.journal(2).pending().map { it.id })
    }
    @Test fun deliverySwitchAndStaleAckCannotRemoveNewDelivery() {
        val disk = Disk(); val journal = disk.journal()
        journal.append(Row("A:1"))
        // Starting B never deletes the unacknowledged A evidence.
        journal.append(Row("B:1", "B"))
        assertEquals(listOf("A:1", "B:1"), journal.pending().map { it.id })
        assertEquals(listOf("A:1", "B:1"), disk.journal().pending().map { it.id })
        journal.remove("A:1"); journal.remove("A:1")
        assertEquals(listOf("B:1"), journal.pending().map { it.id })
        assertEquals(listOf("B:1"), disk.journal().pending().map { it.id })
    }
    @Test fun unreadableJournalRemainsFailClosedAndRetryable() {
        var fail = true; var writes = 0
        val journal = JournalSnapshot<Row>(2, { it.id }, { if (fail) error("corrupt") else listOf(Row("1")) }, { writes++; null })
        assertNotNull(journal.append(Row("2")).failure); assertEquals(0, writes)
        fail = false
        assertNull(journal.append(Row("2")).failure); assertEquals(2, journal.count())
    }
}
