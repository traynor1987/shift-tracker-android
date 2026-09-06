package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.wear.ongoing.OngoingActivity

/** System ambient retention for the user's active shift; never launches an activity itself. */
object WearShiftOngoing {
    private const val ID = 541
    private const val CHANNEL = "active_shift"
    fun reconcile(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        val snapshot = WearState.read(context)
        if (snapshot?.active != true || !WearPreferences.keepAwake(context)) {
            manager.cancel(ID)
            return
        }
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Active shift", NotificationManager.IMPORTANCE_LOW))
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return
        val intent = PendingIntent.getActivity(context, ID,
            Intent(context, WearMainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_shift_ongoing)
            .setContentTitle("Shift Tracker")
            .setContentText(WearDisplayPolicy.activityTitle(snapshot.activity))
            .setContentIntent(intent).setOngoing(true).setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
        OngoingActivity.Builder(context, ID, builder)
            .setStaticIcon(R.drawable.ic_shift_ongoing).setTouchIntent(intent)
            .build().apply(context)
        // Permission may be revoked between the capability check and posting.
        try { manager.notify(ID, builder.build()) } catch (_: SecurityException) { }
    }
}
