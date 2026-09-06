package site.chatgpt.traynor1987.dominosshifttracker.settings

import android.content.Context
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMap
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject

class WearSettingsStore(private val context: Context, private val side: String,
    private val applyValues: (Map<String, String>) -> Unit, private val notifyUi: () -> Unit) {
    companion object {
        const val PATH = "/shift-tracker/wear-settings/"
        const val REQUEST = "/shift-tracker/wear-settings-request"
        private val lock = Any()
    }
    private val prefs get() = context.getSharedPreferences("wear_settings_sync_v1", Context.MODE_PRIVATE)
    private val peer get() = if (side == "phone") "watch" else "phone"
    private fun read(key: String = "records") = decode(prefs.getString(key, "{}") ?: "{}")
    private fun source(): String = prefs.getString("source", null) ?: "$side-${java.util.UUID.randomUUID()}".also { prefs.edit().putString("source", it).apply() }
    private fun encode(records: Map<String, SettingRecord>): String = JSONObject().apply {
        records.forEach { (key, item) -> put(key, JSONObject().put("value", item.value).put("revision", item.revision).put("source", item.source)) }
    }.toString()
    private fun decode(raw: String): Map<String, SettingRecord> {
        if (raw.length > 16_384) return emptyMap()
        val json = runCatching { JSONObject(raw) }.getOrNull() ?: return emptyMap()
        val incoming = mutableMapOf<String, SettingRecord>()
        SettingsMerge.defaults.keys.forEach { key -> json.optJSONObject(key)?.let { entry ->
            val value = entry.opt("value") as? String ?: return@let
            val source = entry.opt("source") as? String ?: return@let
            val revision = entry.opt("revision") as? Number ?: return@let
            if (revision.toDouble() == revision.toLong().toDouble()) incoming[key] = SettingRecord(value, revision.toLong(), source)
        } }
        return SettingsMerge.merge(emptyMap(), incoming)
    }
    fun initializeWatch(values: Map<String, String>) = synchronized(lock) {
        val current = read().toMutableMap()
        SettingsMerge.defaults.forEach { (key, default) ->
            if (key !in current) current[key] = SettingRecord(values[key]?.takeIf { SettingsMerge.valid(key, it) } ?: default, 1, source())
        }
        prefs.edit().putString("records", encode(current)).apply()
        applyValues(current.mapValues { it.value.value })
    }
    fun edit(key: String, value: String): Boolean = synchronized(lock) {
        if (!SettingsMerge.valid(key, value)) return@synchronized false
        val current = read().toMutableMap()
        // The phone must first import actual watch preferences, never replace them with defaults.
        if (SettingsMerge.defaults.keys.any { it !in current }) return@synchronized false
        if (current[key]?.value == value) { notifyUi(); return@synchronized true }
        val revision = (current.values.maxOfOrNull { it.revision } ?: 0) + 1
        if (revision > 9_000_000_000_000_000L) return@synchronized false
        current[key] = SettingRecord(value, revision, source())
        prefs.edit().putString("records", encode(current)).apply()
        applyValues(current.mapValues { it.value.value })
        publish(); notifyUi(); true
    }
    private fun receive(raw: String) = synchronized(lock) {
        val incoming = decode(raw)
        if (incoming.isEmpty()) return@synchronized
        val current = read()
        val merged = SettingsMerge.merge(current, incoming)
        prefs.edit().putString("peer", encode(incoming)).putString("records", encode(merged)).apply()
        if (merged != current) {
            applyValues(merged.mapValues { it.value.value })
            publish()
        }
        notifyUi()
    }
    fun onData(events: DataEventBuffer) {
        events.use { buffer -> buffer.forEach { event ->
            if (event.type == DataEvent.TYPE_CHANGED && event.dataItem.uri.path == PATH + peer) {
                runCatching { DataMap.fromByteArray(event.dataItem.data ?: return@forEach).getString("records") }
                    .getOrNull()?.let(::receive)
            }
        } }
    }
    fun refresh() {
        Wearable.getDataClient(context).dataItems.addOnSuccessListener { items ->
            items.use { buffer -> buffer.forEach { item ->
                if (item.uri.path == PATH + peer) runCatching { DataMap.fromByteArray(item.data ?: return@forEach).getString("records") }.getOrNull()?.let(::receive)
            } }
            publish(); notifyUi()
        }.addOnFailureListener { notifyUi() }
        Wearable.getNodeClient(context).connectedNodes.addOnSuccessListener { nodes -> nodes.forEach {
            Wearable.getMessageClient(context).sendMessage(it.id, REQUEST, byteArrayOf())
        } }
    }
    fun publish() {
        val records = synchronized(lock) { read() }
        if (records.isEmpty()) return
        val data = PutDataMapRequest.create(PATH + side).apply { dataMap.putString("records", encode(records)) }
        Wearable.getDataClient(context).putDataItem(data.asPutDataRequest().setUrgent())
    }
    fun status(): String = synchronized(lock) {
        val records = read()
        val values = JSONObject().apply { records.forEach { (key, item) -> put(key, item.value) } }
        JSONObject().put("type", "shift_tracker_wear_settings:status")
            .put("ready", SettingsMerge.defaults.keys.all { it in records })
            .put("pending", records != read("peer"))
            .put("values", values).toString()
    }
}
