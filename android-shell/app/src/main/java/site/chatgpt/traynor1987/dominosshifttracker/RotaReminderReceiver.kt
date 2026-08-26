package site.chatgpt.traynor1987.dominosshifttracker

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class RotaReminderReceiver : BroadcastReceiver() {
    companion object { const val ACTION_NOTIFY = "site.chatgpt.traynor1987.dominosshifttracker.ROTA_NOTIFY"; private const val CHANNEL = "shift_tracker_rota" }
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) return RotaReminderScheduler.scheduleStored(context)
        if (intent.action != ACTION_NOTIFY) return
        val id = intent.getStringExtra("id") ?: return
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Rota reminders", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Upcoming scheduled Shift Tracker shifts" })
        val open = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        manager.notify(id.hashCode(), NotificationCompat.Builder(context, CHANNEL).setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle(intent.getStringExtra("title") ?: "Shift Tracker").setContentText(intent.getStringExtra("text") ?: "Upcoming shift").setStyle(NotificationCompat.BigTextStyle().bigText(intent.getStringExtra("text") ?: "Upcoming shift")).setContentIntent(open).setAutoCancel(true).setPriority(NotificationCompat.PRIORITY_DEFAULT).build())
        RotaReminderScheduler.remove(context, id)
    }
}
