package site.chatgpt.traynor1987.dominosshifttracker

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Optional reminders derived only from the current mirrored web state. */
object ShiftReminderScheduler {
    private const val REQUEST = 4011
    private const val PREFS = "shift_tracker_native_reminder"

    fun replace(context: Context, snapshot: ShiftSnapshot) {
        cancel(context)
        val dueAt = when {
            !snapshot.shiftActive || snapshot.isStale -> null
            snapshot.activity == "break" && snapshot.settings.breakReminders -> snapshot.activityStartedAt + 45 * 60_000L
            snapshot.activity in setOf("cleaning", "prep", "task") && snapshot.settings.taskReminders -> snapshot.activityStartedAt + 90 * 60_000L
            snapshot.settings.shiftReminders -> snapshot.shiftStartedAt + 10 * 60 * 60_000L
            else -> null
        }?.takeIf { it > System.currentTimeMillis() }
        if (dueAt == null) return
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("due_at", dueAt).apply()
        context.getSystemService(AlarmManager::class.java).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, dueAt, pending(context))
    }

    private fun cancel(context: Context) {
        context.getSystemService(AlarmManager::class.java).cancel(pending(context))
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }

    private fun pending(context: Context) = PendingIntent.getBroadcast(context, REQUEST, Intent(context, ShiftReminderReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
}

class ShiftReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val snapshot = NativeShiftState.read(context) ?: return
        if (!snapshot.shiftActive || snapshot.isStale) return
        val pair = when (snapshot.activity) {
            "break" -> "Break still in progress" to "Open Shift Tracker when your break is finished."
            "cleaning", "prep", "task" -> "Task still in progress" to "${snapshot.activityName.ifBlank { "Your task" }} has been active for a while."
            else -> "Shift still clocked in" to "Open Shift Tracker to check your current shift."
        }
        TrackerNotifications.showReminder(context, pair.first, pair.second)
    }
}
