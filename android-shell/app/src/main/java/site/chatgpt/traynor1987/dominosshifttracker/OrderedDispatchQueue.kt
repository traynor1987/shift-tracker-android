package site.chatgpt.traynor1987.dominosshifttracker

/** UI-owned queue. Reconnect barriers put recovery FIFO ahead of live FIFO;
 * callers retain session guards inside each action, evaluated at dispatch. */
class OrderedDispatchQueue(private val batchSize: Int = 16, private val schedule: (() -> Unit) -> Unit) {
    private val liveBatches = ArrayDeque<Iterator<() -> Unit>>()
    private val replayBatches = ArrayDeque<Iterator<() -> Unit>>()
    private var scheduled = false
    var replayBarrierCount = 0
        private set
    var backlogCount = 0
        private set
    fun beginReplay() { replayBarrierCount++ }
    fun endReplay(actions: List<() -> Unit>) {
        check(replayBarrierCount > 0)
        if (actions.isNotEmpty()) { replayBatches.addLast(actions.iterator()); backlogCount += actions.size }
        replayBarrierCount--
        ensureScheduled()
    }
    private fun ensureScheduled() {
        if (!scheduled && replayBarrierCount == 0 && backlogCount > 0) {
            scheduled = true; schedule(::drain)
        }
    }
    fun offer(actions: List<() -> Unit>) {
        if (actions.isEmpty()) return
        liveBatches.addLast(actions.iterator())
        backlogCount += actions.size
        ensureScheduled()
    }
    private fun prune() {
        while (replayBatches.isNotEmpty() && !replayBatches.first().hasNext()) replayBatches.removeFirst()
        while (liveBatches.isNotEmpty() && !liveBatches.first().hasNext()) liveBatches.removeFirst()
    }
    private fun drain() {
        if (replayBarrierCount > 0) { scheduled = false; return }
        var remaining = batchSize
        try {
            while (remaining > 0 && backlogCount > 0 && replayBarrierCount == 0) {
                prune()
                val current = if (replayBatches.isNotEmpty()) replayBatches.first() else liveBatches.first()
                val action = current.next()
                remaining--; backlogCount--
                action()
            }
            prune()
        } finally {
            scheduled = false
            ensureScheduled()
        }
    }
}
