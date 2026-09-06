package site.chatgpt.traynor1987.dominosshifttracker.wear

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import site.chatgpt.traynor1987.dominosshifttracker.settings.SettingRecord
import site.chatgpt.traynor1987.dominosshifttracker.settings.SettingsMerge

class WearSettingsMergeTest {
    @Test fun unrelatedOfflineEditsSurviveBothDirections() {
        val phone = mapOf("keep_awake" to SettingRecord("false", 2, "phone"))
        val watch = mapOf("break_minutes" to SettingRecord("20", 2, "watch"))
        assertEquals(phone + watch, SettingsMerge.merge(phone, watch))
        assertEquals(phone + watch, SettingsMerge.merge(watch, phone))
    }
    @Test fun sameSettingConflictConvergesAndDuplicatesAreIdempotent() {
        val phone = mapOf("keep_awake" to SettingRecord("false", 2, "phone"))
        val watch = mapOf("keep_awake" to SettingRecord("true", 2, "watch"))
        assertEquals(watch, SettingsMerge.merge(phone, watch))
        assertEquals(watch, SettingsMerge.merge(watch, phone))
        assertEquals(watch, SettingsMerge.merge(watch, watch))
    }
    @Test fun delayedOldSnapshotDoesNotUndoNewEdit() {
        val current = mapOf("hours" to SettingRecord("6", 7, "phone"))
        assertEquals(current, SettingsMerge.merge(current, mapOf("hours" to SettingRecord("8", 2, "watch"))))
    }
    @Test fun malformedAndNonWatchSettingsAreIgnored() {
        assertFalse(SettingsMerge.valid("hourly_pay", "0"))
        val bad = mapOf("break_minutes" to SettingRecord("0", 3, "watch"), "keep_awake" to SettingRecord("yes", 3, "phone"), "dim_delay" to SettingRecord("30000", -1, "watch"))
        assertEquals(emptyMap(), SettingsMerge.merge(emptyMap(), bad))
    }
}
