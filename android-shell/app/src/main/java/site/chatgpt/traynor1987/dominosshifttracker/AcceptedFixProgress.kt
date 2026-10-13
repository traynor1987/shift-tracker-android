package site.chatgpt.traynor1987.dominosshifttracker

/** Process/session-local liveness, independent of bridge replay consumption. */
class AcceptedFixProgress {
    private val identities = mutableSetOf<String>()
    var lastReceiptElapsedMs: Long? = null
        private set
    fun accepted(sampleId: String, receiptElapsedMs: Long) {
        if (identities.add(sampleId)) {
            lastReceiptElapsedMs = maxOf(lastReceiptElapsedMs ?: receiptElapsedMs, receiptElapsedMs)
        }
    }
    fun reset() { identities.clear(); lastReceiptElapsedMs = null }
}
