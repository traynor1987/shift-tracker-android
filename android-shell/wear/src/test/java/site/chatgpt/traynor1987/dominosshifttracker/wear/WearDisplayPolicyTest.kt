package site.chatgpt.traynor1987.dominosshifttracker.wear

import kotlin.test.Test
import kotlin.test.assertEquals

class WearDisplayPolicyTest {
    private fun snapshot(
        activity: String = "delivery_double",
        early: Int = 0,
        exitAt: Long = 0L,
        paused: String = "",
        entryAt: Long = 0L,
    ) = WearSnapshot("revision", "shift", "activity", true, 1_000L, activity, "", 10_000L, 1, "£16.72", 1, 2, early, exitAt, entryAt, paused, "outside_store", setOf("delivered"), 20_000L)

    @Test fun durationUsesClockStyle() {
        assertEquals("0:09", WearDisplayPolicy.duration(9))
        assertEquals("2:05", WearDisplayPolicy.duration(125))
    }

    @Test fun completedOutsideTripUsesRecordedEntry() {
        assertEquals(
            "LEAVE 0:42 · OUT 2:08",
            WearDisplayPolicy.contextLine(snapshot(exitAt = 52_000L, entryAt = 180_000L), "AT STORE"),
        )
    }

    @Test fun deliveryContextIncludesEarlyLeaveLocationAndPausedTask() {
        assertEquals(
            "EARLY 0:30 · LEAVE 0:42 · OUTSIDE STORE\nPAUSED: Cleaning dishes",
            WearDisplayPolicy.contextLine(snapshot(early = 30, exitAt = 52_000L, paused = "Cleaning dishes"), "OUTSIDE STORE"),
        )
    }

    @Test fun storeTaskHasNoDeliveryContext() {
        assertEquals("", WearDisplayPolicy.contextLine(snapshot(activity = "cleaning", paused = "Cleaning dishes"), ""))
    }
}
