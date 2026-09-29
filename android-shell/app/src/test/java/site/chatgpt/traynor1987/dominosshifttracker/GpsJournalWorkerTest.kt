package site.chatgpt.traynor1987.dominosshifttracker

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class GpsJournalWorkerTest {
    @Test
    fun slowJournalWriteDoesNotBlockCallerAndAcknowledgementStaysOrdered() {
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val finished = CountDownLatch(1)
        val caller = Thread.currentThread()
        val events = mutableListOf<String>()
        var workerThread: Thread? = null
        val worker = GpsJournalWorker()
        try {
            worker.execute {
                workerThread = Thread.currentThread()
                entered.countDown()
                release.await(5, TimeUnit.SECONDS)
                events.add("append")
            }
            assertTrue(entered.await(5, TimeUnit.SECONDS))
            worker.execute { events.add("ack"); finished.countDown() }
            // The second submission returns while the first disk write waits.
            assertEquals(1L, finished.count)
            release.countDown()
            assertTrue(finished.await(5, TimeUnit.SECONDS))
            assertTrue(workerThread !== caller)
            assertEquals(listOf("append", "ack"), events)
        } finally { release.countDown(); worker.close() }
    }
}
