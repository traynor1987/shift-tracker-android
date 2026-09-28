package site.chatgpt.traynor1987.dominosshifttracker

import kotlin.test.Test
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RendererRecoveryPolicyTest {
    @Test
    fun `responsive renderer is not recreated`() {
        val policy = RendererRecoveryPolicy()

        policy.onRendererResponsive()

        assertEquals(RendererRecoveryPolicy.Action.NONE, policy.currentAction())
    }

    @Test
    fun `unresponsive renderer recovers once per incident`() {
        val policy = RendererRecoveryPolicy()

        assertEquals(RendererRecoveryPolicy.Action.RECREATE_WEBVIEW, policy.onRendererUnresponsive().action)
        assertEquals(RendererRecoveryPolicy.Action.SHOW_RETRY, policy.onRendererUnresponsive().action)
        policy.onRendererResponsive()
        assertEquals(RendererRecoveryPolicy.Action.RECREATE_WEBVIEW, policy.onRendererUnresponsive().action)
    }

    @Test
    fun `recovery failure exposes retry without a loop`() {
        val policy = RendererRecoveryPolicy()

        policy.onRendererUnresponsive()

        assertEquals(RendererRecoveryPolicy.Action.SHOW_RETRY, policy.onRendererUnresponsive().action)
        assertEquals(RendererRecoveryPolicy.Action.SHOW_RETRY, policy.onRendererUnresponsive().action)
    }

    @Test
    fun `renderer recovery never stops the native location service`() {
        val policy = RendererRecoveryPolicy()

        val first = policy.onRendererUnresponsive()
        val retry = policy.onRendererUnresponsive()

        assertTrue(first.preserveNativeTracking)
        assertTrue(retry.preserveNativeTracking)
    }

    @Test
    fun `renderer crash and stall use bounded recovery`() {
        val source = mainActivitySource()
        val gone = source.substringAfter("override fun onRenderProcessGone").substringBefore("override fun onPageStarted")
        val stalled = source.substringAfter("private fun handleRendererUnresponsive").substringBefore("private fun showRendererRecoveryRetry")

        assertTrue(gone.contains("handleRendererGone(view)"))
        assertFalse(gone.contains("recreateWebViewAfterRendererExit(view)"))
        assertTrue(stalled.contains("postDelayed"))
        assertTrue(stalled.contains("rendererRecoveryPolicy.currentAction()"))
    }

    @Test
    fun `recovery integration does not stop tracking or clear storage`() {
        val source = mainActivitySource()
        val recovery = source.substringAfter("private fun handleRendererGone").substringBefore("private fun configureWebView")

        assertFalse(recovery.contains("stopNativeLocation"))
        assertFalse(recovery.contains("stopService"))
        assertFalse(recovery.contains("clearCache"))
        assertFalse(recovery.contains("clearHistory"))
        assertFalse(recovery.contains("deleteAllData"))
    }

    private fun mainActivitySource(): String {
        val relative = "src/main/java/site/chatgpt/traynor1987/dominosshifttracker/MainActivity.kt"
        return listOf(File("app/$relative"), File(relative))
            .first(File::isFile)
            .readText()
    }
}
