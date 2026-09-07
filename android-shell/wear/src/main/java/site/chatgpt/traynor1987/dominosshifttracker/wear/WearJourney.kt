package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.content.Context
import org.json.JSONObject
import org.json.JSONArray

/** Watch-local display history, never used to execute or replay actions. */
object WearJourney {
    private fun prefs(c: Context) = c.getSharedPreferences("wear_journey_v1", Context.MODE_PRIVATE)
    fun timeline(c: Context): JSONObject? = prefs(c).getString("timeline", null)?.let { runCatching { JSONObject(it) }.getOrNull() }
    fun recap(c: Context): JSONObject? = prefs(c).getString("recap", null)?.let { runCatching { JSONObject(it) }.getOrNull() }
    @Synchronized fun capture(c: Context, previous: WearSnapshot?, next: WearSnapshot) {
        val p = prefs(c)
        if (next.active && previous?.shiftId != next.shiftId) p.edit().remove("timeline").apply()
        if (next.active && next.activity.startsWith("delivery_") && next.activityId.isNotBlank()) {
            val old = timeline(c)
            val item = if (old?.optString("id") == next.activityId && old.optString("shift") == next.shiftId) old
                else JSONObject().put("id", next.activityId).put("shift", next.shiftId).put("customers", JSONArray())
            item.put("type", next.activity).put("start", next.activityStarted).put("exit", next.storeExitAt)
                .put("return", next.storeEntryAt).put("early", next.earlyDispatchGapSeconds)
            val customers = item.getJSONArray("customers")
            for (n in customers.length() until next.deliveredCustomers.coerceIn(0, 4)) customers.put(next.updatedAt)
            p.edit().putString("timeline", item.toString()).apply()
        }
        if (WearJourneyPolicy.closedShift(previous, next) && previous != null) {
            val battery = WearBatteryReport.reports(c).firstOrNull { it.optString("shift") == previous.shiftId }
            val report = JSONObject().put("shift", previous.shiftId).put("asOf", previous.updatedAt)
                .put("deliveries", previous.deliveries).put("runs", previous.runs)
                .put("paid", previous.paidTimeSeconds).put("break", previous.breakTimeSeconds)
                .put("pay", previous.pay).put("total", previous.shiftTotal).put("miles", previous.miles)
            battery?.let { report.put("battery", "${it.optInt("start")}% → ${it.optInt("last")}%") }
            p.edit().putString("recap", report.toString()).putBoolean("recap_pending", true).apply()
        }
    }
    fun pending(c: Context) = prefs(c).getBoolean("recap_pending", false)
    fun acknowledge(c: Context) { prefs(c).edit().putBoolean("recap_pending", false).apply() }
}
