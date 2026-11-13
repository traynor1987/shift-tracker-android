package site.chatgpt.traynor1987.dominosshifttracker

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Bounded observation evidence, never a delivery completion or a retained personal route.
 * Called on the ordered GPS worker; checkpoint and event are committed before any alert/bridge. */
class NativeReturnObserver(private val context: Context) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private var identity = ""
    private var policy = NativeReturnPolicy()

    fun observe(sample: NativeLocationSample, generation: Long, expectedStoreIdentity: String? = null): JSONObject? = synchronized(lock) {
        if (!NativeReturnPolicy.acceptsFix(sample.timestampEpochMs, System.currentTimeMillis(), sample.latitude, sample.longitude, sample.accuracy.toDouble())) return null
        val profile = NativeShiftState.storeProfile(context)?.takeIf { it.verified } ?: return null
        if (expectedStoreIdentity != null && expectedStoreIdentity != profile.identity) return null
        val snapshot = NativeShiftState.read(context) ?: return null
        if (!snapshot.shiftActive || snapshot.isStale || snapshot.activityId != sample.deliveryId ||
            snapshot.activity !in setOf("delivery_single", "delivery_double") || sample.timestampEpochMs < snapshot.activityStartedAt) return null
        val key = "${snapshot.shiftId}|${sample.deliveryId}|$generation|${profile.identity}"
        val saved = state(context).takeIf { it.optString("identity") == key } ?: JSONObject()
        if (identity != key) {
            identity = key
            policy = NativeReturnPolicy()
            if (saved.length() > 0) {
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
            } else if (snapshot.storeExitObserved && snapshot.storeExitAt > 0 && snapshot.storeEntryAt == 0L) {
                policy.exitAt = snapshot.storeExitAt
                policy.presence = "outside"
                policy.lastAt = snapshot.storeExitAt
            }
        }
        val distance = NativeTrackingPolicy.distanceMetres(sample.latitude, sample.longitude, profile.latitude, profile.longitude)
        if (policy.pending == "inside" && policy.pendingAt in 1 until snapshot.latestDeliveredAt) {
            policy.pending = "unknown"
            policy.pendingAt = 0
            policy.count = 0
            policy.pendingObserved = false
        }
        if (policy.firstInsideAt in 1 until snapshot.latestDeliveredAt ||
            policy.confirmedAt in 1 until snapshot.latestDeliveredAt) {
            policy.confirmedAt = 0
            policy.firstInsideAt = 0
            policy.exactEntryAt = 0 // A post-Delivered stationary observation is not an exact new crossing.
        }
        val observed = policy.observe(sample.timestampEpochMs, distance, sample.accuracy.toDouble(), profile.radius)
        val changed = observed && snapshot.requiredCustomers > 0 && snapshot.deliveredCustomers >= snapshot.requiredCustomers &&
            snapshot.latestDeliveredAt > 0 && policy.confirmedAt >= snapshot.latestDeliveredAt
        val now = System.currentTimeMillis()
        val eventId = if (changed) "native-return:" + UUID.nameUUIDFromBytes("$key|${policy.confirmedAt}".toByteArray(Charsets.UTF_8)) else saved.optString("eventId")
        val next = JSONObject().put("identity", key).put("shiftId", snapshot.shiftId)
            .put("storeIdentity", profile.identity).put("deliveryId", sample.deliveryId).put("generation", generation)
            .put("presence", policy.presence).put("pending", policy.pending).put("count", policy.count)
            .put("lastAt", policy.lastAt).put("pendingAt", policy.pendingAt).put("pendingObserved", policy.pendingObserved)
            .put("exitAt", policy.exitAt).put("firstInsideAt", policy.firstInsideAt)
            .put("confirmedAt", policy.confirmedAt).put("exactEntryAt", policy.exactEntryAt)
            .put("persistedAt", if (changed) now else saved.optLong("persistedAt"))
            .put("nativeConfirmedAt", if (changed) now else saved.optLong("nativeConfirmedAt"))
            .put("eventId", eventId).put("notificationAt", if (changed) 0L else saved.optLong("notificationAt"))
        val edit = prefs.edit().putString("state", next.toString())
        if (changed) {
            val events = events(context).filter { it.optString("eventId") != eventId }.takeLast(MAX_EVENTS - 1).toMutableList()
            events.add(JSONObject().put("eventId", eventId).put("kind", "returned")
                .put("shiftId", snapshot.shiftId).put("deliveryId", sample.deliveryId).put("generation", generation)
                .put("storeId", profile.id).put("storeRevision", profile.revision).put("storeIdentity", profile.identity)
                .put("timestampEpochMs", policy.confirmedAt).put("observedAtEpochMs", policy.firstInsideAt)
                .put("exitAt", policy.exitAt).put("entryAt", policy.exactEntryAt)
                .put("accuracy", sample.accuracy.toDouble()).put("source", "native_gps")
                .put("status", "pending").put("acknowledgedAt", 0L).put("notificationAt", 0L).put("persistedAt", now))
            edit.putString("events", JSONArray(events).toString())
        }
        // A failed checkpoint must retry from the last durable state, without sounding an alert.
        if (!edit.commit()) { identity = ""; return null }
        next
    }

    companion object {
        private const val PREFS = "native_return_observation_v1"
        private const val MAX_EVENTS = 64
        private val lock = Any()
        private fun state(context: Context) = runCatching {
            JSONObject(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("state", "{}")!!)
        }.getOrDefault(JSONObject())
        private fun events(context: Context): List<JSONObject> = runCatching {
            val values = JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("events", "[]")!!)
            (maxOf(0, values.length() - MAX_EVENTS) until values.length()).mapNotNull { values.optJSONObject(it) }
        }.getOrDefault(emptyList())
        private fun matches(context: Context, value: JSONObject): Boolean {
            val mirror = NativeShiftState.read(context) ?: return false
            val profile = NativeShiftState.storeProfile(context) ?: return false
            return profile.verified && profile.identity == value.optString("storeIdentity") && mirror.shiftActive && !mirror.isStale &&
                mirror.activity in setOf("delivery_single", "delivery_double") && mirror.activityId == value.optString("deliveryId") && mirror.shiftId == value.optString("shiftId")
        }
        fun hasReturn(context: Context, id: String, generation: Long): Boolean = synchronized(lock) {
            val value = state(context)
            matches(context, value) && value.optString("deliveryId") == id && value.optLong("generation") == generation && value.optLong("confirmedAt") > 0
        }
        private fun currentEvent(context: Context): JSONObject? {
            val state = state(context)
            if (!matches(context, state) || state.optLong("confirmedAt") <= 0) return null
            val snapshot = NativeShiftState.read(context) ?: return null
            if (snapshot.requiredCustomers <= 0 || snapshot.deliveredCustomers < snapshot.requiredCustomers || snapshot.latestDeliveredAt <= 0) return null
            return events(context).lastOrNull { it.optString("eventId") == state.optString("eventId") &&
                it.optLong("observedAtEpochMs") >= snapshot.latestDeliveredAt && it.optLong("timestampEpochMs") >= snapshot.latestDeliveredAt }
        }
        fun pendingEvent(context: Context): JSONObject? = synchronized(lock) {
            currentEvent(context)?.takeIf { it.optString("status") == "pending" }
        }
        fun acknowledge(context: Context, eventId: String): Boolean = synchronized(lock) {
            val current = currentEvent(context)?.takeIf { it.optString("eventId") == eventId } ?: return false
            if (current.optString("status") == "acknowledged") return true
            updateEvent(context, eventId) { it.put("status", "acknowledged").put("acknowledgedAt", System.currentTimeMillis()) }
        }
        private fun updateEvent(context: Context, id: String, update: (JSONObject) -> Unit): Boolean {
            val events = events(context)
            val event = events.firstOrNull { it.optString("eventId") == id } ?: return false
            update(event)
            val state = state(context)
            if (state.optString("eventId") == id) state.put("notificationAt", event.optLong("notificationAt"))
            return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("events", JSONArray(events).toString()).putString("state", state.toString()).commit()
        }
        /** Uses the established audible geofence channel, without an Activity or WebView. */
        fun postPendingAlert(context: Context, post: (Long) -> Boolean): Boolean = synchronized(lock) {
            val event = currentEvent(context)?.takeIf { it.optLong("notificationAt") == 0L } ?: return false
            if (!post(event.optLong("timestampEpochMs"))) return false
            updateEvent(context, event.optString("eventId")) { it.put("notificationAt", System.currentTimeMillis()) }
        }
        fun confirmedSampleAt(context: Context): Long = synchronized(lock) { state(context).optLong("confirmedAt") }
        fun diagnostics(context: Context): JSONObject = synchronized(lock) {
            val value = state(context)
            JSONObject().put("nativeReturnObservedAt", value.optLong("firstInsideAt"))
                .put("nativeReturnConfirmedAt", value.optLong("nativeConfirmedAt"))
                .put("nativeReturnPersistedAt", value.optLong("persistedAt"))
                .put("nativeReturnNotificationAt", value.optLong("notificationAt"))
                .put("nativeReturnEventCount", events(context).size)
                .apply { pendingEvent(context)?.let { put("nativeReturnEvent", it) } }
        }
        fun clear(context: Context) = synchronized(lock) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit()
        }
    }
}
