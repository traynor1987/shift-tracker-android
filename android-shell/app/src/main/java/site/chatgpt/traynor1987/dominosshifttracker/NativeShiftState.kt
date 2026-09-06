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
    val stateRevision: String,
    val shiftId: String,
    val activityId: String,
    val shiftActive: Boolean,
    val shiftStartedAt: Long,
    val activity: String,
    val activityName: String,
    val activityStartedAt: Long,
    val deliveries: Int,
    val estimatedPay: String,
    val paidTimeSeconds: Long,
    val breakTimeSeconds: Long,
    val deliveryReimbursement: String,
    val shiftTotal: String,
    val miles: String,
    val runs: Int,
    val quickTasks: List<String>,
    val deliveredCustomers: Int,
    val requiredCustomers: Int,
    val earlyDispatchGapSeconds: Int,
    val storeExitAt: Long,
    val storeEntryAt: Long,
    val pausedTaskName: String,
    val storeStatus: String,
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
    private val ACTIONS = setOf(
        "delivered", "back_at_store", "end_break", "complete_task", "single", "double", "break", "open",
        "undo_delivered", "cancel_delivery", "resume_task", "dismiss_resume", "start_quick_task", "finish_quick_tasks",
    )

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
        WearSync.clear(context)
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
        val payload = JSONObject()
            .put("id", "native-${System.currentTimeMillis()}-${action}")
            .put("action", action)
            .put("createdAt", System.currentTimeMillis())
            .put("expectedStateRevision", snapshot.stateRevision)
            .put("expectedShiftId", snapshot.shiftId)
            .put("expectedActivityId", snapshot.activityId)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_PENDING_ACTION, payload.toString()).apply()
        return true
    }

    /** Watch and widget actions both enter through this guarded bridge; the web app still performs the action. */
    fun queueRemoteAction(context: Context, request: JSONObject, sourceNodeId: String): String {
        val action = request.optString("action")
        if (action !in ACTIONS) return "invalid_action"
        val current = peekPendingAction(context)
        if (current != null && System.currentTimeMillis() - current.optLong("createdAt") < 4_000L) return "already_pending"
        val snapshot = read(context) ?: return "stale_state"
        if (snapshot.isStale || action !in snapshot.allowedActions) return "invalid_action"
        val taskName = if (action == "start_quick_task") {
            request.optString("taskName").trim().takeIf { requested ->
                requested.length in 1..60 && snapshot.quickTasks.any { it.equals(requested, ignoreCase = true) }
            } ?: return "invalid_action"
        } else null
        val expectedRevision = request.optString("expectedStateRevision")
        val expectedShiftId = request.optString("expectedShiftId")
        val expectedActivityId = request.optString("expectedActivityId")
        if ((expectedRevision.isNotBlank() && expectedRevision != snapshot.stateRevision)
            || (expectedShiftId.isNotBlank() && expectedShiftId != snapshot.shiftId)
            || (expectedActivityId.isNotBlank() && expectedActivityId != snapshot.activityId)) return "stale_state"
        val id = request.optString("id").takeIf { it.isNotBlank() && it.length <= 160 }
            ?: "wear-${System.currentTimeMillis()}-${action}"
        val payload = JSONObject()
            .put("id", id)
            .put("action", action)
            .put("createdAt", System.currentTimeMillis())
            .put("expectedStateRevision", snapshot.stateRevision)
            .put("expectedShiftId", snapshot.shiftId)
            .put("expectedActivityId", snapshot.activityId)
            .put("sourceNodeId", sourceNodeId.take(160))
        taskName?.let { payload.put("taskName", it) }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_PENDING_ACTION, payload.toString()).apply()
        return "queued"
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

    fun completeAction(context: Context, id: String): JSONObject? {
        val current = peekPendingActionUnsafe(context)
        if (current?.optString("id") != id) return null
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_PENDING_ACTION).apply()
        return current
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
        WearSync.publish(context, snapshot)
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
        val quickTasks = JSONArray()
        val seenQuickTasks = mutableSetOf<String>()
        raw.optJSONArray("quickTasks")?.let { source ->
            for (index in 0 until minOf(source.length(), 40)) {
                val label = source.optString(index).trim().take(60)
                if (label.isNotBlank() && seenQuickTasks.add(label.lowercase())) quickTasks.put(label)
            }
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
            .put("stateRevision", raw.optString("stateRevision").trim().take(240))
            .put("shiftId", raw.optString("shiftId").trim().take(128))
            .put("activityId", raw.optString("activityId").trim().take(128))
            .put("shiftActive", shiftActive)
            .put("shiftStartedAtEpochMs", shiftStartedAt)
            .put("activity", activity)
            .put("activityName", name)
            .put("activityStartedAtEpochMs", activityStartedAt)
            .put("deliveries", raw.optInt("deliveries", 0).coerceIn(0, 9999))
            .put("estimatedPay", raw.optString("estimatedPay").trim().take(40))
            .put("paidTimeSeconds", raw.optLong("paidTimeSeconds", 0L).coerceIn(0L, 7L * 24L * 60L * 60L))
            .put("breakTimeSeconds", raw.optLong("breakTimeSeconds", 0L).coerceIn(0L, 7L * 24L * 60L * 60L))
            .put("deliveryReimbursement", raw.optString("deliveryReimbursement").trim().take(40))
            .put("shiftTotal", raw.optString("shiftTotal").trim().take(40))
            .put("miles", raw.optString("miles").trim().take(20))
            .put("runs", raw.optInt("runs", 0).coerceIn(0, 9999))
            .put("quickTasks", quickTasks)
            .put("deliveredCustomers", raw.optInt("deliveredCustomers", 0).coerceIn(0, 4))
            .put("requiredCustomers", raw.optInt("requiredCustomers", 0).coerceIn(0, 4))
            .put("earlyDispatchGapSeconds", raw.optInt("earlyDispatchGapSeconds", 0).coerceIn(0, 1_800))
            .put("storeExitAtEpochMs", raw.optLong("storeExitAtEpochMs", 0L).takeIf { it in 1..System.currentTimeMillis() + 60_000L } ?: 0L)
            .put("storeEntryAtEpochMs", raw.optLong("storeEntryAtEpochMs", 0L).takeIf { it in 1..System.currentTimeMillis() + 60_000L } ?: 0L)
            .put("pausedTaskName", raw.optString("pausedTaskName").trim().take(120))
            .put("storeStatus", raw.optString("storeStatus", "unknown").takeIf { it in setOf("at_store", "outside_store", "detecting", "unknown") } ?: "unknown")
            .put("allowedActions", actions)
            .put("updatedAtEpochMs", System.currentTimeMillis())
            .put("settings", settings)
    }

    private fun parse(value: JSONObject): ShiftSnapshot? {
        val activity = value.optString("activity")
        if (activity !in ACTIVITIES) return null
        val actions = buildSet { value.optJSONArray("allowedActions")?.let { raw -> for (index in 0 until raw.length()) raw.optString(index).takeIf { it in ACTIONS }?.let(::add) } }
        val s = value.optJSONObject("settings") ?: JSONObject()
        val quickTasks = buildList { value.optJSONArray("quickTasks")?.let { raw -> for (index in 0 until raw.length()) raw.optString(index).takeIf { it.isNotBlank() }?.let(::add) } }
        return ShiftSnapshot(value.optString("stateRevision"), value.optString("shiftId"), value.optString("activityId"), value.optBoolean("shiftActive"), value.optLong("shiftStartedAtEpochMs"), activity, value.optString("activityName"), value.optLong("activityStartedAtEpochMs"), value.optInt("deliveries"), value.optString("estimatedPay"), value.optLong("paidTimeSeconds"), value.optLong("breakTimeSeconds"), value.optString("deliveryReimbursement"), value.optString("shiftTotal"), value.optString("miles"), value.optInt("runs"), quickTasks, value.optInt("deliveredCustomers"), value.optInt("requiredCustomers"), value.optInt("earlyDispatchGapSeconds"), value.optLong("storeExitAtEpochMs"), value.optLong("storeEntryAtEpochMs"), value.optString("pausedTaskName"), value.optString("storeStatus", "unknown"), actions, value.optLong("updatedAtEpochMs"), NativeFeatureSettings(s.optBoolean("liveNotification", true), s.optBoolean("notificationActions", true), s.optBoolean("shiftReminders"), s.optBoolean("breakReminders"), s.optBoolean("taskReminders"), s.optString("photoCompression", "automatic")))
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
        listOf(CompactShiftWidget::class.java, SmallShiftWidget::class.java, MediumShiftWidget::class.java, LargeShiftWidget::class.java).forEach { provider ->
            val ids = manager.getAppWidgetIds(ComponentName(context, provider))
            if (ids.isNotEmpty()) manager.notifyAppWidgetViewDataChanged(ids, android.R.id.text1)
        }
        CompactShiftWidget.update(context, manager, manager.getAppWidgetIds(ComponentName(context, CompactShiftWidget::class.java)), snapshot)
        SmallShiftWidget.update(context, manager, manager.getAppWidgetIds(ComponentName(context, SmallShiftWidget::class.java)), snapshot)
        MediumShiftWidget.update(context, manager, manager.getAppWidgetIds(ComponentName(context, MediumShiftWidget::class.java)), snapshot)
        LargeShiftWidget.update(context, manager, manager.getAppWidgetIds(ComponentName(context, LargeShiftWidget::class.java)), snapshot)
    }
}
