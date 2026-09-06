package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.content.Context
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject

data class WearSnapshot(val stateRevision: String, val shiftId: String, val activityId: String, val active: Boolean, val shiftStarted: Long, val activity: String, val name: String, val activityStarted: Long, val deliveries: Int, val pay: String, val storeStatus: String, val actions: Set<String>, val updatedAt: Long) {
    val disconnected: Boolean get() = WearReliabilityPolicy.stateIsDisconnected(updatedAt)
}

data class WearActionFeedback(val id: String, val action: String, val outcome: String, val updatedAt: Long) {
    val pending: Boolean get() = WearReliabilityPolicy.actionIsPending(outcome) &&
        System.currentTimeMillis() - updatedAt <= WearReliabilityPolicy.ACTION_PENDING_TIMEOUT_MS
    val visible: Boolean get() = pending ||
        System.currentTimeMillis() - updatedAt <= WearReliabilityPolicy.ACTION_RESULT_VISIBLE_MS
}

object WearState {
    const val STATE_PATH = "/shift-tracker/state"; const val ACTION_PATH = "/shift-tracker/action"; const val REQUEST_PATH = "/shift-tracker/request-state"; const val RESULT_PATH = "/shift-tracker/action-result"; const val OPEN_PHONE_PATH = "/shift-tracker/open-phone"
    private const val PREFS = "shift_tracker_wear_mirror_v1"; private const val KEY = "snapshot"; private const val ACTION_KEY = "action_feedback"
    fun read(context: Context): WearSnapshot? = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)?.let { parse(it) }
    fun save(context: Context, raw: String) { if (parse(raw) != null) context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, raw).apply() }
    fun readActionFeedback(context: Context): WearActionFeedback? = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(ACTION_KEY, null)?.let { raw -> runCatching {
        val value = JSONObject(raw)
        WearActionFeedback(value.optString("id"), value.optString("action"), value.optString("outcome"), value.optLong("updatedAt"))
    }.getOrNull() }?.takeIf { it.id.isNotBlank() && it.action.isNotBlank() && it.outcome.isNotBlank() }
    fun saveActionFeedback(context: Context, id: String, action: String, outcome: String) {
        if (id.isBlank() || action.isBlank() || outcome.isBlank()) return
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(ACTION_KEY, JSONObject()
            .put("id", id.take(160)).put("action", action.take(40)).put("outcome", outcome.take(40))
            .put("updatedAt", System.currentTimeMillis()).toString()).apply()
    }
    fun updateActionFeedback(context: Context, raw: String): WearActionFeedback? {
        val result = runCatching { JSONObject(raw) }.getOrNull() ?: return null
        val id = result.optString("id")
        val current = readActionFeedback(context) ?: return null
        if (id != current.id) return null
        saveActionFeedback(context, current.id, current.action, result.optString("outcome", "error"))
        return readActionFeedback(context)
    }
    fun clear(context: Context) {
        // Older phone releases delete the DataItem. Treat that as an explicit
        // off-shift state rather than reviving the old timer from preferences.
        save(context, JSONObject()
            .put("shiftActive", false)
            .put("activity", "idle")
            .put("activityName", "")
            .put("deliveries", 0)
            .put("estimatedPay", "")
            .put("storeStatus", "unknown")
            .put("allowedActions", "")
            .put("updatedAtEpochMs", System.currentTimeMillis())
            .toString())
    }
    private fun parse(raw: String): WearSnapshot? = runCatching {
        val o = JSONObject(raw); WearSnapshot(o.optString("stateRevision"), o.optString("shiftId"), o.optString("activityId"), o.optBoolean("shiftActive"), o.optLong("shiftStartedAtEpochMs"), o.optString("activity", "idle"), o.optString("activityName"), o.optLong("activityStartedAtEpochMs"), o.optInt("deliveries"), o.optString("estimatedPay"), o.optString("storeStatus", "unknown"), o.optString("allowedActions").split(',').filter { it.isNotBlank() }.toSet(), o.optLong("updatedAtEpochMs"))
    }.getOrNull()
}

class WearStateListenerService : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) {
        events.use { buffer -> buffer.forEach { event ->
            if (event.dataItem.uri.path != WearState.STATE_PATH) return@forEach
            if (event.type == DataEvent.TYPE_DELETED) {
                WearState.clear(this)
                WearTileRefresh.request(this)
                return@forEach
            }
            event.dataItem.data?.let { bytes ->
                val map = com.google.android.gms.wearable.DataMap.fromByteArray(bytes)
                map.getString("snapshot")?.let { WearState.save(this, it); WearTileRefresh.request(this) }
            }
        } }
    }
    override fun onMessageReceived(event: MessageEvent) { if (event.path == WearState.RESULT_PATH) {
        WearState.updateActionFeedback(this, event.data.toString(Charsets.UTF_8))
        WearTileRefresh.request(this); WearTransport.requestState(this)
    } }
}

object WearTransport {
    /** Opens the paired phone app only; no delivery or shift action is sent. */
    fun openPhone(context: Context) { withBestNode(context, onMissing = {}) { id -> Wearable.getMessageClient(context).sendMessage(id, WearState.OPEN_PHONE_PATH, byteArrayOf()) } }
    fun sendAction(context: Context, action: String): String? {
        val state = WearState.read(context) ?: return null
        val id = "wear-${System.currentTimeMillis()}-$action"
        val payload = JSONObject()
            .put("id", id)
            .put("action", action)
            .put("expectedStateRevision", state.stateRevision)
            .put("expectedShiftId", state.shiftId)
            .put("expectedActivityId", state.activityId)
            .toString().toByteArray()
        WearState.saveActionFeedback(context, id, action, "sending")
        withBestNode(context, onMissing = { WearState.saveActionFeedback(context, id, action, "not_connected") }) { nodeId ->
            Wearable.getMessageClient(context).sendMessage(nodeId, WearState.ACTION_PATH, payload)
                .addOnFailureListener { WearState.saveActionFeedback(context, id, action, "send_failed") }
        }
        return id
    }
    fun requestState(context: Context) { withBestNode(context, onMissing = {}) { id -> Wearable.getMessageClient(context).sendMessage(id, WearState.REQUEST_PATH, byteArrayOf()) } }
    private fun withBestNode(context: Context, onMissing: () -> Unit, action: (String) -> Unit) {
        Wearable.getNodeClient(context).connectedNodes
            .addOnSuccessListener { nodes -> nodes.maxByOrNull { if (it.isNearby) 1 else 0 }?.id?.let(action) ?: onMissing() }
            .addOnFailureListener { onMissing() }
    }
}
