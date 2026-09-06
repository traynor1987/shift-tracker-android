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
    ) = WearSnapshot("revision", "shift", "activity", true, 1_000L, activity, "", 10_000L, 1, "£16.72", 80L, 10L, "£1.00", "£17.72", "0.8 mi", 1, emptyList(), 1, 2, early, exitAt, entryAt, paused, "outside_store", setOf("delivered"), 20_000L)

    @Test fun favouritesOnlyReorderCurrentlyConfiguredTasks() {
        assertEquals(listOf("B", "A", "C"), WearDisplayPolicy.orderedTasks(listOf("A", "B", "C", "B"), setOf("B", "Deleted")))
        assertEquals(listOf("A", "B"), WearDisplayPolicy.orderedTasks(listOf("A", "B"), emptySet()))
    }

    @Test fun missingOrReversedEvidenceNeverBecomesARecordedDuration() {
        assertEquals("Not recorded", WearDisplayPolicy.recordedInterval(0, 10_000))
        assertEquals("Not recorded", WearDisplayPolicy.recordedInterval(10_000, 0))
        assertEquals("Not recorded", WearDisplayPolicy.recordedInterval(10_000, 9_000))
        assertEquals("0:00", WearDisplayPolicy.recordedInterval(10_000, 10_000))
        assertEquals("2:05", WearDisplayPolicy.recordedInterval(10_000, 135_000))
    }

    @Test fun durationUsesClockStyle() {
        assertEquals("0:09", WearDisplayPolicy.duration(9))
        assertEquals("2:05", WearDisplayPolicy.duration(125))
    }

    @Test fun shiftDurationUsesHoursAndMinutes() {
        assertEquals("0:00", WearDisplayPolicy.shiftDuration(0))
        assertEquals("3:26", WearDisplayPolicy.shiftDuration(12_394))
        assertEquals("8:05", WearDisplayPolicy.shiftDuration(29_159))
    }

    @Test fun syncAgeIsHumanReadable() {
        assertEquals("Synced just now", WearDisplayPolicy.syncAgeLabel(995_000L, 1_000_000L))
        assertEquals("Synced 45s ago", WearDisplayPolicy.syncAgeLabel(955_000L, 1_000_000L))
        assertEquals("Synced 3m ago", WearDisplayPolicy.syncAgeLabel(800_000L, 1_000_000L))
    }

    @Test fun deliveryTitlesStayCompactOnRoundScreens() {
        assertEquals("SINGLE", WearDisplayPolicy.activityTitle("delivery_single"))
        assertEquals("DOUBLE", WearDisplayPolicy.activityTitle("delivery_double"))
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

    @Test fun pausedStoreTaskOffersResumeContext() {
        assertEquals("PAUSED: Cleaning dishes\nResume it?", WearDisplayPolicy.contextLine(snapshot(activity = "idle", paused = "Cleaning dishes"), ""))
    }

    @Test fun geofenceAlertRequiresSameLiveDelivery() {
        val before = snapshot()
        assertEquals("left_store", WearDisplayPolicy.geofenceTransition(before, snapshot(exitAt = 52_000L)))
        assertEquals("returned", WearDisplayPolicy.geofenceTransition(snapshot(exitAt = 52_000L), snapshot(exitAt = 52_000L, entryAt = 180_000L)))
        assertEquals(null, WearDisplayPolicy.geofenceTransition(null, snapshot(exitAt = 52_000L)))
        assertEquals(null, WearDisplayPolicy.geofenceTransition(before, snapshot(activity = "idle", exitAt = 52_000L)))
    }
}
