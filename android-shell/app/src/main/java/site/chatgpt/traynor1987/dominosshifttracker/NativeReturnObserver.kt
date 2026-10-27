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

    fun observe(sample: NativeLocationSample, generation: Long, expectedStoreIdentity: String? = null): JSONObject? {
        val profile = NativeShiftState.storeProfile(context)?.takeIf { it.verified } ?: return null
        if (expectedStoreIdentity != null && expectedStoreIdentity != profile.identity) return null
        val snapshot = NativeShiftState.read(context) ?: return null
        if (!snapshot.shiftActive || snapshot.isStale || snapshot.activityId != sample.deliveryId ||
            snapshot.activity !in setOf("delivery_single", "delivery_double")) return null
        val key = "${snapshot.shiftId}|${sample.deliveryId}|$generation|${profile.identity}"
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
            } else {
                saved = JSONObject()
                if (snapshot.storeExitObserved && snapshot.storeExitAt > 0 && snapshot.storeEntryAt == 0L) {
                    policy.exitAt = snapshot.storeExitAt
                    policy.presence = "outside"
                    policy.lastAt = snapshot.storeExitAt
                }
            }
        }
        if (sample.timestampEpochMs < snapshot.activityStartedAt) return null
        val distance = NativeTrackingPolicy.distanceMetres(sample.latitude, sample.longitude,
            profile.latitude, profile.longitude)
        if (policy.confirmedAt > 0 && snapshot.latestDeliveredAt > policy.confirmedAt) policy.confirmedAt = 0
        val changed = policy.observe(sample.timestampEpochMs, distance, sample.accuracy.toDouble(), profile.radius)
        val next = JSONObject().put("identity", key).put("shiftId", snapshot.shiftId)
            .put("storeIdentity", profile.identity).put("deliveryId", sample.deliveryId).put("generation", generation)
            .put("presence", policy.presence).put("pending", policy.pending).put("count", policy.count)
            .put("lastAt", policy.lastAt).put("pendingAt", policy.pendingAt).put("pendingObserved", policy.pendingObserved)
            .put("exitAt", policy.exitAt).put("firstInsideAt", policy.firstInsideAt)
            .put("confirmedAt", policy.confirmedAt).put("exactEntryAt", policy.exactEntryAt)
            .put("persistedAt", if (changed) System.currentTimeMillis() else saved.optLong("persistedAt"))
            .put("nativeConfirmedAt", if (changed) System.currentTimeMillis() else saved.optLong("nativeConfirmedAt"))
            .put("notificationAt", runCatching { JSONObject(prefs.getString("state", "{}")!!).optLong("notificationAt") }.getOrDefault(0L))
        // A failed checkpoint must retry from the last durable state.
        if (!prefs.edit().putString("state", next.toString()).commit()) { identity = ""; return null }
        saved = next
        return next
    }

    companion object {
        fun hasReturn(context: Context, id: String, generation: Long): Boolean = runCatching {
            val v = JSONObject(context.getSharedPreferences("native_return_observation_v1", Context.MODE_PRIVATE).getString("state", "{}")!!)
            val mirror = NativeShiftState.read(context)
            NativeShiftState.storeProfile(context)?.let { it.verified && it.identity == v.optString("storeIdentity") } == true && v.optString("deliveryId") == id && v.optLong("generation") == generation && v.optLong("confirmedAt") > 0 &&
                mirror?.shiftActive == true && mirror.activityId == id && mirror.shiftId == v.optString("shiftId")
        }.getOrDefault(false)
        fun notificationPosted(context: Context, id: String?, generation: Long?) {
            val p = context.getSharedPreferences("native_return_observation_v1", Context.MODE_PRIVATE)
            val v = runCatching { JSONObject(p.getString("state", "{}")!!) }.getOrDefault(JSONObject())
            if (NativeShiftState.storeProfile(context)?.let { it.verified && it.identity == v.optString("storeIdentity") } == true && v.optString("deliveryId") == id && v.optLong("generation") == generation && v.optLong("confirmedAt") > 0)
                p.edit().putString("state", v.put("notificationAt", System.currentTimeMillis()).toString()).commit()
        }
        fun confirmedSampleAt(context: Context): Long = runCatching {
            JSONObject(context.getSharedPreferences("native_return_observation_v1", Context.MODE_PRIVATE).getString("state", "{}")!!).optLong("confirmedAt")
        }.getOrDefault(0L)
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
