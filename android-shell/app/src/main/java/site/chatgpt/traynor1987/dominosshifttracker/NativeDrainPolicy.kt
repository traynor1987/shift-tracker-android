package site.chatgpt.traynor1987.dominosshifttracker

/** Only samples already durable at the explicit finish request belong to its barrier. */
object NativeDrainPolicy {
    fun complete(watermark: Set<String>, durablePending: Set<String>?): Boolean =
        durablePending != null && watermark.none { it in durablePending }
}
