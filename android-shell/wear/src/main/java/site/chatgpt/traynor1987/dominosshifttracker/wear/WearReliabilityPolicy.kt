package site.chatgpt.traynor1987.dominosshifttracker.wear

/** Pure policy kept separate so the safety-critical timing and update rules are unit tested. */
object WearReliabilityPolicy {
    const val STATE_STALE_AFTER_MS = 2 * 60_000L
    const val ACTION_RESULT_VISIBLE_MS = 5_000L
    const val ACTION_PENDING_TIMEOUT_MS = 20_000L
    const val MAX_UPDATE_BYTES = 180L * 1024L * 1024L

    fun stateIsDisconnected(updatedAt: Long, now: Long = System.currentTimeMillis()): Boolean =
        updatedAt <= 0L || now < updatedAt || now - updatedAt > STATE_STALE_AFTER_MS

    fun recentRunsBelongToShift(active: Boolean, currentShift: String, cachedShift: String?): Boolean =
        active && currentShift.isNotBlank() && currentShift == cachedShift

    fun transferIsFresh(state: String?, updatedAt: Long, now: Long = System.currentTimeMillis()): Boolean =
        state in setOf("waiting", "receiving", "verifying") && updatedAt > 0 && now - updatedAt in 0..120_000L

    fun updateSizeIsAllowed(size: Long): Boolean = size in 1..MAX_UPDATE_BYTES

    fun isUpgrade(candidateCode: Long, currentCode: Long): Boolean =
        candidateCode > currentCode && currentCode > 0L

    fun actionIsPending(outcome: String): Boolean = outcome == "sending" || outcome == "queued"
}
