package site.chatgpt.traynor1987.dominosshifttracker

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject

/**
 * Listens only for the precise Order Dispatched wording while a fresh mirrored
 * shift says a normal Single/Double can start. It stores a timestamp only;
 * the trusted PWA bridge decides whether that timestamp may start its existing
 * pending dispatch timer.
 */
class DispatchNotificationListenerService : NotificationListenerService() {
    override fun onNotificationPosted(notification: StatusBarNotification) {
        if (!isOrderDispatched(notification.notification)) return
        DispatchNotificationStore.record(applicationContext, notification.postTime)
    }

    private fun isOrderDispatched(notification: Notification): Boolean {
        val extras = notification.extras ?: return false
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim().orEmpty()
        val body = listOf(
            extras.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
            extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString(),
        ).filterNotNull().joinToString(" ").replace(Regex("\\s+"), " ").trim()
        return title.equals("Order Dispatched", ignoreCase = true)
            && body.contains("new order", ignoreCase = true)
            && body.contains("dispatched", ignoreCase = true)
    }
}

object DispatchNotificationStore {
    private const val PREFS = "shift_tracker_dispatch_notification_v1"
    private const val KEY_EVENT = "pending_event"
    private const val MAX_AGE_MS = 35 * 60_000L

    fun accessEnabled(context: Context): Boolean {
        // NotificationManagerCompat is the normal source, but some Samsung
        // builds can briefly report an empty package set immediately after the
        // user enables the listener. Read Android's enabled-component list as
        // a fallback so the PWA does not show a false "needs enabling" state.
        if (NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)) return true
        val serviceClass = DispatchNotificationListenerService::class.java.name
        return Settings.Secure.getString(
            context.contentResolver,
            "enabled_notification_listeners",
        ).orEmpty().split(':').any { flattened ->
            ComponentName.unflattenFromString(flattened)?.let {
                it.packageName == context.packageName && it.className == serviceClass
            } == true
        }
    }

    fun record(context: Context, postedAtEpochMs: Long) {
        val now = System.currentTimeMillis()
        val snapshot = NativeShiftState.read(context) ?: return
        if (
            !snapshot.shiftActive ||
            snapshot.activity.startsWith("delivery_") ||
            // The native shift mirror is intentionally valid for a full
            // shift. A two-minute expiry made dispatch detection randomly
            // fail whenever the driver had not touched the PWA recently.
            snapshot.isStale ||
            !(snapshot.allowedActions.contains("single") || snapshot.allowedActions.contains("double"))
        ) return
        val receivedAt = postedAtEpochMs.takeIf { it in snapshot.shiftStartedAt..now + 5_000L } ?: now
        val id = "dispatch-$receivedAt"
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getString(KEY_EVENT, null)?.let { runCatching { JSONObject(it).optString("id") }.getOrNull() } == id) return
        prefs.edit().putString(KEY_EVENT, JSONObject().put("id", id).put("receivedAtEpochMs", receivedAt).toString()).apply()
        deliver(context)
    }

    fun deliver(context: Context) {
        val event = readCurrent(context) ?: return
        MainActivity.sendNativeMessage(JSONObject()
            .put("type", "shift_tracker_dispatch_notification:received")
            .put("id", event.optString("id"))
            .put("receivedAtEpochMs", event.optLong("receivedAtEpochMs"))
            .toString())
    }

    fun acknowledge(context: Context, id: String) {
        val event = readCurrent(context) ?: return
        if (event.optString("id") == id) context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_EVENT).apply()
    }

    private fun readCurrent(context: Context): JSONObject? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val event = prefs.getString(KEY_EVENT, null)?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return null
        val receivedAt = event.optLong("receivedAtEpochMs", 0L)
        if (receivedAt <= 0L || System.currentTimeMillis() - receivedAt !in 0..MAX_AGE_MS) {
            prefs.edit().remove(KEY_EVENT).apply()
            return null
        }
        return event
    }
}
