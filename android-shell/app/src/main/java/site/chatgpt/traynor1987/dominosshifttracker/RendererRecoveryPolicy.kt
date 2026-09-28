package site.chatgpt.traynor1987.dominosshifttracker

/**
 * Bounds automatic WebView recovery to one replacement per unresponsive
 * incident. A successfully responsive/loaded page begins a fresh incident.
 * Native location tracking is deliberately outside this policy.
 */
class RendererRecoveryPolicy {
    enum class Action {
        NONE,
        RECREATE_WEBVIEW,
        SHOW_RETRY,
    }

    data class Decision(
        val action: Action,
        val preserveNativeTracking: Boolean = true,
    )

    private var automaticRecoveryAttempted = false
    private var action = Action.NONE

    fun onRendererUnresponsive(): Decision {
        action = if (automaticRecoveryAttempted) {
            Action.SHOW_RETRY
        } else {
            automaticRecoveryAttempted = true
            Action.RECREATE_WEBVIEW
        }
        return Decision(action)
    }

    fun onRendererResponsive() {
        automaticRecoveryAttempted = false
        action = Action.NONE
    }

    fun currentAction(): Action = action
}
