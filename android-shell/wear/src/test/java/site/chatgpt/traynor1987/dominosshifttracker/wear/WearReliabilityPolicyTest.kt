package site.chatgpt.traynor1987.dominosshifttracker.wear

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class WearReliabilityPolicyTest {
    @Test fun newShiftAndLegacyCacheCannotShowOldRuns() {
        assertTrue(WearReliabilityPolicy.recentRunsBelongToShift(true, "shift-B", "shift-B"))
        assertFalse(WearReliabilityPolicy.recentRunsBelongToShift(true, "shift-B", "shift-A"))
        assertFalse(WearReliabilityPolicy.recentRunsBelongToShift(true, "shift-B", null))
        assertFalse(WearReliabilityPolicy.recentRunsBelongToShift(false, "shift-B", "shift-B"))
        assertFalse(WearReliabilityPolicy.recentRunsBelongToShift(true, "", ""))
    }

    @Test fun interruptedTransferCannotShowReceivingForever() {
        assertTrue(WearReliabilityPolicy.transferIsFresh("receiving", 999_000, 1_000_000))
        assertFalse(WearReliabilityPolicy.transferIsFresh("receiving", 800_000, 1_000_000))
        assertFalse(WearReliabilityPolicy.transferIsFresh("waiting", 0, 1_000_000))
        assertFalse(WearReliabilityPolicy.transferIsFresh("ready", 999_000, 1_000_000))
        assertFalse(WearReliabilityPolicy.transferIsFresh("verifying", 1_000_001, 1_000_000))
    }

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
