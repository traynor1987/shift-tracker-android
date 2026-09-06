package site.chatgpt.traynor1987.dominosshifttracker.wear
import kotlin.test.*
class WearGoalsTest {
    @Test fun goalsClampOverrunsAndHandleDisabledTargets() {
        assertEquals(100, WearGoals.percent(25, 20))
        assertEquals(50, WearGoals.percent(10, 20))
        assertEquals(0, WearGoals.percent(-1, 20))
        assertEquals(0, WearGoals.percent(10, 0))
    }
    @Test fun onlyAnActiveBreakHasADeadline() {
        assertEquals(1_801_000L, WearBreakPolicy.deadline(true, "break", 1_000, 30))
        assertNull(WearBreakPolicy.deadline(false, "break", 1_000, 30))
        assertNull(WearBreakPolicy.deadline(true, "idle", 1_000, 30))
        assertNull(WearBreakPolicy.deadline(true, "break", 0, 30))
    }
    @Test fun changedBreakDuplicateAndVeryLateAlarmsDoNotVibrate() {
        assertTrue(WearBreakPolicy.shouldAlert("B", "B", 1000, 1000, null))
        assertFalse(WearBreakPolicy.shouldAlert("A", "B", 1000, 1000, null))
        assertFalse(WearBreakPolicy.shouldAlert("B", "B", 1000, 1000, "B"))
        assertFalse(WearBreakPolicy.shouldAlert("B", "B", 1000, 999, null))
        assertFalse(WearBreakPolicy.shouldAlert("B", "B", 1000, 400_000, null))
    }
}
