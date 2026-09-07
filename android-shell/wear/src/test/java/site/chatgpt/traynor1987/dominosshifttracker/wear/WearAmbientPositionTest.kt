package site.chatgpt.traynor1987.dominosshifttracker.wear
import kotlin.test.*
import site.chatgpt.traynor1987.dominosshifttracker.settings.SettingsMerge

class WearAmbientPositionTest {
    @Test fun movementStaysBoundedAndNeverRepeatsImmediately() {
        for (previous in -1..7) for (choice in listOf(Int.MIN_VALUE, -100, -1, 0, 1, 7, 100, Int.MAX_VALUE)) {
            val next = WearAmbientPosition.next(previous, choice)
            assertTrue(next in WearAmbientPosition.offsets.indices)
            assertNotEquals(previous, next)
            val (x, y) = WearAmbientPosition.offsets[next]
            assertTrue(x in -6..6 && y in -6..6)
        }
    }
    @Test fun holdProtectionStartsOffAndOnlyAcceptsBooleans() {
        assertEquals("false", SettingsMerge.defaults["hold_actions"])
        assertTrue(SettingsMerge.valid("hold_actions", "true"))
        assertFalse(SettingsMerge.valid("hold_actions", "yes"))
    }
}
