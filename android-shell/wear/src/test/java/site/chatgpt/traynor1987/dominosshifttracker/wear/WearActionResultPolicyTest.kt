package site.chatgpt.traynor1987.dominosshifttracker.wear

import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.test.assertFalse

class WearActionResultPolicyTest {
    @Test fun completionReplacesPendingForSameCommand() {
        assertTrue(WearReliabilityPolicy.acceptActionResult("one", "queued", "one", "applied"))
    }
    @Test fun oldCommandCannotUnlockNewCommand() {
        assertFalse(WearReliabilityPolicy.acceptActionResult("two", "queued", "one", "applied"))
    }
    @Test fun delayedQueuedCannotReplaceCompletion() {
        assertFalse(WearReliabilityPolicy.acceptActionResult("one", "applied", "one", "queued"))
        assertFalse(WearReliabilityPolicy.acceptActionResult("one", "invalid_action", "one", "sending"))
    }
}
