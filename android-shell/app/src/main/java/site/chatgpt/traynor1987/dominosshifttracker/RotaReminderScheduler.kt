package site.chatgpt.traynor1987.dominosshifttracker

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import org.json.JSONArray
import org.json.JSONObject

/** Persisted, complete-replacement rota alarm plan. It has no dependency on
 * the delivery GPS foreground service or its recovery journal. */
object RotaReminderScheduler {
    private const val PREFS = "shift_tracker_rota_reminders"
    private const val KEY_PLAN = "plan"
    private const val MAX_REMINDERS = 128

    fun replace(context: Context, raw: JSONArray): Int {
        cancelStored(context)
        val now = System.currentTimeMillis()
        val safe = JSONArray()
        for (index in 0 until minOf(raw.length(), MAX_REMINDERS)) {
            val item = raw.optJSONObject(index) ?: continue
            val id = item.optString("id").trim()
            val at = item.optLong("atEpochMs")
            val title = item.optString("title").trim()
            val text = item.optString("text").trim()
            if (id.isEmpty() || id.length > 160 || at <= now || title.isEmpty() || title.length > 120 || text.isEmpty() || text.length > 240) continue
            safe.put(JSONObject().put("id", id).put("atEpochMs", at).put("title", title).put("text", text))
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_PLAN, safe.toString()).apply()
        scheduleStored(context)
        return safe.length()
    }

    fun scheduleStored(context: Context) {
        val plan = stored(context)
        val now = System.currentTimeMillis()
        for (index in 0 until plan.length()) {
            val item = plan.optJSONObject(index) ?: continue
            if (item.optLong("atEpochMs") > now) schedule(context, item)
        }
    }

    fun remove(context: Context, id: String) {
        val old = stored(context); val next = JSONArray()
        for (index in 0 until old.length()) old.optJSONObject(index)?.takeIf { it.optString("id") != id }?.let { next.put(it) }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_PLAN, next.toString()).apply()
    }

    private fun stored(context: Context): JSONArray = runCatching { JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_PLAN, "[]")) }.getOrElse { JSONArray() }

    private fun requestCode(id: String) = id.fold(17) { hash, char -> 31 * hash + char.code } and 0x7fffffff

    private fun pendingIntent(context: Context, item: JSONObject) = PendingIntent.getBroadcast(
        context, requestCode(item.optString("id")), Intent(context, RotaReminderReceiver::class.java).setAction(RotaReminderReceiver.ACTION_NOTIFY)
            .putExtra("id", item.optString("id")).putExtra("title", item.optString("title")).putExtra("text", item.optString("text")),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun schedule(context: Context, item: JSONObject) {
        val alarm = context.getSystemService(AlarmManager::class.java)
        alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, item.optLong("atEpochMs"), pendingIntent(context, item))
    }

    private fun cancelStored(context: Context) {
        val alarm = context.getSystemService(AlarmManager::class.java)
        val plan = stored(context)
        for (index in 0 until plan.length()) plan.optJSONObject(index)?.let { alarm.cancel(pendingIntent(context, it)) }
    }
}
