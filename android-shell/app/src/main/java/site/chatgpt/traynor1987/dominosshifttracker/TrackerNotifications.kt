package site.chatgpt.traynor1987.dominosshifttracker

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/** Normal notifications only. This object never starts a service or requests
 * location; delivery GPS remains owned exclusively by DeliveryLocationService. */
object TrackerNotifications {
    private const val WORK_CHANNEL = "shift_tracker_work_status"
    private const val LIVE_SHIFT_CHANNEL = "shift_tracker_live_shift_v1"
    private const val REMINDER_CHANNEL = "shift_tracker_reminders_v1"
    private const val GEOFENCE_CHANNEL = "shift_tracker_geofence_events"
    private const val WORK_NOTIFICATION_ID = 2210
    private const val GEOFENCE_NOTIFICATION_ID = 2211
    private const val LIVE_SHIFT_NOTIFICATION_ID = 2212
    private const val REMINDER_NOTIFICATION_ID = 2213

    private fun notificationsAllowed(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun openAppIntent(context: Context): PendingIntent = PendingIntent.getActivity(
        context,
        0,
        Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun manager(context: Context): NotificationManager = context.getSystemService(NotificationManager::class.java)

    private fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        manager(context).createNotificationChannels(listOf(
            NotificationChannel(WORK_CHANNEL, "Active work", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Cleaning and preparation tasks currently being timed"
                setSound(null, null)
                enableVibration(false)
            },
            NotificationChannel(GEOFENCE_CHANNEL, "Store geofence", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Confirmed departures from and returns to the protected store geofence"
                setSound(null, null)
                enableVibration(false)
            },
            NotificationChannel(LIVE_SHIFT_CHANNEL, "Live shift", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Current Shift Tracker status and timer"
                setSound(null, null)
                enableVibration(false)
            },
            NotificationChannel(REMINDER_CHANNEL, "Shift reminders", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Optional break, task and long-shift reminders"
            },
        ))
    }

    fun showLiveShift(context: Context, snapshot: ShiftSnapshot) {
        if (!notificationsAllowed(context) || !snapshot.shiftActive) return
        ensureChannels(context)
        val title = when (snapshot.activity) {
            "delivery_single" -> "Delivery in progress"
            "delivery_double" -> "Double delivery in progress"
            "break" -> "Break in progress"
            "cleaning" -> "Cleaning in progress"
            "prep" -> "Prep in progress"
            "task" -> "Task in progress"
            else -> "Shift in progress"
        }
        val detail = when {
            snapshot.activityName.isNotBlank() -> snapshot.activityName
            snapshot.activity == "delivery_single" -> "Single"
            snapshot.activity == "delivery_double" -> "2 deliveries"
            else -> "At Store"
        }
        val summary = if (snapshot.activity == "idle") "${snapshot.deliveries} deliveries${snapshot.estimatedPay.takeIf(String::isNotBlank)?.let { " • $it estimated" } ?: ""}" else detail
        val builder = NotificationCompat.Builder(context, LIVE_SHIFT_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_shift_tracker)
            .setContentTitle(title)
            .setContentText(summary)
            .setStyle(NotificationCompat.BigTextStyle().bigText(summary))
            .setContentIntent(NativeShiftState.openAppPendingIntent(context))
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(true)
        val startedAt = if (snapshot.activity == "idle") snapshot.shiftStartedAt else snapshot.activityStartedAt
        if (startedAt > 0L) builder.setWhen(startedAt).setUsesChronometer(true).setChronometerCountDown(false)
        if (snapshot.settings.notificationActions) {
            val labels = mapOf("delivered" to "Delivered", "back_at_store" to "Back at Store", "end_break" to "End Break", "complete_task" to "Complete Task", "single" to "Single", "double" to "Double")
            snapshot.allowedActions.take(2).forEachIndexed { index, action -> labels[action]?.let { builder.addAction(0, it, NativeShiftState.actionPendingIntent(context, action, 4100 + index)) } }
        }
        manager(context).notify(LIVE_SHIFT_NOTIFICATION_ID, builder.build())
    }

    fun clearLiveShift(context: Context) = manager(context).cancel(LIVE_SHIFT_NOTIFICATION_ID)

    fun showReminder(context: Context, title: String, text: String) {
        if (!notificationsAllowed(context)) return
        ensureChannels(context)
        manager(context).notify(REMINDER_NOTIFICATION_ID, NotificationCompat.Builder(context, REMINDER_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_shift_tracker)
            .setContentTitle(title).setContentText(text).setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(openAppIntent(context)).setAutoCancel(true).setOnlyAlertOnce(true).build())
    }

    fun showWork(context: Context, kind: String, taskName: String, startedAtEpochMs: Long?, paused: Boolean) {
        if (!notificationsAllowed(context)) return
        ensureChannels(context)
        val label = if (kind == "prep") "Preparation" else "Cleaning"
        val builder = NotificationCompat.Builder(context, WORK_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(if (paused) "$label paused" else "$label in progress")
            .setContentText(taskName)
            .setStyle(NotificationCompat.BigTextStyle().bigText(taskName))
            .setContentIntent(openAppIntent(context))
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(!paused && startedAtEpochMs != null)
        if (!paused && startedAtEpochMs != null) builder
            .setWhen(startedAtEpochMs)
            .setUsesChronometer(true)
            .setChronometerCountDown(false)
        manager(context).notify(WORK_NOTIFICATION_ID, builder.build())
    }

    fun clearWork(context: Context) {
        manager(context).cancel(WORK_NOTIFICATION_ID)
    }

    fun showGeofence(context: Context, returned: Boolean, observedAtEpochMs: Long) {
        if (!notificationsAllowed(context)) return
        ensureChannels(context)
        val title = if (returned) "Returned to store geofence" else "Left store geofence"
        val text = if (returned) "You are back inside the protected Real delivery zone." else "You are now outside the protected Real delivery zone."
        manager(context).notify(GEOFENCE_NOTIFICATION_ID, NotificationCompat.Builder(context, GEOFENCE_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_map)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(openAppIntent(context))
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setWhen(observedAtEpochMs)
            .setShowWhen(true)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setTimeoutAfter(30_000L)
            .build())
    }
}
