package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.content.Context
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject

data class WearSnapshot(val stateRevision: Long, val shiftId: String, val activityId: String, val active: Boolean, val shiftStarted: Long, val activity: String, val name: String, val activityStarted: Long, val deliveries: Int, val pay: String, val storeStatus: String, val actions: Set<String>, val updatedAt: Long) {
    val disconnected: Boolean get() = updatedAt <= 0L || System.currentTimeMillis() - updatedAt > 12 * 60 * 60_000L
}

object WearState {
    const val STATE_PATH = "/shift-tracker/state"; const val ACTION_PATH = "/shift-tracker/action"; const val REQUEST_PATH = "/shift-tracker/request-state"; const val RESULT_PATH = "/shift-tracker/action-result"
    private const val PREFS = "shift_tracker_wear_mirror_v1"; private const val KEY = "snapshot"
    fun read(context: Context): WearSnapshot? = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)?.let { parse(it) }
    fun save(context: Context, raw: String) { if (parse(raw) != null) context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, raw).apply() }
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
        val o = JSONObject(raw); WearSnapshot(o.optLong("stateRevision"), o.optString("shiftId"), o.optString("activityId"), o.optBoolean("shiftActive"), o.optLong("shiftStartedAtEpochMs"), o.optString("activity", "idle"), o.optString("activityName"), o.optLong("activityStartedAtEpochMs"), o.optInt("deliveries"), o.optString("estimatedPay"), o.optString("storeStatus", "unknown"), o.optString("allowedActions").split(',').filter { it.isNotBlank() }.toSet(), o.optLong("updatedAtEpochMs"))
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
    override fun onMessageReceived(event: MessageEvent) { if (event.path == WearState.RESULT_PATH) { WearTileRefresh.request(this); WearTransport.requestState(this) } }
}

object WearTransport {
    fun sendAction(context: Context, action: String) {
        val state = WearState.read(context) ?: return
        val payload = JSONObject()
            .put("id", "wear-${System.currentTimeMillis()}-${action}")
            .put("action", action)
            .put("expectedStateRevision", state.stateRevision)
            .put("expectedShiftId", state.shiftId)
            .put("expectedActivityId", state.activityId)
            .toString().toByteArray()
        Wearable.getNodeClient(context).connectedNodes.addOnSuccessListener { nodes -> nodes.forEach { Wearable.getMessageClient(context).sendMessage(it.id, WearState.ACTION_PATH, payload) } }
    }
    fun requestState(context: Context) { Wearable.getNodeClient(context).connectedNodes.addOnSuccessListener { nodes -> nodes.forEach { Wearable.getMessageClient(context).sendMessage(it.id, WearState.REQUEST_PATH, byteArrayOf()) } } }
}
