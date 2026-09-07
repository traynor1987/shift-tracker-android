package site.chatgpt.traynor1987.dominosshifttracker.wear

import kotlin.test.*
import site.chatgpt.traynor1987.dominosshifttracker.settings.SettingsMerge

class WearInsightPolicyTest {
    @Test fun breakRingClampsAndClockContinuesAfterTarget() {
        val start = 1000L
        assertEquals(0f, WearInsightPolicy.breakProgress(start, 60000, 999))
        assertEquals(0.5f, WearInsightPolicy.breakProgress(start, 60000, 31000))
        assertEquals(1f, WearInsightPolicy.breakProgress(start, 60000, 121000))
        assertEquals(0f, WearInsightPolicy.breakProgress(0, 0, 1000))
        assertEquals("0:01", WearInsightPolicy.breakClock(start, 60000, 60999))
        assertEquals("+0:00", WearInsightPolicy.breakClock(start, 60000, 61000))
        assertEquals("+1:00", WearInsightPolicy.breakClock(start, 60000, 121000))
    }
    @Test fun batteryRateRequiresEnoughUninterruptedUnchargedObservations() {
        assertEquals(5.0, WearInsightPolicy.netBatteryRate(90, 85, 3600000, false, false))
        assertNull(WearInsightPolicy.netBatteryRate(90, 85, 1000, false, false))
        assertNull(WearInsightPolicy.netBatteryRate(90, 85, 3600000, true, false))
        assertNull(WearInsightPolicy.netBatteryRate(90, 85, 3600000, false, true))
        assertNull(WearInsightPolicy.netBatteryRate(85, 90, 3600000, false, false))
        assertNull(WearInsightPolicy.netBatteryDrop(-1, 90))
    }
    @Test fun insightSettingsRejectUnknownChoices() {
        assertTrue(SettingsMerge.valid("main_stat", "deliveries_earnings"))
        assertTrue(SettingsMerge.valid("main_timer", "shift"))
        assertTrue(SettingsMerge.valid("break_ring", "false"))
        assertTrue(SettingsMerge.valid("battery_tracking", "true"))
        assertFalse(SettingsMerge.valid("main_stat", "unknown"))
        assertFalse(SettingsMerge.valid("main_timer", "break"))
    }
}
