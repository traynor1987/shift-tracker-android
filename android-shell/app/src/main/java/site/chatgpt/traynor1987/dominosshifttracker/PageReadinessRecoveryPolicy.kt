package site.chatgpt.traynor1987.dominosshifttracker

/**
 * Recovers a WebView that still owns a URL but never reaches the trusted PWA
 * handshake. Android does not classify that state as a renderer stall, so it
 * needs a separate bounded policy from [RendererRecoveryPolicy].
 *
 * This policy owns no WebView, storage, or location-service state. A
 * generation token makes delayed watchdog callbacks harmless after a newer
 * navigation or a successful page handshake.
 */
class PageReadinessRecoveryPolicy {
    enum class Action {
        NONE,
        RECREATE_WEBVIEW,
        ROLLBACK_RELEASE,
        SHOW_RETRY,
    }

    data class Decision(
        val action: Action,
        val preserveNativeTracking: Boolean = true,
    )

    private var generation = 0L
    private var pageReady = false
    private var automaticReloadAttempted = false
    private var rollbackAttempted = false

    fun navigationStarted(): Long {
        generation += 1L
        pageReady = false
        return generation
    }

    fun pageReady() {
        pageReady = true
        automaticReloadAttempted = false
        rollbackAttempted = false
    }

    fun onTimeout(expectedGeneration: Long, rollbackAvailable: Boolean): Decision {
        if (expectedGeneration != generation || pageReady) return Decision(Action.NONE)
        val action = when {
            !automaticReloadAttempted -> {
                automaticReloadAttempted = true
                Action.RECREATE_WEBVIEW
            }
            rollbackAvailable && !rollbackAttempted -> {
                rollbackAttempted = true
                Action.ROLLBACK_RELEASE
            }
            else -> Action.SHOW_RETRY
        }
        return Decision(action)
    }
}
