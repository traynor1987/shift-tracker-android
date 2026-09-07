package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.content.Context
import android.os.BatteryManager
import org.json.JSONArray
import org.json.JSONObject

/** Opportunistic whole-watch observations. No polling service or additional wake lock. */
object WearBatteryReport {
    private val lock = Any()
    private fun prefs(c: Context) = c.getSharedPreferences("wear_battery_reports_v1", Context.MODE_PRIVATE)
    private fun current(c: Context) = prefs(c).getString("current", null)?.let { runCatching { JSONObject(it) }.getOrNull() }
    private fun history(c: Context) = runCatching { JSONArray(prefs(c).getString("history", "[]")) }.getOrDefault(JSONArray())
    private fun archive(c: Context, record: JSONObject) {
        val old = history(c)
        val saved = JSONArray().put(record.put("finished", true))
        for (i in 0 until minOf(old.length(), 4)) saved.put(old.getJSONObject(i))
        prefs(c).edit().remove("current").putString("history", saved.toString()).apply()
    }
    fun sample(c: Context, snapshot: WearSnapshot? = WearState.read(c)) = synchronized(lock) {
        val now = System.currentTimeMillis()
        var record = current(c)
        val enabled = WearPreferences.batteryTracking(c)
        val hasShift = snapshot?.active == true && snapshot.shiftId.isNotBlank()
        val different = hasShift && record != null && record.optString("shift") != snapshot!!.shiftId
        if (record != null && (!enabled || snapshot?.active == false || different)) {
            if (!different && enabled) {
                val manager = c.getSystemService(BatteryManager::class.java)
                val level = manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
                if (level in 0..100) update(record, now, level, manager.isCharging, WearPreferences.batterySaverDisplay(c))
            }
            archive(c, record)
            record = null
        }
        if (!enabled || !hasShift) return@synchronized
        val manager = c.getSystemService(BatteryManager::class.java)
        val level = manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        if (level !in 0..100) return@synchronized
        val saver = WearPreferences.batterySaverDisplay(c)
        if (record == null) {
            if (snapshot!!.disconnected) return@synchronized
            record = JSONObject().put("shift", snapshot.shiftId).put("startAt", now).put("lastAt", now)
                .put("start", level).put("last", level).put("samples", 1).put("charging", manager.isCharging)
                .put("saver", if (saver) "On" else "Off").put("gaps", false)
        } else if (now - record.optLong("lastAt") >= 60_000L || manager.isCharging && !record.optBoolean("charging") ||
            record.optString("saver") != "Mixed" && record.optString("saver") != (if (saver) "On" else "Off")) {
            update(record, now, level, manager.isCharging, saver)
        } else return@synchronized
        prefs(c).edit().putString("current", record.toString()).apply()
    }
    private fun update(record: JSONObject, now: Long, level: Int, charging: Boolean, saver: Boolean) {
        val previous = record.optLong("lastAt")
        record.put("gaps", record.optBoolean("gaps") || now < previous || now - previous > 5 * 60_000L)
            .put("charging", record.optBoolean("charging") || charging || level > record.optInt("last"))
            .put("lastAt", now).put("last", level).put("samples", record.optInt("samples") + 1)
        if (record.optString("saver") != (if (saver) "On" else "Off")) record.put("saver", "Mixed")
    }
    fun reports(c: Context): List<JSONObject> = synchronized(lock) {
        buildList {
            current(c)?.let { add(it) }
            val saved = history(c)
            for (i in 0 until saved.length()) add(saved.getJSONObject(i))
        }
    }
}
