package site.chatgpt.traynor1987.dominosshifttracker.wear

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class WearReliabilityPolicyTest {
    @Test fun recentStateIsConnected() {
        assertFalse(WearReliabilityPolicy.stateIsDisconnected(900_001L, 1_000_000L))
    }

    @Test fun oldMissingAndFutureStateAreDisconnected() {
        assertTrue(WearReliabilityPolicy.stateIsDisconnected(0L, 1_000_000L))
        assertTrue(WearReliabilityPolicy.stateIsDisconnected(800_000L, 1_000_000L))
        assertTrue(WearReliabilityPolicy.stateIsDisconnected(1_000_001L, 1_000_000L))
    }

    @Test fun updateSizeMustBeBounded() {
        assertFalse(WearReliabilityPolicy.updateSizeIsAllowed(0L))
        assertTrue(WearReliabilityPolicy.updateSizeIsAllowed(4_000_000L))
        assertFalse(WearReliabilityPolicy.updateSizeIsAllowed(WearReliabilityPolicy.MAX_UPDATE_BYTES + 1L))
    }

    @Test fun onlyNewerVersionIsAnUpgrade() {
        assertTrue(WearReliabilityPolicy.isUpgrade(45L, 44L))
        assertFalse(WearReliabilityPolicy.isUpgrade(44L, 44L))
        assertFalse(WearReliabilityPolicy.isUpgrade(43L, 44L))
    }

    @Test fun onlySendingAndQueuedArePending() {
        assertTrue(WearReliabilityPolicy.actionIsPending("sending"))
        assertTrue(WearReliabilityPolicy.actionIsPending("queued"))
        assertFalse(WearReliabilityPolicy.actionIsPending("applied"))
        assertFalse(WearReliabilityPolicy.actionIsPending("stale_state"))
    }
}
