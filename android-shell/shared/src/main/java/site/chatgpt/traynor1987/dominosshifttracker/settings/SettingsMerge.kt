package site.chatgpt.traynor1987.dominosshifttracker.settings

/** Per-setting logical revisions keep unrelated offline edits and converge without clock assumptions. */
data class SettingRecord(val value: String, val revision: Long, val source: String)
object SettingsMerge {
    val defaults = linkedMapOf("keep_awake" to "true", "battery_saver_display" to "true", "show_earnings" to "true",
        "haptic_geofence" to "true", "break_alert" to "true", "dim_delay" to "15000", "break_minutes" to "30", "deliveries" to "20", "hours" to "8")
    fun valid(key: String, value: String): Boolean = when (key) {
        "keep_awake", "battery_saver_display", "show_earnings", "haptic_geofence", "break_alert" -> value == "true" || value == "false"
        "dim_delay" -> value in setOf("15000", "30000", "60000")
        "break_minutes" -> value.toIntOrNull()?.let { it in 5..120 && it.toString() == value } == true
        "deliveries" -> value.toIntOrNull()?.let { it in 0..200 && it.toString() == value } == true
        "hours" -> value.toIntOrNull()?.let { it in 0..24 && it.toString() == value } == true
        else -> false
    }
    fun merge(local: Map<String, SettingRecord>, incoming: Map<String, SettingRecord>): Map<String, SettingRecord> {
        val result = local.toMutableMap()
        incoming.forEach { (key, next) ->
            if (!valid(key, next.value) || next.revision !in 1..9_000_000_000_000_000L || next.source.length !in 1..80) return@forEach
            val old = result[key]
            if (old == null || next.revision > old.revision || next.revision == old.revision && next.source > old.source) result[key] = next
        }
        return result
    }
}
