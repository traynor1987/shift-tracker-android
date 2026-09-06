package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.content.Context

object WearGoals {
    private fun prefs(c: Context) = c.getSharedPreferences("wear_goals_v1", Context.MODE_PRIVATE)
    fun breakMinutes(c: Context) = prefs(c).getInt("break_minutes", 30).coerceIn(5, 120)
    fun breakAlert(c: Context) = prefs(c).getBoolean("break_alert", true)
    fun deliveries(c: Context) = prefs(c).getInt("deliveries", 20).coerceIn(0, 200)
    fun hours(c: Context) = prefs(c).getInt("hours", 8).coerceIn(0, 24)
    fun cycle(c: Context, key: String, options: List<Int>, current: Int) {
        prefs(c).edit().putInt(key, options[(options.indexOf(current) + 1) % options.size]).apply()
    }
    fun toggleBreakAlert(c: Context) { prefs(c).edit().putBoolean("break_alert", !breakAlert(c)).apply() }
    fun percent(current: Long, target: Long): Int = if (target <= 0) 0 else ((current.coerceAtLeast(0).coerceAtMost(target) * 100) / target).toInt()
}

object WearBreakPolicy {
    fun deadline(active: Boolean, activity: String, start: Long, minutes: Int): Long? =
        if (!active || activity != "break" || start <= 0 || minutes !in 5..120 || start > Long.MAX_VALUE - minutes * 60_000L) null
        else start + minutes * 60_000L
    fun shouldAlert(expected: String, current: String, due: Long, now: Long, fired: String?): Boolean =
        expected.isNotBlank() && expected == current && expected != fired && now >= due && now - due <= 5 * 60_000L
}
