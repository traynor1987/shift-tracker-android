package site.chatgpt.traynor1987.dominosshifttracker

import android.content.Context

/** Explicit opt-in shift identity. No positions are stored outside deliveries. */
object ShiftMonitorController {
    private const val PREFS = "shift_monitor_v1"
    fun idleId(context: Context): String? {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val id = p.getString("shiftId", null) ?: return null
        val snapshot = NativeShiftState.read(context) ?: return null
        return if (snapshot.shiftActive && !snapshot.isStale && snapshot.shiftId == id) "monitor:$id" else null
    }
    fun highAccuracy(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("highAccuracy", false)
    fun sync(context: Context, snapshot: ShiftSnapshot) {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        check(p.edit().putString("shiftId", if (ShiftMonitoringPolicy.mode(snapshot.settings.alwaysOnShiftMonitoring, snapshot.shiftActive, false, snapshot.settings.shiftMonitoringHighAccuracy) != "stopped") snapshot.shiftId else null)
            .putBoolean("highAccuracy", snapshot.settings.shiftMonitoringHighAccuracy).commit())
    }
    fun stop(context: Context) {
        check(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit())
    }
}
