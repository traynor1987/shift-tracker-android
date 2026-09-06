package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator

object WearBreakReminder {
    private fun prefs(c: Context) = c.getSharedPreferences("wear_break_reminder_v1", Context.MODE_PRIVATE)
    fun due(c: Context, s: WearSnapshot?) = s?.let { WearBreakPolicy.deadline(it.active, it.activity, it.activityStarted, WearGoals.breakMinutes(c)) }
    private fun key(s: WearSnapshot, due: Long) = "${s.shiftId}:${s.activityId}:$due"
    private fun pending(c: Context, key: String) = PendingIntent.getBroadcast(c, 530,
        Intent(c, WearBreakAlarmReceiver::class.java).putExtra("key", key), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun precise(c: Context): Boolean = Build.VERSION.SDK_INT < 31 || c.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
    @Synchronized fun reconcile(c: Context) {
        val alarm = c.getSystemService(AlarmManager::class.java)
        val s = WearState.read(c)
        val due = due(c, s)
        val p = prefs(c)
        if (due == null || s == null || !WearGoals.breakAlert(c)) {
            alarm.cancel(pending(c, "")); p.edit().remove("scheduled").apply(); return
        }
        val key = key(s, due)
        if (System.currentTimeMillis() >= due) { fire(c, key); return }
        val scheduleKey = "$key:${precise(c)}"
        if (p.getString("scheduled", null) == scheduleKey) return
        val intent = pending(c, key)
        if (Build.VERSION.SDK_INT < 31 || alarm.canScheduleExactAlarms()) {
            try { alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, due, intent) }
            catch (_: SecurityException) { alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, due, intent) }
        } else alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, due, intent)
        p.edit().putString("scheduled", scheduleKey).apply()
    }
    @Synchronized fun fire(c: Context, expected: String) {
        val s = WearState.read(c) ?: return
        val due = due(c, s) ?: return
        val p = prefs(c)
        if (!WearGoals.breakAlert(c) || !WearBreakPolicy.shouldAlert(expected, key(s, due), due, System.currentTimeMillis(), p.getString("fired", null))) return
        p.edit().putString("fired", expected).apply()
        c.getSystemService(Vibrator::class.java)?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 250, 120, 250, 120, 400), -1), android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_ALARM).build())
    }
}

class WearBreakAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        WearBreakReminder.fire(context, intent.getStringExtra("key").orEmpty())
    }
}
