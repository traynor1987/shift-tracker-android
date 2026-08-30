package site.chatgpt.traynor1987.dominosshifttracker

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

data class ShiftSnapshot(
    val shiftActive: Boolean,
    val shiftStartedAt: Long,
    val activity: String,
    val activityName: String,
    val activityStartedAt: Long,
    val deliveries: Int,
    val estimatedPay: String,
    val allowedActions: Set<String>,
    val updatedAt: Long,
    val settings: NativeFeatureSettings,
) {
    val isStale: Boolean get() = updatedAt <= 0L || System.currentTimeMillis() - updatedAt > 12 * 60 * 60_000L
}

data class NativeFeatureSettings(
    val liveNotification: Boolean = true,
    val notificationActions: Boolean = true,
    val shiftReminders: Boolean = false,
    val breakReminders: Boolean = false,
    val taskReminders: Boolean = false,
    val photoCompression: String = "automatic",
)

/** Minimal, non-authoritative mirror used only by Android surfaces. */
object NativeShiftState {
    private const val PREFS = "shift_tracker_native_mirror_v1"
    private const val KEY_SNAPSHOT = "snapshot"
    private const val KEY_PENDING_ACTION = "pending_action"
    private const val MAX_SNAPSHOT_CHARS = 16_384
    private val ACTIVITIES = setOf("idle", "delivery_single", "delivery_double", "break", "cleaning", "prep", "task")
    private val ACTIONS = setOf("delivered", "back_at_store", "end_break", "complete_task", "single", "double", "break", "open")

    fun replace(context: Context, raw: JSONObject): ShiftSnapshot? {
        val canonical = validate(raw) ?: return null
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_SNAPSHOT, canonical.toString()).apply()
        val snapshot = parse(canonical) ?: return null
        refreshSurfaces(context, snapshot)
        return snapshot
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_SNAPSHOT).remove(KEY_PENDING_ACTION).apply()
        TrackerNotifications.clearLiveShift(context)
        ShiftWidgetUpdater.updateAll(context, null)
        updateShortcuts(context, null)
    }

    fun read(context: Context): ShiftSnapshot? {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SNAPSHOT, null) ?: return null
        if (raw.length > MAX_SNAPSHOT_CHARS) return null
        return runCatching { parse(JSONObject(raw)) }.getOrNull()
    }

    fun queueAction(context: Context, action: String): Boolean {
        if (action !in ACTIONS) return false
        val snapshot = read(context) ?: return action == "open"
        if (action != "open" && (snapshot.isStale || action !in snapshot.allowedActions)) return false
        val payload = JSONObject().put("id", "native-${System.currentTimeMillis()}-${action}").put("action", action).put("createdAt", System.currentTimeMillis())
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_PENDING_ACTION, payload.toString()).apply()
        return true
    }

    fun peekPendingAction(context: Context): JSONObject? {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_PENDING_ACTION, null) ?: return null
        val value = runCatching { JSONObject(raw) }.getOrNull() ?: return null
        if (System.currentTimeMillis() - value.optLong("createdAt") > 5 * 60_000L || value.optString("action") !in ACTIONS) {
            acknowledgeAction(context, value.optString("id")); return null
        }
        return value
    }

    fun acknowledgeAction(context: Context, id: String) {
        val current = peekPendingActionUnsafe(context)
        if (current?.optString("id") == id) context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_PENDING_ACTION).apply()
    }

    fun actionPendingIntent(context: Context, action: String, requestCode: Int): PendingIntent = PendingIntent.getActivity(
        context, requestCode, Intent(context, MainActivity::class.java).setAction(NativeActionReceiver.ACTION_RUN_ACTIVITY).putExtra(NativeActionReceiver.EXTRA_ACTION, action).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    fun openAppPendingIntent(context: Context, requestCode: Int = 3200): PendingIntent = PendingIntent.getActivity(
        context, requestCode, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun refreshSurfaces(context: Context, snapshot: ShiftSnapshot) {
        if (snapshot.shiftActive && snapshot.settings.liveNotification) TrackerNotifications.showLiveShift(context, snapshot)
        else TrackerNotifications.clearLiveShift(context)
        ShiftWidgetUpdater.updateAll(context, snapshot)
        updateShortcuts(context, snapshot)
        ShiftReminderScheduler.replace(context, snapshot)
    }

    private fun validate(raw: JSONObject): JSONObject? {
        if (raw.toString().length > MAX_SNAPSHOT_CHARS) return null
        val shiftActive = raw.optBoolean("shiftActive", false)
        val activity = raw.optString("activity", "idle")
        if (activity !in ACTIVITIES) return null
        val name = raw.optString("activityName").trim().take(120)
        val shiftStartedAt = raw.optLong("shiftStartedAtEpochMs", 0L).takeIf { it in 1..System.currentTimeMillis() + 60_000L } ?: 0L
        val activityStartedAt = raw.optLong("activityStartedAtEpochMs", 0L).takeIf { it in 1..System.currentTimeMillis() + 60_000L } ?: 0L
        if (shiftActive && shiftStartedAt == 0L) return null
        val actions = JSONArray()
        raw.optJSONArray("allowedActions")?.let { source ->
            for (index in 0 until minOf(source.length(), ACTIONS.size)) source.optString(index).takeIf { it in ACTIONS }?.let(actions::put)
        }
        val inputSettings = raw.optJSONObject("settings") ?: JSONObject()
        val settings = JSONObject()
            .put("liveNotification", inputSettings.optBoolean("liveNotification", true))
            .put("notificationActions", inputSettings.optBoolean("notificationActions", true))
            .put("shiftReminders", inputSettings.optBoolean("shiftReminders", false))
            .put("breakReminders", inputSettings.optBoolean("breakReminders", false))
            .put("taskReminders", inputSettings.optBoolean("taskReminders", false))
            .put("photoCompression", if (inputSettings.optString("photoCompression") == "original") "original" else "automatic")
        return JSONObject()
            .put("shiftActive", shiftActive)
            .put("shiftStartedAtEpochMs", shiftStartedAt)
            .put("activity", activity)
            .put("activityName", name)
            .put("activityStartedAtEpochMs", activityStartedAt)
            .put("deliveries", raw.optInt("deliveries", 0).coerceIn(0, 9999))
            .put("estimatedPay", raw.optString("estimatedPay").trim().take(40))
            .put("allowedActions", actions)
            .put("updatedAtEpochMs", System.currentTimeMillis())
            .put("settings", settings)
    }

    private fun parse(value: JSONObject): ShiftSnapshot? {
        val activity = value.optString("activity")
        if (activity !in ACTIVITIES) return null
        val actions = buildSet { value.optJSONArray("allowedActions")?.let { raw -> for (index in 0 until raw.length()) raw.optString(index).takeIf { it in ACTIONS }?.let(::add) } }
        val s = value.optJSONObject("settings") ?: JSONObject()
        return ShiftSnapshot(value.optBoolean("shiftActive"), value.optLong("shiftStartedAtEpochMs"), activity, value.optString("activityName"), value.optLong("activityStartedAtEpochMs"), value.optInt("deliveries"), value.optString("estimatedPay"), actions, value.optLong("updatedAtEpochMs"), NativeFeatureSettings(s.optBoolean("liveNotification", true), s.optBoolean("notificationActions", true), s.optBoolean("shiftReminders"), s.optBoolean("breakReminders"), s.optBoolean("taskReminders"), s.optString("photoCompression", "automatic")))
    }

    private fun peekPendingActionUnsafe(context: Context): JSONObject? = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_PENDING_ACTION, null)?.let { runCatching { JSONObject(it) }.getOrNull() }

    private fun updateShortcuts(context: Context, snapshot: ShiftSnapshot?) {
        if (Build.VERSION.SDK_INT < 25) return
        val manager = context.getSystemService(ShortcutManager::class.java)
        val shortcuts = mutableListOf(ShortcutInfo.Builder(context, "open_tracker").setShortLabel("Open Shift Tracker").setLongLabel("Open Domino’s Shift Tracker").setIcon(Icon.createWithResource(context, R.mipmap.shift_tracker_launcher)).setIntent(Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW)).build())
        val quick = if (snapshot?.shiftActive == true) listOf("single" to "Single delivery", "double" to "Double delivery", "break" to "Start break") else emptyList()
        quick.filter { it.first in snapshot!!.allowedActions }.forEachIndexed { index, item ->
            shortcuts += ShortcutInfo.Builder(context, "tracker_${item.first}").setShortLabel(item.second).setIcon(Icon.createWithResource(context, R.drawable.ic_stat_shift_tracker)).setIntent(Intent(context, MainActivity::class.java).setAction(NativeActionReceiver.ACTION_RUN_ACTIVITY).putExtra(NativeActionReceiver.EXTRA_ACTION, item.first)).setRank(index + 1).build()
        }
        manager.dynamicShortcuts = shortcuts
    }
}

object ShiftWidgetUpdater {
    fun updateAll(context: Context, snapshot: ShiftSnapshot? = NativeShiftState.read(context)) {
        val manager = AppWidgetManager.getInstance(context)
        listOf(SmallShiftWidget::class.java, MediumShiftWidget::class.java).forEach { provider ->
            val ids = manager.getAppWidgetIds(ComponentName(context, provider))
            if (ids.isNotEmpty()) manager.notifyAppWidgetViewDataChanged(ids, android.R.id.text1)
        }
        SmallShiftWidget.update(context, manager, manager.getAppWidgetIds(ComponentName(context, SmallShiftWidget::class.java)), snapshot)
        MediumShiftWidget.update(context, manager, manager.getAppWidgetIds(ComponentName(context, MediumShiftWidget::class.java)), snapshot)
    }
}
