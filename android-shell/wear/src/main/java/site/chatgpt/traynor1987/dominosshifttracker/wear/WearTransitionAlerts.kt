package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator

object WearTransitionAlerts {
    private const val PREFS = "shift_tracker_wear_transition_alerts_v1"
    private const val LAST_EVENT = "last_event"

    fun notify(context: Context, previous: WearSnapshot?, next: WearSnapshot) {
        val transition = WearDisplayPolicy.geofenceTransition(previous, next) ?: return
        val eventKey = "${next.shiftId}:${next.activityId}:$transition"
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getString(LAST_EVENT, null) == eventKey) return
        prefs.edit().putString(LAST_EVENT, eventKey).apply()
        val pattern = if (transition == "returned") {
            longArrayOf(0, 180, 90, 180, 90, 260)
        } else {
            longArrayOf(0, 120, 80, 120)
        }
        val vibrator = context.getSystemService(Vibrator::class.java) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(pattern, -1)
        }
    }
}
