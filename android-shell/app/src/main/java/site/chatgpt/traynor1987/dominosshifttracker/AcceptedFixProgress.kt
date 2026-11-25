package site.chatgpt.traynor1987.dominosshifttracker

/** Process/session-local liveness, independent of bridge replay consumption. */
class AcceptedFixProgress {
    private val identities = mutableSetOf<String>()
    var lastReceiptElapsedMs: Long? = null
        private set
    var lastProviderTimestampEpochMs: Long? = null
        private set
    fun accepted(sampleId: String, receiptElapsedMs: Long, providerTimestampEpochMs: Long? = null) {
        if (identities.add(sampleId)) {
            if (providerTimestampEpochMs != null && providerTimestampEpochMs > 0)
                lastProviderTimestampEpochMs = maxOf(lastProviderTimestampEpochMs ?: providerTimestampEpochMs, providerTimestampEpochMs)
            lastReceiptElapsedMs = maxOf(lastReceiptElapsedMs ?: receiptElapsedMs, receiptElapsedMs)
        }
    }
    fun reset() { identities.clear(); lastReceiptElapsedMs = null; lastProviderTimestampEpochMs = null }
}
