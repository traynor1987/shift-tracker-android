package site.chatgpt.traynor1987.dominosshifttracker

import android.content.Context
import org.json.JSONObject

/** Fixed-size observation checkpoint, no coordinates or personal route history.
 * Called only on the ordered GPS worker after encrypted sample persistence. */
class NativeReturnObserver(private val context: Context) {
    private val prefs = context.getSharedPreferences("native_return_observation_v1", Context.MODE_PRIVATE)
    private var identity = ""
    private var policy = NativeReturnPolicy()
    private var saved = JSONObject()

    fun observe(sample: NativeLocationSample, generation: Long): JSONObject? {
        val snapshot = NativeShiftState.read(context) ?: return null
        if (!snapshot.shiftActive || snapshot.isStale || snapshot.activityId != sample.deliveryId ||
            snapshot.activity !in setOf("delivery_single", "delivery_double")) return null
        val key = "${snapshot.shiftId}|${sample.deliveryId}|$generation"
        if (identity != key) {
            identity = key
            saved = runCatching { JSONObject(prefs.getString("state", "{}")!!) }.getOrDefault(JSONObject())
            policy = NativeReturnPolicy()
            if (saved.optString("identity") == key) {
                policy.presence = saved.optString("presence", "unknown")
                policy.pending = saved.optString("pending", "unknown")
                policy.count = saved.optInt("count")
                policy.lastAt = saved.optLong("lastAt")
                policy.pendingAt = saved.optLong("pendingAt")
                policy.pendingObserved = saved.optBoolean("pendingObserved")
                policy.exitAt = saved.optLong("exitAt")
                policy.firstInsideAt = saved.optLong("firstInsideAt")
                policy.confirmedAt = saved.optLong("confirmedAt")
                policy.exactEntryAt = saved.optLong("exactEntryAt")
            } else saved = JSONObject()
        }
        if (sample.timestampEpochMs < snapshot.activityStartedAt) return null
        val distance = NativeTrackingPolicy.distanceMetres(sample.latitude, sample.longitude,
            NativeTrackingPolicy.REAL_GEOFENCE_LATITUDE, NativeTrackingPolicy.REAL_GEOFENCE_LONGITUDE)
        val changed = policy.observe(sample.timestampEpochMs, distance, sample.accuracy.toDouble())
        val next = JSONObject().put("identity", key).put("shiftId", snapshot.shiftId)
            .put("deliveryId", sample.deliveryId).put("generation", generation)
            .put("presence", policy.presence).put("pending", policy.pending).put("count", policy.count)
            .put("lastAt", policy.lastAt).put("pendingAt", policy.pendingAt).put("pendingObserved", policy.pendingObserved)
            .put("exitAt", policy.exitAt).put("firstInsideAt", policy.firstInsideAt)
            .put("confirmedAt", policy.confirmedAt).put("exactEntryAt", policy.exactEntryAt)
            .put("persistedAt", System.currentTimeMillis())
            .put("nativeConfirmedAt", if (changed) System.currentTimeMillis() else saved.optLong("nativeConfirmedAt"))
            .put("notificationAt", saved.optLong("notificationAt"))
        // A failed checkpoint must retry from the last durable state.
        if (!prefs.edit().putString("state", next.toString()).commit()) { identity = ""; return null }
        saved = next
        return if (changed) next else null
    }

    companion object {
        fun diagnostics(context: Context): JSONObject = runCatching {
            val value = JSONObject(context.getSharedPreferences("native_return_observation_v1", Context.MODE_PRIVATE).getString("state", "{}")!!)
            JSONObject().put("nativeReturnObservedAt", value.optLong("firstInsideAt"))
                .put("nativeReturnConfirmedAt", value.optLong("nativeConfirmedAt"))
                .put("nativeReturnPersistedAt", value.optLong("persistedAt"))
                .put("nativeReturnNotificationAt", value.optLong("notificationAt"))
        }.getOrDefault(JSONObject())
        fun clear(context: Context) { context.getSharedPreferences("native_return_observation_v1", Context.MODE_PRIVATE).edit().clear().commit() }
    }
}
