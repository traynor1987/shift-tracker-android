package site.chatgpt.traynor1987.dominosshifttracker.wear

/** Presentation of the phone-owned whitelist; no action/state inference. */
object WearMainPresenter {
    enum class Tone { RED, BLUE, AMBER, TEAL, MUTED }
    data class Action(val action: String, val label: String, val tone: Tone, val primary: Boolean)
    fun actions(activity: String, allowed: Set<String>, deliveredCustomers: Int, requiredCustomers: Int): List<Action> {
        val deliveredLabel = if (requiredCustomers > 1)
            "DELIVERED ${(deliveredCustomers + 1).coerceAtMost(requiredCustomers)}/$requiredCustomers" else "DELIVERED"
        val candidates = if ("resume_task" in allowed || "dismiss_resume" in allowed) listOf(
            "resume_task" to "RESUME", "dismiss_resume" to "LEAVE PAUSED",
        ) else listOf(
            "delivered" to deliveredLabel, "back_at_store" to "BACK AT STORE", "end_break" to "END BREAK",
            "finish_quick_tasks" to "FINISH TASKS", "complete_task" to "COMPLETE",
            "single" to "SINGLE", "double" to "DOUBLE", "break" to "BREAK",
        )
        return candidates.filter { it.first in allowed }.mapIndexed { index, (action, label) ->
            Action(action, label, when {
                action == "single" || action == "delivered" && activity == "delivery_single" -> Tone.RED
                action == "double" || action == "delivered" -> Tone.BLUE
                action == "break" || action == "end_break" -> Tone.AMBER
                action == "dismiss_resume" -> Tone.MUTED
                else -> Tone.TEAL
            }, primary = index == 0)
        }
    }
    fun status(updatedAt: Long, feedbackOutcome: String?, now: Long = System.currentTimeMillis()): String {
        if (feedbackOutcome != null) return feedbackText(feedbackOutcome)
        return if (WearReliabilityPolicy.stateIsDisconnected(updatedAt, now)) "STALE · Controls paused"
            else WearDisplayPolicy.syncAgeLabel(updatedAt, now)
    }
    fun refreshDelay(updatedAt: Long, now: Long = System.currentTimeMillis()): Long {
        if (WearReliabilityPolicy.stateIsDisconnected(updatedAt, now)) return 15_000L
        return (updatedAt + WearReliabilityPolicy.STATE_STALE_AFTER_MS + 1L - now).coerceIn(50L, 15_000L)
    }
    fun feedbackText(outcome: String): String = when (outcome) {
        "sending" -> "SENDING TO PHONE…"
        "queued" -> "PHONE PROCESSING…"
        "applied", "already_applied" -> "✓ DONE"
        "already_pending" -> "WAITING FOR PHONE…"
        "stale_state" -> "STATE CHANGED — TRY AGAIN"
        "invalid_action" -> "ACTION NO LONGER AVAILABLE"
        "not_connected" -> "PHONE NOT CONNECTED"
        "send_failed" -> "SEND FAILED — TRY AGAIN"
        else -> "ACTION FAILED — TRY AGAIN"
    }
}
