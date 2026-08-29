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
    private const val GEOFENCE_CHANNEL = "shift_tracker_geofence_events"
    private const val WORK_NOTIFICATION_ID = 2210
    private const val GEOFENCE_NOTIFICATION_ID = 2211

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
        ))
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
