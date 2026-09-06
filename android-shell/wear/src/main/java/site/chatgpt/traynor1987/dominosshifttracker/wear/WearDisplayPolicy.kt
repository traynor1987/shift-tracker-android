package site.chatgpt.traynor1987.dominosshifttracker.wear

object WearDisplayPolicy {
    fun activityTitle(activity: String): String = when (activity) {
        "delivery_single" -> "SINGLE"
        "delivery_double" -> "DOUBLE"
        "break" -> "BREAK"
        "cleaning" -> "CLEANING"
        "prep" -> "PREP"
        "task" -> "TASK"
        else -> "AT STORE"
    }

    fun duration(seconds: Long): String {
        val safe = seconds.coerceAtLeast(0L)
        val minutes = safe / 60
        return "$minutes:${(safe % 60).toString().padStart(2, '0')}"
    }

    fun contextLine(snapshot: WearSnapshot, storeLabel: String): String {
        val delivery = snapshot.activity.startsWith("delivery_")
        if (!delivery) return snapshot.pausedTaskName.takeIf { it.isNotBlank() }?.let { "PAUSED: $it\nResume it?" }.orEmpty()
        val parts = mutableListOf<String>()
        if (snapshot.earlyDispatchGapSeconds > 0) {
            parts += "EARLY ${duration(snapshot.earlyDispatchGapSeconds.toLong())}"
        }
        if (snapshot.storeExitAt > 0L && snapshot.activityStarted > 0L) {
            parts += "LEAVE ${duration((snapshot.storeExitAt - snapshot.activityStarted) / 1_000L)}"
        }
        if (snapshot.storeEntryAt > snapshot.storeExitAt && snapshot.storeExitAt > 0L) {
            parts += "OUT ${duration((snapshot.storeEntryAt - snapshot.storeExitAt) / 1_000L)}"
        } else if (storeLabel.isNotBlank()) parts += storeLabel
        val firstLine = parts.joinToString(" · ")
        val paused = snapshot.pausedTaskName.takeIf { it.isNotBlank() }?.let { "PAUSED: $it" }.orEmpty()
        return listOf(firstLine, paused).filter { it.isNotBlank() }.joinToString("\n")
    }

    /** Only alert for a transition within the same live delivery. Reconnects
     * and replacement snapshots must never invent a geofence vibration. */
    fun geofenceTransition(previous: WearSnapshot?, next: WearSnapshot): String? {
        if (previous == null || !previous.active || !next.active) return null
        if (previous.shiftId != next.shiftId || previous.activityId != next.activityId) return null
        if (!previous.activity.startsWith("delivery_") || !next.activity.startsWith("delivery_")) return null
        return when {
            previous.storeEntryAt <= 0L && next.storeEntryAt > 0L -> "returned"
            previous.storeExitAt <= 0L && next.storeExitAt > 0L -> "left_store"
            else -> null
        }
    }
}
