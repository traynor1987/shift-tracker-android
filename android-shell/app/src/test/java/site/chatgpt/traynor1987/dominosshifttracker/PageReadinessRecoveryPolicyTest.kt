package site.chatgpt.traynor1987.dominosshifttracker

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PageReadinessRecoveryPolicyTest {
    @Test
    fun `trusted hello cancels recovery for the current navigation`() {
        val policy = PageReadinessRecoveryPolicy()
        val generation = policy.navigationStarted()

        policy.pageReady()

        assertEquals(
            PageReadinessRecoveryPolicy.Action.NONE,
            policy.onTimeout(generation, rollbackAvailable = true).action,
        )
    }

    @Test
    fun `a timeout from an older navigation cannot replace the current page`() {
        val policy = PageReadinessRecoveryPolicy()
        val staleGeneration = policy.navigationStarted()
        policy.navigationStarted()

        assertEquals(
            PageReadinessRecoveryPolicy.Action.NONE,
            policy.onTimeout(staleGeneration, rollbackAvailable = true).action,
        )
    }

    @Test
    fun `missing hello reloads once then rolls back the verified release`() {
        val policy = PageReadinessRecoveryPolicy()
        val first = policy.navigationStarted()

        assertEquals(
            PageReadinessRecoveryPolicy.Action.RECREATE_WEBVIEW,
            policy.onTimeout(first, rollbackAvailable = true).action,
        )

        val second = policy.navigationStarted()
        assertEquals(
            PageReadinessRecoveryPolicy.Action.ROLLBACK_RELEASE,
            policy.onTimeout(second, rollbackAvailable = true).action,
        )

        val third = policy.navigationStarted()
        assertEquals(
            PageReadinessRecoveryPolicy.Action.SHOW_RETRY,
            policy.onTimeout(third, rollbackAvailable = true).action,
        )
    }

    @Test
    fun `missing hello without a previous release stops after one automatic reload`() {
        val policy = PageReadinessRecoveryPolicy()
        val first = policy.navigationStarted()
        policy.onTimeout(first, rollbackAvailable = false)

        val second = policy.navigationStarted()

        assertEquals(
            PageReadinessRecoveryPolicy.Action.SHOW_RETRY,
            policy.onTimeout(second, rollbackAvailable = false).action,
        )
    }

    @Test
    fun `a successful page starts a fresh bounded recovery incident`() {
        val policy = PageReadinessRecoveryPolicy()
        val first = policy.navigationStarted()
        policy.onTimeout(first, rollbackAvailable = true)
        policy.pageReady()

        val nextIncident = policy.navigationStarted()

        assertEquals(
            PageReadinessRecoveryPolicy.Action.RECREATE_WEBVIEW,
            policy.onTimeout(nextIncident, rollbackAvailable = true).action,
        )
    }

    @Test
    fun `every readiness recovery decision preserves native tracking`() {
        val policy = PageReadinessRecoveryPolicy()
        val first = policy.navigationStarted()
        val reload = policy.onTimeout(first, rollbackAvailable = true)
        val second = policy.navigationStarted()
        val rollback = policy.onTimeout(second, rollbackAvailable = true)

        assertTrue(reload.preserveNativeTracking)
        assertTrue(rollback.preserveNativeTracking)
    }
}
