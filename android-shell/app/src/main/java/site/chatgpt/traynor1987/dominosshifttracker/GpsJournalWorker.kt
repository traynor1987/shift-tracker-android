package site.chatgpt.traynor1987.dominosshifttracker

import java.util.concurrent.Executors

/** Serialises journal mutations without occupying Android's UI thread. */
class GpsJournalWorker : AutoCloseable {
    private val executor = Executors.newSingleThreadExecutor { task ->
        Thread(task, "shift-tracker-gps-journal")
    }

    fun execute(task: () -> Unit) { executor.execute(task) }
    override fun close() { executor.shutdown() }
}
