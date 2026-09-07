package site.chatgpt.traynor1987.dominosshifttracker.wear

object WearInsightPolicy {
    fun breakProgress(start: Long, targetMs: Long, now: Long): Float =
        if (start <= 0 || targetMs <= 0 || now < start) 0f
        else ((now - start).toDouble() / targetMs).coerceIn(0.0, 1.0).toFloat()
    fun breakClock(start: Long, targetMs: Long, now: Long): String {
        val elapsed = (now - start).coerceAtLeast(0)
        val remaining = targetMs - elapsed
        return if (remaining > 0) WearDisplayPolicy.duration((remaining + 999) / 1000)
        else "+${WearDisplayPolicy.duration(-remaining / 1000)}"
    }
    fun netBatteryDrop(start: Int, end: Int): Int? = if (start in 0..100 && end in 0..100) start - end else null
    fun netBatteryRate(start: Int, end: Int, elapsedMs: Long, charging: Boolean, gaps: Boolean): Double? {
        val drop = netBatteryDrop(start, end) ?: return null
        return if (elapsedMs < 15 * 60_000L || charging || gaps || drop < 0) null else drop * 3_600_000.0 / elapsedMs
    }
}
