package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class WearRecentRun(
    val id: String,
    val activity: String,
    val durationSeconds: Long,
    val customers: Int,
    val completedAt: Long,
)

/** Display-only watch history derived from authoritative phone transitions. */
object WearRecentRuns {
    private const val PREFS = "shift_tracker_wear_recent_runs_v1"
    private const val KEY = "runs"
    private const val MAX_RUNS = 5

    fun capture(context: Context, previous: WearSnapshot?, next: WearSnapshot) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!WearReliabilityPolicy.recentRunsBelongToShift(next.active, next.shiftId, prefs.getString("shift_id", null))) {
            prefs.edit().remove(KEY).putString("shift_id", next.shiftId).apply()
        }
        if (!next.active || next.shiftId.isBlank()) return
        if (previous == null || previous.shiftId != next.shiftId || previous.activityId.isBlank()) return
        if (!previous.activity.startsWith("delivery_")) return
        if (next.activityId == previous.activityId && next.activity.startsWith("delivery_")) return
        if (previous.requiredCustomers <= 0 || previous.deliveredCustomers < previous.requiredCustomers) return
        val duration = ((next.updatedAt - previous.activityStarted) / 1_000L).coerceIn(0L, 24L * 60L * 60L)
        val run = WearRecentRun(previous.activityId, previous.activity, duration, previous.requiredCustomers, next.updatedAt)
        val updated = (listOf(run) + read(context).filterNot { it.id == run.id }).take(MAX_RUNS)
        val array = JSONArray()
        updated.forEach { item -> array.put(JSONObject()
            .put("id", item.id.take(128))
            .put("activity", item.activity)
            .put("durationSeconds", item.durationSeconds)
            .put("customers", item.customers)
            .put("completedAt", item.completedAt)) }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, array.toString()).apply()
    }

    fun read(context: Context): List<WearRecentRun> = runCatching {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val current = WearState.read(context) ?: return emptyList()
        if (!WearReliabilityPolicy.recentRunsBelongToShift(current.active, current.shiftId, prefs.getString("shift_id", null))) return emptyList()
        val raw = prefs.getString(KEY, null) ?: return emptyList()
        val array = JSONArray(raw)
        buildList {
            for (index in 0 until minOf(array.length(), MAX_RUNS)) {
                val item = array.optJSONObject(index) ?: continue
                val activity = item.optString("activity")
                if (activity !in setOf("delivery_single", "delivery_double")) continue
                add(WearRecentRun(item.optString("id").take(128), activity, item.optLong("durationSeconds").coerceIn(0L, 86_400L), item.optInt("customers").coerceIn(1, 4), item.optLong("completedAt")))
            }
        }
    }.getOrDefault(emptyList())
}
